import { Array, Option, Record, Schema as S, String } from 'effect'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { countsOf } from './painter-ratchet/count'
import {
  BEHAVIOR_FOLDER,
  type Ratchet,
  ratchets,
} from './painter-ratchet/cover'
import {
  type Ledger,
  LedgerJson,
  type Measured,
  type Problem,
  lineOf,
  problemsOf,
  rewritten,
  totalsOf,
} from './painter-ratchet/ledger'

// NOTE: the owner, 2026-11-20: "a painter should just take state and render
// a UI and then when that state changes, it should render again. That's
// it." This gate holds each painter file, and `@foldkit/ui`, to the counts
// checked in beside it, and fails when one rises. The counts are headed to
// zero. They are not a budget.
//
//   pnpm check:painter-ratchet            check the code against the ledgers
//   pnpm check:painter-ratchet --write    record lower counts after moving a rule
//   pnpm check:painter-ratchet --base main   also compare the ledgers with that commit's

const repoRoot = path.resolve(import.meta.dirname, '..')

const WRITE_FLAG = '--write'

const BASE_FLAG = '--base'

const PREVIOUS_COMMIT = 'HEAD~1'

const MAIN_BRANCHES = ['technoplato/main', 'origin/main', 'main']

const JSON_INDENT = 2

const EMPTY_LEDGER: Ledger = { about: [], files: {} }

// GIT

const git = (args: ReadonlyArray<string>): Option.Option<string> => {
  try {
    return Option.some(
      execFileSync('git', [...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return Option.none()
  }
}

const linesOf = (text: string): ReadonlyArray<string> =>
  Array.filter(String.split(text, '\n'), String.isNonEmpty)

const filesOf = (ratchet: Ratchet): ReadonlyArray<string> =>
  Array.filter(
    linesOf(
      Option.getOrElse(
        git([
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '--',
          ...ratchet.roots,
        ]),
        () => '',
      ),
    ),
    filePath =>
      ratchet.covers(filePath) && existsSync(path.join(repoRoot, filePath)),
  )

const mergeBaseOf = (branch: string): Option.Option<string> =>
  Option.map(git(['merge-base', 'HEAD', branch]), String.trim)

const argumentAfter = (flag: string): Option.Option<string> =>
  Option.flatMap(
    Array.findFirstIndex(process.argv, argument => argument === flag),
    index => Array.get(process.argv, index + 1),
  )

const earlierCommits = (): ReadonlyArray<string> =>
  Array.dedupe([
    PREVIOUS_COMMIT,
    ...Array.fromOption(Array.findFirst(MAIN_BRANCHES, mergeBaseOf)),
    ...Array.fromOption(argumentAfter(BASE_FLAG)),
  ])

// LEDGER

const decodeLedger = S.decodeUnknownOption(LedgerJson)

const encodeLedger = S.encodeSync(LedgerJson)

const readLedger = (ratchet: Ratchet): Ledger => {
  const ledgerFile = path.join(repoRoot, ratchet.ledgerPath)
  if (existsSync(ledgerFile)) {
    return S.decodeUnknownSync(LedgerJson)(readFileSync(ledgerFile, 'utf8'))
  } else {
    return EMPTY_LEDGER
  }
}

const ledgerAt = (ratchet: Ratchet, commit: string): Option.Option<Ledger> =>
  Option.flatMap(git(['show', `${commit}:${ratchet.ledgerPath}`]), decodeLedger)

const writeLedger = (ratchet: Ratchet, ledger: Ledger): void => {
  writeFileSync(
    path.join(repoRoot, ratchet.ledgerPath),
    `${JSON.stringify(JSON.parse(encodeLedger(ledger)), null, JSON_INDENT)}\n`,
  )
}

// MEASURE

const measure = (ratchet: Ratchet): Measured =>
  Record.fromEntries(
    Array.map(filesOf(ratchet), filePath => [
      filePath,
      countsOf(
        ratchet.counters,
        filePath,
        readFileSync(path.join(repoRoot, filePath), 'utf8'),
      ),
    ]),
  )

// SAY

const totalsLineOf = (ratchet: Ratchet, ledger: Ledger): string => {
  const totals = totalsOf(ledger)
  return Array.join(
    Array.map(
      ratchet.counters,
      counter =>
        `${Option.getOrElse(Record.get(totals, counter.kind), () => 0)} ${counter.kind}`,
    ),
    ', ',
  )
}

const say = (lines: ReadonlyArray<string>): void => {
  console.log(Array.join(lines, '\n'))
}

const isTagged =
  (tag: Problem['_tag']) =>
  (problem: Problem): boolean =>
    problem._tag === tag

const sectionOf = (
  problems: ReadonlyArray<Problem>,
  tag: Problem['_tag'],
  advice: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const lines = Array.map(Array.filter(problems, isTagged(tag)), lineOf)
  if (Array.isReadonlyArrayNonEmpty(lines)) {
    return ['', ...Array.map(lines, line => `  ${line}`), ...advice]
  } else {
    return []
  }
}

const failureOf = (
  ratchet: Ratchet,
  problems: ReadonlyArray<Problem>,
): ReadonlyArray<string> => [
  `FAILED: the ${ratchet.name} ratchet.`,
  ...sectionOf(problems, 'Grew', [
    '',
    `  A rule goes in ${BEHAVIOR_FOLDER}, not in a painter. Move it there and`,
    '  this passes. A file the ledger does not list starts at zero.',
    `  If the rise is fair (a layout number such as padding: 24, or a file split in`,
    `  two), raise the count in ${ratchet.ledgerPath} and add beside it:`,
    '    "rises": [{ "kind": "<kind>", "from": <old>, "to": <new>, "why": "<the reason>" }]',
  ]),
  ...sectionOf(problems, 'Unexplained', [
    '',
    `  A count in ${ratchet.ledgerPath} went up since an earlier commit. Say why,`,
    '  in that file, beside the count:',
    '    "rises": [{ "kind": "<kind>", "from": <old>, "to": <new>, "why": "<the reason>" }]',
  ]),
  ...sectionOf(problems, 'Fell', [
    '',
    '  Good: these fell. Record them so they cannot drift back up:',
    '    pnpm check:painter-ratchet --write',
  ]),
]

// RUN

const isWriting = Array.contains(process.argv, WRITE_FLAG)

const run = (ratchet: Ratchet): boolean => {
  const measured = measure(ratchet)
  const recorded = readLedger(ratchet)
  const ledger = isWriting ? rewritten(recorded, measured) : recorded
  if (isWriting) {
    writeLedger(ratchet, ledger)
  }
  const problems = problemsOf({
    measured,
    ledger,
    earlier: Array.getSomes(
      Array.map(earlierCommits(), commit => ledgerAt(ratchet, commit)),
    ),
  })
  say([
    ratchet.heading(Record.size(ledger.files), totalsLineOf(ratchet, ledger)),
    ...ratchet.whereItGoes,
    ...(Array.isReadonlyArrayNonEmpty(problems)
      ? ['', ...failureOf(ratchet, problems)]
      : []),
    '',
  ])
  return Array.isReadonlyArrayEmpty(problems)
}

const results = Array.map(ratchets, run)

if (!Array.every(results, isPassing => isPassing)) {
  process.exit(1)
}
