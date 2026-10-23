# Headless decision environment

**Current policy (2026-10-23):** New Discard data/comparisons use DavidBot (Very Hard), with Sven actual preparation; Draft still uses Sven. Use `researchAi.js` / headless `research-action`, which returns the canonical profile, prior hash and full diagnostics without advancing the session. Historical `baseline` remains the Rules action, and historical study protocols below are unchanged. The creator closed further Discard neural/search research unless explicitly reopened. See [DavidBot](DAVID_BOT.md).


Latest experiment: `AI_DRAFT_EXPERIMENT.md` gives the draft-only data/model/tournament workflow. It uses both-seat worker control with the existing heuristic for every preparation decision. The new `baseline` command returns the acting seat's existing heuristic action without advancing the session (terminal requests error). A trained NumPy draft model now exists offline; earlier "no trained model" descriptions below concern the initial environment milestone. Protocol remains v2 with this additive command.

Implemented and verified **2026-10-19**. This is the working environment contract; `AI_TRAINING.md` describes the remaining search/neural plan.

## What works

- Both modes, Normal/Wild Deck, seeded/injected decks and explicit first picker.
- Agent control of either physical seat, or every decision for both seats.
- Preparation as decisions: activate draw/redraw, copy source plus target, recycle source plus target, skip an individual source, or finish.
- Every completed action rebuilds the legal list. Drawn/recycled/copied specials can activate with their correct identity; hand size can exceed five.
- Exact normal combat and terminal reward: win +1, draw 0, loss -1. Default 21-damage lethal and 50-round tie; optional `battleEvaluation` overrides are diagnostics only.
- Per-seat observations/history, numeric hand/combat features, dynamic candidates and masks, replay metadata, and isolated host forks.
- Browser preparation and the headless adapter share `preparationState.js` transitions. The browser still owns picker/animation state and delays the redraw commit for its existing animation.

The default non-controlled seat uses the existing heuristic, including its existing preparation order/target scoring. A first observation-conditioned hidden-world sampler and all-action rollout teacher are now implemented; see `AI_SEARCH.md`. Training/search can replace every choice through the same interface. No trained model, deep tree search, vector/batch simulation or browser neural opponent exists yet.

## Local commands (PowerShell)

The standard-library bridge smoke requires only Node and Python:

```powershell
python python/random_headless_smoke.py --mode draft --seed 7 --reveal-opponent
python python/random_headless_smoke.py --mode five-hand-discard --seed 7
npm run headless:test
```

Gymnasium dependencies live in an ignored local environment. The existing `.ai-venv` was verified with Python 3.14, Gymnasium 1.4.0 and NumPy 2.5.4. Recreate it with:

```powershell
python -m venv .ai-venv
.ai-venv/Scripts/python.exe -m pip install -r python/requirements-lock.txt
.ai-venv/Scripts/python.exe -m unittest discover -s python/tests -v
.ai-venv/Scripts/python.exe python/gym_smoke.py --mode draft --episodes 100 --seed 100
.ai-venv/Scripts/python.exe python/gym_smoke.py --mode five-hand-discard --control opponent --episodes 100 --seed 100
```

`requirements.txt` gives compatible dependency ranges; the lock file records the tested versions. PyTorch has not been installed. Optional `--output .ai-runs/smoke.jsonl` writes local replays; `.ai-runs/` is ignored. Masked random is the default smoke policy. Use `--policy rollout --samples 16` for the new rollout evaluator and optional `--dataset .ai-runs/targets.jsonl` for grouped action targets; see `AI_SEARCH.md` for interpretation and limits.

## JavaScript and worker API

`src/game/headlessGame.js` exports `createHeadlessGame`, `getLegalActions`, `stepHeadlessGame`, `encodeObservation`, `createStepResponse` and `getHeadlessSpec`. Transitions return new state; malformed actions/targets do not consume a decision or mutate the input. Stepping after terminal is an error.

Persistent `scripts/headless-worker.mjs` uses JSON lines on stdin/stdout, logs on stderr. Each request may carry `id` and `sessionId`; every reply has matching `id` and `ok`. Protocol version is **2**; base rules version is `digital-21-50-preparation-v1`. The spec includes a card-data hash, initial pool counts and conservative action capacity.

```json
{"id":1,"command":"reset","sessionId":"game","config":{"mode":"draft","seed":7,"wildDeck":true,"control":"player","revealOpponent":false,"firstPicker":"opponent"}}
```

