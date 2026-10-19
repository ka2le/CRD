"""Small NumPy residual action-value network; inputs are permitted draft information only."""

import hashlib
import json
from pathlib import Path

import numpy as np

FEATURE_VERSION = "draft-counts-cycle-candidate-v1"


def features(observation, actions, card_ids):
    if observation["mode"] != "draft" or any(a["type"] != "draft-pick" for a in actions):
        raise ValueError("The first model supports draft picks only")
    index = {name: i for i, name in enumerate(card_ids)}

    def counts(cards):
        result = np.zeros(len(card_ids))
        for card in cards:
            result[index[card["id"]]] += 1
        return result / 5

    own = counts(observation["playerHand"])
    enemy = counts(observation["opponentHand"])
    row = counts(observation["draftRow"])
    discarded = counts(observation["discardPile"])
    cycles = np.asarray([observation[key]["cycle"] for key in ("ownCombat", "knownOpponentCombat")]).ravel() / 21
    context = np.asarray([
        observation["packNumber"] / 5, observation["picksThisPack"] / 2,
        observation["firstPicker"] == observation["side"], observation["wildDeck"],
    ])
    return np.asarray([np.concatenate([
        own, enemy, row, discarded, counts([action["card"]]), cycles, context,
    ]) for action in actions], dtype=np.float64)


def split_family(family):
    """Stable split before candidate expansion; all seats/branches stay together."""
    bucket = int(hashlib.sha256(family.encode()).hexdigest()[:8], 16) % 10
    return "test" if bucket == 0 else "validation" if bucket == 1 else "train"


def load_dataset(path):
    records = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line]
    if not records:
        raise ValueError("Empty dataset")
    signature = records[0]["signature"]
    if any(record["signature"] != signature for record in records):
        raise ValueError("Mixed dataset versions/catalogs")
    seen = set()
    unique = []
    for record in records:
        if record["observation"]["phase"] == "preparation":
            raise ValueError("Preparation is outside the first model's scope")
        # Ignore physical UID/seed metadata when deduplicating information states.
        x = features(record["observation"], record["legal_actions"], signature["card_ids"])
        key = hashlib.sha256(x.tobytes()).hexdigest()
        if key not in seen:
            seen.add(key)
            unique.append((record, x))
    splits = {}
    for name in ("train", "validation", "test"):
        subset = [(r, x) for r, x in unique if split_family(r["root_family"]) == name]
        if not subset:
            raise ValueError(f"No {name} families; collect more games")
        splits[name] = subset
    return signature, splits


class DraftModel:
    def __init__(self, signature, mean, scale, linear, w1, b1, w2, b2):
        self.signature = signature
        self.mean, self.scale, self.linear = mean, scale, linear
        self.w1, self.b1, self.w2, self.b2 = w1, b1, w2, b2

    def values(self, x, *, baseline_only=False):
        z = (x - self.mean) / self.scale
        base = np.c_[z, np.ones(len(z))] @ self.linear
        return np.tanh(base if baseline_only else base + np.tanh(z @ self.w1 + self.b1) @ self.w2 + self.b2)

    def choose(self, observation, actions):
        return int(np.argmax(self.values(features(observation, actions, self.signature["card_ids"]))))

    def save(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, signature=json.dumps(self.signature), **{
            name: getattr(self, name) for name in ("mean", "scale", "linear", "w1", "b1", "w2", "b2")
        })

    @classmethod
    def load(cls, path):
        with np.load(path, allow_pickle=False) as data:
            signature = json.loads(str(data["signature"]))
            if signature["features"] != FEATURE_VERSION:
                raise ValueError("Unsupported model features")
            return cls(signature, **{name: data[name] for name in ("mean", "scale", "linear", "w1", "b1", "w2", "b2")})


def metrics(model, records, *, baseline_only=False):
    errors, regrets, hits = [], [], []
    for record, x in records:
        target = np.asarray([c["value"] for c in record["teacher"]["candidates"]])
        values = model.values(x, baseline_only=baseline_only)
        errors.extend((values - target) ** 2)
        chosen = int(np.argmax(values))
        regrets.append(float(target.max() - target[chosen]))
        hits.append(bool(target[chosen] == target.max()))
    return {"states": len(records), "families": len({r["root_family"] for r, _ in records}),
            "mse": float(np.mean(errors)), "teacher_regret": float(np.mean(regrets)),
            "teacher_top_choice_rate": float(np.mean(hits))}


def train(signature, splits, *, epochs=200, seed=7, hidden=64):
    rng = np.random.default_rng(seed)
    x = np.concatenate([x for _, x in splits["train"]])
    y = np.concatenate([[c["value"] for c in r["teacher"]["candidates"]] for r, _ in splits["train"]])
    mean, scale = x.mean(axis=0), np.maximum(x.std(axis=0), .1)
    z = (x - mean) / scale
    design = np.c_[z, np.ones(len(z))]
    # A calibrated linear prior in outcome units; no teacher/search value is required at inference.
    linear = np.linalg.solve(design.T @ design + 10 * np.eye(design.shape[1]),
                             design.T @ np.arctanh(np.clip(y, -.95, .95)))
    model = DraftModel(signature, mean, scale, linear,
                       rng.normal(0, 1 / np.sqrt(z.shape[1]), (z.shape[1], hidden)),
                       np.zeros(hidden), np.zeros(hidden), np.zeros(()))
    parameters = [model.w1, model.b1, model.w2, model.b2]
    moments = [np.zeros_like(p) for p in parameters]
    variances = [np.zeros_like(p) for p in parameters]
    best = [p.copy() for p in parameters]
    best_loss = metrics(model, splits["validation"])["mse"]
    step = best_epoch = 0
    for epoch in range(epochs):
        for batch in np.array_split(rng.permutation(len(z)), max(1, (len(z) + 255) // 256)):
            xb, yb = z[batch], y[batch]
            h = np.tanh(xb @ model.w1 + model.b1)
            pred = np.tanh(design[batch] @ linear + h @ model.w2 + model.b2)
            delta = 2 * (pred - yb) * (1 - pred ** 2) / len(batch)
            hidden_delta = delta[:, None] * model.w2 * (1 - h ** 2)
            gradients = [xb.T @ hidden_delta, hidden_delta.sum(axis=0), h.T @ delta, delta.sum()]
            step += 1
            for p, m, v, g in zip(parameters, moments, variances, gradients):
                g = g + 1e-4 * p
                m *= .9
                m += .1 * g
                v *= .999
                v += .001 * g ** 2
                p -= .002 * (m / (1 - .9 ** step)) / (np.sqrt(v / (1 - .999 ** step)) + 1e-8)
        loss = metrics(model, splits["validation"])["mse"]
        if loss < best_loss:
            best_loss, best_epoch = loss, epoch + 1
            best = [p.copy() for p in parameters]
    for p, chosen in zip(parameters, best):
        p[...] = chosen
    return model, {"epochs": epochs, "selected_epoch": best_epoch, "seed": seed,
                   "splits": {name: {"linear": metrics(model, rows, baseline_only=True),
                                      "network": metrics(model, rows)} for name, rows in splits.items()}}
