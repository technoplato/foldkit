import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { tokenForKeyPress } from './keys.js'
import {
  MovedRowCursor,
  ObservedIssues,
  OpenedCommandPalette,
  PeekedRowUnderCursor,
  UpdatedLeftoverComment,
  UpdatedMenuQuery,
  observedIssuesOf,
} from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const CATALOG_SIZE = 1_500
const WORK_LOG_LENGTH = 12
const BUDGET_MS = 8

const issueAt = (index: number): Issue =>
  Issue.make({
    area: Option.some('Recording / transcript'),
    attachments: [],
    claimantId: Option.some(`claude-code/agent-${index.toString()}@ld`),
    complexity: Option.none(),
    createdAtMs: 1_790_000_000_000 + index,
    details: `Issue ${index.toString()} asks for #1358 to stay fast.`,
    evidenceLogQueries: [],
    id: (index + 1).toString().padStart(4, '0'),
    issueType: Option.some('defect'),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `A title for Issue ${index.toString()}`,
    updatedAtMs: 1_790_000_000_000 + index,
    viewerURL: Option.none(),
    workLog: Array.makeBy(WORK_LOG_LENGTH, step =>
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code/agent@ld'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${index.toString()}-${step.toString()}`,
        occurredAtMs: 1_790_000_000_000 + step,
        state: Option.some('progress'),
        summary: `Step ${step.toString()}: green 9be70b4a8 for build 214.`,
      }),
    ),
  })

const catalog = Array.makeBy(CATALOG_SIZE, issueAt)

const RUNS = 5

const fastestMsOf = (work: () => unknown): number =>
  Math.min(
    ...Array.makeBy(RUNS, () => {
      const startedAt = performance.now()
      work()
      return performance.now() - startedAt
    }),
  )

const loaded: Model = update(
  modelForNavigation(IssueDetail.make({ issueId: '0001' })),
  ObservedIssues.make({ issues: catalog }),
)[0]

const list: Model = update(
  modelForNavigation(IssueList.make({})),
  ObservedIssues.make({ issues: catalog }),
)[0]

const changedAt = (position: number): ReadonlyArray<Issue> =>
  Array.map(catalog, (issue, index) =>
    index === position ? Issue.make({ ...issue, status: 'InProgress' }) : issue,
  )

const typed = (model: Model, query: string): Model =>
  update(
    model,
    Option.getOrThrow(messageForScreenToken(model, `search:${query}`)),
  )[0]

describe('what a keystroke and a live change cost with 1,500 Issues loaded', () => {
  it('types a letter into a field without walking the loaded Issues', () => {
    expect(
      fastestMsOf(() =>
        update(loaded, UpdatedLeftoverComment.make({ value: 'wo' })),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes in a change to one Issue without walking the others', () => {
    const changed = Array.map(catalog, (issue, index) =>
      index === 7 ? Issue.make({ ...issue, status: 'InProgress' }) : issue,
    )
    expect(
      fastestMsOf(() => update(loaded, observedIssuesOf(changed))),
    ).toBeLessThan(BUDGET_MS)
  })

  it('repaints all 1,500 rows of the list after a change to one Issue', () => {
    issuesScreen(list)
    const changed = changedAt(7)
    expect(
      fastestMsOf(() =>
        issuesScreen(update(list, observedIssuesOf(changed))[0]),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('reads a press on a row of the list without building an interaction per Issue', () => {
    issuesScreen(list)
    expect(
      fastestMsOf(() =>
        update(
          list,
          Option.getOrThrow(messageForScreenToken(list, 'open:0700')),
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('moves the row cursor a row with j and repaints 1,500 rows', () => {
    issuesScreen(list)
    const walked = update(list, MovedRowCursor.make({ direction: 'Next' }))[0]
    expect(
      fastestMsOf(() => {
        const maybeToken = tokenForKeyPress(walked, {
          isAlt: false,
          isControl: false,
          isMeta: false,
          isShift: false,
          key: 'j',
          target: 'Page',
        })
        return issuesScreen(
          update(
            walked,
            Option.getOrThrow(
              messageForScreenToken(walked, Option.getOrThrow(maybeToken)),
            ),
          )[0],
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })

  it('types a letter into the list search, narrows 1,500 Issues and repaints', () => {
    issuesScreen(list)
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(
            list,
            Option.getOrThrow(
              messageForScreenToken(list, 'search:title for issue 7'),
            ),
          )[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what the command palette costs with 1,500 Issues loaded', () => {
  const palette = update(list, OpenedCommandPalette.make({}))[0]

  it('opens inside one key', () => {
    expect(
      fastestMsOf(() =>
        issuesScreen(update(list, OpenedCommandPalette.make({}))[0]),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes a letter, matching every action and Issue title, inside one key', () => {
    issuesScreen(palette)
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return issuesScreen(
          update(
            palette,
            UpdatedMenuQuery.make({ query: `title ${run.toString()}` }),
          )[0],
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what a peek costs with 1,500 Issues loaded', () => {
  const atRow = update(list, MovedRowCursor.make({ direction: 'Next' }))[0]

  it('opens over the list inside one key', () => {
    issuesScreen(update(atRow, PeekedRowUnderCursor.make({}))[0])
    expect(
      fastestMsOf(() =>
        issuesScreen(update(atRow, PeekedRowUnderCursor.make({}))[0]),
      ),
    ).toBeLessThan(BUDGET_MS)
  })
})

const DEEP_TEXT_PER_ISSUE = 8_400
const SENTENCE =
  'Measured the mirror again; green at build 214 with the same numbers. '

const deepCatalog = Array.map(catalog, issue =>
  Issue.make({
    ...issue,
    details: SENTENCE.repeat(Math.ceil(DEEP_TEXT_PER_ISSUE / SENTENCE.length)),
  }),
)

const deepList: Model = update(
  modelForNavigation(IssueList.make({})),
  observedIssuesOf(deepCatalog),
)[0]

describe('what a search costs over 12.6 MB of Issue text, the size of the real catalog', () => {
  it('finds a word it has not looked for yet, reading every Issue, inside one key', () => {
    issuesScreen(typed(deepList, 'warm the search text'))
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return issuesScreen(typed(deepList, `zqx${run.toString()}`))
      }),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes in a live change to one Issue under a search without reading the others again', () => {
    const searching = typed(deepList, 'zqxsearched')
    issuesScreen(searching)
    const changes = Array.makeBy(RUNS, run =>
      Array.map(deepCatalog, (issue, index) =>
        index === run ? Issue.make({ ...issue, status: 'InProgress' }) : issue,
      ),
    )
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return Option.map(Array.get(changes, run - 1), changed =>
          issuesScreen(update(searching, observedIssuesOf(changed))[0]),
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })
})
