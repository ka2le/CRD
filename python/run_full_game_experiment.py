"""Durable v6 collection -> six-layer training -> the two requested opponents, in both modes.

Run with the local venv. Each subprocess has a separate log. Completed stages are reused
on restart; collection also resumes atomic shards. Training never overwrites a partial run.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    temporary = path.with_suffix(".temporary.json")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--teacher", type=Path, default=ROOT / ".ai-runs/draft-v5/model/best.npz")
    parser.add_argument("--deals", type=int, default=18000)
    parser.add_argument("--training-seconds", type=int, default=3600)
    parser.add_argument("--evaluation-deals", type=int, default=750)
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--seed", type=int, default=17000000)
    parser.add_argument("--evaluation-seed", type=int, default=19000000)
    args = parser.parse_args()
    if min(args.deals, args.training_seconds, args.evaluation_deals, args.workers) <= 0:
        parser.error("Budgets must be positive")
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    teacher = directory / "teacher-v5.npz"
    if teacher.exists():
        if digest(teacher) != digest(args.teacher):
            raise ValueError("Frozen teacher differs from requested source")
    else:
        shutil.copyfile(args.teacher, teacher)
    env = {**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1",
           "PYTHONUNBUFFERED": "1"}
    sources = ["python/collect_draft.py", "python/train_value.py", "python/evaluate_search.py",
               "python/crd/value_net.py", "python/crd/draft_model.py", "src/game/rolloutSearch.js",
               "src/game/preparationFeatures.js", "src/game/headlessGame.js", "scripts/headless-worker.mjs",
               "python/run_full_game_experiment.py"]
    plan = {"deals": args.deals, "mode_cycle": ["draft", "draft", "five-hand-discard"],
            "training_seconds": args.training_seconds, "evaluation_deals": args.evaluation_deals,
            "workers": args.workers, "seed": args.seed, "evaluation_seed": args.evaluation_seed,
            "teacher_sha256": digest(teacher), "source_sha256": {name: digest(ROOT / name) for name in sources},
            "parameters": 200734, "shape": [424, 240, 192, 144, 96, 64, 48, 3],
            "learning_rate": .001, "minimum_learning_rate": .00003, "weight_decay": .0003,
            "actual_outcome_weight": 32, "collection_samples": 32, "evaluation_samples": 16,
            "label_note": "All legal options get prep-lookahead rollout WDL counts. Actual self-play uses search at every decision and frozen v5 priors in draft. Rollout hand building remains heuristic; counterfactual labels are not full-search completions.",
            "old_net_discard_note": "v5 has no discard-mode training; its entire discard game falls back to the same non-neural search. That arm is identical to plain search, so one discard tournament supplies both comparisons."}
    plan_path = directory / "plan.json"
    if plan_path.exists() and json.loads(plan_path.read_text()) != plan:
        raise ValueError("Existing run has a different plan/source; preserve it and choose a fresh run")
    write_json(plan_path, plan)
    started = time.time()
    state = {"pid": os.getpid(), "started_utc": datetime.now(timezone.utc).isoformat(), "completed_stages": []}

    def stage(name, script, arguments, result):
        if result.exists():
            json.loads(result.read_text())  # A parseable completion artifact is required.
            state["completed_stages"].append(name)
            return
        state.update(stage=name, status="running", log=str(directory / f"{name}.log"),
                     stage_started_utc=datetime.now(timezone.utc).isoformat())
        write_json(directory / "status.json", state)
        command = [sys.executable, str(ROOT / "python" / script), *map(str, arguments)]
        print(json.dumps({"stage": name, "command": command}), flush=True)
        with (directory / f"{name}.log").open("a", encoding="utf-8") as log:
            subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        if not result.exists():
            raise RuntimeError(f"{name} exited without its completion artifact")
        state["completed_stages"].append(name)
        write_json(directory / "status.json", state)

    try:
        data = directory / "data"
        stage("collection", "collect_draft.py", [data, "--deals", args.deals, "--chunk", 30,
              "--samples", 32, "--workers", args.workers, "--seed", args.seed,
              "--planning-seed", 81000000, "--exploration-seed", 91000000, "--epsilon", 0,
              "--model", teacher, "--neural-fraction", 1, "--prior", 2, "--prep-search",
              "--completion", "prep-lookahead", "--modes", "draft,draft,five-hand-discard"], data / "collection.json")
        model_dir = directory / "model"
        stage("training", "train_value.py", [data, model_dir, "--epochs", 10000,
              "--seconds", args.training_seconds, "--hidden", "240,192,144,96,64,48", "--batch", 2048,
              "--learning-rate", .001, "--min-lr-ratio", .03, "--weight-decay", .0003,
              "--outcome-weight", 32, "--snapshot-every", 20], model_dir / "training.json")
        common = ["--deals", args.evaluation_deals, "--workers", args.workers, "--chunk", 10,
                  "--seed", args.evaluation_seed, "--planning-seed", 101000000,
                  "--samples", 16, "--opponent-samples", 16, "--prior", 2,
                  "--prep-policy", "search", "--opponent-prep-policy", "search",
                  "--completion", "prep-lookahead", "--opponent-completion", "prep-lookahead"]
        # Only three unique tournaments: old-net discard is exactly plain search.
        results = {}
        for name, mode, opponent in (("draft-vs-v5", "draft", teacher),
                                     ("draft-vs-search", "draft", None),
                                     ("discard-vs-search", "five-hand-discard", None)):
            report = directory / f"{name}.json"
            stage(name, "evaluate_search.py", [model_dir / "best.npz", report, *common, "--mode", mode,
                  *(["--opponent-model", opponent] if opponent else [])], report)
            raw = json.loads(report.read_text())
            results[name] = {key: raw[key] for key in ("games", "independent_deals", "wins", "draws", "losses",
                                                       "score", "deal_clustered_95_interval", "seconds")}
        training = json.loads((model_dir / "training.json").read_text())
        summary = {"status": "complete", "seconds": time.time() - started,
                   "model_sha256": digest(model_dir / "best.npz"),
                   "training": {key: training[key] for key in ("parameters", "shape", "epochs", "selected_epoch", "seconds")},
                   "collection": {key: json.loads((data / "collection.json").read_text())[key]
                                  for key in ("deals", "games", "roots", "prep_roots", "rows", "continuations")},
                   "results": results, "old_net_discard_note": plan["old_net_discard_note"]}
        write_json(directory / "summary.json", summary)
        state.update(status="complete", stage="complete", seconds=time.time() - started)
        write_json(directory / "status.json", state)
        print(json.dumps(summary, indent=2), flush=True)
    except BaseException as error:
        state.update(status="failed", error=str(error), seconds=time.time() - started)
        write_json(directory / "status.json", state)
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
