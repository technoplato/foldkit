"""Mechanical first pass of the composition rubric over every example.

Proxies only; the reading pass decides the rows a script cannot judge. Writes
plans/05a-example-scores.md. Run from the repository root:

    python3 scripts/score-examples.py
"""
from __future__ import annotations

import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parent.parent
examples = root / 'examples'

tracked = set(
    subprocess.run(['git', 'ls-files', 'examples'], cwd=root, capture_output=True, text=True).stdout.split('\n')
)


def files_of(example: pathlib.Path):
    for p in example.rglob('*'):
        if not p.is_file():
            continue
        rel = str(p.relative_to(root))
        if rel not in tracked:
            continue
        if p.suffix not in {'.ts', '.tsx', '.svelte'}:
            continue
        if '/node_modules/' in rel or '/dist/' in rel or '.test.' in p.name:
            continue
        yield p, rel


def scan(example: pathlib.Path):
    facts = {
        'program_make': 0,
        'catalog_action': 0,
        'compose_or_lift': 0,
        'got_union': 0,
        'next_id_in_update': 0,
        'tag_lists_in_screens': 0,
        'stack_edits_in_update': 0,
        'react_bindings': (example / 'react-bindings').is_dir() and any((example / 'react-bindings').iterdir()),
        'cli_host_files': 0,
        'hosts_naming_actions': 0,
        'boolean_state_fields': 0,
        'root_react_api': 0,
        'interaction_react_api': 0,
    }
    for p, rel in files_of(example):
        try:
            text = p.read_text()
        except UnicodeDecodeError:
            continue
        facts['program_make'] += len(re.findall(r'Program\.make\(|Program\.compose\.forEach\(|Program\.compose\(|Runtime\.makeApplication\(|Runtime\.makeElement\(|Runtime\.makeProgram\(|Runtime\.run\(|makeFoldkitApplication\(', text))
        facts['catalog_action'] += len(re.findall(r'Catalog\.action\(', text))
        facts['compose_or_lift'] += len(re.findall(r'compose\.forEach\(|Catalog\.lift\(|Program\.compose\(|Program\.scope\(|Session\.compose\(|ActionMenu\.compose\(', text))
        facts['got_union'] += len(re.findall(r"\bGot[A-Z][A-Za-z]*(Message|Fact|Result)\b", text)) and 1 or 0
        if p.name == 'update.ts':
            facts['next_id_in_update'] += len(re.findall(r'next[A-Z][A-Za-z]*Id', text))
            facts['stack_edits_in_update'] += len(re.findall(r'Navigation\.(pushed|presented|withoutDestinations|truncated)\(', text))
        if p.name in {'screen.ts', 'view.ts'} and '/core/' in rel:
            facts['tag_lists_in_screens'] += len(re.findall(r'entriesTagged\(|\.tag\]|\[\w+\.tag', text))
        if re.search(r'/(cli|tui|terminal)/src/', rel):
            facts['cli_host_files'] += 1
            facts['host_dirs'] = facts.get('host_dirs', 0) + 1
            if p.name not in {'entry.ts', 'daemon.ts', 'layers.ts', 'index.ts', 'main.ts'} and not p.name.endswith('.test.ts'):
                facts['terminal_view_files'] = facts.get('terminal_view_files', 0) + 1
        if re.search(r'/(react|svelte|expo|opentui|foldkit|expo-router|headless|datastar|solid|sveltekit|three|plain-html)/src/', rel) or re.search(r'^examples/[^/]+/src/', rel):
            facts['host_dirs'] = facts.get('host_dirs', 0) + 1
        if re.search(r'/(react|svelte|expo|opentui|tui|cli|foldkit|terminal|expo-router)/src/', rel) and '/core/' not in rel:
            if re.search(r"\b(Increment|Decrement|Reset|press\('[A-Z]|bound\.press\('[A-Z])", text):
                facts['hosts_naming_actions'] += 1
        if '/core/' in rel and p.name == 'model.ts':
            facts['boolean_state_fields'] += len(re.findall(r'\bis[A-Z]\w*: S\.Boolean', text))
        if re.search(r"from '@foldkit/react'$|from '@foldkit/react';", text, re.M):
            facts['root_react_api'] += 1
        if '@foldkit/react/interaction' in text:
            facts['interaction_react_api'] += 1
    return facts


def score(f):
    # composition, "today" rows: ids minted in update, a Got* union, or tag filters score 1;
    # stack moves through Navigation.pushed and friends are allowed today
    composition = 3
    if f['next_id_in_update'] or f['got_union'] or f['tag_lists_in_screens']:
        composition = 1
    # declarations, "today" rows: booleans for states score 1; no Catalog scores 1
    if not f['catalog_action'] or f['boolean_state_fields']:
        declarations = 1
    else:
        declarations = 3
    # hosts, "today" rows: a react-bindings package, a host naming an Action, two React APIs, or terminal
    # files beyond entry and daemon score 1; the root React API alone scores 2
    hosts = 3
    if f['react_bindings'] or f['hosts_naming_actions'] or (f['root_react_api'] and f['interaction_react_api']) or f.get('terminal_view_files', 0) > 0:
        hosts = 1
    elif f['root_react_api']:
        hosts = 2
    return composition, declarations, hosts


