import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path('.ai-runs/normal-balance-2026-10-21/plot-deps').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

FOLLOWUP = '--critter1' in sys.argv
ROOT = Path('.ai-runs/v2-dragon7-critter1-2026-10-22' if FOLLOWUP else '.ai-runs/v2-dragon7-immune-2026-10-22')
OLD = Path('.ai-runs/v2-dragon7-immune-2026-10-22' if FOLLOWUP else '.ai-runs/v2-perfect-shields-2026-10-21')
CONFIGS = [(OLD, 'abilitiesv2-dragon7-immune', 'Previous: shields 2/2/0'),
           (ROOT, 'abilitiesv2-dragon7-immune-critter1', 'New: shields 1/2/0')] if FOLLOWUP else [
           (OLD, 'abilitiesv2-perfect-balance-shields221', 'Historical 6+ / shield -1'),
           (ROOT, 'abilitiesv2-dragon7-immune', 'Trial 7+ / shield 0')]
FACTIONS = ['critter', 'robot', 'dragon']
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
defs = {c['id']: c for c in read(Path('data/cards.json'))['cards']}
defs.update({c['id']: c for c in read(Path('data/tabletop-cards.json'))['cards']})
assert read(ROOT / 'verification.json')['gamesReplayed'] == 1000
rows = []
bootstrap_draws = {}
for mode in ['draft', 'five-hand-discard']:
    prior_games = None
    for folder, variant, label in CONFIGS:
        arm = folder / f'{variant}-{mode}-normal-16'
        meta = read(arm / 'complete.json')
        games = [json.loads(s) for s in (arm / 'games.jsonl').read_text().splitlines()]
        assert len(games) == 500 and meta['deck'] == 'normal' and meta['samples'] == 16
        if FOLLOWUP:
            if prior_games is None:
                prior_games = games
            for before, after in zip(prior_games, games):
                for key in ['seed', 'firstPicker', 'initialDealHash']:
                    assert before[key] == after[key]
        totals = {f: dict(n=0, wins=0, draws=0, losses=0, mainHands=0, allWins=0) for f in FACTIONS}
        per_game = []
        for g in games:
            contributions = {f: [0, 0] for f in FACTIONS}
            for side, rival in [('player', 'opponent'), ('opponent', 'player')]:
                p, enemy = g[side], g[rival]
                f, other = p['damageType'], enemy['damageType']
                if folder == ROOT:
                    printed = {f: sum(defs[c['id']].get('stats', []).count(f) for c in g[side+'Hand'] if defs[c['id']]['type']=='stat') for f in FACTIONS}
                    for stat in FACTIONS:
                        assert p['stats'][stat] == printed[stat] + int(stat=='dragon' and p['overwhelming'])
                    attack_units = sum(2 if c['id']=='robot_ulti' else int(all(p['stats'][f]>0 for f in FACTIONS)) if c['id']=='one_off_each' else int(defs[c['id']].get('effect', {}).get('dmgType')=='robot') for c in g[side+'Hand'])
                    assert p['robotAttacks'] == attack_units
                    assert p['balanced'] == (printed['robot']>0 and printed['robot']==attack_units)
                    assert p['overwhelming'] == (p['dragonBase'] >= 7)
                    assert p['shieldPenalty'] == {'critter': 1 if FOLLOWUP else 2, 'robot': 2, 'dragon': 0}.get(f, 0) * enemy['shields']
                    assert p['reconfigured'] is None
                    assert p['bonus'] == (3 if f == 'robot' and p['balanced'] else 0)
                    assert p['score'] == max(0, p['base'] - p['shieldPenalty']) + p['bonus']
                    assert all(c['id'] not in ['any_off_each', 'chameleon'] for c in g[side+'Hand'])
                if f not in FACTIONS:
                    continue
                totals[f]['mainHands'] += 1
                totals[f]['allWins'] += g['winner'] == side
                if other not in FACTIONS or f == other:
                    continue
                outcome = 'draws' if g['winner'] == 'tie' else 'wins' if g['winner'] == side else 'losses'
                totals[f]['n'] += 1
                totals[f][outcome] += 1
                contributions[f] = [1 if outcome == 'wins' else .5 if outcome == 'draws' else 0, 1]
            per_game.append(contributions)
        rng = random.Random(20261022)
        samples = {f: [] for f in FACTIONS}
        for _ in range(3000):
            picked = rng.choices(per_game, k=500)
            for f in FACTIONS:
                n = sum(g[f][1] for g in picked)
                if n:
                    samples[f].append(sum(g[f][0] for g in picked) / n)
        for f, c in totals.items():
            c['score'] = (c['wins'] + .5*c['draws']) / c['n']
            s = sorted(samples[f])
            c['ci95'] = [s[int(.025*len(s))], s[int(.975*len(s))]]
        bootstrap_draws[(mode, variant)] = samples
        rows.append(dict(mode=mode, label=label, variant=variant, poolSize=meta['poolSize'], factions=totals,
                         draws=sum(g['winner']=='tie' for g in games)/500))
