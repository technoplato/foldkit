import { Array, Option, Order, Schema as S, pipe } from 'effect'

import {
  type Issue,
  type IssueMention,
  type IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { durationLabel } from './clock.js'
import {
  type IssueLanding,
  firstLandedBuild,
  firstTestflightBuild,
  noLanding,
} from './issueLandings.js'

/** The steps an ask goes through, in the order they happen. */
export const TimelineStepName = S.Literals([
  'Asked',
  'Filed',
  'Claimed',
  'Planned',
  'Red',
  'Green',
  'Pushed',
  'Merged',
  'Built',
  'OnTestFlight',
  'Verified',
])
/** The steps an ask goes through, in the order they happen. */
export type TimelineStepName = typeof TimelineStepName.Type

/**
 * One step of an ask: when it happened, how long it took after the step
 * before it, `1 h 6 min`, and the work-log words it was read from, such as
 * `Green 9be70b4a8: recording keeps the phone under 38 C.`
 */
export type TimelineStep = Readonly<{
  name: TimelineStepName
  atMs: number
  maybeTookLabel: Option.Option<string>
  maybeTookMs: Option.Option<number>
  maybeEvidence: Option.Option<string>
}>

type Found = Readonly<{ atMs: number; maybeEvidence: Option.Option<string> }>

const COMMIT = '[0-9a-f]{7,40}'
const RED = new RegExp(
  `^red\\b|\\bred(?: tests? committed as)?:? ${COMMIT}\\b`,
  'i',
)
const GREEN = new RegExp(`^green\\b|\\bgreen:? ${COMMIT}\\b`, 'i')
const PLANNED =
  /^plan landed|\bplan(?:\(#\d+\))? (?:landed|merged|committed)\b/i
const ON_MAIN = /\b(?:landed|merged)\b[^.\n]*\bmain\b/i
const MENTIONS_MAIN = /\bmain\b/i
const BUILT =
  /\b(?:shipped|installed|built) in build \d+|\bin build \d+,? (?:installed|shipped)\b/i

const stateOf = (entry: IssueWorkLogEntry): string =>
  Option.getOrElse(entry.state, () => '')
    .trim()
    .toLowerCase()

type StepRule = readonly [
  TimelineStepName,
  (entry: IssueWorkLogEntry) => boolean,
]

const stepsByState: ReadonlyArray<StepRule> = [
  [
    'Claimed',
    entry => stateOf(entry) === 'claimed' || stateOf(entry) === 'claim-start',
  ],
  [
    'Planned',
    entry => stateOf(entry) === 'planned' || stateOf(entry) === 'plan',
  ],
  ['Red', entry => stateOf(entry) === 'red'],
  ['Pushed', entry => stateOf(entry) === 'pushed'],
  [
    'Merged',
    entry =>
      stateOf(entry) === 'merged' ||
      (stateOf(entry) === 'landed' && MENTIONS_MAIN.test(entry.summary)),
  ],
  ['Verified', entry => stateOf(entry) === 'verified'],
]

const stepsByWords: ReadonlyArray<StepRule> = [
  ['Planned', entry => PLANNED.test(entry.summary)],
  ['Built', entry => BUILT.test(entry.summary)],
  ['Merged', entry => ON_MAIN.test(entry.summary)],
  ['Green', entry => GREEN.test(entry.summary)],
  ['Red', entry => RED.test(entry.summary)],
]

/**
 * The one step a work-log entry records: the step its state names, else
 * the most specific step its words name. `Plan landed on Scribe main
 * 2a2fe8741` is Planned, never also Merged, and `Landed on main 8fc12c548
 * (red 718e55ec5, green 9be70b4a8)` is Merged, not Red.
 */
const stepOfEntry = (
  entry: IssueWorkLogEntry,
): Option.Option<TimelineStepName> =>
  Option.map(
    Option.orElse(
      Array.findFirst(stepsByState, ([, matches]) => matches(entry)),
      () => Array.findFirst(stepsByWords, ([, matches]) => matches(entry)),
    ),
    ([name]) => name,
  )

/**
 * When he asked in one Mention: the time a Recording line was captured, or
 * the time he typed a message. An agent's report is not his ask.
 */
export const askedAtOf = (mention: IssueMention): Option.Option<number> => {
  if (mention.source._tag === 'Recording') {
    return mention.capturedAtMs
  } else if (mention.source._tag === 'Conversation') {
    return Option.orElse(
      Option.fromUndefinedOr(mention.source.conversation.typedAtMs),
      () => mention.capturedAtMs,
    )
  } else {
    return Option.none()
  }
}

const oldestFirst: Order.Order<IssueWorkLogEntry> = Order.mapInput(
  Order.Number,
  (entry: IssueWorkLogEntry) => entry.occurredAtMs,
)

const foundStep = (
  issue: Issue,
  name: TimelineStepName,
  entries: ReadonlyArray<IssueWorkLogEntry>,
  landing: IssueLanding,
): Option.Option<Found> => {
  const maybeBuilt = firstLandedBuild(landing)
  if (name === 'Built' && Option.isSome(maybeBuilt)) {
    return Option.some({
      atMs: maybeBuilt.value.builtAtMs,
      maybeEvidence: Option.none(),
    })
  } else if (name === 'OnTestFlight') {
    return Option.map(
      Option.flatMap(
        firstTestflightBuild(landing),
        build => build.maybeTaggedAtMs,
      ),
      atMs => ({ atMs, maybeEvidence: Option.none() }),
    )
  } else if (name === 'Asked') {
    return Array.match(Array.getSomes(Array.map(issue.mentions, askedAtOf)), {
      onEmpty: () => Option.none(),
      onNonEmpty: times =>
        Option.some({
          atMs: Array.min(times, Order.Number),
          maybeEvidence: Option.none(),
        }),
    })
  } else if (name === 'Filed') {
    return Option.some({
      atMs: issue.createdAtMs,
      maybeEvidence: Option.none(),
    })
  } else {
    return pipe(
      Array.findFirst(entries, entry =>
        Option.contains(stepOfEntry(entry), name),
      ),
      Option.map(entry => ({
        atMs: entry.occurredAtMs,
        maybeEvidence: Option.some(entry.summary),
      })),
    )
  }
}

const stepsOfIssue = (
  issue: Issue,
  landing: IssueLanding,
): ReadonlyArray<TimelineStep> => {
  const entries = Array.sort(issue.workLog, oldestFirst)
  const found = Array.getSomes(
    Array.map(TimelineStepName.literals, name =>
      Option.map(foundStep(issue, name, entries, landing), step => ({
        name,
        ...step,
      })),
    ),
  )
  return Array.map(found, (step, index) => {
    const maybePrevious = pipe(
      Array.get(found, index - 1),
      Option.filter(previous => previous.atMs <= step.atMs),
    )
    return {
      ...step,
      maybeTookLabel: Option.map(maybePrevious, previous =>
        durationLabel(previous.atMs, step.atMs),
      ),
      maybeTookMs: Option.map(
        maybePrevious,
        previous => step.atMs - previous.atMs,
      ),
    }
  })
}

type KeptTimeline = Readonly<{
  landing: IssueLanding
  steps: ReadonlyArray<TimelineStep>
}>

const keptTimelines = new WeakMap<Issue, KeptTimeline>()

/**
 * The steps an Issue went through, read from his mentions and its work log
 * at read time, each with how long it took after the step before it: asked
 * in Recording 326, filed 3 min later, claimed 1 min later, red 1 h later,
 * green, merged on main, built, on TestFlight, verified. The build and
 * TestFlight steps read `landing`, Scribe's rows, when it has them. A step
 * nothing records is left out; a step recorded before the one before it
 * shows no time.
 */
export const timelineOf = (
  issue: Issue,
  landing: IssueLanding = noLanding,
): ReadonlyArray<TimelineStep> => {
  const kept = keptTimelines.get(issue)
  if (kept !== undefined && kept.landing === landing) {
    return kept.steps
  } else {
    const steps = stepsOfIssue(issue, landing)
    keptTimelines.set(issue, { landing, steps })
    return steps
  }
}

/** A step as a person reads it: `OnTestFlight` is `On TestFlight`. */
export const timelineStepWords = (name: TimelineStepName): string =>
  name === 'OnTestFlight' ? 'On TestFlight' : name

/**
 * An ask's timeline on one line: `Asked → Filed 3 min → Claimed 1 min → Red 1 h`.
 */
export const timelineLine = (steps: ReadonlyArray<TimelineStep>): string =>
  Array.join(
    Array.map(steps, step =>
      Option.match(step.maybeTookLabel, {
        onNone: () => timelineStepWords(step.name),
        onSome: took => `${timelineStepWords(step.name)} ${took}`,
      }),
    ),
    ' → ',
  )
