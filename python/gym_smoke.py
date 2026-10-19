"""Run random or observation-sampled rollout decisions through real-rule episodes."""

import argparse
import json
import time
from pathlib import Path

from crd.env import CRDEnv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["draft", "five-hand-discard"], default="draft")
    parser.add_argument("--control", choices=["player", "opponent"], default="player")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--policy", choices=["random", "rollout"], default="random")
    parser.add_argument("--samples", type=int, default=8, help="Sampled worlds per candidate for rollout policy")
    parser.add_argument("--planning-seed", type=int, default=100000, help="Independent search RNG; never uses the real deal seed")
    parser.add_argument("--output", type=Path, help="Optional local JSONL replay file (seeds are host metadata)")
    parser.add_argument("--dataset", type=Path, help="Optional rollout decision targets, grouped by root episode")
    args = parser.parse_args()
    if args.episodes < 1:
        parser.error("episodes must be positive")
    if not 1 <= args.samples <= 256 or args.planning_seed < 0:
        parser.error("samples must be in 1..256 and planning-seed must be nonnegative")
    if args.dataset and args.policy != "rollout":
        parser.error("--dataset requires --policy rollout")
    if args.output and args.dataset and args.output.resolve() == args.dataset.resolve():
        parser.error("Replay and decision dataset files must differ")
    output = None
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        output = args.output.open("w", encoding="utf-8")
    dataset = None
    if args.dataset:
        args.dataset.parent.mkdir(parents=True, exist_ok=True)
        dataset = args.dataset.open("w", encoding="utf-8")
    wins = draws = losses = decisions = preparation = 0
    max_hand = max_candidates = 0
    start = time.perf_counter()
    env = CRDEnv({"mode": args.mode, "control": args.control})
    try:
        for episode in range(args.episodes):
            _, info = env.reset(seed=args.seed + episode)
            env.action_space.seed(args.seed + episode + 10000)
            while True:
                preparation += info["observation"]["phase"] == "preparation"
                max_hand = max(max_hand, len(info["observation"]["playerHand"]))
                max_candidates = max(max_candidates, len(info["legal_actions"]))
                if args.policy == "rollout":
                    evaluation = env.evaluate_actions(samples=args.samples, seed=args.planning_seed + decisions)
                    action = evaluation["bestIndices"][0]
                    if dataset:
                        metadata = env.replay_record()
                        dataset.write(json.dumps({
                            "kind": "rollout-decision", "root_episode": episode,
                            "root_family": metadata["root_family"],
                            "root_config": metadata["config"],
                            "rules_version": metadata["rules_version"], "card_data_hash": metadata["card_data_hash"],
                            "observation": info["observation"], "legal_actions": info["legal_actions"],
                            "teacher": evaluation, "selected_action": info["legal_actions"][action],
                            "planning_seed": args.planning_seed + decisions,
                        }) + "\n")
                else:
                    action = env.action_space.sample()
                _, reward, terminated, truncated, info = env.step(action)
                decisions += 1
                if terminated or truncated:
                    if truncated:
                        raise RuntimeError("Random episode hit the decision guard")
                    wins += reward == 1
                    draws += reward == 0
                    losses += reward == -1
                    if output:
                        output.write(json.dumps({**env.replay_record(), "root_episode": episode, "reward": reward}) + "\n")
                    break
    finally:
        env.close()
        if output:
            output.close()
        if dataset:
            dataset.close()
    elapsed = time.perf_counter() - start
    print(json.dumps({
        "mode": args.mode, "control": args.control, "episodes": args.episodes,
        "wins": wins, "draws": draws, "losses": losses, "decisions": decisions,
        "preparation_decisions": preparation, "max_hand": max_hand, "max_candidates": max_candidates,
        "seconds": round(elapsed, 3), "decisions_per_second": round(decisions / elapsed, 1),
        "policy": args.policy, "samples_per_candidate": args.samples if args.policy == "rollout" else None,
        "note": "Pilot episode run; not a held-out strength benchmark",
    }, indent=2))


if __name__ == "__main__":
    main()
