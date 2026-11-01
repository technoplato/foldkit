import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import {
  agentChipsOf,
  agentChipsQuery,
  issueGraphOf,
  issueGraphQuery,
} from './graphFacts.js'
import { modelForNavigation } from './init.js'
import {
  FailedObserveIssueGraph,
  ObservedAgentChips,
  ObservedIssue,
  ObservedIssueGraph,
  ObservedIssues,
  TickedClock,
} from './message.js'
import { IssueDetail, type Model } from './model.js'
import { agentHandlesOfPage, runsOfIssue } from './pageAgents.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const WROTE_AT_MS = Date.parse('2026-11-01T14:00:00Z')
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const HANDLE = 'claude-code/issues-linear-1538@al'

const storedGraph = {
  agentFindings: [
    {
      agentID: HANDLE,
      id: '1adc23b2-451d-5dd5-9cf9-3b79405661fe',
      issueNumber: 1538,
      kind: 'environment',
      occurredAtMs: WROTE_AT_MS,
      quote: 'The socket went deaf at 12:33.',
      source: 'agentRunStop',
      status: 'open',
    },
  ],
  edges: [
    {
      basis: 'git',
      feature: [
        {
          id: 'a',
          isDraft: false,
          name: 'Scroll back, always.',
          number: 3,
          productSlug: 'scribe',
          slug: 'scroll-back-always',
          status: 'active',
        },
      ],
      note: 'docs/FEATURES.md cites #1538 on Scroll back, always. at 5a705a89d',
      predicate: 'implements',
    },
    {
      basis: 'tracker',
      feature: [
        {
          id: 'a',
          isDraft: false,
          name: 'Scroll back, always.',
          number: 3,
          productSlug: 'scribe',
          slug: 'scroll-back-always',
          status: 'active',
        },
      ],
      note: "#1538's details names FEATURES 3, Scroll back, always., as of 521edbfdb",
      predicate: 'touches',
    },
  ],
}

const issue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: WROTE_AT_MS,
  details: '',
  evidenceLogQueries: [],
  id: '1538',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'An issues site',
  updatedAtMs: WROTE_AT_MS,
  viewerURL: Option.none(),
  workLog: [
    IssueWorkLogEntry.make({
      agentId: Option.some(HANDLE),
      commitSha: Option.none(),
      durationSeconds: Option.none(),
      id: 'work-1538-1',
      occurredAtMs: WROTE_AT_MS,
      state: Option.some('progress'),
      summary: 'Green.',
    }),
  ],
})

const storedRun = {
  account: 'al',
  agentID: HANDLE,
  effort: 'max',
  endedAtMs: WROTE_AT_MS + HOUR_MS,
  harness: 'claude-code',
  id: 'the-run',
  kind: 'headless',
  model: 'claude-opus-5-5',
  name: 'issues-linear-1538',
  startedAtMs: WROTE_AT_MS - HOUR_MS,
  status: 'stopped',
}

const runs = agentChipsOf({
  agentRuns: [
    storedRun,
    {
      ...storedRun,
      agentID: 'claude-code/issues-linear-1538@ld',
      endedAtMs: WROTE_AT_MS - 40 * DAY_MS,
      id: 'an-old-run-of-the-name',
      startedAtMs: WROTE_AT_MS - 41 * DAY_MS,
    },
    {
      ...storedRun,
      agentID: 'claude-code/started-for-it@ld',
      endedAtMs: WROTE_AT_MS - 9 * DAY_MS,
      id: 'started-for-this-issue',
      issueNumber: 1538,
      name: 'started-for-it',
      startedAtMs: WROTE_AT_MS - 10 * DAY_MS,
    },
    {
      agentID: 'grok-claimant',
      harness: 'grok',
      id: 'a-name-with-no-run',
      kind: 'claimant',
      name: 'issues-linear-1538',
      status: 'unknown',
    },
  ],
})

const graph = issueGraphOf(storedGraph)

const page = (): Model =>
  [
    TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
    ObservedIssues.make({ issues: [issue] }),
    ObservedIssue.make({ issue: Option.some(issue), issueId: '1538' }),
    ObservedIssueGraph.make({ graph, issueId: '1538' }),
    ObservedAgentChips.make({ runs }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(IssueDetail.make({ issueId: '1538' })),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

describe('what an Issue’s page reads of the graph', () => {
  it('asks its features by indexed issueNumber, and its findings raised or promoted', () => {
    const { agentFindings, edges } = issueGraphQuery(1538)
    expect(edges.$.where).toEqual({ issueNumber: 1538, objectKind: 'feature' })
    expect(agentFindings.$.where).toEqual({
      or: [{ issueNumber: 1538 }, { promotedIssueNumber: 1538 }],
    })
  })

  it('reads each feature once, its strongest tie first', () => {
    expect(
      Array.map(graph.features, ({ feature, predicate }) => [
        feature.slug,
        predicate,
      ]),
    ).toEqual([['scroll-back-always', 'implements']])
  })

  it('asks runs for the Issue too, not only for the handles it names', () => {
    expect(agentChipsQuery([HANDLE], 1538).agentRuns.$.where).toEqual({
      or: [
        { agentID: { $in: [HANDLE] } },
        { name: { $in: ['issues-linear-1538'] } },
        { issueNumber: 1538 },
      ],
    })
  })

  it('names the handles the Issue’s work log holds', () => {
    expect(agentHandlesOfPage(page())).toEqual([HANDLE])
  })
})

describe('an Issue’s page at a glance', () => {
  it('shows its app and features as chips, from the rows', () => {
    const chips = chipsOf(page())
    expect(
      chips.some(
        chip => chip.kind === 'Product' && chip.href === '/products/scribe',
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Feature' &&
          chip.label === 'Scroll back, always.' &&
          chip.state === 'active' &&
          chip.href === '/features/scroll-back-always',
      ),
    ).toBe(true)
  })

  it('lists every run that worked on it, with its account and model', () => {
    const contents = contentsOf(page())
    expect(contents).toContain('Runs: 2')
    expect(contents).toContainEqual(
      expect.stringContaining('al  ·  claude-opus-5-5  ·  max'),
    )
    expect(
      chipsOf(page()).some(
        chip =>
          chip.kind === 'Agent' &&
          chip.state === 'stopped' &&
          chip.href === `/agents/${encodeURIComponent(HANDLE)}`,
      ),
    ).toBe(true)
  })

  it('keeps a run of the same name from another month, and a bare name, out', () => {
    expect(Array.map(runsOfIssue(issue, runs), run => run.runId)).toEqual([
      'the-run',
      'started-for-this-issue',
    ])
  })

  it('lists the findings raised on it', () => {
    const contents = contentsOf(page())
    expect(contents).toContain('Findings: 1')
    expect(contents).toContainEqual(
      expect.stringContaining('The socket went deaf at 12:33.'),
    )
  })

  it('says why when the rows could not be read, and keeps the rest', () => {
    const [failed] = update(
      page(),
      FailedObserveIssueGraph.make({ issueId: '1538', reason: 'Refused' }),
    )
    expect(contentsOf(failed)).toContainEqual(
      expect.stringContaining('Refused'),
    )
    expect(contentsOf(failed)).toContain('An issues site')
  })

  it('ignores the graph of an Issue no longer open', () => {
    const [ignored] = update(
      modelForNavigation(IssueDetail.make({ issueId: '0041' })),
      ObservedIssueGraph.make({ graph, issueId: '1538' }),
    )
    expect(ignored.issueGraph._tag).toBe('NotObservingIssueGraph')
  })
})
