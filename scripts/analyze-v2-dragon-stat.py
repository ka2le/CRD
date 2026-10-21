"""Matched Normal-deck v2 Dragon comparison. Reuses the archived baseline."""
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path('.ai-runs/v2-dragon-stat-2026-10-21')
BASE = Path('.ai-runs/normal-balance-2026-10-21')
OUT = Path('docs/v2-dragon-stat-2026-10-21')
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str((ROOT / 'matplotlib-cache').resolve()))
sys.path.insert(0, str((BASE / 'plot-deps').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

FACTIONS = ['critter', 'robot', 'dragon']
COLORS = ['#824de4', '#b15384', '#2b61a6']
MODES = ['draft', 'five-hand-discard']
NAMES = ['Current v2\n7+ → +4 power', 'V2 with v1 Dragon\n7+ → +1 Dragon stat']

def read(p):
    return json.loads(p.read_text(encoding='utf-8'))

def lines(p):
    return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s]

def pct(n):
    return f'{n*100:.1f}%'

def tally(values):
    n = len(values)
    w, d = values.count(1), values.count(.5)
    score = sum(values)/n if n else 0
    se = math.sqrt(sum((v-score)**2 for v in values)/(n*(n-1))) if n > 1 else 0
    return dict(n=n, wins=w, draws=d, losses=n-w-d, score=score, winRate=w/n if n else 0,
                interval=[max(0, score-1.96*se), min(1, score+1.96*se)])

arms, raw, per_game = [], {}, {}
verification = read(ROOT / 'comparison-verification.json')
assert verification['totalGamesReplayed'] == 2000 and verification['matchedBaselineDealsVerified']
for mode in MODES:
    for index, (folder, variant) in enumerate([(BASE, 'abilitiesv2'), (ROOT, 'abilitiesv2-extra-stat')]):
        name = f'{variant}-{mode}-normal-16'
        meta = read(folder / name / 'complete.json')
        games = lines(folder / name / 'games.jsonl')
        assert meta['games'] == len(games) == 500 and meta['deck'] == 'normal' and meta['samples'] == 16
        raw[mode, index] = games
        if index:
            for old, new in zip(raw[mode, 0], games):
                for key in ['seed', 'game', 'firstPicker', 'initialDealHash']:
                    assert old[key] == new[key], key
        hands = []
        for g in games:
            for side, enemy in [('player', 'opponent'), ('opponent', 'player')]:
                hands.append(dict(game=g['game'], faction=g[side]['damageType'], rival=g[enemy]['damageType'],
                                  value=.5 if g['winner'] == 'tie' else int(g['winner'] == side), profile=g[side]))
        factions = {}
        for f in FACTIONS:
            selected = [h for h in hands if h['faction'] == f]
            cross = [h for h in selected if h['rival'] in FACTIONS and h['rival'] != f]
            factions[f] = dict(all=tally([h['value'] for h in selected]), cross=tally([h['value'] for h in cross]),
                               presence=len(selected)/1000)
            nums, denoms = np.zeros(500), np.zeros(500)
            for h in cross:
                nums[h['game']] += h['value']
                denoms[h['game']] += 1
            per_game[mode, index, f] = nums, denoms
        activated = [h for h in hands if h['profile']['overwhelming']]
        arms.append(dict(mode=mode, variant=variant, index=index, factions=factions, draws=meta['ties']/500,
                         ability=tally([h['value'] for h in activated]), roots=meta['roots'], simulations=meta['simulations']))

# Bootstrap whole matched deals. Faction membership can change with the policy.
rng = np.random.default_rng(20261021)
deltas = {}
for mode in MODES:
    ids = rng.integers(0, 500, size=(5000, 500))
    result = {}
    for f in FACTIONS:
        scores = []
        for index in [0, 1]:
            nums, denoms = per_game[mode, index, f]
            scores.append(nums[ids].sum(axis=1)/denoms[ids].sum(axis=1))
        result[f] = dict(interval=np.quantile(scores[1]-scores[0], [.025, .975]).tolist())
    old, new = raw[mode, 0], raw[mode, 1]
    draws = np.array([int(b['winner'] == 'tie')-int(a['winner'] == 'tie') for a, b in zip(old, new)])
    result['draws'] = dict(change=float(draws.mean()), interval=np.quantile(draws[ids].mean(axis=1), [.025, .975]).tolist())
    result['changedOutcomes'] = sum(a['winner'] != b['winner'] for a, b in zip(old, new))
    deltas[mode] = result

mechanical = read(ROOT / 'same-hands.json')
summary = dict(arms=arms, paired=deltas, mechanical=[{k: v for k, v in m.items() if k != 'records'} for m in mechanical],
               matchedDealsVerified=True, baselineGamesReused=1000, newGames=1000)
(ROOT / 'analysis.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')

plt.rcParams.update({'font.family': 'DejaVu Sans', 'text.color': '#ededf0', 'axes.labelcolor': '#bfc0ca',
                     'xtick.color': '#d4d4db', 'ytick.color': '#bfc0ca', 'font.size': 12})
fig, axes = plt.subplots(2, 1, figsize=(12.5, 10), facecolor='#101214')
fig.subplots_adjust(top=.86, bottom=.22, left=.09, right=.98, hspace=.65)
fig.text(.09, .962, 'Dragon ability — fixed power or extra stat?', fontsize=23, weight='bold')
fig.text(.09, .923, 'Normal Deck · 500 games per version/mode · matching deals · search uses each version’s rules', fontsize=11, color='#bfc0ca')
for ax, mode, title in zip(axes, MODES, ['Draft', 'Discard']):
    ax.set_facecolor('#101214')
    ax.set_title(title, loc='left', fontsize=18, weight='bold', pad=12)
    ax.set_ylim(0, .8)
    ax.set_yticks(np.arange(0, .81, .1))
    ax.yaxis.set_major_formatter(PercentFormatter(1, decimals=0))
    ax.grid(axis='y', alpha=.13, linestyle=':', zorder=0)
    ax.axhline(.5, color='white', alpha=.28, linestyle='--')
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, f in enumerate(FACTIONS):
        values = [next(a for a in arms if a['mode'] == mode and a['index'] == j)['factions'][f]['cross'] for j in [0, 1]]
        xs = np.arange(2)+(i-1)*.23
        means = np.array([v['score'] for v in values])
        errs = np.array([[v['score']-v['interval'][0] for v in values], [v['interval'][1]-v['score'] for v in values]])
        ax.bar(xs, means, width=.21, color=COLORS[i], label=f.capitalize()+'s' if f != 'dragon' else 'Dragons', zorder=3)
        ax.errorbar(xs, means, yerr=errs, fmt='none', color='#c3c3ca', capsize=4, zorder=4)
        for x, v in zip(xs, values):
            ax.text(x, v['interval'][1]+.014, pct(v['score']), ha='center', fontsize=12)
    ax.set_xlim(-.6, 1.6)
    ax.set_xticks([0, 1], [NAMES[j]+f"\nDraws: {pct(next(a for a in arms if a['mode']==mode and a['index']==j)['draws'])}" for j in [0, 1]])
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc='lower center', bbox_to_anchor=(.5, .071), ncol=3, frameon=False)
fig.text(.09, .04, 'Cross-faction score = wins + half draws; mirrors excluded. Whiskers: approximate 95% intervals.', fontsize=10, color='#bfc0ca')
fig.text(.09, .019, '16 samples per candidate. Conditional hand outcomes; faction choice can change between versions.', fontsize=10, color='#bfc0ca')
for ext in ['png', 'svg']:
    fig.savefig(OUT / f'faction-comparison.{ext}', dpi=180, facecolor=fig.get_facecolor())