rows = []
for example in sorted(p for p in examples.iterdir() if p.is_dir()):
    f = scan(example)
    if f['program_make'] == 0 and f['catalog_action'] == 0:
        rows.append((example.name, f, None))
        continue
    if f.get('host_dirs', 0) == 0:
        rows.append((example.name, f, 'hostless'))
        continue
    rows.append((example.name, f, score(f)))

lines = [
    '# Example scores | mechanical pass | 2026-10-09',
    '',
    '`scripts/score-examples.py` applied proxies for the composition rubric in',
    '`skills/foldkit-composition/SKILL.md` to every directory under `examples/`.',
    'Proxies, not judgments: a row a script cannot read is marked for the reading',
    'pass, and the reading pass in `plans/05-composition.md` is the authority',
    'wherever the two disagree. 3 is best. Every directory that builds a Program',
    'or an application (`Program.make`, `Program.compose`, `Runtime.makeApplication`,',
    '`makeElement`, `makeProgram`, `Runtime.run`) is scored; a directory with no',
    'host at all is listed as "hostless" and not scored; a fixture with none of',
    'those calls is "not a Program".',
    '',
    'Each proxy implements one "today" row of the rubric. Composition 1 when',
    '`update.ts` mints a `next*Id`, a `Got*` union exists, or a core screen filters',
    'by tag list (row 1, today); stack moves through `Navigation.pushed` are',
    'allowed (row 3, today). Declarations 1 with no `Catalog.action` or with an',
    '`is*: S.Boolean` field in `model.ts` (row 1, today), else 3; the proxy cannot',
    'see a `?` in a declaration, which reading scores 2. Hosts 1 when a',
    '`react-bindings` package exists, a host names an Action, one app uses both',
    'React APIs, or a terminal host has a file beyond `entry`, `daemon`, and',
    '`layers` (row 1, today); 2 when a React host uses the root API alone (row 2,',
    'today).',
    '',
    '| Example | Composition | Declarations | Hosts | Score | Evidence |',
    '| ------- | ----------- | ------------ | ----- | ----- | -------- |',
]
scored = 0
threes = 0
not_programs = 0
for name, f, s in rows:
    if s is None:
        not_programs += 1
        lines.append(f'| `{name}` | | | | not a Program | no Program or application call |')
        continue
    if s == 'hostless':
        lines.append(f'| `{name}` | | | | hostless | a Program with no host directory; the reading pass decides |')
        continue
    scored += 1
    c, d, h = s
    total = min(c, d, h)
    if total == 3:
        threes += 1
    ev = []
    if f['next_id_in_update']:
        ev.append('id minted in update')
    if f['got_union']:
        ev.append('Got* union (allowed at a Submodel boundary with OutMessages; the reading pass decides)')
    if f['tag_lists_in_screens']:
        ev.append('tag list in screen')
    if f['stack_edits_in_update']:
        ev.append(f"{f['stack_edits_in_update']} stack edits in update")
    if not f['catalog_action']:
        ev.append('no Catalog')
    if f['boolean_state_fields']:
        ev.append(f"{f['boolean_state_fields']} boolean state fields")
    if f['react_bindings']:
        ev.append('react-bindings package')
    if f['hosts_naming_actions']:
        ev.append(f"{f['hosts_naming_actions']} host files name an Action")
    if f['root_react_api'] and f['interaction_react_api']:
        ev.append('both React APIs')
    elif f['root_react_api']:
        ev.append('root React API')
    if f.get('terminal_view_files', 0) > 0:
        ev.append(f"{f['terminal_view_files']} terminal files beyond entry, daemon, and layers")
    lines.append(f"| `{name}` | {c} | {d} | {h} | {total} | {'; '.join(ev) or 'no proxy fired'} |")

lines += [
    '',
    f'Scored: {scored} Programs, {threes} at 3 by proxy, {not_programs} directories that are not a Program; hostless directories are listed and not scored.',
    '',
    'The reading pass must confirm every 3 (a proxy cannot see a hand-written fold',
    'that uses no `Got*` name) and may lift a 1 whose only evidence is a `Got*`',
    'wrapper at a Submodel boundary with OutMessages, which the rubric allows.',
]
out = root / 'plans/05a-example-scores.md'
out.write_text('\n'.join(lines) + '\n')
print(out, scored, threes, not_programs)
