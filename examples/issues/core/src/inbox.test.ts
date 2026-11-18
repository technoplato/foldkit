import { Array, Effect, Match as M, Option } from 'effect'
import { type ListItem, type UiNode, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ConversationReference,
  Issue,
  IssueMention,
  IssueTracker,
  type IssueTrackerService,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { type Message, observedIssuesOf } from './message.js'
import { type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { makeMemoryIssueTracker } from './resources.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'What is wrong.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P2',
  product: scribe,
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Keep transcript aligned',
  updatedAtMs: 1_000,
  viewerURL: Option.none(),
  workLog: [],
})

const entry = (
  issueId: string,
  state: string,
  occurredAtMs: number,
  summary: string,
  agentId = 'claude-code/one@ld',
): IssueWorkLogEntry =>
  IssueWorkLogEntry.make({
    agentId: Option.some(agentId),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id: `work-${issueId}-${state}-${occurredAtMs.toString()}`,
    occurredAtMs,
    state: Option.some(state),
    summary,
  })

const moved = Issue.make({
  ...stored,
  id: '101',
  title: 'Moved',
  workLog: [
    entry('101', 'progress', 5_000, 'Worked on it.'),
    entry(
      '101',
      'status',
      9_000,
      'Status InProgress → VerificationNeeded: the work is Merged; verify it.',
    ),
  ],
})

const claimed = Issue.make({
  ...stored,
  id: '102',
  title: 'Claimed',
  workLog: [
    entry('102', 'claimed', 7_000, 'Claimed by claude-code/two@ld.'),
    entry('102', 'released', 8_000, 'Claim released.'),
  ],
})

const mentioned = Issue.make({
  ...stored,
  id: '103',
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.some(6_000),
      directQuote: Option.some('Make it much more usable.'),
      id: 'mention-103-1',
      issueId: '103',
      related: [],
      reporter: Option.none(),
      source: ConversationReference.make({
        conversation: { note: 'Typed.', sessionId: 'session-1' },
      }),
    }),
  ],
  title: 'Mentioned',
})

const catalog = [moved, claimed, mentioned]

const inboxAt = (path: string, issues = catalog): Model =>
  update(
    modelForNavigation(pathToNavigation(path)),
    observedIssuesOf(issues),
  )[0]

const rowsIn = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: rows => rows.items,
      Row: row => Array.flatMap(row.children, rowsIn),
      Column: column => Array.flatMap(column.children, rowsIn),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, rowsIn) : [],
      DeviceShell: shell => Array.flatMap(shell.children, rowsIn),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const rowsOf = (model: Model): ReadonlyArray<ListItem> =>
  rowsIn(issuesScreen(model))

const sent = (model: Model, token: string): Model =>
  update(model, Option.getOrThrow(messageForScreenToken(model, token)))[0]

const on = (key: string): KeyPress => ({
  isAlt: false,
  isControl: false,
  isMeta: false,
  isShift: false,
  key,
  target: 'Page',
})

const pressed = (model: Model, key: string): Model =>
  Option.match(tokenForKeyPress(model, on(key)), {
    onNone: () => model,
    onSome: token => sent(model, token),
  })

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

type Step = ReturnType<typeof update>

const settled = async (
  tracker: IssueTrackerService,
  [model, commands]: Step,
): Promise<Model> =>
  Option.match(Array.head(commands), {
    onNone: () => Promise.resolve(model),
    onSome: async command => {
      const message = await Effect.runPromise(
        command.effect.pipe(
          Effect.provideService(IssueTracker, tracker),
          Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
        ) as Effect.Effect<Message>,
      )
      return settled(tracker, update(model, message))
    },
  })

