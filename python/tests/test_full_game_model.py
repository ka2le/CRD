"""Coverage for private discard inputs, full-game collection, and old-model fallback."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from collect_draft import collect_chunk
from crd.value_net import (FULL_FEATURE_VERSION, PREP_FEATURE_VERSION, ValueNet, feature_width,
                           initialize, model_features, signature)
from crd.worker import HeadlessWorker
from evaluate_search import evaluate_chunk
from train_value import load_shards


class FullGameModelTests(unittest.TestCase):
    def test_discard_candidates_visibility_and_checkpoint(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "five-hand-discard", "control": "both", "seed": 77})
        obs, actions, spec = root["observation"], root["legalActions"], root["spec"]
        x = model_features(FULL_FEATURE_VERSION, obs, actions, spec)
        self.assertEqual(x.shape, (32, 424))
        self.assertEqual(feature_width(spec, FULL_FEATURE_VERSION), 424)
        self.assertIsNone(model_features(PREP_FEATURE_VERSION, obs, actions, spec))
        np.testing.assert_array_equal(x[::-1], model_features(FULL_FEATURE_VERSION, obs, actions[::-1], spec))
        self.assertEqual(len(np.unique(x, axis=0)), 32)
        renamed = deepcopy(obs)
        remap = {c["uid"]: f"new/{c['uid']}" for c in obs["playerHand"]}
        for card in renamed["playerHand"]:
            card["uid"] = remap[card["uid"]]
        renamed["seed"], renamed["deck"] = 999, ["hidden secret"]
        renamed_actions = [{**a, "selectedIds": [remap[uid] for uid in a["selectedIds"]]} for a in actions]
        np.testing.assert_array_equal(x, model_features(FULL_FEATURE_VERSION, renamed, renamed_actions, spec))
        changed = {**obs, "playerDiscardsUsed": 1}
        self.assertFalse(np.array_equal(x, model_features(FULL_FEATURE_VERSION, changed, actions, spec)))
        sig = signature(spec, FULL_FEATURE_VERSION)
        sig["dataset_families"] = []
        model = initialize(x, np.ones((32, 3)), sig, hidden=(240, 192, 144, 96, 64, 48))
        self.assertEqual(sum(p.size for p in model.parameters) + model.linear.size, 200734)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.npz"
            model.save(path)
            np.testing.assert_array_equal(model.values(x), ValueNet.load(path).values(x))
            games, _, _ = evaluate_chunk({"model": str(path), "offset": 0, "deals": 1, "seed": 18100000,
                "normal_deck": False, "mode": "five-hand-discard", "planning_seed": 61000000,
                "samples": 1, "opponent_samples": 1, "prior": 2, "policy": "neural", "prep_policy": "search",
                "opponent_prep_policy": "search", "completion": "prep-lookahead", "opponent_completion": "prep-lookahead"})
            self.assertEqual(len(games), 2)

    def test_mixed_collection_splits_and_preparation_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            config = {"directory": temporary, "offset": 0, "deals": 6, "chunk": 6, "samples": 1,
                      "seed": 17000000, "planning_seed": 51000000, "exploration_seed": 71000000,
                      "normal_every": 4, "epsilon": 0, "prep_search": True,
                      "modes": ["draft", "five-hand-discard"], "completion": "prep-lookahead"}
            Path(temporary, "manifest.json").write_text(json.dumps(config))
            report = collect_chunk(config)
            self.assertEqual(report["games"], 9)
            with np.load(Path(temporary) / "shard-000000.npz") as shard:
                x = shard["x"]
                self.assertEqual(x.shape[1], 424)
                self.assertTrue((x[:, 415] == 1).any())  # discard mode
                self.assertTrue((x[:, 416] == 1).any())  # discard action
                self.assertTrue(shard["prep"].any())
                for root in np.unique(shard["root"]):
                    self.assertEqual(int(shard["actual"][shard["root"] == root].sum()), 1)
            _, parts = load_shards(Path(temporary))
            families = [set(part["family"]) for part in parts.values()]
            for i in range(3):
                for j in range(i):
                    self.assertFalse(families[i] & families[j])


if __name__ == "__main__":
    unittest.main()
