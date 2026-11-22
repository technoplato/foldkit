import { Array, Match as M, Option, Schema as S, String, pipe } from 'effect'

import type { BudgetStatus } from '../chart'
import type {
  App,
  Build,
  ConsumerKind,
  Direction,
  EvidenceTag,
  HourState,
  Index,
  MachineState,
  MeasureStatus,
  MemoryPressure,
  Metric,
  Presence,
  Scope,
  Shares,
  Value,
  Verdict,
  WaitingClass,
} from '../data'

// CONSTANT

const SHORT_SHA_LENGTH = 9
const TIME_ZONE = 'America/New_York'
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
const DAYS_BEFORE_SPANS_READ_IN_DAYS = 2
const DECLARED_DIGITS = 2

/** The scopes in the order the page shows them. */
export const SCOPES: ReadonlyArray<Scope> = [
  'Recording',
  'NotRecording',
  'CannedAudio',
]

/** The evidence states in the order the page shows them, the proven first. */
export const EVIDENCE_TAGS: ReadonlyArray<EvidenceTag> = [
  'Proven',
  'Disproved',
  'Landed',
  'InProgress',
]

// FORMAT

/** A number with its metric's digits and thousands separators: `3,848.9`. */
export const formatNumber = (value: number, digits: number): string =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

/** How many minutes a number stands on: `43 min`, `under 1 min`. */
export const formatMinutes = (minutes: number): string =>
  minutes < 1 ? 'under 1 min' : `${formatNumber(minutes, 0)} min`

const formatInNewYork = (
  iso: string,
  options: Intl.DateTimeFormatOptions,
): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  } else {
    return date.toLocaleString('en-US', { timeZone: TIME_ZONE, ...options })
  }
}

/** An ISO time as he reads it, in New York: `Nov 5, 11:31 AM`. */
export const formatDate = (iso: string): string =>
  formatInNewYork(iso, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** The clock hour that starts at an ISO time: `Sun, 11 AM`. */
export const formatHour = (iso: string): string =>
  formatInNewYork(iso, { weekday: 'short', hour: 'numeric' })

/** A length of time in words: `43 min`, `1 h 38 min`, `3 days`. */
export const formatSpan = (minutes: number): string => {
  const whole = Math.round(minutes)
  const hours = Math.floor(whole / MINUTES_PER_HOUR)
  const rest = whole % MINUTES_PER_HOUR
  if (whole < MINUTES_PER_HOUR) {
    return `${whole} min`
  } else if (whole >= DAYS_BEFORE_SPANS_READ_IN_DAYS * MINUTES_PER_DAY) {
    return counted(Math.floor(whole / MINUTES_PER_DAY), 'day')
  } else if (rest === 0) {
    return `${hours} h`
  } else {
    return `${hours} h ${rest} min`
  }
}

/** What follows a number: a percent joins it, any other unit takes a space. */
const unitSuffix = (unit: string): string =>
  unit === '' || String.startsWith('%')(unit) ? unit : ` ${unit}`

/**
 * A number and its small print: a percent is part of the number.
 *
 * @example
 * ```ts
 * amountParts(62, 0, '% of minutes') // ['62%', ' of minutes']
 * amountParts(25, 0, 'an hour') // ['25', ' an hour']
 * ```
 */
export const amountParts = (
  value: number,
  digits: number,
  unit: string,
): readonly [string, string] => {
  const shown = formatNumber(value, digits)
  return String.startsWith('%')(unit)
    ? [`${shown}%`, String.slice(1)(unit)]
    : [shown, unitSuffix(unit)]
}

/** A number and its unit: `62% of minutes`, `35.2 min`. */
export const formatAmount = (
  value: number,
  digits: number,
  unit: string,
): string => `${formatNumber(value, digits)}${unitSuffix(unit)}`

/** A number someone declared, with only the digits they declared: `2.5`, `30`. */
export const formatDeclared = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: DECLARED_DIGITS })

/** A target with its direction: `target at most 10`. */
export const formatTarget = (
  maybeTarget: Option.Option<number>,
  direction: Direction,
): string =>
  Option.match(maybeTarget, {
    onNone: () => 'no target',
    onSome: target =>
      `target ${direction === 'AtLeast' ? 'at least' : 'at most'} ${formatDeclared(target)}`,
  })

