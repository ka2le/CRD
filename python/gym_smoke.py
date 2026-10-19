"""Run masked random decisions through real-rule Gymnasium episodes."""

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
    parser.add_argument("--output", type=Path, help="Optional local JSONL replay file (seeds are host metadata)")
    args = parser.parse_args()
    if args.episodes < 1:
        parser.error("episodes must be positive")
    output = None
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        output = args.output.open("w", encoding="utf-8")
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
                _, reward, terminated, truncated, info = env.step(env.action_space.sample())
                decisions += 1
                if terminated or truncated:
                    if truncated:
                        raise RuntimeError("Random episode hit the decision guard")
                    wins += reward == 1
                    draws += reward == 0
                    losses += reward == -1
                    if output:
                        output.write(json.dumps({**env.replay_record(), "reward": reward}) + "\n")
                    break
    finally:
        env.close()
        if output:
            output.close()
    elapsed = time.perf_counter() - start
    print(json.dumps({
        "mode": args.mode, "control": args.control, "episodes": args.episodes,
        "wins": wins, "draws": draws, "losses": losses, "decisions": decisions,
        "preparation_decisions": preparation, "max_hand": max_hand, "max_candidates": max_candidates,
        "seconds": round(elapsed, 3), "decisions_per_second": round(decisions / elapsed, 1),
        "policy": "masked-random (transport smoke, not a strength benchmark)",
    }, indent=2))


if __name__ == "__main__":
    main()