Commands:

| Command | Extra fields | Behavior |
| --- | --- | --- |
| `ping` | none | Check transport |
| `describe` | optional `config` | Static card/action catalog, pool counts, limits/hash |
| `reset` | `config` | Start/restart session; returns spec and first decision |
| `step` | `action`, optional `actor` | Apply one externally controlled decision; validate actor if supplied |
| `observe` | optional physical `side` | Obtain that seat's permitted observation; only the acting seat gets legal actions |
| `fork` | new `targetSessionId` | Host-only copy of current immutable state into an independent session |
| `evaluate` | `observation`, public `spec`, optional `options` | Stateless observation-sampled values for every root action; no source session lookup |
| `sample` | `observation`, public `spec`, new `targetSessionId`, optional sampling `options` | Create a consistent hypothetical world independently of live state |
| `close` | none | Release session; closing the client process releases all sessions |

`control` is `player` (default), `opponent`, or `both`. In single-seat mode the other seat advances through its heuristic decisions automatically. In `both`, each step exposes the next actor; terminal `rewards` always uses physical seat names. Refill order remains player first, opponent second. Preparation is internally serialized player first, opponent second, matching the browser's Battle boundary. This does not add visible alternating preparation turns.

Native JS callbacks for baseline draft/discard can be injected through the existing strategy options; they are not serializable through JSON. Arbitrary Python policies for either side use explicit `both` control.

Injected decks must contain supported IDs and unique nonempty UIDs; definitions are taken from canonical card data. Minimum initial sizes are 10 for discard and 25 for draft. Keep known small-deck exhaustion/pile quirks in mind; normal pools are the supported training baseline.

## Dynamic actions

Every response supplies `actor`, `terminal`, `reward`, physical-seat `rewards`, `observation` and `legalActions`. The episode remains nonterminal throughout preparation. Select a concrete object or its zero-based index in **that response's** list:

```json
{"type":"draft-pick","uid":"..."}
{"type":"discard","mask":5}
{"type":"discard","selectedIds":["...","..."]}
{"type":"prepare","sourceUid":"draw-source"}
{"type":"prepare","sourceUid":"copy-source","targetUid":"hand-target"}
{"type":"prepare","sourceUid":"recycle-source","targetUid":"discard-target"}
{"type":"skip-preparation","sourceUid":"..."}
{"type":"finish-preparation"}
```

Generated actions also carry useful `cardId` or draft-card summaries. Discard masks use the current acting-hand slot order; IDs and mask must agree if both are supplied. Copy cannot target copy cards. Spent/missing sources and invalid targets are rejected. Opening/cancelling a graphical target picker changes no game information, so an effect and its target form one simulation action.

Skipping marks the chosen identity spent. Finishing leaves unused sources unactivated and irrevocably ends that seat's preparation. Both are optional: an agent can hold a source for later, use other effects first, or finish immediately. Activating one copy of a special does not consume a freshly transformed copy's independent activation.

Candidate indices are transient. Replay/store semantic action objects, not bare indices across changing states. New draws can change the list length and order.

## Observations and privacy

Observation `side` names the physical seat. Fields `playerHand`, `activatedUids`, `playerDiscardsUsed`, `ownCombat`, and the battle's `winner`/damage values are **relative to that observation's seat**. A relative battle winner `player` means this observer won; physical terminal rewards are also returned separately.

- Current own hand/activation, row, public discarded cards, that seat's eligible `recycleCards`, mode/pool/phase/pick counters and own/public event history.
- Draft selections are public even with `revealOpponent: false`. In discard mode that option determines pre-combat hand visibility.
- Enemy private preparation never updates the other seat's pre-preparation known hand until terminal. `opponentHandIsCurrent` marks this distinction.
- During preparation, `deckCount` is the initial preparation count minus the observer's own draws. `deckCountIsExact: false` records possible private consumption by the other seat. Private event counts are not leaked through `steps`; it counts only the observer's decisions.
- No real deck order, episode seed, pending hidden picks, opponent debug data, art URLs or enemy private events are returned.
- `ownCombat` and `knownOpponentCombat` contain class stats and a 12-round raw damage/shield cycle calculated by the exact JS simulator, including doubling and hybrid/shield damage. This is a repeating mechanical feature, not the training reward or an assertion that the partial hand is final.

