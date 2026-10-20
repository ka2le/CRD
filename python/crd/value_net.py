"""Draft WDL evaluator: one public (position, candidate) per row, ~100k parameters."""

import json
from pathlib import Path

import numpy as np

from .draft_model import features as first_features

FEATURE_VERSION = "draft-public-unseen-stats-wdl-v2"
PREP_FEATURE_VERSION = "draft-prep-afterstate-wdl-v3"
FULL_FEATURE_VERSION = "full-game-discard-prep-wdl-v4"
FEATURE_VERSIONS = (FEATURE_VERSION, PREP_FEATURE_VERSION, FULL_FEATURE_VERSION)
PREP_ACTION_TYPES = ("prepare", "skip-preparation", "finish-preparation")


def draft_width(card_count):
    return 6 * card_count + 58


def prep_width(card_count):
    return 1 + len(PREP_ACTION_TYPES) + 5 * card_count + 24 + 3 + 2


def feature_width(spec_or_ids, version=PREP_FEATURE_VERSION):
    n = len(spec_or_ids["cardTypes"]) if isinstance(spec_or_ids, dict) else len(spec_or_ids)
    return draft_width(n) + (prep_width(n) if version in (PREP_FEATURE_VERSION, FULL_FEATURE_VERSION) else 0) + (n + 9 if version == FULL_FEATURE_VERSION else 0)


def _cycle_stats(combat):
    cycle = np.asarray(combat["cycle"], dtype=np.float32).ravel() / 21
    stats = np.asarray([combat["stats"][kind] for kind in ("critter", "robot", "dragon")], dtype=np.float32) / 5
    return cycle, stats


def preparation_features(observation, actions, spec, prep):
    """v3 rows for preparation decisions. `prep` is the worker's stateless afterstate list."""
    ids = [card["id"] for card in spec["cardTypes"]]
    index = {name: i for i, name in enumerate(ids)}
    n = len(ids)
    if observation["phase"] != "preparation" or len(prep) != len(actions):
        raise ValueError("Preparation features need one afterstate per legal preparation action")

    def counts(card_ids):
        result = np.zeros(n, dtype=np.float32)
        for card_id in card_ids:
            result[index[card_id]] += 1
        return result / 5

    own = counts(card["id"] for card in observation["playerHand"])
    enemy = counts(card["id"] for card in observation["opponentHand"])
    row = counts(card["id"] for card in observation["draftRow"])
    discarded = counts(card["id"] for card in observation["discardPile"])
    pile = counts(card["id"] for card in observation["recycleCards"])
    cycles = np.asarray([observation[key]["cycle"] for key in ("ownCombat", "knownOpponentCombat")],
                        dtype=np.float32).ravel() / 21
    context = np.asarray([observation["packNumber"] / 5, observation["picksThisPack"] / 2,
                          observation["firstPicker"] == observation["side"], observation["wildDeck"]], dtype=np.float32)
    # Own drawn/recycled/copied cards make the draft-style partition approximate here; clamp.
    unseen = np.maximum(np.asarray(spec["poolCounts"], dtype=np.float32) / 5 - own - enemy - row - pile, 0)
    stats = np.asarray([observation[key]["stats"][kind] for key in ("ownCombat", "knownOpponentCombat")
                        for kind in ("critter", "robot", "dragon")], dtype=np.float32) / 5
    shared = np.concatenate([own, enemy, row, discarded, np.zeros(n, dtype=np.float32), cycles, context])
    tail = np.r_[unseen, stats]
    target_ids = {card["uid"]: card["id"] for card in observation["playerHand"] + observation["recycleCards"]}
    rows = []
    for action, after in zip(actions, prep):
        kind = np.zeros(len(PREP_ACTION_TYPES), dtype=np.float32)
        kind[PREP_ACTION_TYPES.index(action["type"])] = 1
        source = counts([action["cardId"]] if action.get("cardId") else []) * 5
        target = counts([target_ids[action["targetUid"]]] if action.get("targetUid") else []) * 5
        cycle, after_stats = _cycle_stats(after["combat"])
        block = np.concatenate([[1], kind, source, target, counts(after["handIds"]), cycle, after_stats,
                                counts(after["remainingIds"]), counts(after["pileIds"]),
                                [after["pendingDraws"] / 5, observation["deckCount"] / 50]])
        rows.append(np.concatenate([shared, tail, block]))
    return np.asarray(rows, dtype=np.float32)