plt.close(fig)

report = ['# V2 with the v1 Dragon ability — 2026-10-21', '',
          '**Verdict:** the extra-stat version appears slightly weaker for Dragons here, with no demonstrated balance improvement. Dragon cross-faction score falls 2.1 percentage points in Draft and 1.4 in Discard; both paired 95% intervals include zero. Draft shifts toward Critters and Discard toward Robots. Keep +4 as the working default on this evidence; this trial is not adopted.', '',
          'Only Dragon Overwhelming changes: 7+ Dragon contribution grants one extra Dragon stat, once, instead of +4 power. Critter tiebreak and Robot Reconfigure remain v2. The extra stat recomputes ultimates and hybrid formulas before shields and main-faction selection. Reconfigure compares plans using the experimental rule.', '',
          '1,000 new games versus 1,000 archived baseline games: 500 per version/mode, Normal Deck, both seats using browser search with 16 samples per candidate and preparation lookahead. Starting deals, first pickers and planning seeds match. These are separate self-play environments, not one version playing directly against the other. Local sequential Discard semantics apply.', '',
          '![Faction comparison](v2-dragon-stat-2026-10-21/faction-comparison.png)', '',
          '## Cross-faction score (same metric as the supplied chart)', '',
          'Score = (wins + half draws) / games against another named faction. Mirrors and untyped opponents excluded. This measures selected-hand outcomes, not causal faction strength.', '',
          '| Mode | Dragon rule | Critters | Robots | Dragons | Draws |', '|---|---|---:|---:|---:|---:|']