describe('Issue Tracker inbox', () => {
  it('is a link, and its kinds are links', () => {
    Array.forEach(
      ['/inbox', '/inbox?kind=status', '/inbox?kind=mention'],
      path => {
        expect(navigationToPath(pathToNavigation(path))).toBe(path)
      },
    )
    expect(navigationToPath(pathToNavigation('/inbox?kind=nonsense'))).toBe(
      '/inbox',
    )
  })

  it('opens from the list and with g then i', () => {
    const list = inboxAt('/issues')
    expect(sent(list, 'inbox').navigation._tag).toBe('Inbox')
    expect(pressed(pressed(list, 'g'), 'i').navigation._tag).toBe('Inbox')
  })

  it('lists status changes, claims and mentions, newest first, and no other work', () => {
    const rows = rowsOf(inboxAt('/inbox'))
    expect(Array.map(rows, row => row.key)).toEqual([
      '101/work-101-status-9000',
      '102/work-102-released-8000',
      '102/work-102-claimed-7000',
      '103/mention-103-1',
    ])
  })

  it('names the Issue, the kind, the words and who, and links to the Issue', () => {
    const rows = rowsOf(inboxAt('/inbox'))
    expect(Array.head(rows)).toEqual(
      Option.some(
        expect.objectContaining({
          href: '/issues/101',
          lines: expect.arrayContaining([
            '#101',
            'Status',
            'Status InProgress → VerificationNeeded: the work is Merged; verify it.',
            'claude-code/one@ld',
          ]),
          title: 'Moved',
        }),
      ),
    )
    expect(Array.last(rows)).toEqual(
      Option.some(
        expect.objectContaining({
          lines: expect.arrayContaining([
            '#103',
            'Mention',
            'Make it much more usable.',
          ]),
        }),
      ),
    )
  })

  it('narrows to one kind', () => {
    expect(
      Array.map(rowsOf(inboxAt('/inbox?kind=claim')), row => row.key),
    ).toEqual(['102/work-102-released-8000', '102/work-102-claimed-7000'])
    const statuses = sent(inboxAt('/inbox'), 'inbox:status')
    expect(navigationToPath(statuses.navigation)).toBe('/inbox?kind=status')
    expect(Array.map(rowsOf(statuses), row => row.key)).toEqual([
      '101/work-101-status-9000',
    ])
  })

  it('keeps a row for each of two mentions stored under one id', () => {
    const twice = Issue.make({
      ...mentioned,
      mentions: [
        ...mentioned.mentions,
        IssueMention.make({
          ...Option.getOrThrow(Array.head(mentioned.mentions)),
          capturedAtMs: Option.some(4_000),
          directQuote: Option.some('And this.'),
        }),
      ],
    })
    expect(
      Array.map(
        rowsOf(inboxAt('/inbox?kind=mention', [twice])),
        row => row.key,
      ),
    ).toEqual(['103/mention-103-1', '103/mention-103-1/2'])
  })

  it('says how many there are, every one listed', () => {
    const many = Array.makeBy(700, position =>
      Issue.make({
        ...stored,
        id: (2_000 + position).toString(),
        workLog: [
          entry(
            (2_000 + position).toString(),
            'status',
            10_000 + position,
            'Status Open → Blocked.',
          ),
        ],
      }),
    )
    const model = inboxAt('/inbox', many)
    expect(rowsOf(model)).toHaveLength(700)
    expect(
      Array.map(textsOf(issuesScreen(model)), text => text.content),
    ).toContain('700 changes')
  })

  it('shows a move to VerificationNeeded as soon as the store gives it back', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(catalog))
    const list = pressed(inboxAt('/issues'), 'j')
    const menu = pressed(list, 's')
    const done = await settled(
      tracker,
      update(
        menu,
        Option.getOrThrow(
          messageForScreenToken(
            menu,
            'palette-run:set-status:VerificationNeeded',
          ),
        ),
      ),
    )
    const stored101 = Option.getOrThrow(
      Effect.runSync(tracker.fetchIssue('101')),
    )
    expect(stored101.status).toBe('VerificationNeeded')
    const inbox = sent(
      update(done, observedIssuesOf([stored101, claimed, mentioned]))[0],
      'inbox',
    )
    expect(Option.map(Array.head(rowsOf(inbox)), row => row.lines)).toEqual(
      Option.some(
        expect.arrayContaining([
          '#101',
          'Status',
          'Status Open → VerificationNeeded.',
          'owner@example.com',
        ]),
      ),
    )
  })

  it('writes no entry when the status stays the same', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(catalog))
    const list = pressed(inboxAt('/issues'), 'j')
    const menu = pressed(list, 's')
    await settled(
      tracker,
      update(
        menu,
        Option.getOrThrow(
          messageForScreenToken(menu, 'palette-run:set-status:Open'),
        ),
      ),
    )
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('101')),
        issue => issue.workLog.length,
      ),
    ).toEqual(Option.some(moved.workLog.length))
  })

  it('keeps the row of every item but the changed one across a live change', () => {
    const model = inboxAt('/inbox')
    const before = rowsOf(model)
    const changed = Issue.make({
      ...moved,
      workLog: [
        ...moved.workLog,
        entry('101', 'status', 12_000, 'Status VerificationNeeded → Verified.'),
      ],
    })
    const after = rowsOf(
      update(model, observedIssuesOf([changed, claimed, mentioned]))[0],
    )
    expect(Array.map(after, row => row.key)).toEqual([
      '101/work-101-status-12000',
      '101/work-101-status-9000',
      '102/work-102-released-8000',
      '102/work-102-claimed-7000',
      '103/mention-103-1',
    ])
    expect(Array.drop(after, 2)).toEqual(Array.drop(before, 1))
    Array.forEach(
      Array.zip(Array.drop(after, 2), Array.drop(before, 1)),
      ([next, last]) => {
        expect(next).toBe(last)
      },
    )
  })
})