def model_features(version, observation, actions, spec, prep=None):
    """Feature rows in the layout a given model version expects (None = unsupported decision)."""
    if version == FULL_FEATURE_VERSION:
        return full_game_features(observation, actions, spec, prep)
    if observation["mode"] != "draft":
        # Older nets have never learned this information distribution, including its prep.
        return None
    if observation["phase"] == "preparation":
        if version != PREP_FEATURE_VERSION:
            return None
        return preparation_features(observation, actions, spec, prep)
    x = features(observation, actions, spec)
    if version == PREP_FEATURE_VERSION:
        x = np.c_[x, np.zeros((len(x), prep_width(len(spec["cardTypes"]))), dtype=np.float32)]
    return x


def full_game_features(observation, actions, spec, prep=None):
    """Both modes; discard candidates encode selected and retained card multisets.

    Unknown replacements stay unresolved. Only permitted observations enter features;
    physical UIDs are used for membership, never represented numerically.
    """
    n = len(spec["cardTypes"])
    index = {card["id"]: i for i, card in enumerate(spec["cardTypes"])}

    def counts(cards):
        result = np.zeros(n, dtype=np.float32)
        for card in cards:
            result[index[card["id"]]] += .2
        return result

    is_discard = actions[0]["type"] == "discard"
    if observation["phase"] == "preparation":
        base = preparation_features(observation, actions, spec, prep)
    elif not is_discard:
        base = model_features(PREP_FEATURE_VERSION, observation, actions, spec)
    else:
        own, enemy, row, discarded = [counts(observation[key]) for key in
                                     ("playerHand", "opponentHand", "draftRow", "discardPile")]
        cycles = np.asarray([observation[key]["cycle"] for key in ("ownCombat", "knownOpponentCombat")],
                            dtype=np.float32).ravel() / 21
        stats = np.asarray([observation[key]["stats"][kind] for key in ("ownCombat", "knownOpponentCombat")
                            for kind in ("critter", "robot", "dragon")], dtype=np.float32) / 5
        # These are still in the unknown pool: hidden enemy cards and all unseen draws.
        unseen = np.maximum(np.asarray(spec["poolCounts"], dtype=np.float32) / 5 - own - enemy - discarded, 0)
        base = []
        for action in actions:
            selected = set(action["selectedIds"])
            removed = counts(card for card in observation["playerHand"] if card["uid"] in selected)
            base.append(np.r_[own, enemy, row, discarded, removed, cycles,
                              [0, 0, 0, observation["wildDeck"]], unseen, stats,
                              np.zeros(prep_width(n), dtype=np.float32)])
        base = np.asarray(base, dtype=np.float32)
    context = [observation["mode"] == "five-hand-discard", is_discard,
               observation["playerDiscardsUsed"] / 2, observation["opponentDiscardsUsed"] / 2,
               observation["opponentHandCount"] / 5, observation["opponentHandIsCurrent"],
               observation["deckCountIsExact"], observation["deckCount"] / 50]
    extra = []
    for action in actions:
        selected = set(action["selectedIds"]) if is_discard else set()
        kept = counts(card for card in observation["playerHand"] if card["uid"] not in selected) if is_discard else np.zeros(n)
        extra.append(np.r_[kept, context, len(selected) / 5])
    return np.c_[base, np.asarray(extra, dtype=np.float32)].astype(np.float32)


def features(observation, actions, spec):
    ids = [card["id"] for card in spec["cardTypes"]]
    x = first_features(observation, actions, ids).astype(np.float32)
    n = len(ids)
    # During drafting these four locations partition ALL exposed originals.
    # poolCounts is public composition, not the order/composition of the live deck.
    unseen = np.asarray(spec["poolCounts"], dtype=np.float32) / 5 - sum(x[0, i*n:(i+1)*n] for i in range(4))
    if np.any(unseen < -1e-5):
        raise ValueError("Known draft cards exceed public pool")
    stats = np.asarray([observation[key]["stats"][kind]
                        for key in ("ownCombat", "knownOpponentCombat")
                        for kind in ("critter", "robot", "dragon")], dtype=np.float32) / 5
    return np.c_[x, np.tile(np.r_[np.maximum(unseen, 0), stats], (len(x), 1))].astype(np.float32)


