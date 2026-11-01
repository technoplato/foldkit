import { Array, Option } from 'effect'
import { Plain, Reference, type TextPart } from 'foldkit/renderers'

import {
  durationLabel,
  howLongAgo,
  localTimeLabel,
  recordingClockLabel,
} from './clock.js'
import {
  type AgentRunChip,
  type AgentSession,
  type FeatureChip,
  harnessOfHandle,
} from './graphFacts.js'
import {
  type IssueMoment,
  type LandedBuild,
  type LandedCommit,
  buildLabel,
} from './issueLandings.js'

const SHORT_SHA_LENGTH = 9
const WORDS_ORIGIN = 'https://words.pisspoursoftware.xyz'

/** The reader's clock, read once a minute. */
export type ChipClock = Readonly<{ nowMs: number; offsetMinutes: number }>

/**
 * A time as a person reads it: `2026-10-30 09:00 (2 days ago)`, or just the
 * time before the clock is read.
 */
export const whenWordsOn = (atMs: number, clock: ChipClock): string =>
  clock.nowMs === 0
    ? localTimeLabel(atMs, clock.offsetMinutes)
    : `${localTimeLabel(atMs, clock.offsetMinutes)} (${howLongAgo(atMs, clock.nowMs)})`

/** A build's chip: `Scribe 0.1 (217)`, its state, and a hover with when and its tag. */
export const buildChip = (build: LandedBuild, clock: ChipClock): TextPart =>
  Reference({
    label: buildLabel(build),
    kind: 'Build',
    state: build.status,
    href: `/builds/${build.number.toString()}`,
    detail: [
      `Built ${whenWordsOn(build.builtAtMs, clock)}`,
      ...Option.toArray(Option.map(build.maybeTag, tag => `Tag ${tag}`)),
    ],
  })

/**
 * How to get a build: its TestFlight invite and its upload's page in App
 * Store Connect, each named with the number TestFlight shows, `217.1`.
 */
export const testflightChips = (
  build: LandedBuild,
  clock: ChipClock,
): ReadonlyArray<TextPart> => {
  const shown = Option.getOrElse(build.maybeTestflightVersion, () =>
    build.number.toString(),
  )
  const sent = Option.match(build.maybeTaggedAtMs, {
    onNone: () => [],
    onSome: atMs => [`Sent ${whenWordsOn(atMs, clock)}`],
  })
  return [
    ...Option.toArray(
      Option.map(build.maybeTestflightInvite, href =>
        Reference({
          label: `TestFlight ${shown}`,
          kind: 'TestFlight',
          href,
          detail: ['Opens the TestFlight invite', ...sent],
        }),
      ),
    ),
    ...Option.toArray(
      Option.map(build.maybeTestflightPage, href =>
        Reference({
          label: `Upload ${shown}`,
          kind: 'TestFlight',
          href,
          detail: ['Opens this upload in App Store Connect', ...sent],
        }),
      ),
    ),
  ]
}

/** A commit's chip: its short id with its words as the title. */
export const commitChip = (commit: LandedCommit): TextPart =>
  Reference({
    label: commit.sha.slice(0, SHORT_SHA_LENGTH),
    title: commit.subject,
    kind: 'Commit',
    href: `/commits/${commit.sha}`,
    detail: [`${commit.repo} ${commit.sha}`],
  })

/** A commit's chip when only its id and maybe its words are known. */
export const commitChipOf = (
  sha: string,
  maybeSubject: Option.Option<string>,
): TextPart =>
  Reference({
    label: sha.slice(0, SHORT_SHA_LENGTH),
    ...Option.match(maybeSubject, {
      onNone: () => ({}),
      onSome: title => ({ title }),
    }),
    kind: 'Commit',
    href: `/commits/${sha}`,
    detail: [`Commit ${sha}`],
  })

const AGENT_HARNESS =
  /^(?:claude-code|codex|cursor-grok|cursor|grok|agy|gemini|opencode|pi)\//
const SHORT_SESSION_LENGTH = 8

const agentPagePath = (agentId: string): string =>
  `/agents/${encodeURIComponent(agentId)}`

/** A handle without its harness, as a chip says it: `issues-linear-1538@al`. */
export const agentLabelOf = (agentId: string): string =>
  agentId.replace(AGENT_HARNESS, '')

const howRunWords = (run: AgentRunChip): ReadonlyArray<string> => [
  ...Option.toArray(run.maybeKind),
  ...Option.toArray(run.maybeAccount),
  ...Option.toArray(run.maybeModel),
  ...Option.toArray(run.maybeEffort),
]

const ranWords = (run: AgentRunChip, clock: ChipClock): ReadonlyArray<string> =>
  Option.match(run.maybeStartedAtMs, {
    onNone: () => [],
    onSome: startedAtMs => [
      `Started ${whenWordsOn(startedAtMs, clock)}`,
      ...Option.match(run.maybeEndedAtMs, {
        onNone: () => [],
        onSome: endedAtMs => [`Ran ${durationLabel(startedAtMs, endedAtMs)}`],
      }),
    ],
  })

/**
 * What a hover says about a run: its handle, then how it ran and when, such as
 * `headless al claude-opus-5-5 max` and `Ran 1 h 27 min`.
 */
export const agentRunDetail = (
  agentId: string,
  run: AgentRunChip,
  clock: ChipClock,
): ReadonlyArray<string> => [
  agentId,
  ...Array.match(howRunWords(run), {
    onEmpty: () => [],
    onNonEmpty: words => [Array.join(words, ' ')],
  }),
  ...ranWords(run, clock),
]

