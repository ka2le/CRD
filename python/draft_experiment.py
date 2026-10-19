"""Draft-only data/tournaments. Every preparation decision uses the existing JS heuristic."""

import argparse
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np

from crd.draft_model import DraftModel, FEATURE_VERSION, features
from crd.worker import HeadlessWorker


def family_id(config, spec):
    return hashlib.sha256(json.dumps({"seed": config["seed"], "pool": spec["poolCards"],
                                     "rules": spec["rulesVersion"], "cards": spec["cardDataHash"]},
                                    sort_keys=True).encode()).hexdigest()


def signature(spec):
    return {"features": FEATURE_VERSION, "rules": spec["rulesVersion"], "cards": spec["cardDataHash"],
            "card_ids": [card["id"] for card in spec["cardTypes"]],
            "teacher": "uniform-feasible-random-private-prep-v1/heuristic-v1"}


def choose(worker, response, spec, policy, rng, planning_seed, samples, model=None, evaluation=None):
    if policy == "heuristic":
        return worker.request("baseline")["action"]
    actions = response["legalActions"]
    if policy == "random":
        return rng.choice(actions)
    if policy in ("rollout", "hybrid"):
        evaluation = evaluation or worker.request("evaluate", observation=response["observation"], spec=spec,
                                                  options={"seed": planning_seed, "samples": samples})["evaluation"]
        values = np.asarray([c["value"] for c in evaluation["candidates"]], dtype=float)
        if policy == "hybrid":
            # Small fixed smoothing correction; retained as an experimental ablation.
            values += .05 * model.values(features(response["observation"], actions, model.signature["card_ids"]))
        else:
            # Retain heuristic choice on estimated ties when possible.
            best = evaluation["bestIndices"]
            return actions[evaluation["baselineIndex"] if evaluation["baselineIndex"] in best else best[0]]
        return actions[int(np.argmax(values))]
    x = features(response["observation"], actions, model.signature["card_ids"])
    return actions[int(np.argmax(model.values(x, baseline_only=policy == "linear")))]


def run(args):
    model = DraftModel.load(args.model) if args.model else None
    if args.policy in ("neural", "linear", "hybrid") and model is None:
        raise ValueError("Neural/linear/hybrid policies require --model")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    dataset = args.dataset.open("w", encoding="utf-8") if args.dataset else None
    games, latency = [], []
    states = simulations = 0
    start = time.perf_counter()
    planning = args.planning_seed
    try:
        with HeadlessWorker(timeout=120) as worker:
            for deal in range(args.deals):
                # Four games per physical deal: both candidate seats and opening pickers.
                for seat in ("player", "opponent"):
                    for first in ("player", "opponent"):
                        config = {"mode": "draft", "control": "both", "seed": args.seed + deal,
                                  "firstPicker": first, "wildDeck": not args.normal_deck, "revealOpponent": False}
                        response = worker.request("reset", config=config)
                        spec = response["spec"]
                        sig = signature(spec)
                        family = family_id(config, spec)
                        if model and any(model.signature[k] != sig[k] for k in sig):
                            raise ValueError("Model and engine signature mismatch")
                        if model and family in model.signature.get("dataset_families", []):
                            raise ValueError("Tournament deal overlaps model dataset")
                        # Exploration RNG is independent of the deck/planning streams.
                        rng = random.Random(args.exploration_seed + len(games))
                        actions = []
                        while not response["terminal"]:
                            if len(actions) >= 1000:
                                raise RuntimeError("Decision guard exceeded; no outcome recorded")
                            actor = response["actor"]
                            draft = response["observation"]["phase"] != "preparation"
                            policy = args.policy if actor == seat else args.opponent
                            if args.dataset:
                                policy = ("heuristic", "random", "rollout")[deal % 3]
                            evaluation = None
                            tick = time.perf_counter()
                            if draft and (args.dataset or policy in ("rollout", "hybrid")):
                                evaluation = worker.request("evaluate", observation=response["observation"], spec=spec,
                                                            options={"seed": planning, "samples": args.samples})["evaluation"]
                                simulations += evaluation["simulations"]
                            if draft and args.dataset:
                                record = {"kind": "draft-decision-v1", "signature": sig, "root_family": family,
                                          "game": len(games), "config": config, "behavior": policy,
                                          "observation": response["observation"], "legal_actions": response["legalActions"],
                                          "teacher": evaluation, "planning_seed": planning}
                                dataset.write(json.dumps(record) + "\n")
                                states += 1
                            action = choose(worker, response, spec, policy if draft else "heuristic", rng,
                                            planning, args.samples, model, evaluation)
                            if draft and actor == seat:
                                latency.append(time.perf_counter() - tick)
                            planning += 1
                            actions.append({"actor": actor, "action": action})
                            response = worker.request("step", action=action, actor=actor)
                        games.append({"family": family, "config": config, "seat": seat,
                                      "reward": response["rewards"][seat], "actions": actions})
                if (deal + 1) % 10 == 0:
                    print(json.dumps({"completed_deals": deal + 1, "games": len(games), "states": states}), flush=True)
    finally:
        if dataset:
            dataset.close()
    rewards = np.asarray([game["reward"] for game in games])
    clustered = np.asarray([np.mean([(g["reward"] + 1) / 2 for g in games if g["family"] == f])
                            for f in sorted({g["family"] for g in games})])
    se = float(clustered.std(ddof=1) / np.sqrt(len(clustered))) if len(clustered) > 1 else None
    report = {"policy": args.policy, "opponent": args.opponent, "collection": bool(args.dataset),
              "preparation_policy": "existing-js-heuristic", "samples": args.samples,
              "games": len(games), "independent_deals": len(clustered),
              "wins": int(sum(rewards == 1)), "draws": int(sum(rewards == 0)), "losses": int(sum(rewards == -1)),
              "score": float(np.mean((rewards + 1) / 2)),
              "deal_clustered_95_interval": None if se is None else [max(0., float(clustered.mean() - 1.96 * se)),
                                                                     min(1., float(clustered.mean() + 1.96 * se))],
              "draft_states": states, "simulated_continuations": simulations,
              "seconds": time.perf_counter() - start,
              "draft_latency_ms_median": float(np.median(latency) * 1000),
              "draft_latency_ms_p95": float(np.percentile(latency, 95) * 1000),
              "note": "Four correlated games per deal; normal interval clusters by deal. Teacher labels are approximate.",
              "replays": games}
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "replays"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deals", type=int, default=40)
    parser.add_argument("--seed", type=int, default=1000)
    parser.add_argument("--planning-seed", type=int, default=2000000)
    parser.add_argument("--exploration-seed", type=int, default=3000000)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--policy", choices=["heuristic", "random", "rollout", "neural", "linear", "hybrid"], default="rollout")
    parser.add_argument("--opponent", choices=["heuristic", "random", "rollout"], default="heuristic")
    parser.add_argument("--dataset", type=Path, help="Collect labels for both seats; mix heuristic/random/rollout behavior")
    parser.add_argument("--model", type=Path)
    parser.add_argument("--normal-deck", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.deals < 1 or not 1 <= args.samples <= 256 or min(args.seed, args.planning_seed, args.exploration_seed) < 0:
        parser.error("Invalid deals/samples/seeds")
    if args.dataset:
        if args.dataset.resolve() == args.output.resolve():
            parser.error("Dataset and report paths must differ")
        args.dataset.parent.mkdir(parents=True, exist_ok=True)
    run(args)


if __name__ == "__main__":
    main()
