import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Option,
  Order,
  Predicate,
  Queue,
  Record,
  Schema as S,
  Stream,
  pipe,
} from 'effect'

import { normalizeIssueId } from '@foldkit/instant-tools/issues'

import { DecisionFacts } from './decisionFacts.js'
import { QuestionFacts } from './questionFacts.js'
import { ReminderFacts } from './reminderFacts.js'
import {
  AgentFacts,
  FeatureFacts,
  FindingFacts,
  type GraphQuery,
  ProductFacts,
  SessionFacts,
} from './graphFacts.js'

// MODEL

/**
 * One build of Scribe as Scribe's `builds` row says: Scribe 0.1 (217), built
 * Oct 30, tagged `app/vakyume/0.1+217`, shown by TestFlight as `217.1`, with
 * the invite that gets it and the upload's page in App Store Connect.
 */
export const LandedBuild = S.Struct({
  builtAtMs: S.Number,
  marketingVersion: S.String,
  maybeTag: S.Option(S.String),
  maybeTaggedAtMs: S.Option(S.Number),
  maybeTestflightInvite: S.Option(S.String),
  maybeTestflightPage: S.Option(S.String),
  maybeTestflightVersion: S.Option(S.String),
  number: S.Int,
  status: S.String,
})
/** One build of Scribe as Scribe's `builds` row says. */
export type LandedBuild = typeof LandedBuild.Type

/**
 * One commit that implements an Issue, and the builds it shipped in: the
 * first build whose cut contains it, then the first TestFlight build when
 * that is later.
 */
export const LandedCommit = S.Struct({
  authoredAtMs: S.Number,
  builds: S.Array(LandedBuild),
  repo: S.String,
  sha: S.String,
  subject: S.String,
})
/** One commit that implements an Issue, and the builds it shipped in. */
export type LandedCommit = typeof LandedCommit.Type

/** Whose words a moment's lines are: his, or what he had on. */
export const MomentKind = S.Literals(['Said', 'Seen'])
/** Whose words a moment's lines are. */
export type MomentKind = typeof MomentKind.Type

/**
 * One stretch of a Recording an Issue cites: lines 76 to 78, 22:39 into
 * Recording 208, starting at their first line's row. A `Seen` moment is
 * another app's sound or a voice named for someone else, never his words.
 * `isOrigin` says the Issue came from it: the rows call it `introduced` and
 * he said it before the Issue was filed.
 */
export const IssueMoment = S.Struct({
  firstLineIndex: S.Number,
  isOrigin: S.Boolean,
  kind: MomentKind,
  lastLineIndex: S.Number,
  recordingId: S.String,
  segmentId: S.String,
  startSeconds: S.Number,
})
/** One stretch of a Recording an Issue cites. */
export type IssueMoment = typeof IssueMoment.Type

/**
 * Where an Issue landed, derived from git and read from Scribe's rows: the
 * commits that implement it, oldest first, and the builds he found it in.
 */
export const IssueLanding = S.Struct({
  commits: S.Array(LandedCommit),
  foundIn: S.Array(LandedBuild),
  moments: S.Array(IssueMoment).pipe(
    S.withConstructorDefault(Effect.succeed([])),
  ),
})
/** Where an Issue landed. */
export type IssueLanding = typeof IssueLanding.Type

/** An Issue with no commit and no build known: nothing landed yet. */
export const noLanding: IssueLanding = { commits: [], foundIn: [], moments: [] }

/** A build as a person says it: `Scribe 0.1 (217)`. */
export const buildLabel = (build: LandedBuild): string =>
  `Scribe ${build.marketingVersion} (${build.number.toString()})`

const byNumber: Order.Order<LandedBuild> = Order.mapInput(
  Order.Number,
  (build: LandedBuild) => build.number,
)

const builtBuilds = (landing: IssueLanding): ReadonlyArray<LandedBuild> =>
  Array.sort(
    Array.flatMap(landing.commits, commit => commit.builds),
    byNumber,
  )

/** The first build any of an Issue's commits shipped in. */
export const firstLandedBuild = (
  landing: IssueLanding,
): Option.Option<LandedBuild> => Array.head(builtBuilds(landing))

/** A build that went up to TestFlight: its tag or an App Store Connect page says so. */
export const isOnTestflight = (build: LandedBuild): boolean =>
  Option.isSome(build.maybeTestflightPage) ||
  Option.isSome(build.maybeTestflightInvite) ||
  Option.isSome(build.maybeTestflightVersion)

/** The first TestFlight build holding any of an Issue's commits. */
export const firstTestflightBuild = (
  landing: IssueLanding,
): Option.Option<LandedBuild> =>
  Array.findFirst(builtBuilds(landing), isOnTestflight)