Public/history knowledge and card UIDs remain available for action/replay handling. Python numeric encodings omit UIDs. Initial pool counts are public configuration, not remaining unseen-card counts.

**A host fork preserves the actual hidden world and is not fair AI search.** The new `sample`/`evaluate` paths instead take observations/public pool metadata and independent planning seeds, reproducing the root view while sampling unseen cards. They never query the live source session. This is an approximate feasible-world belief, not an exact posterior over a strategic opponent; see `AI_SEARCH.md`. Do not use fork-and-peek outcomes as fair labels.

## Gymnasium interface

`python/crd/worker.py` is a standard-library client with bounded requests, drained stderr, matching response IDs, explicit shutdown and support for shared workers/multiple sessions. `python/crd/env.py` supplies a single-seat `CRDEnv`:

```python
from crd.env import CRDEnv

with CRDEnv({"mode": "draft", "control": "player"}) as env:
    observation, info = env.reset(seed=7)
    while True:
        action = env.action_space.sample(mask=observation["action_mask"])
        observation, reward, terminated, truncated, info = env.step(action)
        if terminated or truncated:
            break
```

Run a script inside `python/`, or set `PYTHONPATH=python`. Reset options allow mode, Wild Deck, opponent visibility and first picker. Reset seeds the environment RNG; it generates a separate deterministic engine seed. `replay_record()` returns that seed/config plus semantic decisions, versions/hash and a deal-family grouping ID as explicit host metadata, outside policy observations/info. `evaluate_actions(samples=16, seed=100000)` returns non-mutating rollout values using only permitted data.

The action space is a `Discrete` subclass with capacity derived from the supported pool. Its default `sample()` respects the current mask, while explicit mask/probability arguments retain Gymnasium semantics. Out-of-range/masked actions raise without changing state. No legal actions are silently clipped; a capacity mismatch fails explicitly.

Numeric observation fields:

| Field | Shape | Meaning |
| --- | --- | --- |
| `counts` | 7 x 27 | Own unspent/spent identities, known enemy, recycle unspent/spent, row, initial pool |
| `context` | 23 | Mode/phase one-hots, availability/counters, perspective and visibility flags |
| `stats` | 2 x 3 | Own and known-enemy Critter/Robot/Dragon totals |
| `combat_cycle` | 2 x 12 x 2 | Own/known enemy raw damage and shield by round |
| `action_mask` | derived maximum | Legal candidates occupy the initial contiguous slots |
| `candidates` | variable x 87 | Action type, source/target types, discarded-type counts, target spent flag |
| `history` | variable x 94 | Event type/owner/pack and observed/source/target card counts |

Candidates/history use Gymnasium `Sequence` spaces; no five-slot padding drops cards. Learning code must handle variable sequences/masked candidate scoring; this is not an off-the-shelf flattened PPO observation. Per-action indices address the corresponding candidate row. Rich permitted observations and legal descriptors also appear in `info` for inspection.

Intermediate reward is zero. Exact match outcomes terminate; the configurable decision guard truncates with no manufactured loss/draw. The caller must reset after either. Node errors/invalid actions remain exceptions, not rewards.

## Verification and limits

- `npm run headless:test`: 14 tests, including order/targets, browser reducer parity, validation/privacy, exact outcomes, 144 seeded replays, 802 sampled-root reconstructions and rollout teacher checks.
- Python unittest suite: eight tests, including Gymnasium checker for both modes/seats, growing hands/candidates, 48 replays, masks/errors/guards, branch isolation, stateless rollout evaluation and deal-family grouping.
- Two additional 100-episode Python smokes completed (Draft player seat; discard opponent seat). Measured roughly 600 decisions/second on this local run including encoding/transport; this is not a tree-search or model throughput estimate.
- Two additional 20-game rollout pilots generated 230 states / 2,269 action targets / 36,304 completed continuations, grouped into 20 underlying deal families. See `AI_SEARCH.md`; these are development data, not independent held-out strength evidence.
- Build, lint and existing regression smoke pass. No gameplay balance/rules change, model training or external publishing is included.

Deferred final-draft leftovers, starter alternation, recycle pool/copy-count intent and custom deck-exhaustion semantics remain documented in `CURRENT_STATE.md`. Private preparation scheduling follows current implementation; it is not a resolution of every future simultaneous/shared-pool rule question.
