"""Budgeted draft WDL fitting and warm-start continuation over grouped shard corpora."""

import argparse
import hashlib
import json
from pathlib import Path
import time

import numpy as np

from crd.draft_model import split_family
from crd.value_net import (FEATURE_VERSION, PREP_FEATURE_VERSION, ValueNet, initialize, adam_step,
                           cross_entropy, prep_width)


def load_shards(directory, additional=()):
    directories = [directory, *additional]
    if len({path.resolve() for path in directories}) != len(directories):
        raise ValueError("Dataset supplied more than once")
    arrays = {key: [] for key in ("x", "counts", "actual", "root", "family", "draw2", "prep")}
    sig = None
    padded_sources = []
    family_codes = {}
    for source, folder in enumerate(directories):
        manifest = json.loads((folder / "manifest.json").read_text())
        for offset in range(0, manifest["deals"], manifest["chunk"]):
            path = folder / f"shard-{offset:06d}.npz"
            if not path.exists():
                raise ValueError(f"Collection incomplete: {path.name}")
            with np.load(path, allow_pickle=False) as shard:
                current = json.loads(str(shard["signature"]))
                pad = 0
                if sig is not None and current != {k: v for k, v in sig.items() if k != "mixed_teachers"}:
                    # Older draft-only shards may join a v3 run: zero preparation block, flag 0.
                    same = {k: v for k, v in current.items() if k not in ("features", "teacher")} == \
                        {k: v for k, v in sig.items() if k not in ("features", "teacher", "mixed_teachers")}
                    if not (same and current["features"] == FEATURE_VERSION and sig["features"] == PREP_FEATURE_VERSION):
                        raise ValueError("Mixed shard versions")
                    pad = prep_width(len(sig["card_ids"]))
                    if current["teacher"] != sig["teacher"]:
                        sig.setdefault("mixed_teachers", [])
                        if current["teacher"] not in sig["mixed_teachers"]:
                            sig["mixed_teachers"].append(current["teacher"])
                    if str(folder) not in padded_sources:
                        padded_sources.append(str(folder))
                elif sig is None:
                    sig = current
                for key in arrays:
                    if key == "prep":
                        arrays[key].append(shard["prep"] if "prep" in shard else np.zeros(len(shard["x"]), dtype=np.bool_))
                    elif key == "x" and pad:
                        arrays[key].append(np.c_[shard["x"], np.zeros((len(shard["x"]), pad), dtype=np.float32)])
                    elif key == "family":
                        unique, inverse = np.unique(shard[key], return_inverse=True)
                        codes = np.asarray([family_codes.setdefault(str(f), len(family_codes)) for f in unique], dtype=np.int32)
                        arrays[key].append(codes[inverse])
                    elif key == "root":
                        arrays[key].append(shard[key] + source * (1 << 40))
                    else:
                        arrays[key].append(shard[key])
    data = {key: np.concatenate(values) for key, values in arrays.items()}
    arrays.clear()
    names = ("train", "validation", "test")
    lookup = np.empty(len(family_codes), dtype=np.int8)
    for family, code in family_codes.items():
        lookup[code] = names.index(split_family(family))
    split = lookup[data["family"]]
    parts = {name: {key: values[split == index] for key, values in data.items()}
             for index, name in enumerate(names)}
    if any(not len(part["x"]) for part in parts.values()):
        raise ValueError("Need nonempty family-disjoint splits")
    sig["dataset_families"] = sorted(family_codes)
    if padded_sources:
        sig["padded_draft_only_sources"] = padded_sources
    return sig, parts


def warm_start(path, sig, hidden=None):
    model = ValueNet.load(path)
    for key, value in sig.items():
        if key not in ("dataset_families", "actual_outcome_weight", "mixed_teachers", "padded_draft_only_sources") \
                and model.signature.get(key) != value:
            raise ValueError(f"Warm-start signature mismatch: {key}")
    widths = tuple(p.shape[1] for p in model.parameters[::2])[:-1]
    if hidden is not None and tuple(hidden) != widths:
        raise ValueError("Warm-start hidden widths differ from requested architecture")
    previous = model.signature.get("dataset_families", [])
    # Keep all old exclusion identities, even if a caller later trains on new shards only.
    model.signature = {**sig, "dataset_families": sorted(set(previous) | set(sig["dataset_families"]))}
    return model


