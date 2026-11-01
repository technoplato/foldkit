import { Array, Option } from 'effect'
import { textsOf } from 'foldkit/renderers'
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

import {
  AgentEntity,
  FeatureEntity,
  ProductEntity,
  RecordingEntity,
} from './entityGraph.js'
import {
  agentChipsOf,
  agentFactsOf,
  featureChipsOf,
  featureFactsOf,
  featuresOf,
  findingsOf,
  issueGraphOf,
  productFactsOf,
} from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { recordingFactsOf } from './issueLandings.js'
import {
  type Message,
  ObservedAgentChips,
  ObservedFeatureChips,
  ObservedFeatures,
  ObservedFindings,
  ObservedIssue,
  ObservedIssueGraph,
  ObservedPageFacts,
  TickedClock,
  observedIssuesOf,
} from './message.js'
import { type Model } from './model.js'
import { agentHandlesOfPage } from './pageAgents.js'
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
const RELATED_PER_ISSUE = 3

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
    relatedIssueIds: Array.makeBy(RELATED_PER_ISSUE, step =>
      (((index + step * LINE_SPACING) % CATALOG_SIZE) + 1)
        .toString()
        .padStart(4, '0'),
    ),
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

const NOW_MS = 1_790_100_000_000
const FINDING_COUNT = 450
const FEATURE_COUNT = 37
const RUN_COUNT = 60

const storedFinding = (index: number) => ({
  agentID: `claude-code/agent-${(index % 200).toString()}@ld`,
  id: `finding-${index.toString()}`,
  issueNumber: (index % CATALOG_SIZE) + 1,
  kind: 'environment',
  occurredAtMs: 1_790_000_000_000 + index,
  quote: `Step ${index.toString()} stopped at 9be70b4a8 for #1358. ${PADDING.repeat(2)}`,
  sessionID: '2914b977-312b-4d93-a41c-4681d1255fe1',
  source: 'agentRunStop',
  status: 'open',
})

const storedLine = (index: number) => ({
  id: `line-${index.toString()}`,
  isDraft: false,
  issueNumbersJSON: '[410,694]',
  name: `Line ${index.toString()}.`,
  number: index + 1,
  productSlug: 'scribe',
  slug: `line-${index.toString()}`,
  sourceCommitSha: 'a'.repeat(40),
  sourceCommittedAtMs: 1_790_000_000_000,
  status: 'active',
  text: `The words of line ${index.toString()}, citing #410 and #694. ${PADDING}`,
})

const storedRun = (index: number) => ({
  account: 'ld',
  agentID: `claude-code/agent-${index.toString()}@ld`,
  harness: 'claude-code',
  id: `run-${index.toString()}`,
  issueNumber: index + 1,
  kind: 'subagent',
  model: 'claude-opus-5-5',
  name: `agent-${index.toString()}`,
  startedAtMs: 1_790_000_000_000,
  status: 'done',
})

const opened = (path: string, ...messages: ReadonlyArray<Message>): Model =>
  [
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ...messages,
  ].reduce((model, message) => update(model, message)[0], loadedAt(path))

const fastestRepaintMs = (model: Model): number => {
  issuesScreen(model)
  return Math.min(
    ...Array.map(changedCatalogs, changed => {
      const startedAt = performance.now()
      issuesScreen(update(model, observedIssuesOf(changed))[0])
      return performance.now() - startedAt
    }),
  )
}

const fastestDependenciesMs = (model: Model): number =>
  Math.min(
    ...Array.makeBy(RUNS, () => {
      const startedAt = performance.now()
      agentHandlesOfPage(model)
      return performance.now() - startedAt
    }),
  )

const findings = findingsOf({
  agentFindings: Array.makeBy(FINDING_COUNT, storedFinding),
})

const findingsPage = opened('/findings', ObservedFindings.make({ findings }))

const agentEntity = AgentEntity.make({ agentId: 'claude-code/agent-7@ld' })
const agentPage = opened(
  `/agents/${encodeURIComponent(agentEntity.agentId)}`,
  ObservedPageFacts.make({
    entity: agentEntity,
    facts: agentFactsOf({
      agentRuns: [
        {
          ...storedRun(7),
          children: Array.makeBy(RUN_COUNT, storedRun),
          findings: Array.makeBy(20, storedFinding),
          issueNumbersJSON: JSON.stringify(
            Array.makeBy(40, index => index + 1),
          ),
          sessions: [],
        },
      ],
    }),
  }),
)

