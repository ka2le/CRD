"""Single-seat Gymnasium adapter with variable legal-candidate observations.

Indices address the CURRENT candidate list, not a permanent card/action vocabulary.
No rules or damage formulas are reimplemented in Python.
"""

from copy import deepcopy
import hashlib
import json
from uuid import uuid4

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from gymnasium.error import ResetNeeded

from .worker import HeadlessWorker

PHASES = (
    "draft-player-pick", "draft-opponent-thinking", "player-discard-1", "opponent-discard-1",
    "player-discard-2", "opponent-discard-2", "preparation", "finished",
)
HISTORY_TYPES = (
    "opening-hand", "draft-pack", "draft-discard", "draft-pick", "discard", "refill",
    "prepare", "skip-preparation", "finish-preparation",
)
CLASSES = ("critter", "robot", "dragon")


class LegalDiscrete(spaces.Discrete):
    """Discrete candidates whose default sample respects the latest legal mask.

This also lets generic Gymnasium checkers/sample clients select valid actions.
Explicit mask/probability arguments keep the standard Discrete semantics.
"""

    def __init__(self, n):
        super().__init__(n)
        self.legal_mask = np.ones(n, dtype=np.int8)

    def sample(self, mask=None, probability=None):
        if mask is None and probability is None:
            mask = self.legal_mask
        return super().sample(mask=mask, probability=probability)