// PAGES

/** A build on one device: `iphone`, `Michael's iPhone`, when it went on. */
export const BuildInstall = S.Struct({
  deviceName: S.String,
  installedAtMs: S.Number,
  platform: S.String,
})
/** A build on one device. */
export type BuildInstall = typeof BuildInstall.Type

/** One line of a build's What's New, with the Issues it came from. */
export const WhatsNewStory = S.Struct({
  issueIds: S.Array(S.String),
  text: S.String,
})
/** One line of a build's What's New. */
export type WhatsNewStory = typeof WhatsNewStory.Type

/**
 * What Scribe's rows say about one build: the cut commit, the devices it is
 * on, its What's New words, the Issues that shipped in it and those he found
 * in it.
 */
export const BuildFacts = S.TaggedStruct('BuildFacts', {
  build: LandedBuild,
  cutSha: S.String,
  foundIssueIds: S.Array(S.String),
  installs: S.Array(BuildInstall),
  maybeCutSubject: S.Option(S.String),
  maybeNotes: S.Option(S.String),
  shippedIssueIds: S.Array(S.String),
  whatsNew: S.Array(WhatsNewStory),
})
/** What Scribe's rows say about one build. */
export type BuildFacts = typeof BuildFacts.Type

/** What Scribe's rows say about one commit: its words, Issues and builds. */
export const CommitFacts = S.TaggedStruct('CommitFacts', {
  commit: LandedCommit,
  issueIds: S.Array(S.String),
})
/** What Scribe's rows say about one commit. */
export type CommitFacts = typeof CommitFacts.Type

/** One Issue and its moments on a page, in the order he said them. */
export const MomentsOfIssue = S.Struct({
  issueId: S.String,
  moments: S.Array(IssueMoment),
})
/** One Issue and its moments on a page. */
export type MomentsOfIssue = typeof MomentsOfIssue.Type

/**
 * The Issues a Recording's or a line's moments name, each once, in the order
 * he said them. `cameFrom` holds those with their origin here, `alsoCameUp`
 * those filed from somewhere else or before he said these lines.
 */
export const IssuesOfMoments = S.Struct({
  alsoCameUp: S.Array(MomentsOfIssue),
  cameFrom: S.Array(MomentsOfIssue),
})
/** The Issues a Recording's or a line's moments name. */
export type IssuesOfMoments = typeof IssuesOfMoments.Type

/**
 * What Scribe's rows say about one Recording: its name, start and length, and
 * the Issues its moments name.
 */
export const RecordingFacts = S.TaggedStruct('RecordingFacts', {
  durationSeconds: S.Number,
  issues: IssuesOfMoments,
  recordingId: S.String,
  startedAtMs: S.Number,
  title: S.String,
})
/** What Scribe's rows say about one Recording. */
export type RecordingFacts = typeof RecordingFacts.Type

/**
 * What Scribe's rows say about one line: its words, where it was said, and the
 * Issues whose moments cover it.
 */
export const SegmentFacts = S.TaggedStruct('SegmentFacts', {
  isSealed: S.Boolean,
  issues: IssuesOfMoments,
  lineIndex: S.Number,
  recordingId: S.String,
  saidAtMs: S.Number,
  segmentId: S.String,
  startTimeSeconds: S.Number,
  text: S.String,
})
/** What Scribe's rows say about one line. */
export type SegmentFacts = typeof SegmentFacts.Type

/** Scribe's rows hold no such build, commit, Recording or line. */
export const NoPageFacts = S.TaggedStruct('NoPageFacts', {})

/** What Scribe's rows say about the entity a page shows. */
export const PageFacts = S.Union([
  BuildFacts,
  CommitFacts,
  RecordingFacts,
  SegmentFacts,
  AgentFacts,
  SessionFacts,
  FindingFacts,
  FeatureFacts,
  ProductFacts,
  DecisionFacts,
  QuestionFacts,
  ReminderFacts,
  NoPageFacts,
])
/** What Scribe's rows say about the entity a page shows. */
export type PageFacts = typeof PageFacts.Type

// STORED

const OptionalText = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

const StoredBuild = S.Struct({
  ascBuildURL: OptionalText,
  builtAtMs: S.Number,
  marketingVersion: S.String,
  number: S.Number,
  status: S.String,
  tag: OptionalText,
  taggedAtMs: OptionalNumber,
  testflightJoinURL: OptionalText,
  testflightVersion: OptionalText,
})

const StoredBuildLink = S.optionalKey(
  S.NullOr(S.Union([StoredBuild, S.Array(StoredBuild)])),
)

