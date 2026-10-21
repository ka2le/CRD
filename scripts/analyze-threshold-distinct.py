"""Matched-deal cutoff comparison, preserving distinct +2/+3/+4 rewards."""
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path('.ai-runs/threshold-distinct-2026-10-21')
BASELINE = Path('.ai-runs/threshold-confirmation-2026-10-21')
LATER = Path('.ai-runs/threshold-later-2026-10-21')
PLOTS = Path('.ai-runs/normal-balance-2026-10-21')
OUT = Path('docs/threshold-distinct-2026-10-21')
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(PLOTS / 'matplotlib-cache'))
sys.path.insert(0, str((PLOTS / 'plot-deps').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

FACTIONS = ['critter', 'robot', 'dragon']
VARIANTS = ['threshold', 'threshold-tuned', 'threshold-distinct8', 'threshold-distinct9']
LABELS = ['Original\n+1/+2/+4 at 1/4/7', '+2/+3/+4\nat 1/4/7', '+2/+3/+4\nat 1/4/8', '+2/+3/+4\nat 1/4/9']
CUTOFFS = ['1/4/7', '1/4/7', '1/4/8', '1/4/9']
if (LATER/'verification.json').exists():
    VARIANTS += ['threshold-later8', 'threshold-later9']
    LABELS += ['+2/+3/+4\nat 1/5/8', '+2/+3/+4\nat 1/5/9']
    CUTOFFS += ['1/5/8', '1/5/9']
COLORS = ['#824de4', '#b15384', '#2b61a6']

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def pct(value):
    return f'{100*value:.1f}%'

arms = []
deals = {}
for variant in VARIANTS:
    root = BASELINE if variant == 'threshold' else LATER if variant.startswith('threshold-later') else ROOT
    verification = read(root / 'verification.json')
    for mode in ['draft', 'five-hand-discard']:
        folder = root / f'{variant}-{mode}-normal-16'
        manifest = read(folder / 'complete.json')
        games = [json.loads(line) for line in (folder / 'games.jsonl').read_text(encoding='utf-8').splitlines()]
        assert manifest['deck'] == 'normal' and manifest['samples'] == 16 and len(games) == 500
        assert any(a['variant'] == variant and a['mode'] == mode and a['games'] == len(games) for a in verification['arms'])
        hashes = [(g['seed'], g['initialDealHash']) for g in games]
        if mode in deals:
            assert hashes == deals[mode], 'Starting deals differ across compared variants'
        deals[mode] = hashes
        factions = {}
        for faction in FACTIONS:
            all_values, cross_values = [], []
            powers = []
            for game in games:
                for seat, rival in [('player', 'opponent'), ('opponent', 'player')]:
                    hand = game[seat]
                    if hand['damageType'] != faction:
                        continue
                    value = .5 if game['winner'] == 'tie' else float(game['winner'] == seat)
                    all_values.append(value)
                    powers.append(hand['power'])
                    if game[rival]['damageType'] in FACTIONS and game[rival]['damageType'] != faction:
                        cross_values.append(value)
            n = len(cross_values)
            score = sum(cross_values)/n
            se = math.sqrt(sum((v-score)**2 for v in cross_values)/(n*(n-1)))
            factions[faction] = dict(hands=len(all_values), wins=all_values.count(1), draws=all_values.count(.5), losses=all_values.count(0),
                                     score=score, crossHands=n, interval=[max(0, score-1.96*se), min(1, score+1.96*se)],
                                     powerCounts={str(p): powers.count(p) for p in sorted(set(powers))})
        arms.append(dict(variant=variant, mode=mode, games=len(games), drawRate=sum(g['winner']=='tie' for g in games)/len(games), factions=factions))

(ROOT/'summary.json').write_text(json.dumps(dict(arms=arms, pairedInitialDealsVerified=True), indent=2), encoding='utf-8')
plt.rcParams.update({'figure.facecolor':'#101215','axes.facecolor':'#101215','text.color':'#ececf0',
                     'xtick.color':'#d8d8df','ytick.color':'#b9bbc5','font.size':11,'savefig.facecolor':'#101215'})
fig, axes = plt.subplots(2, 1, figsize=(16 if len(VARIANTS)>4 else 12, 10))
for ax, mode in zip(axes, ['draft', 'five-hand-discard']):
    rows = [next(a for a in arms if a['variant']==v and a['mode']==mode) for v in VARIANTS]
    for i, faction in enumerate(FACTIONS):
        values = [r['factions'][faction]['score'] for r in rows]
        bounds = [r['factions'][faction]['interval'] for r in rows]
        errors = np.array([[v-b[0] for v,b in zip(values,bounds)], [b[1]-v for v,b in zip(values,bounds)]])
        positions = np.arange(len(rows))+(i-1)*.24
        ax.bar(positions, values, width=.22, color=COLORS[i], label=['Critters','Robots','Dragons'][i], yerr=errors,
               error_kw={'ecolor':'#b8bbc4','capsize':3,'elinewidth':1})
        for x,v,b in zip(positions,values,bounds):
            ax.text(x,b[1]+.018,pct(v),ha='center',fontsize=10)
    ax.set_xticks(range(len(rows)),[label+'\nDraws: '+pct(row['drawRate']) for label,row in zip(LABELS,rows)])
    ax.set_ylim(0,.9)
    ax.yaxis.set_major_formatter(PercentFormatter(1))
    ax.grid(axis='y',alpha=.13,linestyle=':')
    ax.set_axisbelow(True)
    ax.axhline(.5,color='#aaa',alpha=.4,ls='--',lw=.8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(length=0,pad=8)
    ax.set_title('Draft' if mode=='draft' else 'Discard',loc='left',fontsize=16,weight='bold',pad=16)
fig.suptitle('Threshold — keeping the factions distinct',x=.07,ha='left',fontsize=21,weight='bold')
fig.text(.07,.938,'Normal Deck · 500 games per configuration/mode · matching starting deals · own rules active in search',color='#b9bbc5')
handles,labels=axes[0].get_legend_handles_labels()
fig.legend(handles,labels,loc='lower center',bbox_to_anchor=(.5,.04),ncol=3,frameon=False)
fig.text(.07,.028,'Cross-faction score = wins + half draws; mirrors excluded. Whiskers: approximate 95% intervals.',fontsize=9,color='#b9bbc5')
fig.text(.07,.009,'16 samples per candidate. Conditional hand outcomes, not causal faction strength. Bonuses / cutoffs in C / R / D order.',fontsize=9,color='#b9bbc5')
fig.subplots_adjust(left=.075,right=.975,top=.87,bottom=.155,hspace=.52)
for extension in ['png','svg']:
    fig.savefig(OUT/f'faction-comparison.{extension}',dpi=155)
plt.close(fig)

lines = ['# Threshold: distinct faction rewards', '',
         'The equal-bonus trials are rejected on design grounds: Critters, Robots and Dragons should retain different reward curves. No Critter upper bound was implemented or tested. Abilities v2 stays at Dragon 7+ → +4.', '',
         'The first comparison adds 3,000 Normal Deck games: +2/+3/+4 bonuses at 1/4/7, 1/4/8 and 1/4/9, each with 500 Draft and 500 Discard games. The original Threshold reference is another 1,000 games from the previously running confirmation. All configurations use the same starting deals (41m Draft / 42m Discard seeds), 16 search samples per candidate, and their own rules for choices and rollout scoring. These are exploratory candidates on this set, not independently confirmed selections.', '',
         '![Faction comparison](threshold-distinct-2026-10-21/faction-comparison.png)', '',
         '| Bonuses | Cutoffs | Mode | Critters | Robots | Dragons | Draws |', '|---|---|---|---:|---:|---:|---:|']
for arm in arms:
    index = VARIANTS.index(arm['variant'])
    lines.append(f"| {'1/2/4' if index==0 else '2/3/4'} | {CUTOFFS[index]} | {'Draft' if arm['mode']=='draft' else 'Discard'} | "+' | '.join(pct(arm['factions'][f]['score']) for f in FACTIONS)+f" | {pct(arm['drawRate'])} |")
lines += ['', 'Scores mean wins plus half draws against other named factions; same-faction matches are excluded. Rates describe hands selected by this search policy. They do not prove equal optimal-play strength.', '',
          '## Hand counts', '', '| Configuration | Mode | Faction | Hands | Wins | Draws | Losses | Cross-faction n | 95% interval |', '|---|---|---|---:|---:|---:|---:|---:|---|']
for arm in arms:
    for f,s in arm['factions'].items():
        lines.append(f"| {arm['variant']} | {arm['mode']} | {f} | {s['hands']} | {s['wins']} | {s['draws']} | {s['losses']} | {s['crossHands']} | {pct(s['interval'][0])}–{pct(s['interval'][1])} |")
lines += ['', 'All games replayed with saved legal actions and exact final profiles/outcomes. Building and preparation search roots were recomputed in fresh processes and matched saved choices and candidate values. Source snapshots and manifests are retained. The earlier equal-bonus tests were allowed to finish; no runs were cancelled.', '',
          'Earlier Battle/V2/card analysis: [Normal study](NORMAL_BALANCE_RESULTS.md). Rejected equal-bonus trials: [archive](THRESHOLD_REFINEMENT_RESULTS.md). Raw evidence: `.ai-runs/threshold-distinct-2026-10-21/` and `.ai-runs/threshold-confirmation-2026-10-21/`.', '']
if (ROOT/'interpretation.md').exists():
    lines[2:2] = [(ROOT/'interpretation.md').read_text(encoding='utf-8').strip(), '']
if len(VARIANTS)>4:
    lines += ['Follow-up: because Dragon cutoff 9 produced a large Robot advantage in Discard, an additional 2,000 games tested Robot cutoff 5 with Dragon cutoff 8 or 9, keeping bonuses +2/+3/+4. This was an adaptive exploratory step, not an independent holdout. Evidence is in `.ai-runs/threshold-later-2026-10-21/`.', '']
Path('docs/THRESHOLD_DISTINCT_RESULTS.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps([dict(variant=a['variant'],mode=a['mode'],drawRate=a['drawRate'],scores={f:round(a['factions'][f]['score']*100,1) for f in FACTIONS}) for a in arms],indent=2))
