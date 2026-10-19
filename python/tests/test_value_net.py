import json
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from copy import deepcopy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from crd.value_net import ValueNet, features, signature, initialize, adam_step, cross_entropy
from crd.worker import HeadlessWorker
from collect_draft import planning_seed, collect_chunk
from train_value import load_shards, warm_start
from crd.draft_model import split_family
from evaluate_search import evaluate_chunk
from compare_search import compare


class ValueNetTests(unittest.TestCase):
    def test_public_features_and_wdl_checkpoint(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 22})
        raw, spec, actions = root["observation"], root["spec"], root["legalActions"]
        x = features(raw, actions, spec)
        self.assertEqual(x.shape, (5, 220))
        changed = deepcopy(raw)
        changed["seed"], changed["deck"] = 0, []
        for key in ("playerHand", "opponentHand", "draftRow", "discardPile"):
            for card in changed[key]:
                card["uid"] = "new/" + card["uid"]
        np.testing.assert_array_equal(x, features(changed, actions, spec))
        np.testing.assert_array_equal(x[::-1], features(raw, actions[::-1], spec))
        model = initialize(x, np.ones((5, 3), dtype=np.float32), signature(spec))
        self.assertEqual(sum(p.size for p in model.parameters) + model.linear.size, 98842)
        np.testing.assert_allclose(model.probabilities(x), model.probabilities(x, baseline_only=True))
        np.testing.assert_allclose(model.probabilities(x).sum(axis=1), 1, atol=1e-6)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.npz"
            model.save(path)
            np.testing.assert_allclose(model.values(x), ValueNet.load(path).values(x))
            deep = initialize(x, np.ones((5, 3), dtype=np.float32), signature(spec), hidden=(280, 192, 128, 64))
            self.assertEqual(sum(p.size for p in deep.parameters) + deep.linear.size, 149650)
            np.testing.assert_allclose(deep.probabilities(x), deep.probabilities(x, baseline_only=True))
            deep.save(path)
            np.testing.assert_allclose(deep.values(x), ValueNet.load(path).values(x))
            deep.signature["dataset_families"] = ["previous-family"]
            deep.save(path)
            new_sig = {**signature(spec), "dataset_families": ["new-family"], "actual_outcome_weight": 8}
            continued = warm_start(path, new_sig)
            np.testing.assert_array_equal(deep.probabilities(x), continued.probabilities(x))
            np.testing.assert_array_equal(deep.mean, continued.mean)
            np.testing.assert_array_equal(deep.linear, continued.linear)
            self.assertEqual(continued.signature["dataset_families"], ["new-family", "previous-family"])
            with self.assertRaisesRegex(ValueError, "widths"):
                warm_start(path, new_sig, (256, 160))
            with self.assertRaisesRegex(ValueError, "signature"):
                warm_start(path, {**new_sig, "cards": "different"})

    def test_aggregated_counts_equal_every_individual_evaluation(self):
        p = np.asarray([[.6, .1, .3], [.2, .3, .5]])
        counts = np.asarray([[3, 1, 2], [1, 2, 3]])
        individual_losses = [-np.log(p[row, outcome]) for row in range(2)
                             for outcome in range(3) for _ in range(counts[row, outcome])]
        self.assertAlmostEqual(cross_entropy(p, counts), float(np.mean(individual_losses)))
        rng = np.random.default_rng(11)
        x = rng.normal(size=(100, 12)).astype(np.float32)
        target = np.zeros((100, 3), dtype=np.float32)
        target[:, 0] = x[:, 0] * x[:, 1] > 0
        target[:, 2] = 1 - target[:, 0]
        model = initialize(x, target, {}, hidden=(32, 16))
        before = cross_entropy(model.probabilities(x), target)
        moments = [np.zeros_like(p) for p in model.parameters]
        variances = [np.zeros_like(p) for p in model.parameters]
        for step in range(1, 201):
            adam_step(model, x, target, moments, variances, step, rate=.003)
        self.assertLess(cross_entropy(model.probabilities(x), target), before * .7)
        deep = initialize(x, target, {}, hidden=(32, 24, 16, 8))
        before = cross_entropy(deep.probabilities(x), target)
        moments = [np.zeros_like(p) for p in deep.parameters]
        variances = [np.zeros_like(p) for p in deep.parameters]
        for step in range(1, 201):
            adam_step(deep, x, target, moments, variances, step, rate=.003)
        self.assertLess(cross_entropy(deep.probabilities(x), target), before * .7)

    def test_collection_rows_targets_resume_and_policy_independent_planning(self):
        self.assertEqual(planning_seed(123, 2, 5), planning_seed(123, 2, 5))
        self.assertNotEqual(planning_seed(123, 2, 5), planning_seed(123, 2, 6))
        with tempfile.TemporaryDirectory() as temporary:
            config = {"directory": temporary, "offset": 0, "deals": 2, "samples": 2, "seed": 987,
                      "planning_seed": 1234, "exploration_seed": 5678, "normal_every": 4, "epsilon": .12}
            result = collect_chunk(config)
            self.assertEqual(result["rows"], 180)
            self.assertEqual(result["continuations"], 360)
            self.assertEqual(result, collect_chunk(config))
            with np.load(Path(temporary) / "shard-000000.npz", allow_pickle=False) as shard:
                self.assertTrue(np.all(shard["counts"].sum(axis=1) == 2))
                self.assertEqual(int(shard["actual"].sum()), 40)
                roots = shard["root"]
                for root in np.unique(roots):
                    self.assertEqual(int(shard["actual"][roots == root].sum()), 1)
            config["samples"] = 3
            with self.assertRaisesRegex(ValueError, "configuration"):
                collect_chunk(config)
            (Path(temporary) / "manifest.json").write_text(json.dumps({"deals": 4, "chunk": 2}))
            with self.assertRaisesRegex(ValueError, "incomplete"):
                load_shards(Path(temporary))

    def test_search_prior_zero_is_base_and_overlap_is_rejected(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 555})
        x = features(root["observation"], root["legalActions"], root["spec"])
        sig = signature(root["spec"])
        sig["dataset_families"] = []
        model = initialize(x, np.ones((5, 3), dtype=np.float32), sig)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "model.npz"
            model.save(path)
            config = {"model": str(path), "offset": 0, "deals": 1, "seed": 8000000,
                      "normal_deck": False, "planning_seed": 41000000, "samples": 1,
                      "opponent_samples": 1, "prior": 0, "policy": "base"}
            base = evaluate_chunk(config)
            neural = evaluate_chunk({**config, "policy": "neural"})
            self.assertEqual(base[0], neural[0])
            self.assertEqual(base[2], 180)
            model.signature["dataset_families"] = [base[0][0]["family"]]
            model.save(path)
            with self.assertRaisesRegex(ValueError, "overlaps"):
                evaluate_chunk(config)

    def test_paired_comparison_and_rejection(self):
        settings = {"seed": 1, "deals": 2, "samples": 16, "opponent_samples": 16,
                    "normal_deck": False, "planning_seed": 123}
        games = [{"family": family, "seat": seat, "config": {"firstPicker": first}, "reward": 0}
                 for family in ("a", "b") for seat in ("player", "opponent") for first in ("player", "opponent")]
        report = {"settings": settings, "replays": games, "score": .5}
        self.assertEqual(compare(report, report)["paired_deal_95_interval"], [0, 0])
        incomplete = {**report, "replays": games[:-1]}
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            compare(report, incomplete)
        changed_opponent = {**report, "settings": {**settings, "opponent_model": "different.npz"}}
        with self.assertRaisesRegex(ValueError, "opponent_model"):
            compare(report, changed_opponent)

    def test_multiple_corpora_preserve_splits_and_separate_root_groups(self):
        families = {}
        for index in range(1000):
            family = f"family-{index}"
            families.setdefault(split_family(family), family)
            if len(families) == 3:
                break
        with tempfile.TemporaryDirectory() as temporary:
            folders = [Path(temporary) / name for name in ("old", "new")]
            for source, folder in enumerate(folders):
                folder.mkdir()
                (folder / "manifest.json").write_text(json.dumps({"deals": 1, "chunk": 1}))
                np.savez(folder / "shard-000000.npz", x=np.full((6, 220), source, dtype=np.float32),
                         counts=np.tile([1, 0, 1], (6, 1)), actual=np.tile([[1, 0, 0], [0, 0, 0]], (3, 1)),
                         root=np.repeat([0, 1, 2], 2), family=np.repeat([families[n] for n in ("train", "validation", "test")], 2),
                         draw2=np.zeros(6, dtype=np.bool_), signature=json.dumps({"features": "test"}))
            sig, parts = load_shards(folders[0], [folders[1]])
            self.assertEqual(set(sig["dataset_families"]), set(families.values()))
            for part in parts.values():
                self.assertEqual(len(part["x"]), 4)
                self.assertEqual(len(np.unique(part["root"])), 2)
                self.assertEqual(len(np.unique(part["family"])), 1)
                self.assertEqual(set(part["x"][:, 0]), {0, 1})
            with self.assertRaisesRegex(ValueError, "more than once"):
                load_shards(folders[0], [folders[0]])

    def test_frozen_model_collection_and_hash_guard(self):
        with HeadlessWorker() as worker:
            root = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 44})
        x = features(root["observation"], root["legalActions"], root["spec"])
        model = initialize(x, np.ones((5, 3), dtype=np.float32), signature(root["spec"]), hidden=(32, 24, 16, 8))
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "frozen.npz"
            model.save(path)
            folder = Path(temporary) / "data"
            folder.mkdir()
            config = {"directory": str(folder), "offset": 0, "deals": 1, "samples": 1, "seed": 444,
                      "planning_seed": 12, "exploration_seed": 34, "normal_every": 4, "epsilon": .12,
                      "model": str(path), "model_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                      "neural_fraction": 1., "prior": 2}
            summary = collect_chunk(config)
            self.assertEqual(summary["rows"], 90)
            self.assertEqual(summary, collect_chunk(config))
            with self.assertRaisesRegex(ValueError, "Frozen collection model changed"):
                collect_chunk({**config, "offset": 20, "model_sha256": "changed"})


if __name__ == "__main__":
    unittest.main()