/** An agent's chip: its name, harness and state, with how it ran on hover. */
export const agentChip = (run: AgentRunChip, clock: ChipClock): TextPart =>
  Reference({
    label: agentLabelOf(run.agentId),
    title: run.harness,
    state: run.status,
    kind: 'Agent',
    href: agentPagePath(run.agentId),
    detail: agentRunDetail(run.agentId, run, clock),
  })

/**
 * The chip of a handle in text: the state and harness of the run it names when
 * the page has read one, else the harness the handle itself says. A handle
 * keeps its own name and page, because a run answers to several:
 * `claude-code/issues-linear-1538@al` names a run now on `@max`.
 */
export const agentChipOfHandle = (
  agentId: string,
  maybeRun: Option.Option<AgentRunChip>,
  clock: ChipClock,
): TextPart =>
  Option.match(maybeRun, {
    onNone: () =>
      Reference({
        label: agentLabelOf(agentId),
        ...Option.match(harnessOfHandle(agentId), {
          onNone: () => ({}),
          onSome: title => ({ title }),
        }),
        kind: 'Agent',
        href: agentPagePath(agentId),
        detail: [agentId],
      }),
    onSome: run =>
      Reference({
        label: agentLabelOf(agentId),
        title: run.harness,
        state: run.status,
        kind: 'Agent',
        href: agentPagePath(agentId),
        detail: agentRunDetail(agentId, run, clock),
      }),
  })

/** A session's chip: the start of its id, linking its page. */
export const sessionChip = (session: AgentSession): TextPart =>
  Reference({
    label: session.hostSessionId.slice(0, SHORT_SESSION_LENGTH),
    kind: 'Session',
    href: `/sessions/${session.hostSessionId}`,
    detail: [
      `Session ${session.hostSessionId}`,
      ...Option.toArray(session.maybeTitle),
    ],
  })

/** A session known only by its id, such as a finding's. */
export const sessionChipOf = (sessionId: string): TextPart =>
  Reference({
    label: sessionId.slice(0, SHORT_SESSION_LENGTH),
    kind: 'Session',
    href: `/sessions/${sessionId}`,
    detail: [`Session ${sessionId}`],
  })

const stateOfFeature = (feature: FeatureChip): string =>
  feature.isDraft ? 'draft' : feature.status

/** A feature's chip: its name and state, its number in the file on hover. */
export const featureChip = (feature: FeatureChip): TextPart =>
  Reference({
    label: feature.name,
    state: stateOfFeature(feature),
    kind: 'Feature',
    href: `/features/${feature.slug}`,
    detail: Option.match(feature.maybeNumber, {
      onNone: () => [`Feature of ${feature.productId}`],
      onSome: number => [
        `FEATURES ${number.toString()} of ${feature.productId}`,
      ],
    }),
  })

/** A product's chip: its name and kind. */
export const productChip = (
  productId: string,
  name: string,
  maybeKind: Option.Option<string>,
): TextPart =>
  Reference({
    label: name,
    ...Option.match(maybeKind, {
      onNone: () => ({}),
      onSome: title => ({ title }),
    }),
    kind: 'Product',
    href: `/products/${encodeURIComponent(productId)}`,
    detail: [`${Option.getOrElse(maybeKind, () => 'Product')} ${name}`],
  })

/** A Recording's words in the words app. */
export const recordingWordsLink = (recordingId: string): string =>
  `${WORDS_ORIGIN}/recording/${recordingId}`

/** One line's words at their exact time: its section with `?t=1359.22`. */
export const lineWordsLink = (
  recordingId: string,
  segmentId: string,
  atSeconds: number,
): string =>
  `${recordingWordsLink(recordingId)}/section/${segmentId}?t=${atSeconds.toFixed(2)}`

const linesLabel = ({ firstLineIndex, lastLineIndex }: IssueMoment): string =>
  firstLineIndex === lastLineIndex
    ? `Line ${firstLineIndex.toString()}`
    : `Lines ${firstLineIndex.toString()}-${lastLineIndex.toString()}`

const NOT_HIS_WORDS = 'not his words'

const momentTitleOf = (moment: IssueMoment): string =>
  Array.join(
    [
      ...(moment.isOrigin ? ['origin'] : []),
      ...(moment.kind === 'Seen' ? [NOT_HIS_WORDS] : []),
    ],
    ', ',
  )

const momentDetailOf = (moment: IssueMoment): ReadonlyArray<string> => {
  const atClock = recordingClockLabel(moment.startSeconds)
  return [
    ...(moment.isOrigin ? ['The Issue came from these lines'] : []),
    ...(moment.kind === 'Seen'
      ? [
          'Another app’s sound or another voice',
          `Opens these lines at ${atClock}`,
        ]
      : [`Opens his words at ${atClock}`]),
  ]
}

/**
 * One moment's chip: `Line 76` or `Lines 76-115`, deep linking those lines at
 * their exact time. Its title says when the Issue came from it, and when the
 * lines are not his words.
 */
export const momentChip = (moment: IssueMoment): TextPart => {
  const title = momentTitleOf(moment)
  return Reference({
    label: linesLabel(moment),
    ...(title === '' ? {} : { title }),
    kind: 'Segment',
    href: lineWordsLink(
      moment.recordingId,
      moment.segmentId,
      moment.startSeconds,
    ),
    detail: momentDetailOf(moment),
  })
}

/** Chips with two spaces between them, for one line. */
export const spacedChips = (
  chips: ReadonlyArray<TextPart>,
): ReadonlyArray<TextPart> => Array.flatMap(chips, chip => [Plain('  '), chip])