for a in arms:
    report.append('| '+('Draft' if a['mode']=='draft' else 'Discard')+' | '+('+4 power' if a['index']==0 else '+1 Dragon stat')+' | '+' | '.join(pct(a['factions'][f]['cross']['score']) for f in FACTIONS)+' | '+pct(a['draws'])+' |')
report += ['', '## Actual wins when that faction is played', '',
           'Includes mirrors and draws in the denominator; both mirror hands count as faction appearances. These percentages therefore differ from the cross-faction score.', '',
           '| Mode | Dragon rule | Critters W / hands | Robots W / hands | Dragons W / hands |', '|---|---|---:|---:|---:|']
for a in arms:
    report.append('| '+('Draft' if a['mode']=='draft' else 'Discard')+' | '+('+4 power' if a['index']==0 else '+1 Dragon stat')+' | '+' | '.join(f"{a['factions'][f]['all']['wins']}/{a['factions'][f]['all']['n']} ({pct(a['factions'][f]['all']['winRate'])})" for f in FACTIONS)+' |')
report += ['', '## Cross-faction change and uncertainty', '',
           'Extra stat minus fixed power, in percentage points. Approximate 95% paired bootstrap intervals resample 500 matched deals (5,000 replicates); membership may change with search choices. These deals were used previously and are not a fresh holdout.', '',
           '| Mode | Faction | Change | 95% interval |', '|---|---|---:|---:|']
for mode in MODES:
    for f in FACTIONS:
        a, b = [next(a for a in arms if a['mode']==mode and a['index']==j)['factions'][f]['cross'] for j in [0, 1]]
        lo, hi = deltas[mode][f]['interval']
        report.append(f"| {mode} | {f} | {(b['score']-a['score'])*100:+.1f} | {lo*100:+.1f} to {hi*100:+.1f} |")
report += ['', '## Mechanical check: keep baseline final cards fixed', '',
           'Automatic Reconfigure and faction choice are recomputed, but no cards are redrafted/discarded. This isolates the scoring change from new search choices; it is not additional self-play.', '',
           '| Mode | Activated baseline hands | Weaker / equal / stronger score | Mean score change when active | Changed game outcomes | Draws before → after |', '|---|---:|---:|---:|---:|---:|']
for m in mechanical:
    report.append(f"| {m['mode']} | {m['activated']} | {m['weaker']} / {m['equal']} / {m['stronger']} | {m['meanScoreChangeWhenActivated']:+.2f} | {m['changedOutcomes']}/500 | {m['drawsBefore']} → {m['drawsAfter']} |")
report += ['', '## Evidence and reproduction', '',
           'Raw evidence: `.ai-runs/v2-dragon-stat-2026-10-21/`; baseline `.ai-runs/normal-balance-2026-10-21/abilitiesv2-*-normal-16/`. Every new game is replayed, sampled building/preparation roots are recomputed, and baseline replays verify default behavior remains identical. `verification.json`, `analysis.json` and `same-hands.json` preserve checks and detailed counts. Source snapshots and hashes accompany collection.', '',
           'Commands (use a fresh output directory for collection; the runner preserves existing evidence):', '', '```powershell',
           'node scripts/run-normal-balance.mjs .ai-runs/v2-dragon-stat-2026-10-21 500 16 2 abilitiesv2-extra-stat 31000000',
           'node scripts/verify-normal-balance.mjs .ai-runs/v2-dragon-stat-2026-10-21',
           'node scripts/verify-v2-dragon-stat.mjs',
           'node scripts/rescore-v2-dragon-stat.mjs',
           '.ai-venv/Scripts/python.exe scripts/analyze-v2-dragon-stat.py', '```', '',
           'The process-local trial is configured before any cached profiles are created. Playable v2 still defaults to +4 power; no design adoption or publishing is implied.', '']
Path('docs/V2_DRAGON_STAT_RESULTS.md').write_text('\n'.join(report), encoding='utf-8')
print(json.dumps(summary, indent=2))