const StoredShipped = S.Struct({
  build: StoredBuildLink,
  predicate: S.String,
})

const StoredCommit = S.Struct({
  authoredAtMs: S.Number,
  edges: S.optionalKey(S.Array(StoredShipped)),
  repo: S.String,
  sha: S.String,
  subject: S.String,
})

const StoredEdge = S.Struct({
  build: StoredBuildLink,
  commit: S.optionalKey(
    S.NullOr(S.Union([StoredCommit, S.Array(StoredCommit)])),
  ),
  predicate: S.String,
})

const StoredEdges = S.Struct({ edges: S.Array(StoredEdge) })

const StoredIssueEnd = S.Struct({
  issueNumber: OptionalNumber,
  predicate: S.String,
})

const StoredBuildEdge = S.Struct({
  commit: S.optionalKey(
    S.NullOr(
      S.Union([
        S.Struct({ edges: S.optionalKey(S.Array(StoredIssueEnd)) }),
        S.Array(S.Struct({ edges: S.optionalKey(S.Array(StoredIssueEnd)) })),
      ]),
    ),
  ),
  issueNumber: OptionalNumber,
  predicate: S.String,
})

const StoredCutCommit = S.Struct({ subject: S.String })

const StoredInstall = S.Struct({
  deviceName: S.String,
  installedAtMs: S.Number,
  platform: S.String,
})

const StoredBuildPage = S.Struct({
  ...StoredBuild.fields,
  commit: S.optionalKey(
    S.NullOr(S.Union([StoredCutCommit, S.Array(StoredCutCommit)])),
  ),
  commitSha: S.String,
  edges: S.optionalKey(S.Array(StoredBuildEdge)),
  installs: S.optionalKey(S.Array(StoredInstall)),
  notes: OptionalText,
  whatsNewJSON: S.optionalKey(S.NullOr(S.Unknown)),
})

const StoredBuildPages = S.Struct({ builds: S.Array(StoredBuildPage) })

const StoredCommitEdge = S.Struct({
  build: StoredBuildLink,
  issueNumber: OptionalNumber,
  predicate: S.String,
})

const StoredCommitPage = S.Struct({
  authoredAtMs: S.Number,
  edges: S.optionalKey(S.Array(StoredCommitEdge)),
  repo: S.String,
  sha: S.String,
  subject: S.String,
})

const StoredCommitPages = S.Struct({ commits: S.Array(StoredCommitPage) })

const StoredWhatsNew = S.Struct({
  stories: S.optionalKey(
    S.Array(
      S.Struct({
        issues: S.optionalKey(S.Array(S.Struct({ number: S.Number }))),
        text: S.String,
      }),
    ),
  ),
})

const isList = <A>(value: A | ReadonlyArray<A>): value is ReadonlyArray<A> =>
  globalThis.Array.isArray(value)

const listOf = <A>(
  value: A | ReadonlyArray<A> | null | undefined,
): ReadonlyArray<A> => {
  if (value === null || value === undefined) {
    return []
  } else if (isList(value)) {
    return value
  } else {
    return [value]
  }
}

const SHIPPED_IN = 'shippedIn'
const IMPLEMENTS = 'implements'
const FOUND_IN = 'foundIn'

const landedBuildOf = (stored: typeof StoredBuild.Type): LandedBuild =>
  LandedBuild.make({
    builtAtMs: stored.builtAtMs,
    marketingVersion: stored.marketingVersion,
    maybeTag: Option.fromNullishOr(stored.tag),
    maybeTaggedAtMs: Option.fromNullishOr(stored.taggedAtMs),
    maybeTestflightInvite: Option.fromNullishOr(stored.testflightJoinURL),
    maybeTestflightPage: Option.fromNullishOr(stored.ascBuildURL),
    maybeTestflightVersion: Option.fromNullishOr(stored.testflightVersion),
    number: stored.number,
    status: stored.status,
  })

const eachBuildOnce = (
  builds: ReadonlyArray<LandedBuild>,
): ReadonlyArray<LandedBuild> =>
  Array.sort(
    Array.dedupeWith(builds, (left, right) => left.number === right.number),
    byNumber,
  )

const landedCommitOf = (stored: typeof StoredCommit.Type): LandedCommit =>
  LandedCommit.make({
    authoredAtMs: stored.authoredAtMs,
    builds: eachBuildOnce(
      pipe(
        listOf(stored.edges),
        Array.filter(edge => edge.predicate === SHIPPED_IN),
        Array.flatMap(edge => Array.map(listOf(edge.build), landedBuildOf)),
      ),
    ),
    repo: stored.repo,
    sha: stored.sha,
    subject: stored.subject,
  })