export const shortSha = (sha: string): string =>
  String.takeLeft(sha, SHORT_SHA_LENGTH)

/** The ledger writes bold verdicts as `**Yes.**`; the page shows the words. */
export const withoutMarkdown = (text: string): string =>
  pipe(text, String.replaceAll('**', ''), String.replaceAll('`', ''))

export const scopeLabel = (scope: Scope): string =>
  M.value(scope).pipe(
    M.when('Recording', () => 'While recording'),
    M.when('NotRecording', () => 'While not recording'),
    M.when('CannedAudio', () => 'Canned-audio runs'),
    M.exhaustive,
  )

export const evidenceLabel = (tag: EvidenceTag): string =>
  M.value(tag).pipe(
    M.when('Proven', () => 'Proven on a device'),
    M.when('Disproved', () => 'Disproved'),
    M.when('Landed', () => 'Landed, not proven'),
    M.when('InProgress', () => 'In progress'),
    M.exhaustive,
  )

/** The glyph beside an evidence label; the label always carries the meaning. */
export const evidenceIcon = (tag: EvidenceTag): string =>
  M.value(tag).pipe(
    M.when('Proven', () => '✓'),
    M.when('Disproved', () => '✕'),
    M.when('Landed', () => '◐'),
    M.when('InProgress', () => '○'),
    M.exhaustive,
  )

export const evidenceDotClass = (tag: EvidenceTag): string =>
  M.value(tag).pipe(
    M.when('Proven', () => 'status-dot-good'),
    M.when('Disproved', () => 'status-dot-critical'),
    M.when('Landed', () => 'status-dot-warning'),
    M.when('InProgress', () => 'ink-muted'),
    M.exhaustive,
  )

/** `1 build`, `16 builds`. */
export const counted = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

export const verdictLabel = (verdict: Verdict): string =>
  M.value(verdict).pipe(
    M.when('Held', () => 'Held'),
    M.when('Disproved', () => 'Disproved'),
    M.when('NotMet', () => 'Not met'),
    M.when('Open', () => 'Open'),
    M.exhaustive,
  )

export const budgetStatusLabel = (status: BudgetStatus): string =>
  M.value(status).pipe(
    M.when('Within', () => 'within budget'),
    M.when('OverTarget', () => 'over the target'),
    M.when('OverFail', () => 'over the fail line'),
    M.when('NoBudget', () => 'no budget set'),
    M.exhaustive,
  )

// MARK

/**
 * The marks a state can wear: the evidence's four (done, half way, failed,
 * open), and a dash for nothing to do. Words always sit beside one.
 */
export const Tone = S.Literals(['Good', 'Warning', 'Critical', 'Open', 'None'])
export type Tone = typeof Tone.Type

/** A tone's glyph, from the evidence's own marks. */
export const toneIcon = (tone: Tone): string =>
  M.value(tone).pipe(
    M.when('Good', () => evidenceIcon('Proven')),
    M.when('Warning', () => evidenceIcon('Landed')),
    M.when('Critical', () => evidenceIcon('Disproved')),
    M.when('Open', () => evidenceIcon('InProgress')),
    M.when('None', () => '–'),
    M.exhaustive,
  )

/** A tone's color, which never stands without its glyph and words. */
export const toneClass = (tone: Tone): string =>
  M.value(tone).pipe(
    M.when('Good', () => evidenceDotClass('Proven')),
    M.when('Warning', () => evidenceDotClass('Landed')),
    M.when('Critical', () => evidenceDotClass('Disproved')),
    M.whenOr('Open', 'None', () => evidenceDotClass('InProgress')),
    M.exhaustive,
  )

// PIPELINE

/** The machine's states an hour can have, in the order the legend shows them. */
export const HOUR_STATES: ReadonlyArray<HourState> = [
  'JustRight',
  'UnderUsed',
  'OverUsed',
  'Idle',
  'Unknown',
]

