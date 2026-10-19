import json
import sys
import unittest
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from gymnasium.error import ResetNeeded
from gymnasium.utils.env_checker import check_env

from crd.env import CRDEnv
from crd.worker import HeadlessWorker, WorkerError


class EnvironmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = HeadlessWorker()

    @classmethod
    def tearDownClass(cls):
        cls.worker.close()

    def test_worker_errors_and_immutable_forks(self):
        self.assertTrue(self.worker.request("ping")["pong"])
        initial = self.worker.request("reset", sessionId="root", config={"seed": 10, "control": "both"})
        self.assertEqual(initial["protocolVersion"], 2)
        self.assertEqual(len(initial["spec"]["cardDataHash"]), 64)
        branch = self.worker.request("fork", sessionId="root", targetSessionId="branch")
        self.assertEqual(branch["observation"], initial["observation"])
        self.worker.request("step", sessionId="branch", action=0)
        with self.assertRaises(WorkerError):
            self.worker.request("step", sessionId="root", action={"type": "discard", "selectedIds": ["forged"]})
        with self.assertRaises(WorkerError):
            self.worker.request("step", sessionId="root", actor="opponent", action=0)
        with self.assertRaises(WorkerError):
            self.worker.request("fork", sessionId="root", targetSessionId="root")
        after = self.worker.request("observe", sessionId="root")
        self.assertEqual(after["observation"], initial["observation"])
        self.assertEqual(after["legalActions"], initial["legalActions"])

    def test_gym_contract_both_modes_and_controlled_seats(self):
        for mode in ("draft", "five-hand-discard"):
            for control in ("player", "opponent"):
                with self.subTest(mode=mode, control=control):
                    env = CRDEnv({"mode": mode, "control": control}, worker=self.worker)
                    try:
                        with warnings.catch_warnings():
                            warnings.filterwarnings("ignore", message=".*maximum value is infinity.*")
                            check_env(env, skip_render_check=True)
                    finally:
                        env.close()

    def test_dynamic_preparation_candidates_and_growing_hands(self):
        ids = ["copy_card_in_hand", "draw_2_extra", "recycle_card", "swarm", "critter1"]
        ids += ["robot1"] * 5
        # Default opponent's two discard passes consume the first four deck cards.
        ids += ["dragon1"] * 4 + ["recycle_card", "draw_2_extra"]
        ids += ["robot1", "robot_attack", "critter1", "swarm"] * 4
        deck = [{"id": card_id, "uid": f"fixture-{i}"} for i, card_id in enumerate(ids)]
        env = CRDEnv({"mode": "five-hand-discard", "deck": deck}, worker=self.worker)
        try:
            obs, info = env.reset(seed=7)
            for _ in range(2):
                obs, _, _, _, info = env.step(0)  # Keep all five.
            self.assertEqual(info["observation"]["phase"], "preparation")
            actions = info["legal_actions"]
            index = next(i for i, action in enumerate(actions) if action["type"] == "prepare"
                         and action["sourceUid"] == "fixture-0" and action.get("targetUid") == "fixture-1")
            obs, _, _, _, info = env.step(index)
            copied = next(card for card in info["observation"]["playerHand"] if "__copy__" in card["uid"])
            index = next(i for i, action in enumerate(info["legal_actions"])
                         if action["type"] == "prepare" and action["sourceUid"] == copied["uid"])
            obs, _, _, _, info = env.step(index)
            self.assertEqual(len(info["observation"]["playerHand"]), 7)
            self.assertEqual(obs["counts"][:2].sum(), 7)
            self.assertEqual(len(obs["candidates"]), len(info["legal_actions"]))
            self.assertEqual(obs["action_mask"].sum(), len(info["legal_actions"]))
            self.assertTrue(env.observation_space.contains(obs))
            self.assertTrue(any(action.get("sourceUid") == "fixture-14" for action in info["legal_actions"]))
            self.assertTrue(any(action.get("sourceUid") == "fixture-15" for action in info["legal_actions"]))
        finally:
            env.close()

    def test_replays_masks_rewards_and_observations_across_random_episodes(self):
        episodes = 0
        for mode in ("draft", "five-hand-discard"):
            for control in ("player", "opponent"):
                env = CRDEnv({"mode": mode, "control": control}, worker=self.worker)
                try:
                    for seed in range(1, 13):
                        obs, info = env.reset(seed=seed, options={"wildDeck": seed % 2 == 0})
                        env.action_space.seed(seed + 200)
                        self.assertEqual(info["observation"]["side"], control)
                        initial_obs = {key: value.copy() for key, value in obs.items()}
                        while True:
                            self.assertTrue(env.observation_space.contains(obs))
                            self.assertEqual(obs["action_mask"].sum(), len(info["legal_actions"]))
                            self.assertNotIn("seed", info["observation"])
                            self.assertNotIn("deck", info["observation"])
                            self.assertNotIn("opponentDebug", info["observation"])
                            action = env.action_space.sample()
                            self.assertEqual(obs["action_mask"][action], 1)
                            obs, reward, terminated, truncated, info = env.step(action)
                            if terminated or truncated:
                                break
                            self.assertEqual(reward, 0)
                        self.assertTrue(terminated)
                        self.assertFalse(truncated)
                        self.assertTrue(env.observation_space.contains(obs))
                        self.assertEqual(obs["action_mask"].sum(), 0)
                        expected = {"player": 1, "opponent": -1, "tie": 0}[info["observation"]["battle"]["winner"]]
                        self.assertEqual(reward, expected)
                        record = env.replay_record()
                        replay = self.worker.request("reset", sessionId="replay", config=record["config"])
                        for concrete in record["actions"]:
                            replay = self.worker.request("step", sessionId="replay", action=concrete)
                        self.assertEqual(replay["observation"], info["observation"])
                        self.assertEqual(replay["reward"], reward)
                        again, _ = env.reset(seed=seed, options={"wildDeck": seed % 2 == 0})
                        for key in initial_obs:
                            np.testing.assert_array_equal(initial_obs[key], again[key])
                        episodes += 1
                finally:
                    env.close()
        self.assertEqual(episodes, 48)

    def test_invalid_actions_are_rejected_and_info_cannot_mutate_environment(self):
        env = CRDEnv(worker=self.worker)
        try:
            _, info = env.reset(seed=9)
            before = self.worker.request("observe", sessionId=env.session_id)["observation"]
            for action in (-1, 1.5, True, env.action_capacity, len(info["legal_actions"])):
                with self.assertRaises(ValueError):
                    env.step(action)
            info["legal_actions"].clear()
            info["observation"]["playerHand"].clear()
            self.assertEqual(self.worker.request("observe", sessionId=env.session_id)["observation"], before)
            env.step(0)
        finally:
            env.close()

    def test_decision_guard_is_truncation_and_terminal_needs_reset(self):
        env = CRDEnv(worker=self.worker, max_decisions=1)
        try:
            env.reset(seed=3)
            _, reward, terminated, truncated, info = env.step(0)
            self.assertFalse(terminated)
            self.assertTrue(truncated)
            self.assertEqual(reward, 0)
            self.assertIsNone(info["observation"]["battle"])
            with self.assertRaises(ResetNeeded):
                env.step(0)
            json.dumps(env.replay_record())
        finally:
            env.close()

    def test_rollout_teacher_is_stateless_and_available_at_all_decision_types(self):
        for mode in ("draft", "five-hand-discard"):
            env = CRDEnv({"mode": mode}, worker=self.worker)
            try:
                _, info = env.reset(seed=15, options={"wildDeck": False})
                before = self.worker.request("observe", sessionId=env.session_id)
                evaluation = env.evaluate_actions(samples=2, seed=11000)
                self.assertEqual(len(evaluation["candidates"]), len(info["legal_actions"]))
                self.assertEqual(evaluation["simulations"], 2 * len(info["legal_actions"]))
                self.assertEqual(self.worker.request("observe", sessionId=env.session_id)["observation"], before["observation"])
                self.assertEqual(evaluation, env.evaluate_actions(samples=2, seed=11000))
                while info["observation"]["phase"] != "preparation":
                    action = 0
                    _, _, _, _, info = env.step(action)
                evaluation = env.evaluate_actions(samples=2, seed=12000)
                self.assertEqual([entry["action"] for entry in evaluation["candidates"]], info["legal_actions"])
                self.worker.request("sample", targetSessionId=f"sample-{mode}",
                                    observation=info["observation"],
                                    spec=env._episode_spec, options={"seed": 13000})
            finally:
                env.close()

    def test_root_family_groups_the_same_deal_across_modes_and_seats(self):
        families = set()
        for mode in ("draft", "five-hand-discard"):
            for control in ("player", "opponent"):
                env = CRDEnv({"mode": mode, "control": control}, worker=self.worker)
                try:
                    _, info = env.reset(seed=150)
                    record = env.replay_record()
                    families.add(record["root_family"])
                    self.assertNotIn("root_family", info)
                    self.assertNotIn("root_family", info["observation"])
                finally:
                    env.close()
        self.assertEqual(len(families), 1)


if __name__ == "__main__":
    unittest.main()
