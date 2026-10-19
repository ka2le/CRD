import json
import tempfile
import unittest
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import random

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from crd.draft_model import DraftModel, features, split_family, train
from crd.worker import HeadlessWorker
from draft_experiment import choose, family_id, signature


class DraftPipelineTests(unittest.TestCase):
    def test_draft_features_ignore_identity_metadata_and_follow_candidate_permutations(self):
        with HeadlessWorker() as worker:
            response = worker.request("reset", config={"mode": "draft", "control": "both", "seed": 123})
            ids = signature(response["spec"])["card_ids"]
            raw, actions = response["observation"], response["legalActions"]
            x = features(raw, actions, ids)
            changed = deepcopy(raw)
            changed["seed"], changed["debug"] = 999, [12345]
            for key in ("playerHand", "opponentHand", "draftRow", "discardPile"):
                for card in changed[key]:
                    card["uid"] = "changed"
            np.testing.assert_array_equal(x, features(changed, actions, ids))
            np.testing.assert_array_equal(x[::-1], features(raw, actions[::-1], ids))
            action = worker.request("baseline")["action"]
            self.assertEqual(raw, worker.request("observe")["observation"])
            model = SimpleNamespace(signature=signature(response["spec"]), values=lambda x: np.zeros(len(x)))
            hybrid = choose(worker, response, response["spec"], "hybrid", random.Random(1), 1234, 1, model)
            self.assertIn(hybrid, actions)
            worker.request("step", action=action)

    def test_family_groups_seats_and_first_pickers(self):
        with HeadlessWorker() as worker:
            families = set()
            for seat in ("player", "opponent"):
                for first in ("player", "opponent"):
                    config = {"seed": 234, "control": seat, "firstPicker": first}
                    response = worker.request("reset", config=config)
                    families.add(family_id(config, response["spec"]))
            self.assertEqual(len(families), 1)
            self.assertEqual(len({split_family(f) for f in families}), 1)

    def test_network_training_zero_residual_and_roundtrip(self):
        rng = np.random.default_rng(4)
        splits = {}
        for name in ("train", "validation", "test"):
            rows = []
            for group in range(20):
                x = rng.normal(size=(5, 8))
                y = np.tanh(2 * x[:, 0] * x[:, 1])
                record = {"root_family": f"{name}-{group}", "teacher": {
                    "candidates": [{"value": float(value)} for value in y]}}
                rows.append((record, x))
            splits[name] = rows
        model, report = train({"features": "draft-counts-cycle-candidate-v1"}, splits, epochs=120, hidden=32)
        self.assertGreater(report["selected_epoch"], 0)
        self.assertLess(report["splits"]["validation"]["network"]["mse"],
                        report["splits"]["validation"]["linear"]["mse"])
        x = splits["test"][0][1]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.npz"
            model.save(path)
            np.testing.assert_allclose(model.values(x), DraftModel.load(path).values(x))
        model.w2[...] = 0
        model.b2[...] = 0
        np.testing.assert_allclose(model.values(x), model.values(x, baseline_only=True))
        self.assertTrue(np.isfinite(model.values(x)).all())
        json.dumps(report)


if __name__ == "__main__":
    unittest.main()
