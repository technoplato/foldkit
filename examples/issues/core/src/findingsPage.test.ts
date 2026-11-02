import { Array, Effect, Layer, Option, Stream } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { FindingEntity } from './entityGraph.js'
import {
  type AgentFinding,
  findingFactsOf,
  findingFactsQuery,
  findingsOf,
  findingsQuery,
} from './graphFacts.js'
import { GraphRows, NoGraphRows } from './graphRows.js'
import { modelForNavigation } from './init.js'
import { IssueLandingError } from './issueLandings.js'
import {
  ClickedPromoteFinding,
  FailedMarkFindingPromoted,
  FailedObserveFindings,
  ObservedFindings,
  ObservedIssues,
  ObservedPageFacts,
  ObservedProducts,
  OpenedNavigation,
  SubmittedIssue,
  SucceededMarkFindingPromoted,
  SucceededFileIssueDraft,
  TickedClock,
} from './message.js'
import {
  EntityPage,
  FileIssue,
  FindingFilter,
  Findings,
  type Model,
} from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { MarkFindingPromoted, update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const SAID_AT_MS = Date.parse('2026-11-01T14:00:00Z')
const SESSION_ID = '2914b977-312b-4d93-a41c-4681d1255fe1'
const FINDING_ID = '1adc23b2-451d-5dd5-9cf9-3b79405661fe'
const HANDLE = 'claude-code/issues-linear-1538@al'
const COMMIT_SHA = 'a020bb4735690e424fba8421749bdf32eb0c3c33'

const storedOpen = {
  agentID: HANDLE,
  deepLink: 'https://issues.pisspoursoftware.xyz/issues/1538#work-1538-1',
  id: FINDING_ID,
  issueNumber: 1538,
  kind: 'environment',
  occurredAtMs: SAID_AT_MS,
  quote: 'The socket went deaf at 12:33. Nothing reconnected it.',
  sessionID: SESSION_ID,
  source: 'agentRunStop',
  status: 'open',
}

const storedFixed = {
  agentID: 'claude-code/recording-1200@ld',
  fix: 'Always read the worktree’s branch first.',
  fixCommitSha: COMMIT_SHA,
  id: '8a3c972c-f1ef-5ca1-a483-6e81534c61c9',
  issueNumber: 41,
  kind: 'mistake',
  occurredAtMs: SAID_AT_MS - 86_400_000,
  quote: 'Mistake (mine): I edited the main checkout.',
  source: 'workLogMistake',
  status: 'fixed',
}

const storedPromoted = {
  id: '5db9eae6-5754-5308-afae-87f8925f9309',
  kind: 'product',
  occurredAtMs: SAID_AT_MS - 2 * 86_400_000,
  promotedIssueNumber: 1538,
  quote: 'Found while reading the writes: a final rewrites its summary.',
  source: 'workLogFoundWhile',
  status: 'promoted',
}

const findings = findingsOf({
  agentFindings: [storedFixed, storedOpen, storedPromoted],
})

const blank = (id: string, title: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: SAID_AT_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'foldkit', name: 'Foldkit' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title,
    updatedAtMs: SAID_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [blank('1538', 'An issues site'), blank('041', 'Old defect')]

const scribe = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  updatedAtMs: SAID_AT_MS,
})
const foldkit = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'foldkit', name: 'Foldkit' }),
  updatedAtMs: SAID_AT_MS,
})