const featureEntity = FeatureEntity.make({ slug: 'line-3' })
const featurePage = opened(
  '/features/line-3',
  ObservedPageFacts.make({
    entity: featureEntity,
    facts: Option.getOrThrow(
      featureFactsOf({
        features: [
          {
            ...storedLine(3),
            edges: Array.makeBy(40, index => ({
              basis: 'tracker',
              issueNumber: index + 1,
              predicate: index < 5 ? 'implements' : 'touches',
            })),
          },
        ],
      }),
    ),
  }),
)

const featuresPage = opened(
  '/features',
  ObservedFeatures.make({
    features: featuresOf({
      features: Array.makeBy(FEATURE_COUNT, storedLine),
    }),
  }),
)

const productEntity = ProductEntity.make({ productId: 'scribe' })
const productPage = opened(
  '/products/scribe',
  ObservedFeatureChips.make({
    features: featureChipsOf({
      features: Array.makeBy(FEATURE_COUNT, storedLine),
    }),
  }),
  ObservedPageFacts.make({
    entity: productEntity,
    facts: productFactsOf(
      {
        builds: Array.makeBy(216, index => ({ number: index + 1 })),
        projects: [
          {
            features: Array.makeBy(FEATURE_COUNT, storedLine),
            productKind: 'Application',
            slug: 'scribe',
            title: 'Scribe',
          },
        ],
      },
      {
        products: {
          scribe: {
            modules: Array.makeBy(172, index => ({
              id: `scribe:module-${index.toString()}`,
              name: `Module${index.toString()}`,
            })),
            platforms: ['iOS'],
            repos: ['scribe'],
            surfaces: Array.makeBy(34, index => ({
              id: `scribe:surface-${index.toString()}`,
              name: `Surface${index.toString()}`,
            })),
          },
        },
      },
      'scribe',
    ),
  }),
)

const issuePage = opened(
  '/issues/0001',
  ObservedAgentChips.make({
    runs: agentChipsOf({ agentRuns: Array.makeBy(RUN_COUNT, storedRun) }),
  }),
  ObservedIssueGraph.make({
    graph: issueGraphOf({
      agentFindings: Array.makeBy(20, storedFinding),
      edges: [],
    }),
    issueId: '0001',
  }),
)

const RECORDING_ISSUE_COUNT = 100
const MOMENTS_PER_RECORDING_ISSUE = 3
const FIRST_RECORDING_ISSUE = 1_100
const CHANGED_ISSUE_ID = (FIRST_RECORDING_ISSUE + 3).toString()

const storedRecordingMoment = (index: number) => {
  const issueIndex = Math.floor(index / MOMENTS_PER_RECORDING_ISSUE)
  return {
    firstLineIndex: index * LINE_SPACING,
    id: `moment-${index.toString()}`,
    kind: index % 11 === 0 ? 'seen' : 'said',
    lastLineIndex: index * LINE_SPACING + 2,
    role: index % MOMENTS_PER_RECORDING_ISSUE === 0 ? 'introduced' : 'refined',
    segmentID: sectionIdAt(index, 0, 0),
    startSeconds: index * LINE_SPACING * 4.5,
    startedAtMs: 1_780_000_000_000 + index,
    trackedIssue: [
      {
        createdAtMs: 1_790_000_000_000,
        id: `issue-row-${issueIndex.toString()}`,
        number: FIRST_RECORDING_ISSUE + issueIndex + 1,
      },
    ],
  }
}

const recordingEntity = RecordingEntity.make({ recordingId: recordingIdAt(28) })

const recordingPage = opened(
  `/recordings/${recordingEntity.recordingId}`,
  ObservedPageFacts.make({
    entity: recordingEntity,
    facts: recordingFactsOf({
      recordings: [
        {
          durationSeconds: 19_176,
          id: recordingEntity.recordingId,
          startedAtMs: 1_780_000_000_000,
          title: 'Recording 208',
        },
      ],
      sourceMoments: Array.makeBy(
        RECORDING_ISSUE_COUNT * MOMENTS_PER_RECORDING_ISSUE,
        storedRecordingMoment,
      ),
    }),
  }),
)

const rowOfIssue = (model: Model, issueId: string) =>
  Option.getOrThrow(
    Array.findFirst(textsOf(issuesScreen(model)), text =>
      text.content.startsWith(`#${issueId}`),
    ),
  )

