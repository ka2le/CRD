"""Resumable sharded search self-play; each candidate evaluation becomes one row.

With --prep-search, preparation decisions (draw/copy/recycle order, targets, skip/finish) are
searched and recorded too, using the v3 draft+preparation feature layout."""

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import random
import time

import numpy as np

from crd.value_net import PREP_FEATURE_VERSION, FEATURE_VERSION, ValueNet, model_features, signature
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
    xx, yy, actual, roots, families, specials, preps = [], [], [], [], [], [], []
    v3 = bool(config.get("prep_search"))
    version = PREP_FEATURE_VERSION if v3 else FEATURE_VERSION
    completion = config.get("completion", "heuristic")
    teacher = f"observation-sampled-{completion}-completion-v1"
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
                sig = signature(spec, version, teacher)
                if model and any(model.signature[key] != value for key, value in signature(spec, model.signature["features"]).items()
                                 if key not in ("features", "teacher")):
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
                    observation = response["observation"]
                    is_prep = observation["phase"] == "preparation"
                    if is_prep and (not v3 or len(response["legalActions"]) == 1):
                        action = worker.request("baseline")["action"]
                    else:
                        options = {"seed": planning_seed(config["planning_seed"], game, turn), "samples": config["samples"]}
                        if completion != "heuristic":
                            options["completionPolicy"] = completion
                        report = worker.request("evaluate", observation=observation, spec=spec, options=options)["evaluation"]
                        actions = response["legalActions"]
                        actor = response["actor"]
                        chosen = search_index(report)
                        prep = worker.request("preparation-features", observation=observation,
                                              legalActions=actions)["actions"] if is_prep else None
                        x = model_features(version, observation, actions, spec, prep)
                        prior_x = model_features(model.signature["features"], observation, actions, spec, prep) if model else None
                        if guided[actor] and config["prior"] > 0 and prior_x is not None:
                            values = np.asarray([candidate["value"] for candidate in report["candidates"]], dtype=np.float32)
                            chosen = int(np.argmax(config["samples"] * values + config["prior"] * model.values(prior_x)))
                        exploring_seat = "player" if deal % 2 == 0 else "opponent"
                        if actor == exploring_seat and rng.random() < config["epsilon"]:
                            chosen = rng.randrange(len(actions))
                        selected.append((len(xx) + chosen, actor))
                        xx.extend(x)
                        yy.extend([[c["wins"], c["draws"], c["losses"]] for c in report["candidates"]])
                        actual.extend([[0, 0, 0] for _ in actions])
                        roots.extend([(game * 100 if v3 else game * 10) + turn] * len(actions))
                        families.extend([family] * len(actions))
                        specials.extend([(a.get("cardId") if is_prep else a["card"]["id"]) == "draw_2_extra" for a in actions])
                        preps.extend([is_prep] * len(actions))
                        action = actions[chosen]
                        turn += 1
                    response = worker.request("step", action=action)
                for index, actor in selected:
                    reward = response["rewards"][actor]
                    actual[index][0 if reward == 1 else 1 if reward == 0 else 2] = 1
    root_count = len(set(roots))
    summary = {"offset": config["offset"], "deals": config["deals"], "games": 2 * config["deals"],
               "roots": root_count, "prep_roots": len({r for r, p in zip(roots, preps) if p}), "rows": len(xx),
               "continuations": len(xx) * config["samples"], "seconds": time.perf_counter() - start}
    temporary = path.with_suffix(".temporary.npz")
    np.savez_compressed(temporary, x=np.asarray(xx, dtype=np.float32), counts=np.asarray(yy, dtype=np.uint16),
                        actual=np.asarray(actual, dtype=np.uint8), root=np.asarray(roots, dtype=np.int64),
                        family=np.asarray(families), draw2=np.asarray(specials, dtype=np.bool_),
                        **({"prep": np.asarray(preps, dtype=np.bool_)} if v3 else {}),
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
    parser.add_argument("--prep-search", action="store_true",
                        help="Search and record preparation decisions too (v3 draft+preparation features)")
    parser.add_argument("--completion", choices=["heuristic", "prep-lookahead"], default="heuristic",
                        help="Rollout completion policy used by the search teacher")
    parser.add_argument("--only-offsets", type=str, default=None,
                        help="start:end deal offsets to process on this machine (manifest still covers --deals)")
    args = parser.parse_args()
    if min(args.deals, args.workers, args.chunk) < 1 or not 1 <= args.samples <= 256 or not 0 <= args.epsilon <= 1:
        parser.error("Invalid deal/worker/chunk/sample/exploration settings")
    if min(args.seed, args.planning_seed, args.exploration_seed, args.normal_every) < 0:
        parser.error("Seeds/normal-every must be nonnegative")
    if not 0 <= args.neural_fraction <= 1 or args.prior < 0:
        parser.error("Invalid neural mixture/prior")
    args.directory.mkdir(parents=True, exist_ok=True)
    settings = vars(args).copy()
    only = settings.pop("only_offsets")
    settings["directory"] = str(args.directory.resolve())
    if args.model:
        settings["model"] = str(args.model.resolve())
        settings["model_sha256"] = hashlib.sha256(args.model.read_bytes()).hexdigest()
    else:
        # Preserve byte-for-byte legacy shard identity for resuming v2 commands.
        for key in ("model", "neural_fraction", "prior"):
            settings.pop(key)
    # Legacy runs keep their exact shard identity; new options only appear when used.
    if not args.prep_search:
        settings.pop("prep_search")
    if args.completion == "heuristic":
        settings.pop("completion")
    manifest_path = args.directory / "manifest.json"
    if manifest_path.exists() and json.loads(manifest_path.read_text()) != settings:
        parser.error("Directory belongs to another run; use a fresh directory or original settings")
    manifest_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    jobs = [{**settings, "offset": offset, "deals": min(args.chunk, args.deals - offset)}
            for offset in range(0, args.deals, args.chunk)]
    if only:
        low, high = (int(value) for value in only.split(":"))
        jobs = [job for job in jobs if low <= job["offset"] < high]
    start = time.perf_counter()
    summaries = []
    # Workers are ordinary independent local simulator processes, not AI agents.
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        for future in as_completed([executor.submit(collect_chunk, job) for job in jobs]):
            summaries.append(future.result())
            progress = {key: sum(row.get(key, 0) for row in summaries)
                        for key in ("deals", "games", "roots", "prep_roots", "rows", "continuations")}
            progress["seconds"] = round(time.perf_counter() - start, 1)
            print(json.dumps(progress), flush=True)
    progress["shards"] = sorted(summaries, key=lambda row: row["offset"])
    (args.directory / ("collection.json" if not only else f"collection-{only.replace(':', '-')}.json")).write_text(json.dumps(progress, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
