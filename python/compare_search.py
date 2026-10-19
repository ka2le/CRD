"""Compare two frozen-policy tournament reports using paired deal-level differences."""

import argparse
import json
from pathlib import Path

import numpy as np


def compare(reference, challenger):
    for key in ("seed", "deals", "samples", "opponent_samples", "normal_deck", "planning_seed"):
        if reference["settings"][key] != challenger["settings"][key]:
            raise ValueError(f"Unpaired settings: {key}")
    defaults = {"opponent_policy": "search", "opponent_prep_policy": "heuristic", "opponent_completion": "heuristic"}
    for key in ("opponent_model", "prior", *defaults):
        if reference["settings"].get(key, defaults.get(key)) != challenger["settings"].get(key, defaults.get(key)):
            raise ValueError(f"Unpaired settings: {key}")
    def group(report):
        values = {}
        identities = set()
        for game in report["replays"]:
            identity = (game["family"], game["seat"], game["config"]["firstPicker"])
            if identity in identities:
                raise ValueError("Duplicate game identity")
            identities.add(identity)
            values.setdefault(game["family"], []).append((game["reward"] + 1) / 2)
        if any(len(scores) != 4 for scores in values.values()):
            raise ValueError("Incomplete paired seat/starter set")
        return {key: np.mean(scores) for key, scores in values.items()}
    before, after = group(reference), group(challenger)
    if set(before) != set(after) or len(before) < 2:
        raise ValueError("Need identical deal families and at least two deals")
    delta = np.asarray([after[key] - before[key] for key in sorted(before)])
    mean = float(delta.mean())
    margin = 1.96 * float(delta.std(ddof=1) / np.sqrt(len(delta)))
    return {"independent_deals": len(delta), "score_delta": mean,
            "paired_deal_95_interval": [mean - margin, mean + margin],
            "reference_score": reference["score"], "challenger_score": challenger["score"],
            "note": "Approximate normal interval on paired physical-deal means; four games per deal."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("challenger", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = compare(json.loads(args.reference.read_text()), json.loads(args.challenger.read_text()))
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
