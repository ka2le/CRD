"""Normal Deck study tables and reproducible Matplotlib figures. No game mutations."""
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.ai-runs/normal-balance-2026-10-21')
OUT = Path('docs/normal-balance-2026-10-21')
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(ROOT / 'matplotlib-cache'))
sys.path.insert(0, str((ROOT / 'plot-deps').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

FACTIONS = ['critter', 'robot', 'dragon']
COLORS = ['#824de4', '#b15384', '#2b61a6']
VARIANTS = ['battle', 'threshold', 'threshold-tuned', 'abilitiesv2', 'abilitiesv2-tuned']
TITLES = ['Battle*', 'Threshold\n+1 / +2 / +4', 'Threshold trial\n+2 / +3 / +4', 'Abilities v2\n7+ → +4', 'V2 trial\n8+ → +3']
MODES = ['draft', 'five-hand-discard']
LABELS = {
    'critter1': 'Critter stat ×1', 'rabbit2': 'Critter stat ×2', 'swarm': 'Basic Critter attack (all art)', 'murder_rabbit': 'Murder Rabbit',
    'robot1': 'Robot stat ×1', 'robot2': 'Robot stat ×2', 'robot_attack': 'Basic Robot attack', 'robot_ulti': 'Robot Ultimate',
    'dragon1': 'Dragon stat ×1', 'dragon2': 'Dragon stat ×2', 'dragons_breath': 'Dragon Breath', 'dragon_ulti': 'Dragon Ultimate', 'devour': 'Devour',
    'robot_critter': 'Robot + Critter stat', 'robot_dragon': 'Robot + Dragon stat', 'dragon_rabbit': 'Dragon + Critter stat', 'joker': 'Joker',
    'one_off_each': 'One of Each (C × R × D)', 'any_off_each': 'Any of Each (C + R + D)', 'shield2': 'Shield', 'shield_is_dmg': 'Shield Is Damage',
    'bite': 'Bite', 'chameleon': 'Chameleon', 'double_dmg': '2×', 'shortcut': 'Shortcut',
    'copy_card_in_hand': 'Copy', 'draw_2_extra': 'Draw 2', 'draw_all_new_1': 'Redraw', 'recycle_card': 'Recycle',
}
PREP = ['copy_card_in_hand', 'draw_2_extra', 'draw_all_new_1', 'recycle_card']

def read(p):
    return json.loads(p.read_text(encoding='utf-8'))

def records(p):
    return [json.loads(line) for line in p.read_text(encoding='utf-8').splitlines() if line]

def pct(x):
    return '—' if x is None else f'{100*x:.1f}%'

def tally(hands, independent=False):
    n = len(hands)
    w = sum(h['value'] == 1 for h in hands)
    d = sum(h['value'] == .5 for h in hands)
    mean = (w + d/2)/n if n else None
    se = math.sqrt(sum((h['value']-mean)**2 for h in hands)/(n*(n-1))) if n > 1 else 0
    return dict(n=n, wins=w, draws=d, losses=n-w-d, winRate=w/n if n else None, score=mean,
                interval=[max(0, mean-1.96*se), min(1, mean+1.96*se)] if n and independent else None)

def mean_interval(values):
    n = len(values)
    mean = sum(values)/n
    se = math.sqrt(sum((v-mean)**2 for v in values)/(n*(n-1))) if n > 1 else 0
    return dict(n=n, mean=mean, interval=[mean-1.96*se, mean+1.96*se])

def wilson(w, n):
    p = w/n
    z = 1.96
    mid = (p+z*z/(2*n))/(1+z*z/n)
    half = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    return [mid-half, mid+half]

arms = []
raw_games = {}
verification = read(ROOT / 'verification.json')
assert verification['gamesReplayed'] == 5000
for variant in VARIANTS:
    for mode in MODES:
        name = f'{variant}-{mode}-normal-16'
        folder = ROOT / name
        meta = read(folder / 'complete.json')
        assert meta['deck'] == 'normal' and meta['samples'] == 16 and meta['games'] == 500
        games = records(folder / 'games.jsonl')
        raw_games[variant, mode] = games
        ready, activated = {}, {}
        for d in records(folder / 'decisions.jsonl'):
            key = d['game'], d['actor']
            if d['phase'] == 'preparation':
                ready.setdefault(key, [c['id'] for c in d['hand']])
            if d['action']['type'] == 'prepare':
                activated.setdefault(key, []).append(d['action']['cardId'])
        hands = []
        for g in games:
            for side in ['player', 'opponent']:
                enemy = 'opponent' if side == 'player' else 'player'
                assert (g['game'], side) in ready
                hands.append(dict(game=g['game'], side=side, value=.5 if g['winner'] == 'tie' else float(g['winner'] == side),
                                  faction=g[side]['damageType'] or 'untyped', rival=g[enemy]['damageType'] or 'untyped',
                                  final=[c['id'] for c in g[side+'Hand']], ready=ready[g['game'], side],
                                  activated=activated.get((g['game'], side), []), profile=g[side]))
        totals = tally(hands)
        factions = {}
        for f in FACTIONS + ['mixed', 'neutral', 'untyped']:
            selected = [h for h in hands if h['faction'] == f]
            s = tally(selected)
            s.update(presence=len(selected)/len(hands), shareOfWins=s['wins']/totals['wins'],
                     nonmirror=tally([h for h in selected if f in FACTIONS and h['rival'] in FACTIONS and h['rival'] != f], independent=True))
            factions[f] = s
        cards = {}
        for card_id in LABELS:
            if card_id not in meta['poolCounts']:
                continue
            card = dict(label=LABELS[card_id], deckCopies=meta['poolCounts'][card_id])
            for stage in ['final', 'ready', 'activated']:
                s = tally([h for h in hands if card_id in h[stage]])
                s.update(presence=s['n']/len(hands), inWinners=s['wins']/totals['wins'], inLosers=s['losses']/totals['losses'],
                         inDraws=s['draws']/totals['draws'] if totals['draws'] else None,
                         copies=sum(h[stage].count(card_id) for h in hands))
                card[stage] = s
            # Paired per-match presence differences, rather than treating both hands as independent.
            deltas = []
            for p, o in zip(hands[::2], hands[1::2]):
                if p['value'] == .5:
                    continue
                win, lose = (p, o) if p['value'] == 1 else (o, p)
                deltas.append(int(card_id in win['final'])-int(card_id in lose['final']))
            card['pairedPresenceGap'] = mean_interval(deltas)
            cards[card_id] = card
        matchups = {}
        for i, f in enumerate(FACTIONS):
            for other in FACTIONS[i+1:]:
                matchups[f'{f} vs {other}'] = tally([h for h in hands if h['faction'] == f and h['rival'] == other], independent=True)
        features = {
            'Joker + One of Each': lambda h: 'joker' in h['final'] and 'one_off_each' in h['final'],
            'Joker without One of Each': lambda h: 'joker' in h['final'] and 'one_off_each' not in h['final'],
            'One of Each without Joker': lambda h: 'joker' not in h['final'] and 'one_off_each' in h['final'],
            'Double Dragon + Ultimate/Devour': lambda h: 'dragon2' in h['final'] and bool(set(h['final']) & {'dragon_ulti', 'devour'}),
            'Overwhelming earned': lambda h: bool(h['profile'].get('overwhelming')),
            'Dragon contribution exactly 7': lambda h: h['profile'].get('dragonBase') == 7,
            'Dragon contribution exactly 8': lambda h: h['profile'].get('dragonBase') == 8,
            'Reconfigure stat → attack': lambda h: (h['profile'].get('reconfigured') or {}).get('direction') == 'stat-to-attack',
            'Reconfigure attack → stat': lambda h: (h['profile'].get('reconfigured') or {}).get('direction') == 'attack-to-stat',
            'Five final cards': lambda h: len(h['final']) == 5,
            'Six or more final cards': lambda h: len(h['final']) >= 6,
        }
        draws = sum(g['winner'] == 'tie' for g in games)
        comparable = [g for g in games if g['digitalWinner'] is not None]
        arms.append(dict(**meta, name=name, hands=totals, draws=draws, drawRate=draws/len(games), drawInterval=wilson(draws, len(games)),
                         factions=factions, cards=cards, matchups=matchups,
                         features={label: tally([h for h in hands if fn(h)]) for label, fn in features.items()},
                         critterTiebreaks=sum(g['reason'] == 'critter-tiebreak' for g in games),
                         playerScore=sum(.5 if g['winner'] == 'tie' else int(g['winner'] == 'player') for g in games)/len(games),
                         firstPickerScore=sum(.5 if g['winner'] == 'tie' else int(g['winner'] == g['firstPicker']) for g in games)/len(games) if mode == 'draft' else None,
                         digitalComparable=len(comparable), digitalAgreement=sum(g['winner'] == g['digitalWinner'] for g in comparable)/len(comparable) if comparable else None))

paired = []
for base in ['threshold', 'abilitiesv2']:
    for mode in MODES:
        lo, hi = raw_games[base, mode], raw_games[base+'-tuned', mode]
        assert all(a['initialDealHash'] == b['initialDealHash'] and a['seed'] == b['seed'] for a, b in zip(lo, hi))
        paired.append(dict(base=base, mode=mode, drawChange=mean_interval([int(b['winner']=='tie')-int(a['winner']=='tie') for a, b in zip(lo, hi)]),
                           changedWinners=sum(a['winner'] != b['winner'] for a, b in zip(lo, hi))))
same_hands = read(ROOT / 'same-hands-trials.json')
summary = dict(arms=arms, pairedComparisons=paired, sameHandsTrials=same_hands, verification=verification)
(ROOT / 'normal-summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')

plt.rcParams.update({'figure.facecolor': '#101215', 'axes.facecolor': '#101215', 'axes.edgecolor': '#555', 'text.color': '#ececf0',
                     'axes.labelcolor': '#d8d8df', 'xtick.color': '#d8d8df', 'ytick.color': '#b9bbc5', 'font.size': 11, 'savefig.facecolor': '#101215'})

def save(fig, name):
    fig.savefig(OUT / (name+'.png'), dpi=155)
    fig.savefig(OUT / (name+'.svg'))
    plt.close(fig)

def style(ax, maximum=1):
    ax.set_ylim(0, maximum)
    ax.yaxis.set_major_formatter(PercentFormatter(1))
    ax.grid(axis='y', alpha=.13, linestyle=':')
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(axis='both', length=0, pad=8)

def faction_chart(presence=False):
    fig, axes = plt.subplots(2, 1, figsize=(13, 10))
    for ax, mode, title in zip(axes, MODES, ['Draft', 'Discard']):
        group = [next(r for r in arms if r['variant']==v and r['mode']==mode) for v in VARIANTS]
        for i, f in enumerate(FACTIONS):
            values = [r['factions'][f]['presence'] if presence else r['factions'][f]['nonmirror']['score'] for r in group]
            x = np.arange(len(group))+(i-1)*.24
            errors = None
            if not presence:
                bounds = [r['factions'][f]['nonmirror']['interval'] for r in group]
                errors = np.array([[v-b[0] for v, b in zip(values, bounds)], [b[1]-v for v, b in zip(values, bounds)]])
            ax.bar(x, values, width=.22, color=COLORS[i], label=['Critters', 'Robots', 'Dragons'][i],
                   yerr=errors, error_kw={'ecolor': '#b8bbc4', 'capsize': 3, 'elinewidth': 1})
            for j, (xx, v) in enumerate(zip(x, values)):
                top = v if presence else bounds[j][1]
                ax.text(xx, top+.018, pct(v), ha='center', va='bottom', fontsize=9)
        ax.set_xticks(range(len(group)), TITLES)
        ax.set_title(title, loc='left', fontsize=16, weight='bold', pad=16)
        style(ax, .8 if presence else 1)
        if not presence:
            ax.axhline(.5, color='#a0a4b0', lw=.8, ls='--', alpha=.4)
    fig.suptitle('Faction presence in final hands' if presence else 'Normal Deck — faction performance', x=.07, ha='left', fontsize=21, weight='bold')
    fig.text(.07, .938, '500 games per configuration and building mode · in-game search self-play · 16 samples per candidate', color='#b9bbc5', fontsize=11)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc='lower center', bbox_to_anchor=(.5, .045), ncol=3, frameon=False)
    note = 'Presence = fraction of all 1,000 hands. Mixed/neutral/untyped Battle hands remain outside these three bars.' if presence else 'Score = (wins + ½ draws) / matches against other named factions; mirrors excluded. Whiskers: approximate 95% intervals.'
    fig.text(.07, .035, note, fontsize=9, color='#b9bbc5')
    fig.text(.07, .014, '*Battle: main class inferred from a full 12-round typed-damage cycle. Conditional results are not causal faction strength.', fontsize=9, color='#b9bbc5')
    fig.subplots_adjust(left=.075, right=.975, top=.87, bottom=.14, hspace=.47)
    save(fig, 'faction-presence' if presence else 'faction-comparison')

faction_chart()
faction_chart(True)
fig, ax = plt.subplots(figsize=(12, 5.3))
for i, mode in enumerate(MODES):
    group = [next(r for r in arms if r['variant']==v and r['mode']==mode) for v in VARIANTS]
    values = [r['drawRate'] for r in group]
    errors = np.array([[v-r['drawInterval'][0] for v, r in zip(values, group)], [r['drawInterval'][1]-v for v, r in zip(values, group)]])
    x = np.arange(5)+(i-.5)*.32
    ax.bar(x, values, width=.29, color=['#57b6ad', '#dfb56c'][i], label=['Draft', 'Discard'][i], yerr=errors,
           error_kw={'ecolor': '#c5c8d1', 'capsize': 4, 'elinewidth': 1})
    for xx, r in zip(x, group):
        ax.text(xx, r['drawInterval'][1]+.006, pct(r['drawRate']), ha='center', fontsize=10)
ax.set_xticks(range(5), [t.replace('*', '') for t in TITLES])
style(ax, max(.20, max(r['drawInterval'][1] for r in arms)+.04))
ax.set_title('Normal Deck — drawn games', loc='left', fontsize=20, weight='bold', pad=25)
ax.legend(frameon=False, loc='upper right')
fig.text(.08, .025, '500 games per bar · 95% Wilson intervals · Trial vs baseline uses matched starting deals within each ruleset.', fontsize=10, color='#b9bbc5')
fig.subplots_adjust(left=.08, right=.98, top=.82, bottom=.18)
save(fig, 'draw-comparison')

card_ids = list(LABELS)
columns = [next(r for r in arms if r['variant']==v and r['mode']==m) for m in MODES for v in VARIANTS]
matrix = []
for cid in card_ids:
    stage = 'ready' if cid in PREP else 'final'
    matrix.append([100*(r['cards'][cid][stage]['inWinners']-r['cards'][cid][stage]['inLosers']) if cid in r['cards'] else np.nan for r in columns])
fig, ax = plt.subplots(figsize=(14, 14))
limit = max(10, math.ceil(np.nanmax(np.abs(matrix))/5)*5)
cmap = plt.get_cmap('PuOr').copy()
cmap.set_bad('#30333a')
im = ax.imshow(matrix, cmap=cmap, vmin=-limit, vmax=limit, aspect='auto')
ax.set_yticks(range(len(card_ids)), [LABELS[c]+(' [preparation entry]' if c in PREP else '') for c in card_ids], fontsize=10)
ax.set_xticks(range(10), [t.replace('\n', ' ').replace('*', '') for t in TITLES]*2, rotation=40, ha='right', fontsize=9)
ax.axvline(4.5, color='white', lw=2)
for y, row in enumerate(matrix):
    for x, value in enumerate(row):
        ax.text(x, y, '—' if np.isnan(value) else f'{value:+.1f}', ha='center', va='center', fontsize=9,
                color='#ddd' if np.isnan(value) or abs(value)>limit*.55 else '#222')
ax.set_title('Card presence: winners minus losers (percentage points)', loc='left', fontsize=18, weight='bold', pad=48)
ax.text(.25, 1.014, 'Draft', ha='center', transform=ax.transAxes, fontsize=15)
ax.text(.75, 1.014, 'Discard', ha='center', transform=ax.transAxes, fontsize=15)
fig.colorbar(im, ax=ax, shrink=.6, pad=.025, label='Positive: more common in winning hands')
fig.text(.03, .022, 'Normal Deck · 500 games per column · presence counts each card once per hand · preparation cards measured before use\nThese are card/hand associations, not causal effects. Grey cells: card absent from that ruleset’s deck.', fontsize=10, color='#b9bbc5')
fig.subplots_adjust(left=.26, right=.94, top=.91, bottom=.15)
save(fig, 'card-presence')

lines = ['# Normal Deck balance comparison — 2026-10-21', '',
         '**This supersedes the earlier Wild Deck study for balance decisions. Wild is an intentionally unbalanced fun mode.**', '',
         '## Design', '',
         '- 5,000 games: Battle, Threshold, Threshold trial, Abilities v2, V2 trial × Draft/Discard × 500. Normal Deck only; printed copy counts verified in every starting deal. No Abilities v1 runs.',
         '- Threshold current: cutoffs 1/4/7, bonuses +1/+2/+4. Trial: same cutoffs, bonuses +2/+3/+4. V2 current: Dragon power7+ → +4. Trial: Dragon power8+ → +3. Other rules unchanged. Trials are isolated research processes, not adopted browser defaults.',
         '- Both players use the actual in-game sampled-world search, fixed16 samples/candidate, including preparation lookahead. Search makes decisions for each ruleset; Battle has independent native round-combat self-play. 256-world rechecks of selected decisions are diagnostics, not extra played games.',
         '- Draft first picker alternates. Discard uses the existing sequential local-AI flow and existing recycle-pile semantics. First-seat outcomes are reported; online simultaneous Discard and optimal human play are not established by this study.',
         '- Current/trial variants share starting deals and planning seeds within a ruleset. Across Battle/Threshold/V2, decks differ (70/72/70 cards and different special cards), so equal seeds do not imply identical starting hands. This is a comparison of playable systems, not an isolated ability-effect experiment.',
         '- Tabletop faction is its chosen main type. Battle has no chosen faction: the report uses largest typed pre-shield damage over one full12-round cooldown cycle, including doubling. One of Each is tagged Robot for consistency with tabletop. Equal typed leaders remain mixed; neutral-only and powerless hands are separate. This proxy is independent of opponent and actual fight length, but is not identical to a tabletop main-type choice.',
         '- Cross-faction score = (wins + half draws) / matches against either other named faction. Mirrors and mixed/neutral/untyped opponents are excluded. Approximate95% intervals use one observation per included match for each faction. These are conditional associations, not proof of equal causal strength or fun.',
         '- Card presence counts a hand once per card ID, combining artwork and physical copies. Final-hand and pre-preparation tables are separate; Copy transforms, so absence from final hands is not evidence of weakness. Activated-card groups and combinations overlap. Small groups are exploratory.', '',
         '## Faction comparison', '', '![Faction performance](normal-balance-2026-10-21/faction-comparison.png)', '',
         '| Configuration | Building | Draws | Critter score (n) | Robot score (n) | Dragon score (n) | First-picker / P1 score |', '|---|---|---:|---:|---:|---:|---:|']
for r in arms:
    cells = [f"{pct(r['factions'][f]['nonmirror']['score'])} ({r['factions'][f]['nonmirror']['n']})" for f in FACTIONS]
    lines.append(f"| {r['title']} | {'Draft' if r['mode']=='draft' else 'Discard'} | {r['draws']}/500 ({pct(r['drawRate'])}) | {' | '.join(cells)} | {pct(r['firstPickerScore'] if r['mode']=='draft' else r['playerScore'])} |")
lines += ['', '## Draws and faction presence', '', '![Draw rates](normal-balance-2026-10-21/draw-comparison.png)', '', '![Faction presence](normal-balance-2026-10-21/faction-presence.png)', '',
          'Paired trial-minus-current draw-rate changes (same starting deal, both policies may then diverge):', '',
          '| Rules | Building | Change | Approximate paired95% interval | Changed winner/tie labels |', '|---|---|---:|---:|---:|']
for p in paired:
    d = p['drawChange']
    lines.append(f"| {p['base']} | {p['mode']} | {100*d['mean']:+.1f}pp | {100*d['interval'][0]:+.1f} to {100*d['interval'][1]:+.1f}pp | {p['changedWinners']}/500 |")
lines += ['', '## Mechanical effect on unchanged baseline hands', '',
          'Rescore the baseline final hands under trial values, using each ruleset’s automatic conversion and main-type selection. Preparation/drafting/discard decisions are held fixed. This is not additional self-play.', '',
          '| Rules | Building | Changed outcomes | Draws before → after | Hands with changed score |', '|---|---|---:|---:|---:|']
for r in same_hands:
    lines.append(f"| {r['base']} | {r['mode']} | {r['changedOutcomes']}/500 | {r['drawsBefore']} → {r['drawsAfter']} | {r['changedHandScores']}/1000 |")
lines += ['', '## Card overview', '', '![Card presence](normal-balance-2026-10-21/card-presence.png)', '']
for r in arms:
    lines += [f"## {r['title']} — {'Draft' if r['mode']=='draft' else 'Discard'}", '',
              f"500 games; {r['hands']['wins']} winning hands, {r['hands']['losses']} losing hands, {r['hands']['draws']} drawn hands. Critter tiebreak wins: {r['critterTiebreaks']}.", '',
              '| Main faction | Hands | Wins / draws / losses | Share of all wins | Win when played | Cross-faction score [95% interval] |', '|---|---:|---:|---:|---:|---:|']
    for f, s in r['factions'].items():
        nm = s['nonmirror']
        ci = '—' if nm['interval'] is None else f"{pct(nm['score'])} [{pct(nm['interval'][0])}, {pct(nm['interval'][1])}]"
        lines.append(f"| {f} | {s['n']} | {s['wins']} / {s['draws']} / {s['losses']} | {pct(s['shareOfWins'])} | {pct(s['winRate'])} | {ci} |")
    lines += ['', '| Matchup | First faction wins / draws / losses | First faction score |', '|---|---:|---:|']
    for label, s in r['matchups'].items():
        lines.append(f"| {label} | {s['wins']} / {s['draws']} / {s['losses']} | {pct(s['score'])} |")
    lines += ['', '| Feature | Hands | Wins / draws / losses | Win rate |', '|---|---:|---:|---:|']
    for label, s in r['features'].items():
        if s['n']:
            lines.append(f"| {label} | {s['n']} | {s['wins']} / {s['draws']} / {s['losses']} | {pct(s['winRate'])} |")
    lines += ['', '### Every card in final hands', '', '| Card | Deck copies | Hands | All | Winners | Losers | Draws | Win when held | Copies /100 hands |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for cid, c in r['cards'].items():
        s = c['final']
        lines.append(f"| {c['label']} | {c['deckCopies']} | {s['n']} | {pct(s['presence'])} | {pct(s['inWinners'])} | {pct(s['inLosers'])} | {pct(s['inDraws'])} | {pct(s['winRate'])} | {s['copies']/10:.1f} |")
    lines += ['', '### Every card entering preparation', '', '| Card | Hands | All | Eventual winners | Eventual losers | Win when held |', '|---|---:|---:|---:|---:|---:|']
    for cid, c in r['cards'].items():
        s = c['ready']
        lines.append(f"| {c['label']} | {s['n']} | {pct(s['presence'])} | {pct(s['inWinners'])} | {pct(s['inLosers'])} | {pct(s['winRate'])} |")
    lines += ['', '### Actual preparation use', '', '| Card activated at least once | Hands | Wins / draws / losses | Win rate |', '|---|---:|---:|---:|']
    for cid in PREP:
        s = r['cards'][cid]['activated']
        lines.append(f"| {LABELS[cid]} | {s['n']} | {s['wins']} / {s['draws']} / {s['losses']} | {pct(s['winRate'])} |")
    if r['variant'] != 'battle':
        lines += ['', f"Same-final-hand Battle winner agreement: {pct(r['digitalAgreement'])} of {r['digitalComparable']} eligible games (tabletop-only cards excluded). This is an additional mechanical reference, not the native Battle self-play comparison above."]
lines += ['', '## Verification and reproduction', '',
          f"All {verification['gamesReplayed']:,} games replayed from their original seeds and logged actions through the shared engine. Verified {verification['rootsVerified']:,} decision roots and {verification['simulationsVerified']:,} root-candidate completions, candidate W/D/L arithmetic, source snapshots, final profiles/outcomes, and identical initial deals within trial/current pairs. Also recomputed {verification['searchRootsRecomputed']} actual search roots (one building and one preparation root per arm) under their original variant: every action, candidate value and W/D/L count matches the saved search. Nested preparation evaluations are additional.", '',
          '```powershell', 'node scripts/run-normal-balance.mjs .ai-runs/new-normal-study 500 16 6', 'node scripts/verify-normal-balance.mjs .ai-runs/new-normal-study',
          'node scripts/rescore-normal-trials.mjs .ai-runs/new-normal-study',
          '# Install/use Matplotlib in the selected study plot-deps directory, then:', 'python scripts/analyze-normal-balance.py .ai-runs/new-normal-study', '```', '',
          f"Raw evidence, source archive and machine-readable summary: `{ROOT.as_posix()}`. Charts have both PNG and SVG exports under `docs/normal-balance-2026-10-21/`. No browser rules were adopted or published by this experiment.", '']
interpretation = ROOT / 'interpretation.md'
if interpretation.exists():
    lines[4:4] = [interpretation.read_text(encoding='utf-8').strip(), '']
Path('docs/NORMAL_BALANCE_RESULTS.md').write_text('\n'.join(lines), encoding='utf-8')
print(json.dumps(dict(arms=len(arms), games=sum(r['games'] for r in arms), report='docs/NORMAL_BALANCE_RESULTS.md', figures=str(OUT))))
