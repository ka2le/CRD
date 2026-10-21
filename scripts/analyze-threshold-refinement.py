"""Threshold-only follow-up; calibration and fresh-deal confirmation remain separate."""
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path('.ai-runs/threshold-refinement-2026-10-21')
REFERENCE = Path('.ai-runs/normal-balance-2026-10-21')
HOLDOUT = Path('.ai-runs/threshold-confirmation-2026-10-21')
OUT = Path('docs/threshold-refinement-2026-10-21')
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(REFERENCE / 'matplotlib-cache'))
sys.path.insert(0, str((REFERENCE / 'plot-deps').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

FACTIONS = ['critter', 'robot', 'dragon']
COLORS = ['#824de4', '#b15384', '#2b61a6']
LABELS = {
    'threshold': 'Original\n+1/+2/+4 at 1/4/7',
    'threshold-tuned': 'First trial\n+2/+3/+4 at 1/4/7',
    'threshold-balanced': 'Trial A\n+2/+2/+3 at 1/4/7',
    'threshold-balanced-robot3': 'Trial B\n+2/+2/+3 at 1/3/7',
    'threshold-balanced-dragon8': 'Trial C\n+2/+2/+4 at 1/4/8',
}

def read(p):
    return json.loads(p.read_text(encoding='utf-8'))

def pct(x):
    return '—' if x is None else f'{100*x:.1f}%'

def collect(root):
    study = read(root / 'study.json')
    verification = read(root / 'verification.json')
    result = []
    for job in study['jobs']:
        folder = root / f"{job['variant']}-{job['mode']}-normal-16"
        m = read(folder / 'complete.json')
        games = [json.loads(line) for line in (folder / 'games.jsonl').read_text(encoding='utf-8').splitlines()]
        assert m['deck'] == 'normal' and m['samples'] == 16 and len(games) == m['games']
        hands = [dict(faction=g[s]['damageType'], rival=g['opponent' if s == 'player' else 'player']['damageType'],
                      value=.5 if g['winner'] == 'tie' else float(g['winner'] == s)) for g in games for s in ['player', 'opponent']]
        factions = {}
        for f in FACTIONS:
            all_hands = [h for h in hands if h['faction'] == f]
            group = [h for h in all_hands if h['rival'] in FACTIONS and h['rival'] != f]
            n = len(group)
            score = sum(h['value'] for h in group)/n
            se = math.sqrt(sum((h['value']-score)**2 for h in group)/(n*(n-1)))
            factions[f] = dict(n=len(all_hands), wins=sum(h['value']==1 for h in all_hands),
                               draws=sum(h['value']==.5 for h in all_hands), losses=sum(h['value']==0 for h in all_hands),
                               nonmirror=dict(n=n, score=score, interval=[max(0,score-1.96*se),min(1,score+1.96*se)]))
        draws = sum(g['winner']=='tie' for g in games)
        result.append(dict(variant=job['variant'], mode=job['mode'], games=len(games), draws=draws, drawRate=draws/len(games),
                           factions=factions, thresholds=m['thresholds']))
    assert sum(r['games'] for r in result) == verification['gamesReplayed']
    return result

reference = [r for r in read(REFERENCE/'normal-summary.json')['arms'] if r['variant'] in ['threshold','threshold-tuned']]
calibration = collect(ROOT)
confirmation = collect(HOLDOUT) if (HOLDOUT/'verification.json').exists() else []
selection = read(ROOT/'selection.json') if (ROOT/'selection.json').exists() else None
summary = dict(reference=reference, calibration=calibration, confirmation=confirmation, selection=selection)
(ROOT/'refinement-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')

plt.rcParams.update({'figure.facecolor':'#101215','axes.facecolor':'#101215','text.color':'#ececf0','axes.labelcolor':'#d8d8df',
                     'xtick.color':'#d8d8df','ytick.color':'#b9bbc5','font.size':11,'savefig.facecolor':'#101215'})

def chart(reports, name, title):
    variants = list(dict.fromkeys(r['variant'] for r in reports))
    fig, axes = plt.subplots(2, 1, figsize=(13, 10))
    for ax, mode in zip(axes,['draft','five-hand-discard']):
        rows = [next(r for r in reports if r['variant']==v and r['mode']==mode) for v in variants]
        for i,f in enumerate(FACTIONS):
            scores = [r['factions'][f]['nonmirror']['score'] for r in rows]
            bounds = [r['factions'][f]['nonmirror']['interval'] for r in rows]
            x = np.arange(len(rows))+(i-1)*.24
            error = np.array([[v-b[0] for v,b in zip(scores,bounds)],[b[1]-v for v,b in zip(scores,bounds)]])
            ax.bar(x,scores,width=.22,color=COLORS[i],label=['Critters','Robots','Dragons'][i],yerr=error,
                   error_kw={'ecolor':'#b8bbc4','capsize':3,'elinewidth':1})
            for xx,v,b in zip(x,scores,bounds):
                ax.text(xx,b[1]+.018,pct(v),ha='center',fontsize=10)
        ax.set_xticks(range(len(rows)),[LABELS[v]+f"\nDraws: {pct(r['drawRate'])}" for v,r in zip(variants,rows)])
        ax.set_ylim(0,1)
        ax.yaxis.set_major_formatter(PercentFormatter(1))
        ax.grid(axis='y',alpha=.13,linestyle=':')
        ax.set_axisbelow(True)
        ax.axhline(.5,color='#aaa',alpha=.4,ls='--',lw=.8)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.tick_params(length=0,pad=8)
        ax.set_title('Draft' if mode=='draft' else 'Discard',loc='left',fontsize=16,weight='bold',pad=16)
    fig.suptitle(title,x=.07,ha='left',fontsize=21,weight='bold')
    fig.text(.07,.938,'Normal Deck · 500 games per configuration/mode · 16 samples per candidate · own rules active throughout search',color='#b9bbc5')
    handles,labels=axes[0].get_legend_handles_labels()
    fig.legend(handles,labels,loc='lower center',bbox_to_anchor=(.5,.04),ncol=3,frameon=False)
    fig.text(.07,.028,'Cross-faction score = wins + half draws; mirrors excluded. Whiskers: approximate 95% intervals.',fontsize=9,color='#b9bbc5')
    fig.text(.07,.009,'Labels show bonuses and required power in Critter / Robot / Dragon order. Conditional outcomes do not measure causal strength.',fontsize=9,color='#b9bbc5')
    fig.subplots_adjust(left=.075,right=.975,top=.87,bottom=.155,hspace=.52)
    fig.savefig(OUT/(name+'.png'),dpi=155)
    fig.savefig(OUT/(name+'.svg'))
    plt.close(fig)

chart(reference+calibration,'threshold-calibration','Threshold — focused balance pass')
if confirmation:
    chart(confirmation,'threshold-confirmation','Threshold — fresh-deal confirmation')

lines=['# Threshold refinement — Normal Deck', '',
       'Abilities v2 remains unchanged at Dragon7+ → +4. This pass targets a simple, reasonably balanced Threshold fallback.', '',
       '## Calibration', '',
       'Three candidates, 500 Draft + 500 Discard games each, on the previous31m/32m seeds. All use their own scoring parameters throughout actual search and all rollout/preparation evaluation, with the same16-sample budget. Earlier original/first-trial results are shown for context; no Wild games are included.', '',
       '![Threshold calibration](threshold-refinement-2026-10-21/threshold-calibration.png)', '',
       '| Configuration | Building | Critters | Robots | Dragons | Draws |', '|---|---|---:|---:|---:|---:|']
for r in reference+calibration:
    lines.append(f"| {LABELS[r['variant']].replace(chr(10),' ')} | {'Draft' if r['mode']=='draft' else 'Discard'} | "+' | '.join(pct(r['factions'][f]['nonmirror']['score']) for f in FACTIONS)+f" | {pct(r['drawRate'])} |")
if selection:
    lines += ['', '## Selection before fresh-deal testing', '', selection['reason'], '',
              f"Selected: `{selection['variant']}`. Selection recorded before launching the confirmation games. Confirmation uses fresh41m/42m seeds, comparing the selected candidate against the original Threshold on matching starting deals; no calibration games are pooled into confirmation."]
if confirmation:
    lines += ['', '## Fresh-deal confirmation', '', '![Threshold confirmation](threshold-refinement-2026-10-21/threshold-confirmation.png)', '',
              '| Configuration | Building | Critters | Robots | Dragons | Draws |', '|---|---|---:|---:|---:|---:|']
    for r in confirmation:
        lines.append(f"| {LABELS[r['variant']].replace(chr(10),' ')} | {'Draft' if r['mode']=='draft' else 'Discard'} | "+' | '.join(pct(r['factions'][f]['nonmirror']['score']) for f in FACTIONS)+f" | {pct(r['drawRate'])} |")
lines += ['', '## Faction counts and uncertainty', '',
          '| Stage | Configuration | Building | Faction | Hands | Wins / draws / losses | Cross-faction score [95% interval] |', '|---|---|---|---|---:|---:|---:|']
for stage, reports in [('Calibration',calibration),('Confirmation',confirmation)]:
    for r in reports:
        for f,s in r['factions'].items():
            nm=s['nonmirror']
            lines.append(f"| {stage} | {r['variant']} | {r['mode']} | {f} | {s['n']} | {s['wins']} / {s['draws']} / {s['losses']} | {pct(nm['score'])} [{pct(nm['interval'][0])}, {pct(nm['interval'][1])}] (n={nm['n']}) |")
lines += ['', 'Normal Deck and real mode-specific search are verified in manifests and reproducible source snapshots. Every actual game was replayed; building and preparation search roots were recomputed under each variant and matched saved candidate values/actions. Draft starters alternate. Discard retains the existing local sequential flow and recycle semantics. Group rates describe selected hands, not optimal play or equal causal faction strength.', '',
          'Full earlier Battle/V2 comparison and card tables: [Normal balance study](NORMAL_BALANCE_RESULTS.md). Raw calibration/confirmation evidence lives in `.ai-runs/threshold-refinement-2026-10-21/` and `.ai-runs/threshold-confirmation-2026-10-21/`.', '']
interpretation=ROOT/'interpretation.md'
if interpretation.exists():
    lines[4:4]=[interpretation.read_text(encoding='utf-8').strip(),'']
Path('docs/THRESHOLD_REFINEMENT_RESULTS.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps(dict(calibrationGames=sum(r['games'] for r in calibration),confirmationGames=sum(r['games'] for r in confirmation),report='docs/THRESHOLD_REFINEMENT_RESULTS.md')))
