"""Merge partial evaluate_search.py reports (same settings, disjoint --deal-range) into one report."""

import argparse
import json
from pathlib import Path

import numpy as np


def merge(reports):
    def portable(value):
        # Parts may come from different machines: compare model files relative to .ai-runs.
        return value.replace("\\", "/").split(".ai-runs/")[-1] if isinstance(value, str) else value

    strip = lambda s: {k: portable(v) for k, v in s.items() if k not in ("output", "workers", "chunk")}
    settings = reports[0]["settings"]
    if any(strip(report["settings"]) != strip(settings) for report in reports):
        raise ValueError("Partial reports have different settings")
    games = [game for report in reports for game in report["replays"]]
    identities = {(g["family"], g["seat"], g["config"]["firstPicker"]) for g in games}
    if len(identities) != len(games) or len(games) != 4 * settings["deals"]:
        raise ValueError(f"Need exactly the full schedule once: {len(games)} games for {settings['deals']} deals")
    games.sort(key=lambda g: (g["config"]["seed"], g["seat"], g["config"]["firstPicker"]))
    by_family = {}
    for game in games:
        by_family.setdefault(game["family"], []).append((game["reward"] + 1) / 2)
    clustered = np.asarray([np.mean(scores) for scores in by_family.values()])
    se = clustered.std(ddof=1) / np.sqrt(len(clustered))
    latency = [ms for report in reports for ms in [report["median_draft_ms"]]]
    return {"settings": settings, "games": len(games), "independent_deals": len(clustered),
            "wins": sum(g["reward"] == 1 for g in games), "draws": sum(g["reward"] == 0 for g in games),
            "losses": sum(g["reward"] == -1 for g in games), "score": float(clustered.mean()),
            "deal_clustered_95_interval": [max(0, float(clustered.mean()-1.96*se)), min(1, float(clustered.mean()+1.96*se))],
            "median_draft_ms": float(np.median(latency)), "p95_draft_ms": max(r["p95_draft_ms"] for r in reports),
            "simulated_continuations": sum(r["simulated_continuations"] for r in reports),
            "seconds": sum(r["seconds"] for r in reports), "merged_parts": [r.get("deal_range") for r in reports],
            "replays": games}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("parts", type=Path, nargs="+")
    args = parser.parse_args()
    report = merge([json.loads(path.read_text()) for path in args.parts])
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "replays"}, indent=2))


if __name__ == "__main__":
    main()
