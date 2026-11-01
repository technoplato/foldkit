import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  type IssueStatus,
  IssueWorkLogEntry,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { ObservedIssue, observedIssuesOf } from './message.js'
import { type Model } from './model.js'
import { issuesScreen } from './program.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const CATALOG_SIZE = 1_500
const RECORDING_COUNT = 60
const WORK_LOG_LENGTH = 10
const OPENED_WORK_LOG_LENGTH = 250
const BUDGET_MS = 8
const RUNS = 5
const FIRST_RECORDING_NUMBER = 180
const LINE_SPACING = 7
const MENTIONS_PER_ISSUE = 3
const LINKS_PER_MENTION = 3

const STATUSES: ReadonlyArray<IssueStatus> = [
  'Open',
  'InProgress',
  'PartiallyDone',
  'VerificationNeeded',
  'Fixed',
  'Closed',
  'Planned',
]

const recordingIdAt = (index: number): string =>
  `faa684c2-34e4-47e5-8f9b-${(index % RECORDING_COUNT).toString().padStart(12, '0')}`

const sectionIdAt = (index: number, step: number, link: number): string =>
  `8d70b597-a775-41d8-b688-${(index * 100 + step * 10 + link).toString().padStart(12, '0')}`

const recordingNumberAt = (index: number): number =>
  FIRST_RECORDING_NUMBER + (index % RECORDING_COUNT)

const PADDING =
  'He wants the tracker to open on the words he said and the build that shipped them, measured as Linear would, without retyping anything an agent already wrote down. '

const summaryAt = (index: number, step: number): string =>
  `Step ${step.toString()}: green 9be70b4a8 for build 214 after #1358 and #${(index + 1).toString()}; ` +
  `asked in Recording ${recordingNumberAt(index).toString()} #${(step * LINE_SPACING).toString()}. ${PADDING.repeat(4)}`

const mentionAt = (index: number, step: number): IssueMention =>
  IssueMention.make({
    capturedAtMs: Option.some(1_790_000_000_000 + step),
    directQuote: Option.some(
      `Recording ${recordingNumberAt(index).toString()} (${recordingIdAt(index)}) #${(step * LINE_SPACING).toString()}: ${PADDING.repeat(3)}`,
    ),
    id: `mention-${index.toString()}-${step.toString()}`,
    issueId: (index + 1).toString().padStart(4, '0'),
    related: Array.makeBy(LINKS_PER_MENTION, link =>
      UriReference.make({
        value: `https://words.pisspoursoftware.xyz/recording/${recordingIdAt(index)}/section/${sectionIdAt(index, step, link)}?t=14287.00`,
      }),
    ),
    reporter: Option.none(),
    source: RecordingReference.make({
      recording: RecordingMention.make({
        endMilliseconds: Option.none(),
        recordingId: recordingIdAt(index),
        screenshotIds: [],
        startMilliseconds: 14_287_000,
      }),
    }),
  })

const issueAt = (index: number): Issue =>
  Issue.make({
    area: Option.some('Recording / transcript'),
    attachments: [],
    claimantId: Option.some(`claude-code/agent-${index.toString()}@ld`),
    complexity: Option.none(),
    createdAtMs: 1_790_000_000_000 + index,
    details: `Issue ${index.toString()} asks for #1358 to stay fast. ${PADDING.repeat(6)}`,
    evidenceLogQueries: [],
    id: (index + 1).toString().padStart(4, '0'),
    issueType: Option.some('defect'),
    mentions: Array.makeBy(MENTIONS_PER_ISSUE, step => mentionAt(index, step)),
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: Option.getOrElse(
      Array.get(STATUSES, index % STATUSES.length),
      () => 'Open',
    ),
    successCriteria: [],
    title: `A title for Issue ${index.toString()}`,
    updatedAtMs: 1_790_000_000_000 + index,
    viewerURL: Option.none(),
    workLog: Array.makeBy(
      index === 0 ? OPENED_WORK_LOG_LENGTH : WORK_LOG_LENGTH,
      step =>
        IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/agent@ld'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-${index.toString()}-${step.toString()}`,
          occurredAtMs: 1_790_000_000_000 + step,
          state: Option.some('progress'),
          summary: summaryAt(index, step),
        }),
    ),
  })

const catalog = Array.makeBy(CATALOG_SIZE, issueAt)

const changedCatalogs = Array.makeBy(RUNS, run =>
  Array.map(catalog, (issue, index) =>
    index === 7 + run
      ? Issue.make({ ...issue, updatedAtMs: issue.updatedAtMs + 1 })
      : issue,
  ),
)

const loadedAt = (path: string): Model => {
  const navigated = modelForNavigation(pathToNavigation(path))
  const loaded = update(navigated, observedIssuesOf(catalog))[0]
  return Option.match(Array.get(catalog, 0), {
    onNone: () => loaded,
    onSome: first =>
      update(
        loaded,
        ObservedIssue.make({ issue: Option.some(first), issueId: first.id }),
      )[0],
  })
}

const fastestLiveChangeMs = (path: string): number => {
  const loaded = loadedAt(path)
  issuesScreen(loaded)
  return Math.min(
    ...Array.map(changedCatalogs, changed => {
      const startedAt = performance.now()
      issuesScreen(update(loaded, observedIssuesOf(changed))[0])
      return performance.now() - startedAt
    }),
  )
}

describe('what a page costs to paint again after a live change, with 1,500 Issues loaded', () => {
  it("paints a Recording's page again without reading every Issue's text", () => {
    expect(
      fastestLiveChangeMs(`/recordings/${recordingIdAt(28)}`),
    ).toBeLessThan(BUDGET_MS)
  })

  it("paints an Issue's page again without rebuilding every index", () => {
    expect(fastestLiveChangeMs('/issues/0001')).toBeLessThan(BUDGET_MS)
  })

  it("paints a product's page again without listing all its Issues", () => {
    expect(fastestLiveChangeMs('/products/scribe')).toBeLessThan(BUDGET_MS)
  })
})
