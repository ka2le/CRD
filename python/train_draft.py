"""Fit the first draft-only residual network with family-disjoint validation/test."""

import argparse
import json
from pathlib import Path

from crd.draft_model import load_dataset, train


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=200)
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    signature, splits = load_dataset(args.dataset)
    model, report = train(signature, splits, epochs=args.epochs)
    report["training_families"] = sorted({r["root_family"] for r, _ in splits["train"]})
    report["all_dataset_families"] = sorted({r["root_family"] for rows in splits.values() for r, _ in rows})
    model.signature["dataset_families"] = report["all_dataset_families"]
    model.save(args.model)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["splits"], indent=2))


if __name__ == "__main__":
    main()
