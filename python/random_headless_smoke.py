import argparse
import json
import random
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "scripts" / "headless-worker.mjs"


class HeadlessWorker:
    def __init__(self):
        self._next_id = 1
        self.process = subprocess.Popen(
            ["node", str(WORKER)],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )

    def request(self, command, **payload):
        request_id = self._next_id
        self._next_id += 1
        message = {"id": request_id, "command": command, **payload}
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read()
            raise RuntimeError(f"worker stopped without response\n{stderr}")

        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(response.get("error", "worker returned an unknown error"))
        return response

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()


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
                "battleEvaluation": {
                    "maxRounds": 12,
                    "damageToWin": 999,
                },
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
        print("terminal battle-ready")
        print(
            "12-round damage: "
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