const oldestCommitFirst: Order.Order<LandedCommit> = Order.mapInput(
  Order.Number,
  (commit: LandedCommit) => commit.authoredAtMs,
)

/**
 * An Issue's landing from the rows Instant answers with: its `implements`
 * edges, each commit with its `shippedIn` edges and their builds, and its
 * `foundIn` edges with their builds. Instant answers a link to one row as
 * that row or as a list of one; both read the same.
 */
export const issueLandingOf = (data: unknown): IssueLanding => {
  const { edges } = S.decodeUnknownSync(StoredEdges)(data)
  return IssueLanding.make({
    commits: pipe(
      Array.filter(edges, edge => edge.predicate === IMPLEMENTS),
      Array.flatMap(edge => listOf(edge.commit)),
      Array.map(landedCommitOf),
      Array.dedupeWith((left, right) => left.sha === right.sha),
      Array.sort(oldestCommitFirst),
    ),
    foundIn: eachBuildOnce(
      pipe(
        Array.filter(edges, edge => edge.predicate === FOUND_IN),
        Array.flatMap(edge => listOf(edge.build)),
        Array.map(landedBuildOf),
      ),
    ),
  })
}

/** Every build Instant answers with, lowest number first. */
export const buildsOf = (data: unknown): ReadonlyArray<LandedBuild> =>
  eachBuildOnce(
    Array.map(
      S.decodeUnknownSync(S.Struct({ builds: S.Array(StoredBuild) }))(data)
        .builds,
      landedBuildOf,
    ),
  )

const issueIdOf = (issueNumber: number): string =>
  Option.getOrElse(normalizeIssueId(issueNumber.toString()), () =>
    issueNumber.toString(),
  )

const byIssueNewestFirst: Order.Order<string> = Order.mapInput(
  Order.flip(Order.Number),
  Number,
)

const issueIdsOf = (
  numbers: ReadonlyArray<number | null | undefined>,
): ReadonlyArray<string> =>
  pipe(
    numbers,
    Array.filter(Predicate.isNumber),
    Array.dedupe,
    Array.map(issueIdOf),
    Array.sort(byIssueNewestFirst),
  )

const whatsNewOf = (stored: unknown): ReadonlyArray<WhatsNewStory> =>
  Option.match(
    Option.flatMap(
      typeof stored === 'string'
        ? Option.liftThrowable((text: string): unknown => JSON.parse(text))(
            stored,
          )
        : Option.fromNullishOr(stored),
      S.decodeUnknownOption(StoredWhatsNew),
    ),
    {
      onNone: () => [],
      onSome: ({ stories }) =>
        Array.map(listOf(stories), story =>
          WhatsNewStory.make({
            issueIds: issueIdsOf(
              Array.map(listOf(story.issues), issue => issue.number),
            ),
            text: story.text,
          }),
        ),
    },
  )

/**
 * A build's page from the rows Instant answers with: the Issues that shipped
 * in it come through each `shippedIn` commit's `implements` edges, those he
 * found in it from its `foundIn` edges. No row is {@link NoPageFacts}.
 */
export const buildFactsOf = (data: unknown): PageFacts =>
  Option.match(Array.head(S.decodeUnknownSync(StoredBuildPages)(data).builds), {
    onNone: () => NoPageFacts.make({}),
    onSome: stored => {
      const edges = listOf(stored.edges)
      return BuildFacts.make({
        build: landedBuildOf(stored),
        cutSha: stored.commitSha,
        foundIssueIds: issueIdsOf(
          Array.map(
            Array.filter(edges, edge => edge.predicate === FOUND_IN),
            edge => edge.issueNumber,
          ),
        ),
        installs: Array.map(listOf(stored.installs), install =>
          BuildInstall.make(install),
        ),
        maybeCutSubject: Option.map(
          Array.head(listOf(stored.commit)),
          commit => commit.subject,
        ),
        maybeNotes: Option.fromNullishOr(stored.notes),
        shippedIssueIds: issueIdsOf(
          pipe(
            Array.filter(edges, edge => edge.predicate === SHIPPED_IN),
            Array.flatMap(edge => listOf(edge.commit)),
            Array.flatMap(commit => listOf(commit.edges)),
            Array.filter(edge => edge.predicate === IMPLEMENTS),
            Array.map(edge => edge.issueNumber),
          ),
        ),
        whatsNew: whatsNewOf(stored.whatsNewJSON),
      })
    },
  })

/**
 * A commit's page from the rows Instant answers with: its `implements` edges
 * name its Issues and its `shippedIn` edges its builds. No row is
 * {@link NoPageFacts}.
 */