/** The machine's state in a word or two: `Under-used`. */
export const stateLabel = (state: MachineState): string =>
  M.value(state).pipe(
    M.when('JustRight', () => 'Just right'),
    M.when('UnderUsed', () => 'Under-used'),
    M.when('OverUsed', () => 'Overloaded'),
    M.when('Blocked', () => 'Blocked'),
    M.when('Idle', () => 'Nothing to build'),
    M.when('Unknown', () => 'Not measured'),
    M.exhaustive,
  )

/** The mark the machine's state wears. */
export const stateTone = (state: MachineState): Tone =>
  M.value(state).pipe(
    M.withReturnType<Tone>(),
    M.when('JustRight', () => 'Good'),
    M.when('UnderUsed', () => 'Warning'),
    M.whenOr('OverUsed', 'Blocked', () => 'Critical'),
    M.when('Idle', () => 'None'),
    M.when('Unknown', () => 'Open'),
    M.exhaustive,
  )

/** A measure against its target, in words: `On target`. */
export const measureStatusLabel = (status: MeasureStatus): string =>
  M.value(status).pipe(
    M.when('Met', () => 'On target'),
    M.when('Near', () => 'Close'),
    M.when('Missed', () => 'Missed'),
    M.when('NotMeasured', () => 'Not measured'),
    M.exhaustive,
  )

/** The mark a measure's status wears. */
export const measureStatusTone = (status: MeasureStatus): Tone =>
  M.value(status).pipe(
    M.withReturnType<Tone>(),
    M.when('Met', () => 'Good'),
    M.when('Near', () => 'Warning'),
    M.when('Missed', () => 'Critical'),
    M.when('NotMeasured', () => 'Open'),
    M.exhaustive,
  )

/** The mark a number against its budget wears. */
export const budgetStatusTone = (status: BudgetStatus): Tone =>
  M.value(status).pipe(
    M.withReturnType<Tone>(),
    M.when('Within', () => 'Good'),
    M.when('OverTarget', () => 'Warning'),
    M.when('OverFail', () => 'Critical'),
    M.when('NoBudget', () => 'Open'),
    M.exhaustive,
  )

/** Memory now, in plain words: `Short of memory`. */
export const memoryLabel = (pressure: MemoryPressure): string =>
  M.value(pressure).pipe(
    M.when('Normal', () => 'Enough memory'),
    M.when('Warning', () => 'Short of memory'),
    M.when('Critical', () => 'Very short of memory'),
    M.when('Unknown', () => 'Memory not measured'),
    M.exhaustive,
  )

/** The mark memory's state wears. */
export const memoryTone = (pressure: MemoryPressure): Tone =>
  M.value(pressure).pipe(
    M.withReturnType<Tone>(),
    M.when('Normal', () => 'Good'),
    M.when('Warning', () => 'Warning'),
    M.when('Critical', () => 'Critical'),
    M.when('Unknown', () => 'Open'),
    M.exhaustive,
  )

/** Where a CPU user's work came from, in words. */
export const consumerKindLabel = (kind: ConsumerKind): string =>
  M.value(kind).pipe(
    M.when('Queue', () => 'from the queue'),
    M.when('Outside', () => 'outside the queue'),
    M.when('Standing', () => 'always running'),
    M.when('Other', () => 'other'),
    M.exhaustive,
  )

const exporterNameOf = (state: MachineState): string =>
  M.value(state).pipe(
    M.when('OverUsed', () => 'Over-used'),
    M.when('Idle', () => 'Idle'),
    M.when('Unknown', () => 'Not known'),
    M.orElse(stateLabel),
  )

/**
 * The headline under the verdict's word, without saying that word again,
 * whether the exporter began it with the page's word or with its own.
 *
 * @example
 * ```ts
 * headlineAfterState('UnderUsed', 'Under-used: 10 builds are waiting.')
 * // '10 builds are waiting.'
 * ```
 */
export const headlineAfterState = (
  state: MachineState,
  headline: string,
): string => {
  const said = String.toLowerCase(headline)
  return pipe(
    [stateLabel(state), exporterNameOf(state)],
    Array.map(name => `${String.toLowerCase(name)}: `),
    Array.findFirst(prefix => String.startsWith(prefix)(said)),
    Option.match({
      onNone: () => headline,
      onSome: prefix =>
        String.capitalize(String.slice(prefix.length)(headline)),
    }),
  )
}

