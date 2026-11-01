import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Result,
  Schema as S,
} from 'effect'
import {
  IssueLanding,
  type LandedBuild,
  type LandedCommit,
  buildLabel,
  firstLandedBuild,
  firstTestflightBuild,
  issueLandingOf,
  issueLandingQuery,
  noLanding,
} from 'issues-core-example'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

import { type ScribeQuery, buildJobsTimeout } from './builds.js'

/** Scribe answered: where the Issue landed. */
export const FoundLanding = S.TaggedStruct('FoundLanding', {
  landing: IssueLanding,
})

/**
 * The landing could not be read, and why, such as
 * `Scribe's Instant app did not answer within 5 seconds.`
 */
export const UnavailableLanding = S.TaggedStruct('UnavailableLanding', {
  reason: S.String,
})

/** What `issues show` learned of where an Issue landed. */
export const LandingRead = S.Union([FoundLanding, UnavailableLanding])
/** What `issues show` learned of where an Issue landed. */
export type LandingRead = typeof LandingRead.Type

/**
 * Reads where an Issue landed by its number, such as 625. It never fails: a
 * landing that cannot be read is `UnavailableLanding` with its reason.
 */
export type LandingReader = (issueNumber: number) => Effect.Effect<LandingRead>

const MAXIMUM_REASON_LENGTH = 400

const oneLine = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAXIMUM_REASON_LENGTH
    ? `${line.slice(0, MAXIMUM_REASON_LENGTH)}…`
    : line
}

/**
 * Reads where an Issue landed from Scribe's Instant app with `send`, waiting
 * at most `timeout` (5 seconds, the bound on every wait), then abandoning the
 * request. It never fails: a refused query, no answer, or rows that do not
 * read are `UnavailableLanding` with the reason.
 */
export const readLanding = (
  send: ScribeQuery,
  issueNumber: number,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<LandingRead> =>
  Effect.tryPromise({
    try: signal => send(issueLandingQuery(issueNumber), signal),
    catch: describeIssueTrackerCause,
  }).pipe(
    Effect.timeoutOption(timeout),
    Effect.map(maybeAnswer =>
      Option.match(maybeAnswer, {
        onNone: () =>
          UnavailableLanding.make({
            reason: `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`,
          }),
        onSome: answer =>
          Result.match(
            Result.try(() => issueLandingOf(answer)),
            {
              onFailure: () =>
                UnavailableLanding.make({
                  reason:
                    "Scribe's Instant app answered with rows this command cannot read.",
                }),
              onSuccess: landing => FoundLanding.make({ landing }),
            },
          ),
      }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableLanding.make({
          reason: `the landing query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

const INDENT = '  '

const localTime = (atMs: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
  }).formatToParts(atMs)
  const partOf = (type: Intl.DateTimeFormatPartTypes): string =>
    Option.getOrElse(
      Option.map(
        Array.findFirst(parts, part => part.type === type),
        part => part.value,
      ),
      () => '',
    )
  return `${partOf('month')}-${partOf('day')} ${partOf('hour')}:${partOf('minute')}`
}

const getItWords = (build: LandedBuild): string => {
  const shown = Option.getOrElse(build.maybeTestflightVersion, () =>
    build.number.toString(),
  )
  return Array.join(
    [
      buildLabel(build),
      ...Option.toArray(
        Option.map(
          build.maybeTestflightInvite,
          invite => `TestFlight ${shown} ${invite}`,
        ),
      ),
      ...Option.toArray(
        Option.map(build.maybeTestflightPage, page => `upload ${page}`),
      ),
    ],
    ', ',
  )
}

const SHORT_SHA_LENGTH = 9

const commitLine = (commit: LandedCommit, timeZone: string): string =>
  Array.join(
    [
      `${INDENT}${commit.sha.slice(0, SHORT_SHA_LENGTH)}`,
      commit.repo,
      localTime(commit.authoredAtMs, timeZone),
      Array.match(commit.builds, {
        onEmpty: () => 'no build',
        onNonEmpty: builds =>
          `${builds.length === 1 ? 'build' : 'builds'} ${Array.join(
            Array.map(builds, build => build.number.toString()),
            ', ',
          )}`,
      }),
      commit.subject,
    ],
    '  ',
  )

const landingLines = (
  landing: IssueLanding,
  timeZone: string,
): ReadonlyArray<string> => [
  ...Option.match(firstLandedBuild(landing), {
    onNone: () =>
      Array.isReadonlyArrayEmpty(landing.commits)
        ? []
        : [`${INDENT}Not in a build yet`],
    onSome: build => [
      `${INDENT}Landed in ${buildLabel(build)}, built ${localTime(build.builtAtMs, timeZone)}`,
    ],
  }),
  ...Option.match(firstTestflightBuild(landing), {
    onNone: () => [],
    onSome: build => [`${INDENT}Get it: ${getItWords(build)}`],
  }),
  ...Array.map(
    landing.foundIn,
    build => `${INDENT}Found in ${buildLabel(build)}`,
  ),
  ...Array.map(landing.commits, commit => commitLine(commit, timeZone)),
]

/**
 * The lines `issues show` prints for where an Issue landed: a blank line, the
 * heading, then the first build, how to get it, the build he found it in and
 * every commit. Nothing when nothing is known, and one line saying why when
 * Scribe cannot be read.
 */
export const landingSection = (
  read: LandingRead,
  timeZone: string,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundLanding: ({ landing }) =>
        Array.match(landingLines(landing, timeZone), {
          onEmpty: () => [],
          onNonEmpty: lines => ['', 'Landing', ...lines],
        }),
      UnavailableLanding: ({ reason }) => ['', `Landing not shown: ${reason}`],
    }),
  )

const encodeLanding = S.encodeSync(IssueLanding)

/**
 * The keys `issues show --json` adds to the Issue: `landing`, or
 * `landingNotShown`, why it could not be read.
 */
export const landingJson = (
  read: LandingRead,
): Readonly<{
  landing?: typeof IssueLanding.Encoded
  landingNotShown?: string
}> =>
  M.value(read).pipe(
    M.tagsExhaustive({
      FoundLanding: ({ landing }) => ({ landing: encodeLanding(landing) }),
      UnavailableLanding: ({ reason }) => ({ landingNotShown: reason }),
    }),
  )

/** A reader for hosts with no Scribe app: nothing landed, nothing said. */
export const noLandingReader: LandingReader = () =>
  Effect.succeed(FoundLanding.make({ landing: noLanding }))