def signature(spec, version=FEATURE_VERSION, teacher="observation-sampled-heuristic-completion-v1"):
    return {"features": version, "rules": spec["rulesVersion"], "cards": spec["cardDataHash"],
            "card_ids": [card["id"] for card in spec["cardTypes"]],
            "teacher": teacher, "outcomes": ["win", "draw", "loss"]}


def softmax(logits):
    logits = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


class ValueNet:
    def __init__(self, signature, mean, scale, linear, w1, b1, w2, b2, w3, b3):
        self.signature = signature
        self.mean, self.scale, self.linear = mean, scale, linear
        self.w1, self.b1, self.w2, self.b2, self.w3, self.b3 = w1, b1, w2, b2, w3, b3

    def probabilities(self, x, *, baseline_only=False):
        z = np.clip((x - self.mean) / self.scale, -20, 20)
        logits = z @ self.linear[:-1] + self.linear[-1]
        if not baseline_only:
            logits += np.tanh(np.tanh(z @ self.w1 + self.b1) @ self.w2 + self.b2) @ self.w3 + self.b3
        return softmax(logits)

    def values(self, x, *, baseline_only=False):
        p = self.probabilities(x, baseline_only=baseline_only)
        return p[:, 0] - p[:, 2]

    @property
    def parameters(self):
        return [self.w1, self.b1, self.w2, self.b2, self.w3, self.b3]

    def save(self, path):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".temporary.npz")
        np.savez_compressed(temporary, signature=json.dumps(self.signature), **{
            name: getattr(self, name) for name in ("mean", "scale", "linear", "w1", "b1", "w2", "b2", "w3", "b3")
        })
        temporary.replace(target)

    @classmethod
    def load(cls, path):
        with np.load(path, allow_pickle=False) as data:
            sig = json.loads(str(data["signature"]))
            if sig["features"] not in FEATURE_VERSIONS:
                raise ValueError("Wrong model feature version")
            if "depth" in data:
                depth = int(data["depth"])
                return DeepValueNet(sig, data["mean"], data["scale"], data["linear"],
                                    [data[f"weight_{i}"] for i in range(depth)],
                                    [data[f"bias_{i}"] for i in range(depth)])
            return cls(sig, **{name: data[name] for name in ("mean", "scale", "linear", "w1", "b1", "w2", "b2", "w3", "b3")})


class DeepValueNet(ValueNet):
    """Same public features/objective with a configurable number of hidden layers."""

    def __init__(self, signature, mean, scale, linear, weights, biases):
        self.signature, self.mean, self.scale, self.linear = signature, mean, scale, linear
        self.weights, self.biases = weights, biases

    @property
    def parameters(self):
        return [parameter for pair in zip(self.weights, self.biases) for parameter in pair]

    def probabilities(self, x, *, baseline_only=False):
        z = np.clip((x - self.mean) / self.scale, -20, 20)
        logits = z @ self.linear[:-1] + self.linear[-1]
        if not baseline_only:
            h = z
            for weight, bias in zip(self.weights[:-1], self.biases[:-1]):
                h = np.tanh(h @ weight + bias)
            logits += h @ self.weights[-1] + self.biases[-1]
        return softmax(logits)

    def save(self, path):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".temporary.npz")
        arrays = {f"weight_{i}": weight for i, weight in enumerate(self.weights)}
        arrays.update({f"bias_{i}": bias for i, bias in enumerate(self.biases)})
        np.savez_compressed(temporary, signature=json.dumps(self.signature), mean=self.mean, scale=self.scale,
                            linear=self.linear, depth=len(self.weights), **arrays)
        temporary.replace(target)


def cross_entropy(probabilities, counts):
    return float(-np.sum(counts * np.log(np.maximum(probabilities, 1e-8))) / counts.sum())