const listAt = (
  filter: typeof FindingFilter.Type,
  rows: ReadonlyArray<AgentFinding> = findings,
): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    ObservedProducts.make({ products: [scribe, foldkit] }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedFindings.make({ findings: rows }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(Findings.make({ filter })),
  )

const noFilter = FindingFilter.make({
  maybeKind: Option.none(),
  maybeSource: Option.none(),
  maybeStatus: Option.none(),
})

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

describe('the findings a page reads', () => {
  it('asks for every finding’s scalars, with no link per row', () => {
    const { $, ...links } = findingsQuery.agentFindings
    expect($.order).toEqual({ occurredAtMs: 'desc' })
    expect('limit' in $).toBe(false)
    expect(Object.keys(links)).toEqual([])
  })

  it('reads a finding by its id, with its run', () => {
    expect(findingFactsQuery(FINDING_ID).agentFindings.$.where).toEqual({
      id: FINDING_ID,
    })
  })

  it('holds the newest first', () => {
    expect(Array.map(findings, finding => finding.findingId)).toEqual([
      storedOpen.id,
      storedFixed.id,
      storedPromoted.id,
    ])
  })
})

describe('/findings', () => {
  it('routes the list, its filters and one finding', () => {
    const path = '/findings?kind=mistake&source=workLogMistake&status=open'
    const navigation = pathToNavigation(path)
    expect(navigation).toEqual(
      Findings.make({
        filter: FindingFilter.make({
          maybeKind: Option.some('mistake'),
          maybeSource: Option.some('workLogMistake'),
          maybeStatus: Option.some('open'),
        }),
      }),
    )
    expect(navigationToPath(navigation)).toBe(path)
    expect(navigationToPath(Findings.make({}))).toBe('/findings')
    expect(pathToNavigation(`/findings/${FINDING_ID}`)).toEqual(
      EntityPage.make({
        entity: FindingEntity.make({ findingId: FINDING_ID }),
      }),
    )
  })

  it('counts them by kind, source and state, each a link that filters', () => {
    const chips = chipsOf(listAt(noFilter))
    const countOf = (href: string): Option.Option<string | undefined> =>
      Option.map(
        Array.findFirst(chips, chip => chip.href === href),
        chip => chip.title,
      )
    expect(countOf('/findings?kind=environment')).toEqual(Option.some('1'))
    expect(countOf('/findings?kind=mistake')).toEqual(Option.some('1'))
    expect(countOf('/findings?kind=product')).toEqual(Option.some('1'))
    expect(countOf('/findings?source=workLogMistake')).toEqual(Option.some('1'))
    expect(countOf('/findings?status=open')).toEqual(Option.some('1'))
    expect(contentsOf(listAt(noFilter))).toContainEqual(
      expect.stringContaining('3 findings'),
    )
  })

  it('lists every finding, with no cutoff', () => {
    const many = Array.makeBy(600, index =>
      findingsOf({
        agentFindings: [
          {
            ...storedOpen,
            id: `finding-${index.toString()}`,
            quote: `Words ${index.toString()}`,
          },
        ],
      }),
    ).flat()
    const contents = contentsOf(listAt(noFilter, many))
    expect(
      Array.filter(contents, content => content.startsWith('Words ')).length,
    ).toBe(600)
  })

  it('links each one’s run, session, Issue and fix, and shows its words', () => {
    const model = listAt(noFilter)
    const chips = chipsOf(model)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Agent' &&
          chip.href === `/agents/${encodeURIComponent(HANDLE)}`,
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Session' && chip.href === `/sessions/${SESSION_ID}`,
      ),
    ).toBe(true)
    expect(
      chips.some(chip => chip.kind === 'Issue' && chip.href === '/issues/1538'),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Commit' && chip.href === `/commits/${COMMIT_SHA}`,
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Finding' && chip.href === `/findings/${FINDING_ID}`,
      ),
    ).toBe(true)
    const contents = contentsOf(model)
    expect(contents).toContainEqual(
      expect.stringContaining('The socket went deaf at 12:33.'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('Always read the worktree’s branch first.'),
    )
  })

  it('narrows to a filter and keeps the whole counts', () => {
    const model = listAt({ ...noFilter, maybeKind: Option.some('mistake') })
    const contents = contentsOf(model)
    expect(contents).toContainEqual(
      expect.stringContaining('I edited the main checkout'),
    )
    expect(contents).not.toContainEqual(
      expect.stringContaining('The socket went deaf'),
    )
    expect(contents).toContainEqual(expect.stringContaining('1 of 3 findings'))
  })

  it('says why when the rows could not be read', () => {
    const [failed] = update(
      modelForNavigation(Findings.make({})),
      FailedObserveFindings.make({ reason: 'Permission denied' }),
    )
    expect(contentsOf(failed)).toContain(
      'Scribe’s rows could not be read: Permission denied',
    )
  })

  it('offers an open finding’s Issue, and shows the Issue of a promoted one', () => {
    const model = listAt(noFilter)
    expect(
      Option.isSome(
        messageForScreenToken(model, `promote-finding:${storedOpen.id}`),
      ),
    ).toBe(true)
    expect(
      chipsOf(model).some(
        chip => chip.kind === 'Issue' && chip.href === '/issues/1538',
      ),
    ).toBe(true)
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Promoted to'),
    )
  })
})

describe('a finding’s own page', () => {
  const entity = FindingEntity.make({ findingId: FINDING_ID })
  const facts = findingFactsOf({
    agentFindings: [
      {
        ...storedOpen,
        agentRun: [
          {
            agentID: HANDLE,
            harness: 'claude-code',
            id: 'run',
            name: 'issues-linear-1538',
            status: 'running',
          },
        ],
      },
    ],
  })

  it('shows its words, its run with state, and its date', () => {
    const model = [
      ObservedIssues.make({ issues: catalog }),
      TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
      ObservedPageFacts.make({ entity, facts: Option.getOrThrow(facts) }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(EntityPage.make({ entity })),
    )
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('The socket went deaf at 12:33.'),
    )
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('2026-11-01 09:00 (3 h ago)'),
    )
    expect(
      chipsOf(model).some(
        chip => chip.kind === 'Agent' && chip.state === 'running',
      ),
    ).toBe(true)
  })
})