def evaluate(model, data, outcome_weight, baseline_only=False):
    probabilities = np.concatenate([model.probabilities(data["x"][i:i+8192], baseline_only=baseline_only)
                                    for i in range(0, len(data["x"]), 8192)])
    counts = data["counts"].astype(np.float32)
    actual = data["actual"].astype(np.float32)
    target = counts / counts.sum(axis=1, keepdims=True)
    pred = probabilities[:, 0] - probabilities[:, 2]
    target_value = target[:, 0] - target[:, 2]
    # Root IDs are monotonic within each shard; loading is in offset order.
    boundaries = np.r_[0, np.flatnonzero(np.diff(data["root"])) + 1, len(pred)]
    regrets, agreement = [], []
    for start, end in zip(boundaries[:-1], boundaries[1:]):
        selected = start + np.argmax(pred[start:end])
        best = np.max(target_value[start:end])
        regrets.append(float(best - target_value[selected]))
        agreement.append(bool(best == target_value[selected]))
    result = {"rows": len(pred), "roots": len(regrets), "families": len(np.unique(data["family"])),
              "mixed_cross_entropy": cross_entropy(probabilities, counts + outcome_weight * actual),
              "teacher_cross_entropy": cross_entropy(probabilities, counts),
              "actual_search_game_cross_entropy": cross_entropy(probabilities, actual),
              "teacher_value_mse": float(np.mean((pred - target_value) ** 2)),
              "teacher_regret": float(np.mean(regrets)), "teacher_top_choice_rate": float(np.mean(agreement))}
    prep = data["prep"]
    if prep.any():
        prep_roots = np.zeros(len(regrets), dtype=bool)
        for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
            prep_roots[i] = prep[start]
        result["preparation"] = {"rows": int(prep.sum()), "roots": int(prep_roots.sum()),
                                 "teacher_value_mse": float(np.mean((pred[prep]-target_value[prep])**2)),
                                 "cross_entropy": cross_entropy(probabilities[prep], counts[prep]),
                                 "teacher_regret": float(np.mean(np.asarray(regrets)[prep_roots])),
                                 "teacher_top_choice_rate": float(np.mean(np.asarray(agreement)[prep_roots]))}
    draw2 = data["draw2"]
    if draw2.any():
        result["draw2"] = {"rows": int(draw2.sum()), "teacher_value_mse": float(np.mean((pred[draw2]-target_value[draw2])**2)),
                           "cross_entropy": cross_entropy(probabilities[draw2], counts[draw2])}
    return result


