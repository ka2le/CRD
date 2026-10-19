import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from crd.value_net import (FEATURE_VERSION, PREP_FEATURE_VERSION, features, feature_width, initialize,
                           model_features, prep_width, signature, ValueNet)
from crd.worker import HeadlessWorker
from collect_draft import collect_chunk
from compare_search import compare
from evaluate_search import evaluate_chunk
from train_value import load_shards


def preparation_root(worker, seed):
    """First preparation decision with more than one option, reached by baseline play."""
    response = worker.request("reset", config={"mode": "draft", "control": "both", "seed": seed})
    while not response["terminal"]:
        if response["observation"]["phase"] == "preparation" and len(response["legalActions"]) > 1:
            return response
        response = worker.request("step", action=worker.request("baseline")["action"])
    return None


class PreparationModelTests(unittest.TestCase):
    def test_v3_draft_rows_are_v2_rows_plus_zero_block_and_prep_rows_permute(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 31})
            spec = root["spec"]
            v2 = features(root["observation"], root["legalActions"], spec)
            v3 = model_features(PREP_FEATURE_VERSION, root["observation"], root["legalActions"], spec)
            self.assertEqual(v3.shape[1], feature_width(spec))
            np.testing.assert_array_equal(v3[:, :v2.shape[1]], v2)
            self.assertFalse(v3[:, v2.shape[1]:].any())
            prep_root = next(r for r in (preparation_root(worker, s) for s in range(40, 80)) if r)
            obs, legal = prep_root["observation"], prep_root["legalActions"]
            prep = worker.request("preparation-features", observation=obs, legalActions=legal)["actions"]
            x = model_features(PREP_FEATURE_VERSION, obs, legal, spec, prep)
            self.assertEqual(x.shape, (len(legal), feature_width(spec)))
            self.assertTrue((x[:, v2.shape[1]] == 1).all())  # preparation flag
            self.assertIsNone(model_features(FEATURE_VERSION, obs, legal, spec, prep))
            order = list(reversed(range(len(legal))))
            reversed_prep = worker.request("preparation-features", observation=obs,
                                           legalActions=[legal[i] for i in order])["actions"]
            y = model_features(PREP_FEATURE_VERSION, obs, [legal[i] for i in order], spec, reversed_prep)
            np.testing.assert_array_equal(y, x[order])
            # Afterstates are a function of the acting seat's observation only.
            stripped = {**obs, "history": []}
            self.assertEqual(worker.request("preparation-features", observation=stripped, legalActions=legal)["actions"], prep)

    def test_prep_collection_rows_mix_with_padded_draft_only_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = {"seed": 3100009, "planning_seed": 23100000, "exploration_seed": 33100000, "samples": 2,
                    "epsilon": 0, "normal_every": 0, "chunk": 3, "deals": 3, "offset": 0}
            new, old = Path(temporary) / "new", Path(temporary) / "old"
            for folder, extra in ((new, {"prep_search": True, "completion": "prep-lookahead"}), (old, {})):
                folder.mkdir()
                config = {**base, **extra, "directory": str(folder)}
                (folder / "manifest.json").write_text(json.dumps(config))
                summary = collect_chunk(config)
                self.assertGreater(summary["roots"], 0)
            with np.load(new / "shard-000000.npz") as shard:
                self.assertTrue(shard["prep"].any())
                self.assertEqual(shard["x"].shape[1], 388)
                for root in np.unique(shard["root"]):
                    self.assertEqual(int(shard["actual"][shard["root"] == root].sum()), 1)
                self.assertEqual(json.loads(str(shard["signature"]))["teacher"],
                                 "observation-sampled-prep-lookahead-completion-v1")
            with self.assertRaises(ValueError):  # draft-only data cannot be the primary v3 corpus
                load_shards(old, [new])
            sig, parts = load_shards(new, [old])
            self.assertEqual(sig["features"], PREP_FEATURE_VERSION)
            self.assertIn("observation-sampled-heuristic-completion-v1", sig["mixed_teachers"])
            rows = np.concatenate([part["x"] for part in parts.values()])
            prep = np.concatenate([part["prep"] for part in parts.values()])
            self.assertEqual(rows.shape[1], 388)
            self.assertFalse(rows[~prep, 220:].any())

    def test_preparation_search_evaluation_and_pairing_guards(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 77})
        spec = root["spec"]
        x = model_features(PREP_FEATURE_VERSION, root["observation"], root["legalActions"], spec)
        sig = signature(spec, PREP_FEATURE_VERSION, "test")
        sig["dataset_families"] = []
        model = initialize(x, np.ones((len(x), 3), dtype=np.float32), sig, hidden=(16, 8, 8))
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.npz"
            model.save(path)
            self.assertEqual(ValueNet.load(path).signature["features"], PREP_FEATURE_VERSION)
            config = {"model": str(path), "offset": 0, "deals": 1, "seed": 8100000, "normal_deck": False,
                      "planning_seed": 41000000, "samples": 2, "opponent_samples": 2, "prior": 2,
                      "policy": "neural", "prep_policy": "search", "completion": "prep-lookahead"}
            games, _, simulations = evaluate_chunk(config)
            self.assertEqual(len(games), 4)
            base, _, base_simulations = evaluate_chunk({**config, "prep_policy": "heuristic", "completion": "heuristic"})
            self.assertGreaterEqual(simulations, base_simulations)
        settings = {"seed": 1, "deals": 2, "samples": 16, "opponent_samples": 16, "normal_deck": False,
                    "planning_seed": 1}
        replays = [{"family": f, "seat": s, "config": {"firstPicker": p}, "reward": 0}
                   for f in "ab" for s in ("player", "opponent") for p in ("player", "opponent")]
        report = {"settings": settings, "score": .5, "replays": replays}
        compare(report, {**report, "settings": {**settings, "prep_policy": "search"}})
        with self.assertRaisesRegex(ValueError, "opponent_prep_policy"):
            compare(report, {**report, "settings": {**settings, "opponent_prep_policy": "search"}})


if __name__ == "__main__":
    unittest.main()
