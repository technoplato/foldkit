import { Array, Match as M, Option, String, pipe } from 'effect'

import type { BudgetStatus } from '../chart'
import type {
  App,
  Build,
  EvidenceTag,
  Index,
  Metric,
  Scope,
  Value,
  Verdict,
} from '../data'

// CONSTANT

const SHORT_SHA_LENGTH = 9
const TIME_ZONE = 'America/New_York'

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

/** An ISO time as he reads it, in New York: `Nov 5, 11:31 AM`. */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  } else {
    return date.toLocaleString('en-US', {
      timeZone: TIME_ZONE,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
}

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
