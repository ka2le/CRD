"""Resumable sharded draft search self-play; each candidate evaluation becomes one row."""

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import random
import time

import numpy as np

from crd.value_net import ValueNet, features, signature
from crd.worker import HeadlessWorker
from draft_experiment import family_id


def planning_seed(base, game, turn):
    # Stream schedule is stable across policies, even if private preparation lengths differ.
    return int.from_bytes(hashlib.sha256(f"planning/{base}/{game}/{turn}".encode()).digest()[:4], "little")


def search_index(report):
    return report["baselineIndex"] if report["baselineIndex"] in report["bestIndices"] else report["bestIndices"][0]


def collect_chunk(config):
    path = Path(config["directory"]) / f"shard-{config['offset']:06d}.npz"
    identity = json.dumps(config, sort_keys=True)
    if path.exists():
        with np.load(path, allow_pickle=False) as saved:
            if str(saved["config"]) != identity:
                raise ValueError(f"Existing shard has different configuration: {path}")
            return json.loads(str(saved["summary"]))
    rng = random.Random(config["exploration_seed"] + config["offset"])
    model = None
    if config.get("model"):
        if hashlib.sha256(Path(config["model"]).read_bytes()).hexdigest() != config["model_sha256"]:
            raise ValueError("Frozen collection model changed")
        model = ValueNet.load(config["model"])
    xx, yy, actual, roots, families, specials = [], [], [], [], [], []
    sig = None
    start = time.perf_counter()
    with HeadlessWorker(timeout=120) as worker:
        for deal in range(config["offset"], config["offset"] + config["deals"]):
            for opening, first in enumerate(("player", "opponent")):
                game = 2 * deal + opening
                game_config = {"mode": "draft", "control": "both", "seed": config["seed"] + deal,
                               "wildDeck": not (config["normal_every"] and deal % config["normal_every"] == 0),
                               "firstPicker": first, "revealOpponent": False}
                response = worker.request("reset", config=game_config)
                spec = response["spec"]
                sig = signature(spec)
                if model and any(model.signature[key] != value for key, value in sig.items()):
                    raise ValueError("Collection model/engine mismatch")
                family = family_id(game_config, spec)
                guided = {side: model is not None and rng.random() < config.get("neural_fraction", .5)
                          for side in ("player", "opponent")}
                selected = []
                turn = decisions = 0
                while not response["terminal"]:
                    decisions += 1
                    if decisions > 1000:
                        raise RuntimeError("Guard exceeded; refusing manufactured outcomes")
                    if response["observation"]["phase"] == "preparation":
                        action = worker.request("baseline")["action"]
                    else:
                        report = worker.request("evaluate", observation=response["observation"], spec=spec,
                                                options={"seed": planning_seed(config["planning_seed"], game, turn),
                                                         "samples": config["samples"]})["evaluation"]
                        actions = response["legalActions"]
                        actor = response["actor"]
                        chosen = search_index(report)
                        x = features(response["observation"], actions, spec)
                        if guided[actor] and config["prior"] > 0:
                            values = np.asarray([candidate["value"] for candidate in report["candidates"]], dtype=np.float32)
                            chosen = int(np.argmax(config["samples"] * values + config["prior"] * model.values(x)))
                        exploring_seat = "player" if deal % 2 == 0 else "opponent"
                        if actor == exploring_seat and rng.random() < config["epsilon"]:
                            chosen = rng.randrange(len(actions))
                        selected.append((len(xx) + chosen, actor))
                        xx.extend(x)
                        yy.extend([[c["wins"], c["draws"], c["losses"]] for c in report["candidates"]])
                        actual.extend([[0, 0, 0] for _ in actions])
                        roots.extend([game * 10 + turn] * len(actions))
                        families.extend([family] * len(actions))
                        specials.extend([a["card"]["id"] == "draw_2_extra" for a in actions])
                        action = actions[chosen]
                        turn += 1
                    response = worker.request("step", action=action)
                for index, actor in selected:
                    reward = response["rewards"][actor]
                    actual[index][0 if reward == 1 else 1 if reward == 0 else 2] = 1
    summary = {"offset": config["offset"], "deals": config["deals"], "games": 2 * config["deals"],
               "roots": 20 * config["deals"], "rows": len(xx),
               "continuations": len(xx) * config["samples"], "seconds": time.perf_counter() - start}
    temporary = path.with_suffix(".temporary.npz")
    np.savez_compressed(temporary, x=np.asarray(xx, dtype=np.float32), counts=np.asarray(yy, dtype=np.uint16),
                        actual=np.asarray(actual, dtype=np.uint8), root=np.asarray(roots, dtype=np.int64),
                        family=np.asarray(families), draw2=np.asarray(specials, dtype=np.bool_),
                        signature=json.dumps(sig), config=identity, summary=json.dumps(summary))
    temporary.replace(path)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--deals", type=int, default=4000)
    parser.add_argument("--seed", type=int, default=1000000)
    parser.add_argument("--planning-seed", type=int, default=21000000)
    parser.add_argument("--exploration-seed", type=int, default=31000000)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--chunk", type=int, default=20)
    parser.add_argument("--epsilon", type=float, default=.12)
    parser.add_argument("--normal-every", type=int, default=4)
    parser.add_argument("--model", type=Path, help="Frozen neural search policy mixed into actual play")
    parser.add_argument("--neural-fraction", type=float, default=.5, help="Per-seat game policy mixture probability")
    parser.add_argument("--prior", type=float, default=2)
    args = parser.parse_args()
    if min(args.deals, args.workers, args.chunk) < 1 or not 1 <= args.samples <= 256 or not 0 <= args.epsilon <= 1:
        parser.error("Invalid deal/worker/chunk/sample/exploration settings")
    if min(args.seed, args.planning_seed, args.exploration_seed, args.normal_every) < 0:
        parser.error("Seeds/normal-every must be nonnegative")
    if not 0 <= args.neural_fraction <= 1 or args.prior < 0:
        parser.error("Invalid neural mixture/prior")
    args.directory.mkdir(parents=True, exist_ok=True)
    settings = vars(args).copy()
    settings["directory"] = str(args.directory.resolve())
    if args.model:
        settings["model"] = str(args.model.resolve())
        settings["model_sha256"] = hashlib.sha256(args.model.read_bytes()).hexdigest()
    else:
        # Preserve byte-for-byte legacy shard identity for resuming v2 commands.
        for key in ("model", "neural_fraction", "prior"):
            settings.pop(key)
    manifest_path = args.directory / "manifest.json"
    if manifest_path.exists() and json.loads(manifest_path.read_text()) != settings:
        parser.error("Directory belongs to another run; use a fresh directory or original settings")
    manifest_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    jobs = [{**settings, "offset": offset, "deals": min(args.chunk, args.deals - offset)}
            for offset in range(0, args.deals, args.chunk)]
    start = time.perf_counter()
    summaries = []
    # Workers are ordinary independent local simulator processes, not AI agents.
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        for future in as_completed([executor.submit(collect_chunk, job) for job in jobs]):
            summaries.append(future.result())
            progress = {key: sum(row[key] for row in summaries) for key in ("deals", "games", "roots", "rows", "continuations")}
            progress["seconds"] = round(time.perf_counter() - start, 1)
            print(json.dumps(progress), flush=True)
    progress["shards"] = sorted(summaries, key=lambda row: row["offset"])
    (args.directory / "collection.json").write_text(json.dumps(progress, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
