import {
  Array,
  Effect,
  Option,
  Order,
  Result,
  Schema as S,
  String,
} from 'effect'
import { AgentSurvey, EndedRun, LiveAgent } from 'issues-core-example'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

import {
  BinaryFile,
  ChangedFile,
  type IssueTouchedFile,
  IssueTouchedFiles,
  UntrackedFile,
  normalizeIssueId,
} from '@foldkit/instant-tools/issues'

const OptionalText = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))
const OptionalIssueNumber = S.optionalKey(
  S.NullOr(S.Union([S.Number, S.String])),
)

const ProgressCheckAgent = S.Struct({
  account: OptionalText,
  agentId: OptionalText,
  branch: OptionalText,
  harness: OptionalText,
  issue: OptionalIssueNumber,
  name: OptionalText,
  startedAtMs: OptionalNumber,
  worktree: OptionalText,
})

const ProgressCheckDeadRun = S.Struct({
  exit: S.optionalKey(S.NullOr(S.Union([S.String, S.Number]))),
  issue: OptionalIssueNumber,
  lastSignMs: OptionalNumber,
  name: OptionalText,
})

/** The parts of `tools/agent-progress-check --json` the survey reads. */
const ProgressCheck = S.Struct({
  agents: S.Array(ProgressCheckAgent),
  dead: S.optionalKey(S.Array(ProgressCheckDeadRun)),
  generatedAtMs: OptionalNumber,
})

const RegistryRow = S.Struct({
  ended: OptionalText,
  finished: OptionalText,
  issue: OptionalIssueNumber,
  name: OptionalText,
  started: OptionalText,
  state: OptionalText,
  stopped: OptionalText,
  updated: OptionalText,
})

/** The parts of `~/Scribe/agents-registry.json` the survey reads. */
const Registry = S.Struct({ agents: S.Array(RegistryRow) })

const textOf = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), text => text.trim() !== '')

const issueIdOf = (
  value: number | string | null | undefined,
): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(value), issue =>
    normalizeIssueId(`${issue}`),
  )

const liveAgentOf = (
  agent: typeof ProgressCheckAgent.Type,
): Option.Option<LiveAgent> =>
  Option.map(textOf(agent.name), name => {
    const account = textOf(agent.account)
    const harness = textOf(agent.harness)
    return LiveAgent.make({
      account,
      agentId: Option.getOrElse(
        textOf(agent.agentId),
        () =>
          `${Option.getOrElse(harness, () => 'agent')}/${name}${Option.match(
            account,
            { onNone: () => '', onSome: value => `@${value}` },
          )}`,
      ),
      branch: textOf(agent.branch),
      harness,
      issueId: issueIdOf(agent.issue),
      name,
      startedAtMs: Option.fromNullishOr(agent.startedAtMs),
      worktree: textOf(agent.worktree),
    })
  })

const deadRunOf = (
  run: typeof ProgressCheckDeadRun.Type,
  observedAtMs: number,
): Option.Option<EndedRun> =>
  Option.map(textOf(run.name), name =>
    EndedRun.make({
      endedAtMs: Option.some(run.lastSignMs ?? observedAtMs),
      how: Option.match(Option.fromNullishOr(run.exit), {
        onNone: () => 'process gone',
        onSome: exit => `exit ${exit}`,
      }),
      issueId: issueIdOf(run.issue),
      name,
    }),
  )

const exitStatePattern = /^\w+ \(exit \d+\)$/

const howItEnded = (state: string): string =>
  exitStatePattern.test(state)
    ? state
    : Option.getOrElse(Array.head(String.split(state, ' (')), () => state)

const timeOf = (row: typeof RegistryRow.Type): Option.Option<number> =>
  Option.filter(
    Option.map(
      Option.firstSomeOf([
        textOf(row.ended),
        textOf(row.finished),
        textOf(row.stopped),
        textOf(row.updated),
        textOf(row.started),
      ]),
      Date.parse,
    ),
    Number.isFinite,
  )