def train_run(args):
    started = time.perf_counter()
    sig, parts = load_shards(args.dataset, args.add_data)
    sig["actual_outcome_weight"] = args.outcome_weight
    training = parts["train"]
    counts = training["counts"].astype(np.float32) + args.outcome_weight * training["actual"].astype(np.float32)
    model = warm_start(args.warm_start, sig, args.hidden) if args.warm_start else initialize(
        training["x"], counts, sig, args.seed, hidden=args.hidden or (256, 160))
    parameter_count = sum(p.size for p in model.parameters) + model.linear.size
    shape = [len(model.mean), *[p.shape[1] for p in model.parameters[::2]]]
    print(json.dumps({"parameters": parameter_count, "shape": shape,
                      "split_rows": {key: len(value["x"]) for key, value in parts.items()}}), flush=True)
    args.directory.mkdir(parents=True, exist_ok=True)
    moments = [np.zeros_like(p) for p in model.parameters]
    variances = [np.zeros_like(p) for p in model.parameters]
    rng = np.random.default_rng(args.seed)
    initial_validation = evaluate(model, parts["validation"], args.outcome_weight)
    best = initial_validation["mixed_cross_entropy"]
    best_epoch = step = 0
    model.save(args.directory / "best.npz")
    model.save(args.directory / "initial.npz")
    with (args.directory / "learning.jsonl").open("w", encoding="utf-8") as log:
        for epoch in range(1, args.epochs + 1):
            tick = time.perf_counter()
            order = rng.permutation(len(counts))
            # Smooth decay across the requested training window; no test-based tuning.
            fraction = min(1., (tick - started) / args.seconds)
            rate = args.learning_rate * (.1 + .9 * (1 + np.cos(np.pi * fraction)) / 2)
            for start in range(0, len(order), args.batch):
                indices = order[start:start+args.batch]
                step += 1
                adam_step(model, training["x"][indices], counts[indices], moments, variances, step, rate,
                          weight_decay=args.weight_decay)
            validation = evaluate(model, parts["validation"], args.outcome_weight)
            if validation["mixed_cross_entropy"] < best:
                best, best_epoch = validation["mixed_cross_entropy"], epoch
                model.save(args.directory / "best.npz")
            progress = {"epoch": epoch, "best_epoch": best_epoch, "seconds": round(time.perf_counter()-started, 1),
                        "epoch_seconds": round(time.perf_counter()-tick, 2), "learning_rate": rate,
                        "validation": validation}
            log.write(json.dumps(progress) + "\n")
            log.flush()
            (args.directory / "progress.json").write_text(json.dumps(progress, indent=2), encoding="utf-8")
            if args.snapshot_every and epoch % args.snapshot_every == 0:
                model.save(args.directory / f"epoch-{epoch:04d}.npz")
            if epoch == 1 or epoch % 5 == 0:
                print(json.dumps(progress), flush=True)
            if time.perf_counter()-started >= args.seconds:
                break
    model.save(args.directory / "last.npz")
    chosen = ValueNet.load(args.directory / "best.npz")
    starting = ValueNet.load(args.warm_start) if args.warm_start else None
    report = {"parameters": parameter_count, "shape": shape, "epochs": epoch, "selected_epoch": best_epoch,
              "seconds": time.perf_counter()-started, "seed": args.seed, "learning_rate": args.learning_rate,
              "weight_decay": args.weight_decay,
              "datasets": [str(path.resolve()) for path in [args.dataset, *args.add_data]],
              "warm_start": None if args.warm_start is None else str(args.warm_start.resolve()),
              "warm_start_sha256": None if args.warm_start is None else hashlib.sha256(args.warm_start.read_bytes()).hexdigest(),
              "initial_validation": initial_validation,
              "actual_outcome_weight": args.outcome_weight, "splits": {
                  name: {"linear": evaluate(chosen, data, args.outcome_weight, baseline_only=True),
                         "network": evaluate(chosen, data, args.outcome_weight),
                         **({"starting_network": evaluate(starting, data, args.outcome_weight)} if starting else {})}
                  for name, data in parts.items()}}
    (args.directory / "training.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--add-data", type=Path, action="append", default=[], help="Mix additional complete shard directories")
    parser.add_argument("--warm-start", type=Path, help="Continue existing weights/scaling/prior; initialize a fresh optimizer")
    parser.add_argument("--epochs", type=int, default=1000)
    parser.add_argument("--seconds", type=float, default=600)
    parser.add_argument("--batch", type=int, default=2048)
    parser.add_argument("--learning-rate", type=float, default=.0006)
    parser.add_argument("--outcome-weight", type=float, default=8)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--weight-decay", type=float, default=1e-5, help="L2 coefficient added to every gradient")
    parser.add_argument("--snapshot-every", type=int, default=0, help="Also save epoch-NNNN.npz every N epochs (0 = off)")
    parser.add_argument("--hidden", type=lambda value: tuple(int(size) for size in value.split(",")), default=None,
                        help="Hidden widths; four-layer alternative: 280,192,128,64 (~150k total parameters)")
    args = parser.parse_args()
    if min(args.epochs, args.seconds, args.batch, args.learning_rate) <= 0 or args.outcome_weight < 0:
        parser.error("Invalid training budget/settings")
    if args.hidden is not None and (not args.hidden or min(args.hidden) < 1):
        parser.error("Hidden widths must be positive")
    if args.directory.exists() and any(args.directory.iterdir()):
        parser.error("Use a fresh checkpoint directory; existing training artifacts are preserved")
    train_run(args)


if __name__ == "__main__":
    main()