def initialize(x, counts, sig, seed=7, hidden=(256, 160)):
    rng = np.random.default_rng(seed)
    # Stream sufficient statistics rather than materialising several corpus-sized arrays.
    total = np.zeros(x.shape[1], dtype=np.float64)
    squares = total.copy()
    for start in range(0, len(x), 8192):
        block = x[start:start+8192].astype(np.float64)
        total += block.sum(axis=0)
        squares += np.square(block).sum(axis=0)
    mean = (total / len(x)).astype(np.float32)
    scale = np.maximum(np.sqrt(np.maximum(squares / len(x) - (total / len(x)) ** 2, 0)), .1).astype(np.float32)
    gram = 100 * np.eye(x.shape[1] + 1, dtype=np.float64)
    rhs = np.zeros((x.shape[1] + 1, 3), dtype=np.float64)
    for start in range(0, len(x), 8192):
        z = np.clip((x[start:start+8192] - mean) / scale, -20, 20)
        design = np.c_[z, np.ones(len(z), dtype=np.float32)].astype(np.float64)
        target = counts[start:start+8192]
        targets = (target + .5) / (target.sum(axis=1, keepdims=True) + 1.5)
        gram += design.T @ design
        rhs += design.T @ np.log(targets)
    linear = np.linalg.solve(gram, rhs).astype(np.float32)
    if len(hidden) != 2:
        sizes = [x.shape[1], *hidden, 3]
        weights = [rng.normal(0, 1 / np.sqrt(before), (before, after)).astype(np.float32)
                   for before, after in zip(sizes[:-2], sizes[1:-1])]
        weights.append(np.zeros((sizes[-2], 3), dtype=np.float32))
        biases = [np.zeros(size, dtype=np.float32) for size in sizes[1:]]
        return DeepValueNet(sig, mean, scale, linear, weights, biases)
    return ValueNet(sig, mean, scale, linear,
                    rng.normal(0, 1 / np.sqrt(x.shape[1]), (x.shape[1], hidden[0])).astype(np.float32),
                    np.zeros(hidden[0], dtype=np.float32),
                    rng.normal(0, 1 / np.sqrt(hidden[0]), hidden).astype(np.float32),
                    np.zeros(hidden[1], dtype=np.float32),
                    np.zeros((hidden[1], 3), dtype=np.float32), np.zeros(3, dtype=np.float32))


def adam_step(model, x, counts, moments, variances, step, rate=.0006, weight_decay=1e-5):
    if isinstance(model, DeepValueNet):
        return deep_adam_step(model, x, counts, moments, variances, step, rate, weight_decay)
    z = np.clip((x - model.mean) / model.scale, -20, 20)
    h1 = np.tanh(z @ model.w1 + model.b1)
    h2 = np.tanh(h1 @ model.w2 + model.b2)
    p = softmax(z @ model.linear[:-1] + model.linear[-1] + h2 @ model.w3 + model.b3)
    # Exactly the gradient obtained by expanding every simulated W/D/L evaluation
    # into an individual one-hot example, without copying identical input vectors.
    delta = (p * counts.sum(axis=1, keepdims=True) - counts) / counts.sum()
    d2 = (delta @ model.w3.T) * (1 - h2 ** 2)
    d1 = (d2 @ model.w2.T) * (1 - h1 ** 2)
    gradients = [z.T @ d1, d1.sum(axis=0), h1.T @ d2, d2.sum(axis=0), h2.T @ delta, delta.sum(axis=0)]
    for parameter, m, v, gradient in zip(model.parameters, moments, variances, gradients):
        gradient += weight_decay * parameter
        m *= .9
        m += .1 * gradient
        v *= .999
        v += .001 * gradient ** 2
        parameter -= rate * (m / (1 - .9 ** step)) / (np.sqrt(v / (1 - .999 ** step)) + 1e-8)
    return cross_entropy(p, counts)


def deep_adam_step(model, x, counts, moments, variances, step, rate, weight_decay=1e-5):
    z = np.clip((x - model.mean) / model.scale, -20, 20)
    activations = [z]
    for weight, bias in zip(model.weights[:-1], model.biases[:-1]):
        activations.append(np.tanh(activations[-1] @ weight + bias))
    p = softmax(z @ model.linear[:-1] + model.linear[-1] + activations[-1] @ model.weights[-1] + model.biases[-1])
    delta = (p * counts.sum(axis=1, keepdims=True) - counts) / counts.sum()
    pairs = []
    for layer in range(len(model.weights)-1, -1, -1):
        pairs.append((activations[layer].T @ delta, delta.sum(axis=0)))
        if layer:
            delta = (delta @ model.weights[layer].T) * (1 - activations[layer] ** 2)
    gradients = [value for pair in reversed(pairs) for value in pair]
    for parameter, m, v, gradient in zip(model.parameters, moments, variances, gradients):
        gradient += weight_decay * parameter
        m *= .9
        m += .1 * gradient
        v *= .999
        v += .001 * gradient ** 2
        parameter -= rate * (m / (1 - .9 ** step)) / (np.sqrt(v / (1 - .999 ** step)) + 1e-8)
    return cross_entropy(p, counts)