export const commitFactsOf = (data: unknown): PageFacts =>
  Option.match(
    Array.head(S.decodeUnknownSync(StoredCommitPages)(data).commits),
    {
      onNone: () => NoPageFacts.make({}),
      onSome: stored => {
        const edges = listOf(stored.edges)
        return CommitFacts.make({
          commit: LandedCommit.make({
            authoredAtMs: stored.authoredAtMs,
            builds: eachBuildOnce(
              pipe(
                Array.filter(edges, edge => edge.predicate === SHIPPED_IN),
                Array.flatMap(edge =>
                  Array.map(listOf(edge.build), landedBuildOf),
                ),
              ),
            ),
            repo: stored.repo,
            sha: stored.sha,
            subject: stored.subject,
          }),
          issueIds: issueIdsOf(
            Array.map(
              Array.filter(edges, edge => edge.predicate === IMPLEMENTS),
              edge => edge.issueNumber,
            ),
          ),
        })
      },
    },
  )

const StoredMomentIssue = S.Struct({
  createdAtMs: S.Number,
  number: S.Number,
})

const StoredMoment = S.Struct({
  firstLineIndex: OptionalNumber,
  kind: OptionalText,
  lastLineIndex: OptionalNumber,
  role: S.String,
  segmentID: OptionalText,
  startSeconds: OptionalNumber,
  startedAtMs: S.Number,
  trackedIssue: S.optionalKey(
    S.NullOr(S.Union([StoredMomentIssue, S.Array(StoredMomentIssue)])),
  ),
})

const StoredMoments = S.optionalKey(S.Array(StoredMoment))

const INTRODUCED = 'introduced'
const SEEN = 'seen'

const momentOf = (
  stored: typeof StoredMoment.Type,
  issue: typeof StoredMomentIssue.Type,
  recordingId: string,
): Option.Option<IssueMoment> =>
  Option.all({
    firstLineIndex: Option.fromNullishOr(stored.firstLineIndex),
    lastLineIndex: Option.fromNullishOr(stored.lastLineIndex),
    segmentId: Option.fromNullishOr(stored.segmentID),
    startSeconds: Option.fromNullishOr(stored.startSeconds),
  }).pipe(
    Option.map(line => ({
      ...line,
      isOrigin:
        stored.role === INTRODUCED && stored.startedAtMs <= issue.createdAtMs,
      kind: stored.kind === SEEN ? 'Seen' : 'Said',
      recordingId,
    })),
  )

const inOrderSaid: Order.Order<IssueMoment> = Order.combine(
  Order.mapInput(Order.Number, (moment: IssueMoment) => moment.firstLineIndex),
  Order.mapInput(Order.Number, (moment: IssueMoment) => moment.lastLineIndex),
)

const firstSaid = ({ moments }: MomentsOfIssue): number =>
  Option.getOrElse(
    Option.map(Array.head(moments), moment => moment.firstLineIndex),
    () => 0,
  )

const issuesInOrderSaid: Order.Order<MomentsOfIssue> = Order.combine(
  Order.mapInput(Order.Number, firstSaid),
  Order.mapInput(Order.Number, ({ issueId }: MomentsOfIssue) =>
    Number(issueId),
  ),
)

const hasOrigin = ({ moments }: MomentsOfIssue): boolean =>
  Array.some(moments, moment => moment.isOrigin)

/**
 * The Issues the rows of a Recording or a line name, each once, in the order
 * he said them, by first line and then by Issue number. One Issue can have
 * many moments. A moment whose row names no Issue, or no line, is skipped: four
 * came from an old bridge, and their Issues have moments of their own.
 */
const issuesOfMomentsOf = (
  stored: ReadonlyArray<typeof StoredMoment.Type>,
  recordingId: string,
): IssuesOfMoments => {
  const moments = Array.flatMap(stored, row =>
    Array.flatMap(Array.take(listOf(row.trackedIssue), 1), issue =>
      Array.map(Option.toArray(momentOf(row, issue, recordingId)), moment => ({
        issueId: issueIdOf(issue.number),
        moment,
      })),
    ),
  )
  const issues = pipe(
    Array.groupBy(moments, ({ issueId }) => issueId),
    Record.toEntries,
    Array.map(([issueId, ofIssue]) => ({
      issueId,
      moments: Array.sort(
        Array.map(ofIssue, ({ moment }) => moment),
        inOrderSaid,
      ),
    })),
    Array.sort(issuesInOrderSaid),
  )
  return {
    alsoCameUp: Array.filter(issues, ofIssue => !hasOrigin(ofIssue)),
    cameFrom: Array.filter(issues, hasOrigin),
  }
}