describe('what a Recording’s moments cost, with 1,500 Issues loaded', () => {
  const afterLiveChange = (index: number): Model =>
    update(
      recordingPage,
      observedIssuesOf(
        Array.map(catalog, issue =>
          issue.id === CHANGED_ISSUE_ID
            ? Issue.make({
                ...issue,
                title: `${issue.title} ${index.toString()}`,
              })
            : issue,
        ),
      ),
    )[0]

  it('paints 100 Issues and 300 moments again', () => {
    expect(fastestRepaintMs(recordingPage)).toBeLessThan(BUDGET_MS)
  })

  it('keeps the Facts it read across a live change elsewhere', () => {
    expect(afterLiveChange(1).pageFacts).toBe(recordingPage.pageFacts)
  })

  it('derives no row again for an Issue that did not change', () => {
    const before = afterLiveChange(1)
    const after = afterLiveChange(2)
    const unchangedId = (FIRST_RECORDING_ISSUE + 4).toString()
    expect(rowOfIssue(before, unchangedId)).toBe(
      rowOfIssue(before, unchangedId),
    )
    expect(rowOfIssue(after, unchangedId)).toBe(rowOfIssue(before, unchangedId))
  })

  it('shows the live change on the row of the Issue that changed', () => {
    expect(rowOfIssue(afterLiveChange(2), CHANGED_ISSUE_ID).content).toContain(
      `Issue ${(FIRST_RECORDING_ISSUE + 2).toString()} 2`,
    )
  })
})

describe('what a graph page costs to paint again after a live change, with 1,500 Issues loaded', () => {
  it('paints all 450 findings again without reading what did not change', () => {
    expect(fastestRepaintMs(findingsPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints an agent's page again", () => {
    expect(fastestRepaintMs(agentPage)).toBeLessThan(BUDGET_MS)
  })

  it('paints all 37 lines of /features again', () => {
    expect(fastestRepaintMs(featuresPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints a feature's page again", () => {
    expect(fastestRepaintMs(featurePage)).toBeLessThan(BUDGET_MS)
  })

  it("paints a product's page with its rows and map again", () => {
    expect(fastestRepaintMs(productPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints an Issue's page with its runs and findings again", () => {
    expect(fastestRepaintMs(issuePage)).toBeLessThan(BUDGET_MS)
  })
})

describe('what a Message costs a graph page', () => {
  const MESSAGE_BUDGET_MS = 1

  it('names a page’s handles without walking its rows again', () => {
    expect(fastestDependenciesMs(findingsPage)).toBeLessThan(MESSAGE_BUDGET_MS)
    expect(fastestDependenciesMs(issuePage)).toBeLessThan(MESSAGE_BUDGET_MS)
    expect(fastestDependenciesMs(productPage)).toBeLessThan(MESSAGE_BUDGET_MS)
    expect(fastestDependenciesMs(agentPage)).toBeLessThan(MESSAGE_BUDGET_MS)
  })
})

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

  it('paints the board again, 1,500 cards in their columns', () => {
    expect(fastestLiveChangeMs('/issues?view=board')).toBeLessThan(BUDGET_MS)
  })

  it('paints the inbox again, reading only the Issue that changed', () => {
    expect(fastestLiveChangeMs('/inbox')).toBeLessThan(BUDGET_MS)
  })

})

const ASK_STEP_STATES = [
  'claimed',
  'planned',
  'red',
  'pushed',
  'merged',
  'verified',
]

const askedIssueAt = (index: number): Issue => {
  const issue = issueAt(index)
  return Issue.make({
    ...issue,
    workLog: [
      ...Array.map(ASK_STEP_STATES, (state, step) =>
        IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/agent@ld'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-${index.toString()}-${state}`,
          occurredAtMs:
            issue.createdAtMs + (step + 1) * 60_000 * ((index % 97) + 1),
          state: Option.some(state),
          summary: `${state} for #${(index + 1).toString()}.`,
        }),
      ),
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code/agent@ld'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${index.toString()}-green`,
        occurredAtMs: issue.createdAtMs + 7 * 60_000 * ((index % 89) + 1),
        state: Option.some('progress'),
        summary: `Green 9be70b4a8 for #${(index + 1).toString()}.`,
      }),
    ],
  })
}

const askedCatalog = Array.makeBy(CATALOG_SIZE, askedIssueAt)

describe('what how long asks take costs, with 1,500 Issues each at every step', () => {
  it('paints /asks again after a live change, working out only the Issue that changed', () => {
    const loaded = update(
      opened('/asks'),
      observedIssuesOf(askedCatalog),
    )[0]
    issuesScreen(loaded)
    const fastestMs = Math.min(
      ...Array.makeBy(RUNS, run => {
        const changed = Array.map(askedCatalog, (issue, index) =>
          index === 7 + run
            ? Issue.make({ ...issue, updatedAtMs: issue.updatedAtMs + 1 })
            : issue,
        )
        const startedAt = performance.now()
        issuesScreen(update(loaded, observedIssuesOf(changed))[0])
        return performance.now() - startedAt
      }),
    )
    expect(fastestMs).toBeLessThan(BUDGET_MS)
  })
})
