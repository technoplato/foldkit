import { Array, Option } from 'effect'
import { type ListItem, type UiNode } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { decisionsOf } from './decisionFacts.js'
import { featureChipsOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { tokenForKeyPress } from './keys.js'
import {
  MovedCardAcross,
  MovedRowCursor,
  ObservedDecisions,
  ObservedFeatureChips,
  ObservedIssues,
  ObservedProducts,
  OpenedChoiceMenu,
  OpenedCommandPalette,
  PeekedRowUnderCursor,
  PickedMenuRow,
  SucceededRowEdit,
  UpdatedLeftoverComment,
  UpdatedMenuQuery,
  observedIssuesOf,
} from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const CATALOG_SIZE = 1_500
const WORK_LOG_LENGTH = 12
const BUDGET_MS = 8
const EVENTS_PER_ISSUE = 3

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

const palette = (): Model => update(list, OpenedCommandPalette.make({}))[0]

describe('what the command palette costs with 1,500 Issues loaded', () => {
  it('opens inside one key', () => {
    expect(
      fastestMsOf(() =>
        issuesScreen(update(list, OpenedCommandPalette.make({}))[0]),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes a letter, matching every action and Issue title, inside one key', () => {
    const opened = palette()
    issuesScreen(opened)
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return issuesScreen(
          update(
            opened,
            UpdatedMenuQuery.make({ query: `title ${run.toString()}` }),
          )[0],
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what the palette costs with every product and feature in it', () => {
  const PRODUCT_COUNT = 17
  const FEATURE_COUNT = 40

  const places = update(
    update(
      palette(),
      ObservedProducts.make({
        products: Array.makeBy(PRODUCT_COUNT, index =>
          ProductCatalogEntry.make({
            product: ApplicationProduct.make({
              id: `product-${index.toString()}`,
              name: `Product ${index.toString()}`,
            }),
            updatedAtMs: 1,
          }),
        ),
      }),
    )[0],
    ObservedFeatureChips.make({
      features: featureChipsOf({
        features: Array.makeBy(FEATURE_COUNT, index => ({
          name: `Line ${index.toString()}.`,
          number: index + 1,
          productSlug: 'scribe',
          slug: `line-${index.toString()}`,
          status: 'active',
        })),
      }),
    }),
  )[0]

  it('takes a letter, matching every place and Issue title, inside one key', () => {
    issuesScreen(places)
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return issuesScreen(
          update(
            places,
            UpdatedMenuQuery.make({ query: `line ${run.toString()}` }),
          )[0],
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what the palette costs with every decision in it', () => {
  const DECISION_COUNT = 155

  const places = update(
    palette(),
    ObservedDecisions.make({
      decisions: decisionsOf({
        decisions: Array.makeBy(DECISION_COUNT, index => ({
          decidedAtMs: 1,
          id: `decision-${index.toString()}`,
          status: 'decided',
          text: `Rule ${index.toString()}, as one plain sentence of what he decided.`,
        })),
      }),
    }),
  )[0]

  it('takes a letter, matching every decision and Issue title, inside one key', () => {
    issuesScreen(places)
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return issuesScreen(
          update(
            places,
            UpdatedMenuQuery.make({ query: `rule ${run.toString()}` }),
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

describe('what a selection costs with 1,500 Issues loaded', () => {
  const pressedKey = (model: Model, key: string, isShift = false): Model =>
    update(
      model,
      Option.getOrThrow(
        messageForScreenToken(
          model,
          Option.getOrThrow(
            tokenForKeyPress(model, {
              isAlt: false,
              isControl: false,
              isMeta: false,
              isShift,
              key,
              target: 'Page',
            }),
          ),
        ),
      ),
    )[0]
  const atRow = pressedKey(list, 'j')
  const allSelected = Array.reduce(
    Array.makeBy(CATALOG_SIZE - 1, () => 'J'),
    atRow,
    (model, key) => pressedKey(model, key, true),
  )

  it('selects a row with x inside one key', () => {
    issuesScreen(atRow)
    expect(
      fastestMsOf(() => issuesScreen(pressedKey(atRow, 'x'))),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes one more row with Shift+k, every row selected, inside one key', () => {
    issuesScreen(allSelected)
    expect(
      fastestMsOf(() => issuesScreen(pressedKey(allSelected, 'K', true))),
    ).toBeLessThan(BUDGET_MS)
  })

  it('shows a priority on every row of 1,500 selected inside one key', () => {
    const menu = pressedKey(allSelected, 'p')
    issuesScreen(menu)
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(menu, PickedMenuRow.make({ token: 'set-priority:P1' }))[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('takes in one of 1,500 writes without building the other rows again', () => {
    const picked = update(
      pressedKey(allSelected, 'p'),
      PickedMenuRow.make({ token: 'set-priority:P1' }),
    )[0]
    const firstPaint = issuesScreen(picked)
    const written = Option.getOrThrow(Array.head(catalog))
    const next = update(
      picked,
      SucceededRowEdit.make({
        issue: Issue.make({ ...written, priority: 'P1' }),
      }),
    )[0]
    const rowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
      node._tag === 'List'
        ? node.items
        : 'children' in node
          ? Array.flatMap(node.children, rowsOf)
          : []
    const before = rowsOf(firstPaint)
    const after = rowsOf(issuesScreen(next))
    const rebuilt = Array.filter(after, (row, position) =>
      Option.exists(Array.get(before, position), same => same !== row),
    )
    expect(rebuilt.length).toBeLessThanOrEqual(1)
  })
})

describe('what the inbox costs with 1,500 Issues loaded', () => {
  const eventCatalog = Array.map(catalog, (issue, index) =>
    Issue.make({
      ...issue,
      workLog: [
        ...issue.workLog,
        ...Array.makeBy(EVENTS_PER_ISSUE, step =>
          IssueWorkLogEntry.make({
            agentId: Option.some('claude-code/agent@ld'),
            commitSha: Option.none(),
            durationSeconds: Option.none(),
            id: `work-${index.toString()}-status-${step.toString()}`,
            occurredAtMs: 1_790_000_000_000 + index * 10 + step,
            state: Option.some('status'),
            summary: 'Status Open → VerificationNeeded.',
          }),
        ),
      ],
    }),
  )
  const inbox: Model = update(
    modelForNavigation(pathToNavigation('/inbox')),
    observedIssuesOf(eventCatalog),
  )[0]
  const rowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
    node._tag === 'List'
      ? node.items
      : 'children' in node
        ? Array.flatMap(node.children, rowsOf)
        : []
  const changes = Array.makeBy(RUNS, run =>
    Array.map(eventCatalog, (issue, index) =>
      index === run ? Issue.make({ ...issue, status: 'Fixed' }) : issue,
    ),
  )

  it('takes in a change to one Issue among 4,500 changes inside one key', () => {
    issuesScreen(inbox)
    let run = 0
    expect(
      fastestMsOf(() => {
        run += 1
        return Option.map(Array.get(changes, run - 1), changed =>
          issuesScreen(update(inbox, observedIssuesOf(changed))[0]),
        )
      }),
    ).toBeLessThan(BUDGET_MS)
  })

  it('builds only the rows of the Issue that changed', () => {
    const before = new Set(rowsOf(issuesScreen(inbox)))
    const changed = Option.getOrThrow(Array.get(changes, 3))
    const after = rowsOf(
      issuesScreen(update(inbox, observedIssuesOf(changed))[0]),
    )
    expect(Array.filter(after, row => !before.has(row))).toHaveLength(
      EVENTS_PER_ISSUE,
    )
  })
})

describe('what a board costs with 1,500 Issues loaded', () => {
  const board: Model = update(
    modelForNavigation(pathToNavigation('/issues?view=board')),
    ObservedIssues.make({ issues: catalog }),
  )[0]
  const atCard = update(board, MovedRowCursor.make({ direction: 'Next' }))[0]

  it('paints 1,500 cards again after a change to one Issue inside one key', () => {
    issuesScreen(board)
    const changed = changedAt(7)
    expect(
      fastestMsOf(() =>
        issuesScreen(update(board, observedIssuesOf(changed))[0]),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('moves the cursor a card inside one key', () => {
    issuesScreen(atCard)
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(atCard, MovedRowCursor.make({ direction: 'Next' }))[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('moves a card to the next column inside one key', () => {
    issuesScreen(atCard)
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(atCard, MovedCardAcross.make({ direction: 'Next' }))[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what triage from the row costs with 1,500 Issues loaded', () => {
  const atRow = update(list, MovedRowCursor.make({ direction: 'Next' }))[0]
  const statusMenu = update(
    atRow,
    OpenedChoiceMenu.make({ menu: 'SetStatus' }),
  )[0]

  it('opens the status menu inside one key', () => {
    issuesScreen(statusMenu)
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(atRow, OpenedChoiceMenu.make({ menu: 'SetStatus' }))[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('opens a field pressed on a row, repainting 1,500 rows, inside one key', () => {
    const pressed = () =>
      update(
        list,
        Option.getOrThrow(messageForScreenToken(list, 'field:status:0700')),
      )[0]
    issuesScreen(pressed())
    expect(fastestMsOf(() => issuesScreen(pressed()))).toBeLessThan(BUDGET_MS)
  })

  it('shows a new status on the row inside one key', () => {
    expect(
      fastestMsOf(() =>
        issuesScreen(
          update(
            statusMenu,
            PickedMenuRow.make({ token: 'set-status:Blocked' }),
          )[0],
        ),
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