result = dict(rows=rows, gamesPerArm=500, samples=16,
              historicalCaveat=('Same current card pool and identical starting deals verified. Only Critter shield cost changes, 2 to 1. Previous data reused; no new control run.' if FOLLOWUP else 'Historical data includes Chameleon and C+R+D and predates the zero-damage product Perfect Balance fix. Different pools/deals: not a paired or isolated rule comparison.'),
              metric='Cross-faction wins plus half draws, mirrors excluded; 95% whole-game bootstrap intervals, 3000 replicates.')
if FOLLOWUP:
    result['pairedChanges'] = {}
    for mode in ['draft', 'five-hand-discard']:
        before, after = [r for r in rows if r['mode']==mode]
        changes = {}
        for f in FACTIONS:
            delta = sorted(100*(b-a) for a, b in zip(bootstrap_draws[(mode, before['variant'])][f], bootstrap_draws[(mode, after['variant'])][f]))
            changes[f] = dict(changePP=100*(after['factions'][f]['score']-before['factions'][f]['score']), ci95PP=[delta[75], delta[2925]])
        result['pairedChanges'][mode] = changes
(ROOT / 'summary.json').write_text(json.dumps(result, indent=2))
colors = ['#4a9e55', '#4089cb', '#c95656']
fig, axes = plt.subplots(1, 2, figsize=(12, 5), sharey=True)
for ax, mode in zip(axes, ['draft', 'five-hand-discard']):
    for j, row in enumerate(r for r in rows if r['mode']==mode):
        for i, f in enumerate(FACTIONS):
            c = row['factions'][f]
            y = 100*c['score']
            x = j + (i-1)*.24
            ax.bar(x, y, width=.22, color=colors[i], label=f.title() if j==0 else None)
            ax.errorbar(x, y, yerr=[[y-100*c['ci95'][0]], [100*c['ci95'][1]-y]], color='#333333', capsize=3)
            ax.text(x, 2, f'{y:.1f}%\nn={c["n"]}', ha='center', va='bottom', color='white', fontsize=9)
        ax.text(j, 77, f'Draws {row["draws"]*100:.1f}%', ha='center', fontsize=10)
    ax.axhline(50, color='#555555', linestyle='--', linewidth=1)
    ax.set_xticks([0, 1], ['Previous\nShields 2/2/0', 'New\nShields 1/2/0'] if FOLLOWUP else ['Historical\n6+ / shield -1', 'Trial\n7+ / shield 0'])
    ax.set_title('Draft' if mode=='draft' else 'Discard')
    ax.set_ylim(0, 85)
    ax.spines[['top', 'right']].set_visible(False)
axes[0].set_ylabel('Cross-faction score (%)')
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc='upper center', bbox_to_anchor=(.5, .84), ncol=3, fontsize=10)
fig.suptitle('Abilities v2 · Regular deck · Svenbot vs Svenbot\n500 games per mode/version · 16 samples per decision · 95% game-bootstrap intervals')
fig.text(.5, .015, 'Dragon 7+ extra stat and shield immunity in both versions. Same 68-card pool and starting deals; only Critter shielding changes.' if FOLLOWUP else 'Historical comparison uses an older card pool and Perfect Balance behavior; changes cannot be attributed solely to Dragon rules.', ha='center', fontsize=9)
fig.tight_layout(rect=[0, .055, 1, .89])
fig.savefig(ROOT / 'faction-results.png', dpi=160)
fig.savefig(ROOT / 'faction-results.svg')
table = '| Mode | Version | Critters | Robots | Dragons | Draws |\n|---|---|---:|---:|---:|---:|\n'
for row in rows:
    table += '| '+('Draft' if row['mode']=='draft' else 'Discard')+' | '+row['label']+' | '+' | '.join(f'{row["factions"][f]["score"]*100:.1f}%' for f in FACTIONS)+f' | {row["draws"]*100:.1f}% |\n'
report = '# Dragon 7+ and shield immunity trial — 2026-10-22\n\n'+table+'\n'+result['metric']+'\n\n'+result['historicalCaveat']+'\n\nCurrent v2 regular deck (68 cards), Perfect Balance, Critter ties, shields C/R/D 2/2/0; Dragon contribution 7+ before shields adds exactly one stat. Each search and rollout uses the trial rules. No new control run. All 1,000 games replayed; four actual building/preparation search roots recomputed exactly. Live defaults and score cards unchanged pending creator review.\n\n![Faction results](../.ai-runs/v2-dragon7-immune-2026-10-22/faction-results.png)\n'
if FOLLOWUP:
    report = '# Critter shield -1 follow-up — 2026-10-22\n\n'+table+'\n'+result['metric']+'\n\n'+result['historicalCaveat']+'\n\nBoth versions keep Dragon contribution 7+ before shields adding exactly one stat, Dragon shield immunity, Robot Perfect Balance and Critter ties. New shield costs C/R/D: 1/2/0. Svenbot search and all rollouts use their own variant rules. All 1,000 new games replayed; four building/preparation roots recomputed exactly. Playable rules and score cards unchanged pending creator review.\n\n![Faction results](../.ai-runs/v2-dragon7-critter1-2026-10-22/faction-results.png)\n'
Path('docs/V2_CRITTER1_SHIELD_RESULTS.md' if FOLLOWUP else 'docs/V2_DRAGON7_IMMUNE_RESULTS.md').write_text(report, encoding='utf-8')
print(table)
