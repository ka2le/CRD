import argparse
import json
import random
from crd.worker import HeadlessWorker


def describe_action(action):
    if action["type"] == "discard":
        return f"discard mask={action['mask']:02d} count={len(action['selectedIds'])}"
    if action["type"] == "draft-pick":
        return f"pick {action['card']['id']} from row index {action['index']}"
    return json.dumps(action)


def run_random_episode(mode, seed, reveal_opponent):
    rng = random.Random(seed)
    worker = HeadlessWorker()

    try:
        response = worker.request(
            "reset",
            sessionId="smoke",
            config={
                "mode": mode,
                "seed": seed,
                "wildDeck": True,
                "revealOpponent": reveal_opponent,
            },
        )

        observation = response["observation"]
        print(f"start mode={observation['mode']} phase={observation['phase']} deck={observation['deckCount']}")

        step = 0
        while not response["terminal"]:
            legal_actions = response["legalActions"]
            if not legal_actions:
                raise RuntimeError(f"no legal actions at phase {observation['phase']}")

            action = rng.choice(legal_actions)
            print(f"step {step}: {describe_action(action)}")
            response = worker.request("step", sessionId="smoke", action=action)
            observation = response["observation"]
            print(
                f"  -> phase={observation['phase']} "
                f"playerHand={len(observation['playerHand'])} "
                f"opponentHand={observation['opponentHandCount']} "
                f"deck={observation['deckCount']} "
                f"playerDiscards={observation['playerDiscardsUsed']}"
            )
            step += 1

        battle = observation["battle"]
        print(f"terminal winner={battle['winner']} reward={response['reward']}")
        print(
            "match damage: "
            f"player={battle['playerTotalDamageDealt']} "
            f"opponent={battle['opponentTotalDamageDealt']} "
            f"rounds={battle['rounds']}"
        )
        print("player final hand:", ", ".join(card["id"] for card in observation["playerHand"]))
        if reveal_opponent:
            print("opponent final hand:", ", ".join(card["id"] for card in observation["opponentHand"]))
    finally:
        worker.close()


def main():
    parser = argparse.ArgumentParser(description="Play one random CRD headless episode through the Node worker.")
    parser.add_argument("--mode", choices=["five-hand-discard", "draft"], default="five-hand-discard")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--reveal-opponent", action="store_true")
    args = parser.parse_args()

    run_random_episode(args.mode, args.seed, args.reveal_opponent)


if __name__ == "__main__":
    main()