class CRDEnv(gym.Env):
    metadata = {"render_modes": ["ansi"]}

    def __init__(self, config=None, *, worker=None, max_decisions=1000, render_mode=None):
        super().__init__()
        self.config = {
            "mode": "draft", "wildDeck": True, "revealOpponent": False, "control": "player",
            **(config or {}),
        }
        if self.config["control"] not in ("player", "opponent"):
            raise ValueError("CRDEnv controls one seat; use the worker's control='both' for self-play")
        if render_mode not in (None, "ansi"):
            raise ValueError("Only ansi rendering is supported")
        if not isinstance(max_decisions, int) or max_decisions < 1:
            raise ValueError("max_decisions must be positive")
        self.render_mode = render_mode
        self.max_decisions = max_decisions
        self.worker = worker or HeadlessWorker()
        self._owns_worker = worker is None
        self.session_id = f"gym-{uuid4().hex}"
        self._closed = False
        self._ended = True
        self._response = None
        # Provision the largest regular pool so reset can toggle Normal/Wild without resizing.
        try:
            self.engine_spec = self.worker.request("describe", config={**self.config, "wildDeck": True})["spec"]
            if self.engine_spec["protocolVersion"] != 2:
                raise ValueError("Unsupported CRD worker protocol")
            self.card_ids = tuple(card["id"] for card in self.engine_spec["cardTypes"])
            self.card_index = {card_id: i for i, card_id in enumerate(self.card_ids)}
            self.action_types = tuple(self.engine_spec["actionTypes"])
            self.action_capacity = self.engine_spec["maxLegalActions"]
            n = len(self.card_ids)
            self.action_feature_size = len(self.action_types) + 3 * n + 1
            self.history_feature_size = len(HISTORY_TYPES) + 3 + 1 + 3 * n
            self.action_space = LegalDiscrete(self.action_capacity)
            self.observation_space = spaces.Dict({
                # Own unspent/spent, known opponent, recycle unspent/spent, row, pool.
                "counts": spaces.Box(0, np.inf, shape=(7, n), dtype=np.float32),
                "context": spaces.Box(0, np.inf, shape=(2 + len(PHASES) + 13,), dtype=np.float32),
                "stats": spaces.Box(0, np.inf, shape=(2, 3), dtype=np.float32),
                "combat_cycle": spaces.Box(0, np.inf, shape=(2, 12, 2), dtype=np.float32),
                "action_mask": spaces.MultiBinary(self.action_capacity),
                "candidates": spaces.Sequence(
                    spaces.Box(0, np.inf, shape=(self.action_feature_size,), dtype=np.float32), stack=True,
                ),
                "history": spaces.Sequence(
                    spaces.Box(0, np.inf, shape=(self.history_feature_size,), dtype=np.float32), stack=True,
                ),
            })
        except Exception:
            if self._owns_worker:
                self.worker.close()
            raise

    def _counts(self, cards):
        counts = np.zeros(len(self.card_ids), dtype=np.float32)
        for card in cards:
            counts[self.card_index[card["id"]]] += 1
        return counts

    def _encode(self, response):
        raw = response["observation"]
        legal = response["legalActions"]
        if len(legal) > self.action_capacity:
            raise RuntimeError("Action capacity exceeded; no actions have been clipped")
        activated = set(raw["activatedUids"])
        hand = raw["playerHand"]
        recycle = raw["recycleCards"]
        counts = np.stack([
            self._counts([card for card in hand if card["uid"] not in activated]),
            self._counts([card for card in hand if card["uid"] in activated]),
            self._counts(raw["opponentHand"]),
            self._counts([card for card in recycle if card["uid"] not in activated]),
            self._counts([card for card in recycle if card["uid"] in activated]),
            self._counts(raw["draftRow"]),
            np.asarray(self._pool_counts, dtype=np.float32),
        ])
        context = np.zeros(2 + len(PHASES) + 13, dtype=np.float32)
        context[0 if raw["mode"] == "draft" else 1] = 1
        context[2 + PHASES.index(raw["phase"])] = 1
        first = raw["firstPicker"]
        context[2 + len(PHASES):] = [
            raw["deckCount"], raw["deckCountIsExact"], raw["opponentHandCount"],
            raw["opponentHandIsCurrent"], raw["steps"], raw["packNumber"], raw["picksThisPack"],
            raw["playerDiscardsUsed"], raw["opponentDiscardsUsed"], raw["wildDeck"], raw["terminal"],
            raw["actor"] == raw["side"], 0 if first is None else (1 if first == raw["side"] else 2),
        ]
        combat = [raw["ownCombat"], raw["knownOpponentCombat"]]
        stats = np.asarray([[profile["stats"][kind] for kind in CLASSES] for profile in combat], dtype=np.float32)
        cycles = np.asarray([profile["cycle"] for profile in combat], dtype=np.float32)
        mask = np.zeros(self.action_capacity, dtype=np.int8)
        mask[:len(legal)] = 1
        self.action_space.legal_mask = mask.copy()

        candidates = np.zeros((len(legal), self.action_feature_size), dtype=np.float32)
        by_uid = {card["uid"]: card for card in hand + recycle}
        offset = len(self.action_types)
        n = len(self.card_ids)
        for row, action in zip(candidates, legal):
            row[self.action_types.index(action["type"])] = 1
            source_id = action.get("cardId") or action.get("card", {}).get("id")
            if source_id is not None:
                row[offset + self.card_index[source_id]] = 1
            target = by_uid.get(action.get("targetUid"))
            if target:
                row[offset + n + self.card_index[target["id"]]] = 1
                row[-1] = target["uid"] in activated
            selected = set(action.get("selectedIds", []))
            row[offset + 2 * n:offset + 3 * n] = self._counts([
                card for card in hand if card["uid"] in selected
            ])

        history = np.zeros((len(raw["history"]), self.history_feature_size), dtype=np.float32)
        offset = len(HISTORY_TYPES)
        for row, event in zip(history, raw["history"]):
            row[HISTORY_TYPES.index(event["type"])] = 1
            owner = event.get("side", event["scope"])
            row[offset + (0 if owner == raw["side"] else (2 if owner == "public" else 1))] = 1
            row[offset + 3] = event.get("packNumber", 0)
            cards = event.get("cards", []) + event.get("drawn", [])
            if "card" in event:
                cards = cards + [event["card"]]
            row[offset + 4:offset + 4 + n] = self._counts(cards)
            source_id = event.get("action", {}).get("cardId")
            if source_id:
                row[offset + 4 + n + self.card_index[source_id]] = 1
            if event.get("target"):
                row[offset + 4 + 2 * n + self.card_index[event["target"]["id"]]] = 1
        return {
            "counts": counts, "context": context, "stats": stats, "combat_cycle": cycles,
            "action_mask": mask, "candidates": candidates, "history": history,
        }

    def _info(self):
        return {
            "legal_actions": deepcopy(self._response["legalActions"]),
            "observation": deepcopy(self._response["observation"]),
            "rules_version": self.engine_spec["rulesVersion"],
            "card_data_hash": self.engine_spec["cardDataHash"],
        }

    def reset(self, *, seed=None, options=None):
        if self._closed:
            raise RuntimeError("Environment is closed")
        super().reset(seed=seed)
        overrides = options or {}
        if set(overrides) - {"mode", "wildDeck", "revealOpponent", "firstPicker"}:
            raise ValueError("reset options support only mode, wildDeck, revealOpponent and firstPicker")
        self._engine_seed = int(self.np_random.integers(0, 2**32, dtype=np.uint32))
        self._episode_config = {**self.config, **overrides, "seed": self._engine_seed}
        response = self.worker.request("reset", sessionId=self.session_id, config=self._episode_config)
        if response["spec"]["cardDataHash"] != self.engine_spec["cardDataHash"]:
            raise RuntimeError("Card catalog changed; recreate the environment")
        if response["spec"]["maxLegalActions"] > self.action_capacity:
            raise RuntimeError("Configured pool exceeds this environment's action capacity")
        self._pool_counts = response["spec"]["poolCounts"]
        self._episode_spec = deepcopy(response["spec"])
        family = {
            "deal": self.config.get("deck", self._engine_seed),
            "pool": self._episode_spec["poolCards"], "rules": self.engine_spec["rulesVersion"],
            "cards": self.engine_spec["cardDataHash"],
        }
        # Group the same physical deal across modes/seats/visibility, before expanding labels.
        self._root_family = hashlib.sha256(json.dumps(family, sort_keys=True).encode()).hexdigest()
        self._response = response
        self._actions = []
        self._episode_steps = 0
        self._ended = bool(response["terminal"])
        return self._encode(response), self._info()

    def step(self, action):
        if self._ended or self._response is None:
            raise ResetNeeded("Call reset before stepping a new episode")
        if isinstance(action, (bool, np.bool_)) or not self.action_space.contains(action):
            raise ValueError("Action must be a candidate index in the action space")
        action = int(action)
        if action >= len(self._response["legalActions"]):
            raise ValueError("Action is masked out in the current decision")
        concrete_action = deepcopy(self._response["legalActions"][action])
        response = self.worker.request("step", sessionId=self.session_id, action=action)
        self._response = response
        self._actions.append(concrete_action)
        self._episode_steps += 1
        terminated = bool(response["terminal"])
        truncated = not terminated and self._episode_steps >= self.max_decisions
        self._ended = terminated or truncated
        return self._encode(response), float(response["reward"]), terminated, truncated, self._info()

    def replay_record(self):
        """Privileged host metadata, intentionally separate from observations/info."""
        if self._response is None:
            raise ResetNeeded("No episode to record")
        return {
            "protocol_version": 2, "rules_version": self.engine_spec["rulesVersion"],
            "card_data_hash": self.engine_spec["cardDataHash"],
            "root_family": self._root_family,
            "config": deepcopy(self._episode_config), "actions": deepcopy(self._actions),
        }

    def evaluate_actions(self, *, samples=8, seed=1, completion_policy="heuristic", max_decisions=1000):
        """Stateless rollout teacher using only permitted observations/public pool metadata.

        The planning seed is explicit and independent of replay/deal metadata. This does
        not fork or inspect the live session, and does not advance the real game.
        """
        if self._ended or self._response is None:
            raise ResetNeeded("No active decision to evaluate")
        return self.worker.request(
            "evaluate", observation=deepcopy(self._response["observation"]),
            spec=self._episode_spec,
            options={"samples": samples, "seed": seed, "completionPolicy": completion_policy,
                     "maxDecisions": max_decisions},
        )["evaluation"]

    def render(self):
        if self._response is None:
            return "CRD: not reset"
        raw = self._response["observation"]
        return f"{raw['side']} {raw['phase']}: " + ", ".join(card["id"] for card in raw["playerHand"])

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            if not self._owns_worker:
                self.worker.request("close", sessionId=self.session_id)
        finally:
            if self._owns_worker:
                self.worker.close()