const StoredRecordingPages = S.Struct({
  recordings: S.Array(
    S.Struct({
      durationSeconds: S.Number,
      id: S.String,
      startedAtMs: S.Number,
      title: S.String,
    }),
  ),
  sourceMoments: StoredMoments,
})

/**
 * A Recording's page from the rows Instant answers with: its own row, and its
 * moments with their Issues.
 */
export const recordingFactsOf = (data: unknown): PageFacts => {
  const { recordings, sourceMoments } =
    S.decodeUnknownSync(StoredRecordingPages)(data)
  return Option.match(Array.head(recordings), {
    onNone: () => NoPageFacts.make({}),
    onSome: stored =>
      RecordingFacts.make({
        durationSeconds: stored.durationSeconds,
        issues: issuesOfMomentsOf(listOf(sourceMoments), stored.id),
        recordingId: stored.id,
        startedAtMs: stored.startedAtMs,
        title: stored.title,
      }),
  })
}

const StoredSegmentPages = S.Struct({
  transcriptionSegments: S.Array(
    S.Struct({
      id: S.String,
      recordingID: S.String,
      segmentIndex: S.Number,
      sourceMoments: StoredMoments,
      startTimeSeconds: S.Number,
      text: S.String,
      wallClockStartedAtMs: S.Number,
      wordsSeal: OptionalText,
    }),
  ),
})

/**
 * A line's page from the rows Instant answers with: its own row, and through
 * its link every moment that covers it.
 */
export const segmentFactsOf = (data: unknown): PageFacts =>
  Option.match(
    Array.head(
      S.decodeUnknownSync(StoredSegmentPages)(data).transcriptionSegments,
    ),
    {
      onNone: () => NoPageFacts.make({}),
      onSome: stored =>
        SegmentFacts.make({
          isSealed: Option.isSome(Option.fromNullishOr(stored.wordsSeal)),
          issues: issuesOfMomentsOf(
            listOf(stored.sourceMoments),
            stored.recordingID,
          ),
          lineIndex: stored.segmentIndex,
          recordingId: stored.recordingID,
          saidAtMs: stored.wallClockStartedAtMs,
          segmentId: stored.id,
          startTimeSeconds: stored.startTimeSeconds,
          text: stored.text,
        }),
    },
  )

const COMMIT_PREFIX = /^[0-9a-f]{7,40}$/
const NEXT_AFTER_ANY_HEX = 'g'
const BUILD_NUMBER_AT_START = /^\d+/

/** What can begin a commit id, lowercase: `852F55FE9` is `852f55fe9`. */
export const normalizedCommitPrefix = (sha: string): Option.Option<string> =>
  Option.liftPredicate(sha.toLowerCase(), prefix => COMMIT_PREFIX.test(prefix))

// SERVICE

/** Reading Scribe's rows failed, such as when the rules refuse them. */
export class IssueLandingError extends Data.TaggedError('IssueLandingError')<{
  readonly cause: unknown
}> {}