const endedRegistryRunOf = (
  row: typeof RegistryRow.Type,
): Option.Option<EndedRun> =>
  Option.flatMap(textOf(row.name), name =>
    Option.map(
      Option.filter(textOf(row.state), state => state !== 'running'),
      state =>
        EndedRun.make({
          endedAtMs: timeOf(row),
          how: howItEnded(state),
          issueId: issueIdOf(row.issue),
          name,
        }),
    ),
  )

/**
 * What the Mac saw of its agents: every named agent
 * `tools/agent-progress-check --json` reports running, every run it found
 * dead, and every run `agents-registry.json` records as ended. The survey's
 * time is the progress check's `generatedAtMs`, else `nowMs`.
 */
export const surveyFromProgressCheck = (
  progressCheck: unknown,
  maybeRegistry: Option.Option<unknown>,
  nowMs: number,
): Result.Result<AgentSurvey, string> =>
  Result.flatMap(
    Result.mapError(
      S.decodeUnknownResult(ProgressCheck)(progressCheck),
      error => `not a progress check report: ${error.message}`,
    ),
    report =>
      Result.map(
        Option.match(maybeRegistry, {
          onNone: () => Result.succeed<ReadonlyArray<EndedRun>>([]),
          onSome: registry =>
            Result.mapBoth(S.decodeUnknownResult(Registry)(registry), {
              onFailure: error => `not an agents registry: ${error.message}`,
              onSuccess: ({ agents }) =>
                Array.getSomes(Array.map(agents, endedRegistryRunOf)),
            }),
        }),
        registryRuns => {
          const observedAtMs = report.generatedAtMs ?? nowMs
          return AgentSurvey.make({
            ended: [
              ...Array.getSomes(
                Array.map(report.dead ?? [], run =>
                  deadRunOf(run, observedAtMs),
                ),
              ),
              ...registryRuns,
            ],
            live: Array.getSomes(Array.map(report.agents, liveAgentOf)),
            observedAtMs,
          })
        },
      ),
  )

const HOUR_MS = 3_600_000
const RECENTLY_ENDED_HOURS = 6

/**
 * How long after a run ended its Issue is still read on every sync, so its
 * claim is released: six hours. `issues working sync --sweep` reads every
 * Issue in progress.
 */
export const recentlyEndedMs = RECENTLY_ENDED_HOURS * HOUR_MS

/**
 * The Issues a sync reads by number: those of running agents, then those of
 * runs found dead or ended in the last six hours, each once. A registry row
 * with no time at all waits for `--sweep`.
 */
export const issueIdsToCheck = (survey: AgentSurvey): ReadonlyArray<string> =>
  Array.dedupe([
    ...Array.getSomes(Array.map(survey.live, agent => agent.issueId)),
    ...Array.getSomes(
      Array.map(
        Array.filter(survey.ended, run =>
          Option.exists(
            run.endedAtMs,
            endedAtMs => endedAtMs >= survey.observedAtMs - recentlyEndedMs,
          ),
        ),
        run => run.issueId,
      ),
    ),
  ])

const NUMSTAT_FIELD_COUNT = 3

const numstatFileOf = (line: string): Option.Option<IssueTouchedFile> => {
  const fields = String.split(line, '\t')
  if (fields.length < NUMSTAT_FIELD_COUNT) {
    return Option.none()
  }
  const [insertions = '', deletions = '', ...pathParts] = fields
  const path = Array.join(pathParts, '\t')
  if (insertions === '-' || deletions === '-') {
    return Option.some(BinaryFile.make({ path }))
  }
  return Option.some(
    ChangedFile.make({
      deletions: Number(deletions),
      insertions: Number(insertions),
      path,
    }),
  )
}

const nonEmptyLines = (text: string): ReadonlyArray<string> =>
  Array.filter(String.split(text, '\n'), line => line.trim() !== '')

/**
 * The files a worktree touches from `git diff --numstat <base>` (binary
 * files show `-` counts) and `git ls-files --others --exclude-standard`,
 * keeping the first `maximumFiles` and counting them all.
 */