describe('turning a finding into an Issue', () => {
  const filed = blank('1570', 'The socket went deaf at 12:33.')

  const promoted = (): Model =>
    update(
      listAt(noFilter),
      ClickedPromoteFinding.make({ findingId: FINDING_ID }),
    )[0]

  it('opens the filing form with its words, on its Issue’s product', () => {
    const model = promoted()
    expect(model.navigation).toEqual(FileIssue.make({}))
    expect(model.draft.title).toBe('The socket went deaf at 12:33.')
    expect(model.draft.details).toContain('Nothing reconnected it.')
    expect(model.draft.details).toContain(`/findings/${FINDING_ID}`)
    expect(model.draft.productId).toBe('foldkit')
    expect(model.draft.relatedIssueIds).toEqual(['1538'])
    expect(
      Array.map(model.draft.mentions, mention => mention.directQuote),
    ).toEqual([Option.some(storedOpen.quote)])
  })

  it('titles it without the kind an entry starts with, and says what it files', () => {
    const labeled = update(
      listAt(
        noFilter,
        findingsOf({
          agentFindings: [
            { ...storedOpen, quote: 'mistake: I edited the main checkout.' },
          ],
        }),
      ),
      ClickedPromoteFinding.make({ findingId: FINDING_ID }),
    )[0]
    expect(labeled.draft.title).toBe('I edited the main checkout.')
    expect(
      chipsOf(labeled).some(
        chip =>
          chip.kind === 'Finding' && chip.href === `/findings/${FINDING_ID}`,
      ),
    ).toBe(true)
  })

  it('files through the same path as any Issue, then marks the finding', () => {
    const [saving, commands] = update(promoted(), SubmittedIssue.make({}))
    expect(Array.map(commands, command => command.name)).toEqual(['FileIssueDraft'])
    const [opened, after] = update(
      saving,
      SucceededFileIssueDraft.make({
        issue: filed,
        maybeFindingId: Option.some(FINDING_ID),
      }),
    )
    expect(Array.map(after, command => command.name)).toContain(
      'MarkFindingPromoted',
    )
    expect(opened.maybeDraftFindingId).toEqual(Option.none())
  })

  it('marks the row through the graph, with the Issue’s number', async () => {
    const calls: Array<unknown> = []
    const graph = Layer.succeed(GraphRows, {
      ...NoGraphRows,
      markFindingPromoted: (findingId, issueNumber) =>
        Effect.sync(() => {
          calls.push({ findingId, issueNumber })
        }),
    })
    const result = await Effect.runPromise(
      MarkFindingPromoted({
        findingId: FINDING_ID,
        issueId: '1570',
      }).effect.pipe(Effect.provide(graph)),
    )
    expect(calls).toEqual([{ findingId: FINDING_ID, issueNumber: 1570 }])
    expect(result).toEqual(
      SucceededMarkFindingPromoted.make({
        findingId: FINDING_ID,
        issueId: '1570',
      }),
    )
  })

  it('says so when the row could not be marked, on the Issue it filed', async () => {
    const graph = Layer.succeed(GraphRows, {
      ...NoGraphRows,
      markFindingPromoted: () =>
        Effect.fail(new IssueLandingError({ cause: new Error('refused') })),
    })
    const result = await Effect.runPromise(
      MarkFindingPromoted({
        findingId: FINDING_ID,
        issueId: '1570',
      }).effect.pipe(Effect.provide(graph)),
    )
    expect(result).toEqual(
      FailedMarkFindingPromoted.make({
        findingId: FINDING_ID,
        issueId: '1570',
        reason: 'refused',
      }),
    )
    const [marked] = update(modelForNavigation(FileIssue.make({})), result)
    expect(marked.issueMutation._tag).toBe('FailedIssueMutation')
  })

  it('forgets the finding when the form is left', () => {
    const left = update(
      promoted(),
      OpenedNavigation.make({ navigation: Findings.make({}) }),
    )[0]
    expect(left.maybeDraftFindingId).toEqual(Option.none())
    expect(left.draft.title).toBe('')
  })

  it('keeps Stream empty where no host reads the graph', async () => {
    expect(
      await Effect.runPromise(Stream.runCollect(NoGraphRows.observeFindings)),
    ).toEqual([])
  })
})