/**
 * Presence as a sentence to him. The file's minutes are how long the queue
 * has counted him so, which starts 25 minutes after his last sign when he
 * is away, so the sentence never calls them how long he has been gone.
 *
 * @example
 * ```ts
 * presenceSentence(presence)
 * // 'The queue has counted you as away for 1 h 38 min.'
 * ```
 */
export const presenceSentence = (presence: Presence): string => {
  if (presence.state === 'Unknown') {
    return 'Whether you are here is not known.'
  }
  const where = presence.state === 'Present' ? 'here' : 'away'
  return Option.match(presence.maybeSinceMinutes, {
    onNone: () => `The queue counts you as ${where}.`,
    onSome: minutes =>
      Math.round(minutes) === 0
        ? `The queue has just counted you as ${where}.`
        : `The queue has counted you as ${where} for ${formatSpan(minutes)}.`,
  })
}

/** How many builds may run at once now, as a sentence. */
export const placesSentence = (presence: Presence): string =>
  Option.match(presence.maybePlaces, {
    onNone: () => 'How many builds may run at once is not known.',
    onSome: places => `Up to ${counted(places, 'build')} may run at once now.`,
  })

/**
 * The shares as one sentence. Nothing to build and Not measured are named
 * only when they hold any of the window.
 */
export const sharesSentence = (shares: Shares): string => {
  const share = (words: string) => (pct: number) =>
    `${words} ${formatNumber(pct, 0)}%`
  const isAny = (pct: number): boolean => pct > 0
  return Option.match(shares.maybeJustRightPct, {
    onNone: () => `How the ${shares.window} were shared is not measured.`,
    onSome: pct => {
      const parts = [
        `${share('Just right')(pct)} of the ${shares.window}`,
        ...Array.getSomes([
          Option.map(
            shares.maybeUnderUsedPct,
            share('idle with builds waiting'),
          ),
          Option.map(shares.maybeOverUsedPct, share('overloaded')),
          pipe(
            shares.maybeIdlePct,
            Option.filter(isAny),
            Option.map(share('nothing to build')),
          ),
          pipe(
            shares.maybeUnknownPct,
            Option.filter(isAny),
            Option.map(share('not measured')),
          ),
        ]),
      ]
      return `${Array.join(parts, ', ')}.`
    },
  })
}

const waitingClassWords = (waitingClass: WaitingClass): string => {
  const { class: name, count } = waitingClass
  return M.value(name).pipe(
    M.when('main', () => counted(count, 'landing check')),
    M.when('release', () => counted(count, 'release')),
    M.orElse(() => `${count} ${name}`),
  )
}

/** Builds waiting, split by class: `10 (4 P0, 6 P1)`. */
export const waitingWords = (
  waiting: number,
  classes: ReadonlyArray<WaitingClass>,
): string =>
  Array.match(classes, {
    onEmpty: () => formatNumber(waiting, 0),
    onNonEmpty: each =>
      `${formatNumber(waiting, 0)} (${Array.join(
        Array.map(each, waitingClassWords),
        ', ',
      )})`,
  })

/** A metric's plain name, without the technical one in parentheses after it. */
export const plainMetricLabel = (label: string): string =>
  label.replace(/ \(.+\)$/, '')

// LOOKUP

/** A build's number for one metric in one scope, if the export holds one. */
export const buildValue = (
  build: Build,
  scope: Scope,
  metricId: string,
): Option.Option<Value> => Option.fromNullishOr(build.scopes[scope][metricId])

export const findApp = (index: Index, appId: string): Option.Option<App> =>
  Array.findFirst(index.apps, app => app.id === appId)

export const findMetric = (
  index: Index,
  metricId: string,
): Option.Option<Metric> =>
  Array.findFirst(index.metrics, metric => metric.id === metricId)

/** How many of an app's builds have a measured number for any metric in a scope. */
export const measuredBuildCount = (app: App, scope: Scope): number =>
  Array.filter(app.builds, build =>
    Array.some(
      Object.values(build.scopes[scope]),
      value => value._tag === 'Measured',
    ),
  ).length
