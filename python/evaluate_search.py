"""Paired base-search versus neural-prior search on fresh deals, both seats/starters."""

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import json
import os
from pathlib import Path
import time

import numpy as np

from crd.value_net import ValueNet, features, signature
from crd.worker import HeadlessWorker
from collect_draft import planning_seed, search_index
from draft_experiment import family_id


def evaluate_chunk(config):
    model = ValueNet.load(config["model"])
    opponent = ValueNet.load(config["opponent_model"]) if config.get("opponent_model") else None
    excluded = set(model.signature["dataset_families"])
    if opponent:
        excluded.update(opponent.signature["dataset_families"])
    games, latencies = [], []
    simulations = 0
    with HeadlessWorker(timeout=120) as worker:
        for deal in range(config["offset"], config["offset"] + config["deals"]):
            for seat_index, seat in enumerate(("player", "opponent")):
                for first_index, first in enumerate(("player", "opponent")):
                    game = deal * 4 + seat_index * 2 + first_index
                    actual_config = {"mode": "draft", "control": "both", "seed": config["seed"] + deal,
                                     "wildDeck": not config["normal_deck"], "firstPicker": first,
                                     "revealOpponent": False}
                    response = worker.request("reset", config=actual_config)
                    spec = response["spec"]
                    if any(model.signature[k] != value for k, value in signature(spec).items()):
                        raise ValueError("Model/engine mismatch")
                    if opponent and any(opponent.signature[k] != value for k, value in signature(spec).items()):
                        raise ValueError("Opponent model/engine mismatch")
                    family = family_id(actual_config, spec)
                    if family in excluded:
                        raise ValueError("Evaluation overlaps model data")
                    turn = decisions = 0
                    actions = []
                    while not response["terminal"]:
                        decisions += 1
                        if decisions > 1000:
                            raise RuntimeError("Decision guard")
                        actor = response["actor"]
                        if response["observation"]["phase"] == "preparation" or (
                                actor != seat and config.get("opponent_policy") == "heuristic"):
                            # Preparation, and optionally the opponent's draft, use the Rules AI heuristic.
                            action = worker.request("baseline")["action"]
                        else:
                            tick = time.perf_counter()
                            is_candidate = actor == seat
                            samples = config["samples"] if is_candidate else config["opponent_samples"]
                            report = worker.request("evaluate", observation=response["observation"], spec=spec,
                                                    options={"seed": planning_seed(config["planning_seed"], game, turn),
                                                             "samples": samples})["evaluation"]
                            simulations += report["simulations"]
                            chosen = search_index(report)
                            prior_model = model if is_candidate and config["policy"] != "base" else opponent if not is_candidate else None
                            if prior_model is not None and config["prior"] > 0:
                                p = prior_model.probabilities(features(response["observation"], response["legalActions"], spec),
                                                              baseline_only=is_candidate and config["policy"] == "linear")
                                values = np.asarray([c["value"] for c in report["candidates"]], dtype=np.float32)
                                # A fixed number of virtual WDL samples smooths noisy search estimates.
                                score = (samples * values + config["prior"] * (p[:, 0] - p[:, 2])) / (samples + config["prior"])
                                chosen = int(np.argmax(score))
                            action = response["legalActions"][chosen]
                            if is_candidate:
                                latencies.append(time.perf_counter() - tick)
                            turn += 1
                        actions.append({"actor": actor, "action": action})
                        response = worker.request("step", action=action)
                    games.append({"family": family, "seat": seat, "config": actual_config,
                                  "reward": response["rewards"][seat], "actions": actions})
    return games, latencies, simulations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--policy", choices=["base", "neural", "linear"], default="neural")
    parser.add_argument("--deals", type=int, default=500)
    parser.add_argument("--seed", type=int, default=8000000)
    parser.add_argument("--planning-seed", type=int, default=41000000)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--opponent-samples", type=int, default=16)
    parser.add_argument("--prior", type=float, default=2)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--chunk", type=int, default=10)
    parser.add_argument("--normal-deck", action="store_true")
    parser.add_argument("--opponent-model", type=Path, help="Frozen neural-prior search opponent (default: base search)")
    parser.add_argument("--opponent-policy", choices=["search", "heuristic"], default="search",
                        help="heuristic = opponent drafts with the Rules AI (browser Easy) instead of searching")
    args = parser.parse_args()
    if min(args.deals, args.workers, args.chunk) < 1 or min(args.samples, args.opponent_samples) < 1 or max(args.samples, args.opponent_samples) > 256 or args.prior < 0:
        parser.error("Invalid evaluation settings")
    if args.output.resolve() == args.model.resolve():
        parser.error("Output must not overwrite the model")
    if args.opponent_policy == "heuristic" and args.opponent_model:
        parser.error("--opponent-model is unused with a heuristic opponent")
    if args.opponent_model and args.output.resolve() == args.opponent_model.resolve():
        parser.error("Output must not overwrite the opponent")
    settings = vars(args).copy()
    settings["model"] = str(args.model.resolve())
    settings["output"] = str(args.output.resolve())
    settings["opponent_model"] = str(args.opponent_model.resolve()) if args.opponent_model else None
    jobs = [{**settings, "offset": offset, "deals": min(args.chunk, args.deals-offset)} for offset in range(0, args.deals, args.chunk)]
    start = time.perf_counter()
    games, latency = [], []
    simulations = 0
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        for future in as_completed([executor.submit(evaluate_chunk, config) for config in jobs]):
            result, times, completed = future.result()
            games.extend(result)
            latency.extend(times)
            simulations += completed
            print(json.dumps({"policy": args.policy, "games": len(games), "seconds": round(time.perf_counter()-start, 1)}), flush=True)
    games.sort(key=lambda g: (g["config"]["seed"], g["seat"], g["config"]["firstPicker"]))
    by_family = {family: [] for family in {game["family"] for game in games}}
    for game in games:
        by_family[game["family"]].append((game["reward"] + 1) / 2)
    clustered = np.asarray([np.mean(scores) for scores in by_family.values()])
    se = clustered.std(ddof=1) / np.sqrt(len(clustered)) if len(clustered) > 1 else None
    report = {"settings": settings, "games": len(games), "independent_deals": len(clustered),
              "wins": sum(g["reward"] == 1 for g in games), "draws": sum(g["reward"] == 0 for g in games),
              "losses": sum(g["reward"] == -1 for g in games), "score": float(clustered.mean()),
              "deal_clustered_95_interval": None if se is None else [max(0, float(clustered.mean()-1.96*se)), min(1, float(clustered.mean()+1.96*se))],
              "median_draft_ms": float(np.median(latency)*1000), "p95_draft_ms": float(np.percentile(latency, 95)*1000),
              "simulated_continuations": simulations,
              "seconds": time.perf_counter()-start, "replays": games}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "replays"}, indent=2), flush=True)


if __name__ == "__main__":
    main()