/** Where each Issue landed, as Scribe's rows change. */
export type IssueLandingsService = Readonly<{
  observeRecordingFacts: (
    recordingId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeSegmentFacts: (
    segmentId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeBuilds: Stream.Stream<ReadonlyArray<LandedBuild>, IssueLandingError>
  observeBuildFacts: (
    number: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeCommitFacts: (
    sha: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeIssueLanding: (
    issueId: string,
  ) => Stream.Stream<IssueLanding, IssueLandingError>
}>

/** A controlled dependency for where an Issue landed. */
export class IssueLandings extends Context.Service<
  IssueLandings,
  IssueLandingsService
>()('issues-example/IssueLandings') {}

/**
 * Hosts with no graph, such as previews and terminals: nothing landed, and
 * entity pages show only what Issue text says.
 */
export const NoIssueLandings: IssueLandingsService = {
  observeRecordingFacts: () => Stream.empty,
  observeSegmentFacts: () => Stream.empty,
  observeBuilds: Stream.empty,
  observeBuildFacts: () => Stream.empty,
  observeCommitFacts: () => Stream.empty,
  observeIssueLanding: () => Stream.succeed(noLanding),
}

/** The part of an Instant client that observes one query. */
export type LandingsDatabase = Readonly<{
  subscribeQuery: (
    query: LandingsQuery,
    onResponse: (
      response: Readonly<{ data?: unknown; error?: unknown }>,
    ) => void,
  ) => () => void
}>

const ISSUE_NUMBER = /^\d+$/

/** The fields a page draws of a build; its What's New copy stays behind. */
const BUILD_FIELDS = [
  'ascBuildURL',
  'builtAtMs',
  'marketingVersion',
  'number',
  'status',
  'tag',
  'taggedAtMs',
  'testflightJoinURL',
  'testflightVersion',
]

const ISSUE_END_FIELDS = ['issueNumber', 'predicate']

/**
 * What the Issue page asks Scribe's app for: the edges that name the Issue by
 * number, each commit with what shipped it, each build found in. #625 asks
 * `edges` where `issueNumber` is 625.
 */
export const issueLandingQuery = (issueNumber: number) => ({
  edges: {
    $: { where: { issueNumber } },
    build: { $: { fields: BUILD_FIELDS } },
    commit: { edges: { build: { $: { fields: BUILD_FIELDS } } } },
  },
})

/**
 * What the Issue page asks Scribe's app for: where it landed, and its moments
 * with their kind, so the page says whether the line he is quoted from is his
 * or another app's sound. #625's moments are `sourceMoments` whose
 * `trackedIssue.number` is 625. The `issues` command reads the landing alone.
 */
export const issuePageLandingQuery = (issueNumber: number) => ({
  ...issueLandingQuery(issueNumber),
  sourceMoments: {
    $: {
      where: { 'trackedIssue.number': issueNumber, subjectKind: ISSUE_SUBJECT },
      fields: [...MOMENT_FIELDS, 'recordingID'],
    },
    trackedIssue: MOMENT_ISSUE,
  },
})

const StoredIssueMoments = S.Struct({
  sourceMoments: S.optionalKey(
    S.Array(S.Struct({ ...StoredMoment.fields, recordingID: S.String })),
  ),
})

/** What the Issue page reads: where it landed, and its moments. */
export const issuePageLandingOf = (data: unknown): IssueLanding => {
  const { sourceMoments } = S.decodeUnknownSync(StoredIssueMoments)(data)
  return IssueLanding.make({
    ...issueLandingOf(data),
    moments: Array.flatMap(listOf(sourceMoments), stored =>
      Array.flatMap(listOf(stored.trackedIssue), issue =>
        Option.toArray(momentOf(stored, issue, stored.recordingID)),
      ),
    ),
  })
}

/**
 * What a build's page asks for: the row by its key, `scribe|217`, its cut
 * commit and devices, and its edges with each commit's Issue ends.
 */
export const buildFactsQuery = (buildNumber: number) => ({
  builds: {
    $: { where: { key: `scribe|${buildNumber.toString()}` } },
    commit: { $: { fields: ['subject'] } },
    edges: {
      $: { fields: ISSUE_END_FIELDS },
      commit: {
        $: { fields: ['sha'] },
        edges: { $: { fields: ISSUE_END_FIELDS } },
      },
    },
    installs: { $: { fields: ['deviceName', 'installedAtMs', 'platform'] } },
  },
})

/**
 * What a commit's page asks for: the row whose id starts with the prefix a
 * text gave, `852f55fe9`, by a range on the indexed id, and its edges with
 * each build it shipped in.
 */
export const commitFactsQuery = (prefix: string) => ({
  commits: {
    $: {
      where: {
        and: [
          { sha: { $gte: prefix } },
          { sha: { $lte: `${prefix}${NEXT_AFTER_ANY_HEX}` } },
        ],
      },
    },
    edges: { build: { $: { fields: BUILD_FIELDS } } },
  },
})

/** Every build's drawn fields, so any build named in text is a full chip. */
export const buildsQuery = { builds: { $: { fields: BUILD_FIELDS } } }

const UUID_LIKE = /^[0-9a-f-]{36}$/i

/** The fields a page draws of a moment; its quoted words stay behind. */
const MOMENT_FIELDS = [
  'firstLineIndex',
  'kind',
  'lastLineIndex',
  'role',
  'segmentID',
  'startSeconds',
  'startedAtMs',
]

const ISSUE_SUBJECT = 'issue'

/**
 * What a page reads of a moment's Issue: which Issue, and when it was filed.
 * Its title and state come from the catalog, which keeps them live.
 */
const MOMENT_ISSUE = { $: { fields: ['createdAtMs', 'number'] } }

/**
 * What a Recording's page asks for, in one query: its name, start and length,
 * and every Issue moment in it. Recording 208 answers 100 Issues and 297
 * moments. Its rows hold ids in lowercase, so any spelling of the id reads.
 */
export const recordingFactsQuery = (recordingId: string) => {
  const id = recordingId.toLowerCase()
  return {
    recordings: {
      $: {
        where: { id },
        fields: ['durationSeconds', 'startedAtMs', 'title'],
      },
    },
    sourceMoments: {
      $: {
        where: { recordingID: id, subjectKind: ISSUE_SUBJECT },
        fields: MOMENT_FIELDS,
      },
      trackedIssue: MOMENT_ISSUE,
    },
  }
}

/**
 * What a line's page asks for: its words, time and sealing, and through its
 * `sourceMoments` link the Issue moments that cover it, the line among the
 * lines of a stretch such as `#76-115` too.
 */
export const segmentFactsQuery = (segmentId: string) => ({
  transcriptionSegments: {
    $: {
      where: { id: segmentId.toLowerCase() },
      fields: [
        'recordingID',
        'segmentIndex',
        'startTimeSeconds',
        'text',
        'wallClockStartedAtMs',
        'wordsSeal',
      ],
    },
    sourceMoments: {
      $: { where: { subjectKind: ISSUE_SUBJECT }, fields: MOMENT_FIELDS },
      trackedIssue: MOMENT_ISSUE,
    },
  },
})

/** Every query a page asks Scribe's app. */
export type LandingsQuery =
  | typeof buildsQuery
  | ReturnType<typeof recordingFactsQuery>
  | ReturnType<typeof segmentFactsQuery>
  | ReturnType<typeof issueLandingQuery>
  | ReturnType<typeof issuePageLandingQuery>
  | ReturnType<typeof buildFactsQuery>
  | ReturnType<typeof commitFactsQuery>
  | GraphQuery

/**
 * One live query of Scribe's app as a Stream of what `read` makes of each
 * answer: opened when asked for, closed with the Stream, and failing with the
 * reason a person reads when the rules refuse it or the rows cannot be read.
 */
export const observed = <A>(
  openDatabase: Effect.Effect<LandingsDatabase, IssueLandingError>,
  query: LandingsQuery,
  read: (data: unknown) => A,
): Stream.Stream<A, IssueLandingError> =>
  Stream.unwrap(
    Effect.map(openDatabase, database =>
      Stream.callback<A, IssueLandingError>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeQuery(query, response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(new IssueLandingError({ cause: response.error })),
                )
              } else {
                const maybeRead = Option.liftThrowable(read)(response.data)
                if (Option.isSome(maybeRead)) {
                  Queue.offerUnsafe(queue, maybeRead.value)
                } else {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new IssueLandingError({
                        cause: new Error(
                          'Scribe answered with rows this page cannot read.',
                        ),
                      }),
                    ),
                  )
                }
              }
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    ),
  )

/**
 * Where an Issue landed and what a build's or commit's page shows, live from
 * Scribe's Instant app, opened the first time a page asks, so the list pays
 * nothing for it. `openDatabase` answers with the signed-in client, or fails
 * with the reason. An Issue whose name is not a number, such as a preview's
 * `issue-041`, has no rows and no read; neither has a build or commit whose
 * name cannot be one.
 */
export const instantIssueLandings = (
  openDatabase: Effect.Effect<LandingsDatabase, IssueLandingError>,
): IssueLandingsService => ({
  observeRecordingFacts: recordingId =>
    UUID_LIKE.test(recordingId)
      ? observed(
          openDatabase,
          recordingFactsQuery(recordingId),
          recordingFactsOf,
        )
      : Stream.succeed(NoPageFacts.make({})),
  observeSegmentFacts: segmentId =>
    UUID_LIKE.test(segmentId)
      ? observed(openDatabase, segmentFactsQuery(segmentId), segmentFactsOf)
      : Stream.succeed(NoPageFacts.make({})),
  observeBuilds: observed(openDatabase, buildsQuery, buildsOf),
  observeBuildFacts: number =>
    Option.match(
      Option.map(
        Option.fromNullishOr(BUILD_NUMBER_AT_START.exec(number)?.[0]),
        Number,
      ),
      {
        onNone: () => Stream.succeed(NoPageFacts.make({})),
        onSome: buildNumber =>
          observed(openDatabase, buildFactsQuery(buildNumber), buildFactsOf),
      },
    ),
  observeCommitFacts: sha =>
    Option.match(normalizedCommitPrefix(sha), {
      onNone: () => Stream.succeed(NoPageFacts.make({})),
      onSome: prefix =>
        observed(openDatabase, commitFactsQuery(prefix), commitFactsOf),
    }),
  observeIssueLanding: issueId =>
    ISSUE_NUMBER.test(issueId)
      ? observed(
          openDatabase,
          issuePageLandingQuery(Number(issueId)),
          issuePageLandingOf,
        )
      : Stream.succeed(noLanding),
})

/** Why an Issue's landing could not be read, in words a person reads. */
export const describeIssueLandingError = (error: IssueLandingError): string => {
  const cause = error.cause
  if (cause instanceof Error) {
    return cause.message
  }
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    return String(cause.message)
  }
  return String(cause)
}