export const touchedFilesFromGit = (
  input: Readonly<{
    base: string
    checkedAtMs: number
    maximumFiles: number
    numstat: string
    untracked: string
  }>,
): IssueTouchedFiles => {
  const files = [
    ...Array.getSomes(Array.map(nonEmptyLines(input.numstat), numstatFileOf)),
    ...Array.map(nonEmptyLines(input.untracked), path =>
      UntrackedFile.make({ path }),
    ),
  ]
  return IssueTouchedFiles.make({
    base: input.base,
    checkedAtMs: input.checkedAtMs,
    fileCount: files.length,
    files: Array.take(files, input.maximumFiles),
  })
}

const GIT_TIMEOUT_MS = 15_000
const GIT_MAXIMUM_OUTPUT_BYTES = 8 * 1024 * 1024
const MAXIMUM_LISTED_FILES = 40

const runGit = (
  worktree: string,
  args: ReadonlyArray<string>,
): Effect.Effect<string, Error> =>
  Effect.callback<string, Error>(resume => {
    execFile(
      'git',
      ['-C', worktree, '-c', 'core.fsmonitor=false', ...args],
      {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        maxBuffer: GIT_MAXIMUM_OUTPUT_BYTES,
        timeout: GIT_TIMEOUT_MS,
      },
      (error, stdout) => {
        if (error === null) {
          resume(Effect.succeed(stdout))
        } else {
          resume(Effect.fail(error))
        }
      },
    )
  })

type BaseCandidate = Readonly<{ aheadCount: number; ref: string }>

const nearestMainLine = (
  worktree: string,
): Effect.Effect<Option.Option<string>, Error> =>
  Effect.gen(function* () {
    const remoteRefs = Array.filter(
      nonEmptyLines(
        yield* runGit(worktree, [
          'for-each-ref',
          '--format=%(refname:short)',
          'refs/remotes/*/main',
          'refs/remotes/*/master',
        ]),
      ),
      ref => !ref.endsWith('/HEAD'),
    )
    const localRefs = nonEmptyLines(
      yield* runGit(worktree, [
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads/main',
        'refs/heads/master',
      ]),
    )
    const refs = [...remoteRefs, ...localRefs]
    const candidates = yield* Effect.forEach(refs, ref =>
      Effect.map(
        runGit(worktree, ['rev-list', '--count', `${ref}..HEAD`]),
        (count): BaseCandidate => ({ aheadCount: Number(count.trim()), ref }),
      ),
    )
    return Option.map(
      Array.head(
        Array.sort(
          candidates,
          Order.mapInput(
            Order.Number,
            (candidate: BaseCandidate) => candidate.aheadCount,
          ),
        ),
      ),
      candidate => candidate.ref,
    )
  })

/**
 * Counts the files a worktree's branch touches with git: committed and
 * uncommitted changes since it left its nearest main line (the `main` or
 * `master` it is fewest commits ahead of, such as `technoplato/main`, a
 * remote one on a tie, so unpushed commits on a local main count), and
 * new files not yet added. Git runs without optional locks, so it never
 * holds the index lock an agent working there needs. None when the worktree
 * is gone or git fails.
 */
export const countTouchedFilesWithGit = (
  worktree: string,
  checkedAtMs: number,
): Effect.Effect<Option.Option<IssueTouchedFiles>> =>
  existsSync(worktree)
    ? Effect.gen(function* () {
        const maybeBase = yield* nearestMainLine(worktree)
        if (Option.isNone(maybeBase)) {
          return Option.none()
        }
        const mergeBase = (yield* runGit(worktree, [
          'merge-base',
          'HEAD',
          maybeBase.value,
        ])).trim()
        const numstat = yield* runGit(worktree, [
          'diff',
          '--numstat',
          mergeBase,
        ])
        const untracked = yield* runGit(worktree, [
          'ls-files',
          '--others',
          '--exclude-standard',
        ])
        return Option.some(
          touchedFilesFromGit({
            base: maybeBase.value,
            checkedAtMs,
            maximumFiles: MAXIMUM_LISTED_FILES,
            numstat,
            untracked,
          }),
        )
      }).pipe(Effect.orElseSucceed(() => Option.none()))
    : Effect.succeed(Option.none())
