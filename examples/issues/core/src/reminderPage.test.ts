import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import {
  type ChipFacts,
  chipContextOf,
  noChipFacts,
  partsOfText,
} from './chips.js'
import { ReminderEntity, backlinksOf } from './entityGraph.js'
import { modelForNavigation } from './init.js'
import {
  FailedObserveReminders,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
  observedRemindersOf,
} from './message.js'
import { EntityPage, type Model, ReminderFilter, Reminders } from './model.js'
import { issuesScreen } from './program.js'
import {
  reminderFactsOf,
  reminderFactsQuery,
  remindersOf,
  remindersQuery,
} from './reminderFacts.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { readTextReferences } from './textReferences.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const CREATED_AT_MS = Date.parse('2026-10-29T14:15:00Z')
const REMINDER_ID = 'c0ffee01-0a0b-5c0d-8e0f-101112131415'
const SHORT_ID = 'c0ffee01'
const DONE_ID = 'c0ffee02-0a0b-5c0d-8e0f-101112131415'
const STARTED_ID = 'c0ffee03-0a0b-5c0d-8e0f-101112131415'
const DELETED_ID = 'c0ffee04-0a0b-5c0d-8e0f-101112131415'
const RECORDING_ID = 'faa684c2-34e4-47e5-8f9b-000000000001'
const SEGMENT_ID = '8d70b597-a775-41d8-b688-000000000001'

const storedOpen = {
  createdAtMs: CREATED_AT_MS,
  dueAtMs: CREATED_AT_MS + 3 * 86_400_000,
  id: REMINDER_ID,
  isCompleted: false,
  title: 'Water the plants before the trip',
}

const storedDone = {
  completedAtMs: CREATED_AT_MS - 3_600_000,
  createdAtMs: CREATED_AT_MS - 86_400_000,
  id: DONE_ID,
  isCompleted: true,
  title: 'Renew the library card',
}

const storedStarted = {
  context: 'when the rain stops',
  createdAtMs: CREATED_AT_MS - 2 * 86_400_000,
  id: STARTED_ID,
  isCompleted: false,
  startedAtMs: CREATED_AT_MS - 3_600_000,
  title: 'Return the borrowed ladder',
  url: 'https://issues.pisspoursoftware.xyz/issues/1005',
}

const storedDeleted = {
  createdAtMs: CREATED_AT_MS - 3 * 86_400_000,
  deletedAtMs: CREATED_AT_MS - 86_400_000,
  id: DELETED_ID,
  isCompleted: false,
  title: 'Sort the garage shelves',
}

const reminders = remindersOf({
  remindersItems: [storedDone, storedDeleted, storedOpen, storedStarted],
})

const moment = {
  evidenceJSON: JSON.stringify({ heard: 'I have to water the plants.' }),
  id: 'moment-created',
  kind: 'created',
  recordingID: RECORDING_ID,
  segmentID: SEGMENT_ID,
  startSeconds: 107.78,
  startedAtMs: CREATED_AT_MS,
}

const rejected = {
  ...moment,
  evidenceJSON: JSON.stringify({ heard: 'Not this one.' }),
  id: 'moment-rejected',
  kind: 'mentioned',
  mentionKind: 'progress',
  review: 'rejected',
  startedAtMs: CREATED_AT_MS + 60_000,
}

const typed = {
  id: 'moment-typed',
  kind: 'typed',
  quote: 'Also the ones on the porch.',
  role: 'introduced',
  startedAtMs: CREATED_AT_MS + 120_000,
}

const factsOfReminder = Option.getOrThrow(
  reminderFactsOf({
    remindersItems: [
      {
        ...storedOpen,
        list: [{ id: 'list', title: 'Inbox' }],
        moments: [rejected, moment],
        notes: 'Receipt #1520 is not an Issue, and these words stay words.',
        sourceMoments: [typed],
      },
    ],
  }),
)

const blank = (id: string, title: string, details = ''): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: CREATED_AT_MS,
    details,
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title,
    updatedAtMs: CREATED_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [
  blank('1277', 'Cites a reminder', `Reminder ${SHORT_ID} holds the ask.`),
  blank('1520', 'A real Issue with the same number as his receipt'),
  blank('525', 'A branch', 'Head: agent/claude/reminders ea8dc31c (pushed).'),
]

const opened = (
  path: string,
  ...messages: ReadonlyArray<Parameters<typeof update>[1]>
): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ...messages,
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(pathToNavigation(path)),
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

const chipsOfText = (
  text: string,
  facts: ChipFacts = noChipFacts,
): ReadonlyArray<ReferencePart> =>
  Array.filter(
    partsOfText(text, chipContextOf(catalog, NOW_MS, 'America/New_York', facts)),
    (part): part is ReferencePart => part._tag === 'Reference',
  )

const withRows: ChipFacts = { ...noChipFacts, reminders }

describe('what a reminder’s rows read', () => {
  it('holds the newest first, each with a state', () => {
    expect(Array.map(reminders, row => [row.reminderId, row.state])).toEqual([
      [REMINDER_ID, 'open'],
      [DONE_ID, 'done'],
      [STARTED_ID, 'started'],
      [DELETED_ID, 'deleted'],
    ])
  })

  it('reads the list’s scalars with no link per row, and no notes', () => {
    const { $, ...links } = remindersQuery.remindersItems
    expect('limit' in $).toBe(false)
    expect($.fields).not.toContain('notes')
    expect(Object.keys(links)).toEqual([])
  })

  it('reads a reminder by its id, with its moments and list', () => {
    const query = reminderFactsQuery(REMINDER_ID).remindersItems
    expect(query.$.where).toEqual({ id: REMINDER_ID })
    expect(Object.keys(query)).toEqual(
      expect.arrayContaining(['list', 'moments', 'sourceMoments']),
    )
  })

  it('holds his words as heard, in the order he said them', () => {
    expect(
      Array.map(factsOfReminder.moments, found => [
        found.momentId,
        found.quote,
      ]),
    ).toEqual([
      ['moment-created', 'I have to water the plants.'],
      ['moment-rejected', 'Not this one.'],
      ['moment-typed', 'Also the ones on the porch.'],
    ])
  })
})

describe('a reminder in text', () => {
  it.each([
    `reminder ${SHORT_ID}`,
    `Reminder ${SHORT_ID}`,
    `reminder ${REMINDER_ID}`,
    `https://issues.pisspoursoftware.xyz/reminders/${REMINDER_ID}`,
  ])('reads %s', text => {
    expect(
      Array.flatMap(readTextReferences(text), piece =>
        piece._tag === 'Referenced' && piece.reference._tag === 'ReminderId'
          ? [piece.reference.reminderId.slice(0, SHORT_ID.length)]
          : [],
      ),
    ).toEqual([SHORT_ID])
  })

  it('leaves a branch called reminders alone', () => {
    expect(
      readTextReferences('agent/claude/reminders ea8dc31c').some(
        piece =>
          piece._tag === 'Referenced' && piece.reference._tag === 'ReminderId',
      ),
    ).toBe(false)
  })

  it('draws the title and its state from the row', () => {
    expect(chipsOfText(`See reminder ${SHORT_ID}.`, withRows)).toEqual([
      expect.objectContaining({
        href: `/reminders/${REMINDER_ID}`,
        kind: 'Reminder',
        label: `reminder ${SHORT_ID}`,
        state: 'open',
        title: 'Water the plants before the trip',
      }),
    ])
  })

  it('links by the words alone until the row is read', () => {
    expect(chipsOfText(`See reminder ${SHORT_ID}.`)).toEqual([
      expect.objectContaining({
        href: `/reminders/${SHORT_ID}`,
        label: `reminder ${SHORT_ID}`,
      }),
    ])
  })
})

describe('/reminders', () => {
  it('routes the list, its state and one reminder', () => {
    const path = '/reminders?status=open'
    const navigation = pathToNavigation(path)
    expect(navigation).toEqual(
      Reminders.make({
        filter: ReminderFilter.make({ maybeStatus: Option.some('open') }),
      }),
    )
    expect(navigationToPath(navigation)).toBe(path)
    expect(navigationToPath(Reminders.make({}))).toBe('/reminders')
    expect(pathToNavigation(`/reminders/${SHORT_ID}`)).toEqual(
      EntityPage.make({
        entity: ReminderEntity.make({ reminderId: SHORT_ID }),
      }),
    )
  })

  it('lists every reminder and counts each state as a link that narrows', () => {
    const model = opened(
      '/reminders?status=done',
      observedRemindersOf(reminders),
    )
    const contents = contentsOf(model)
    expect(contents).toContain('Renew the library card')
    expect(contents).not.toContain('Water the plants before the trip')
    expect(contents).toContainEqual(expect.stringContaining('1 of 4 reminders'))
    expect(
      Option.map(
        Array.findFirst(
          chipsOf(model),
          chip => chip.href === '/reminders?status=open',
        ),
        chip => chip.title,
      ),
    ).toEqual(Option.some('1'))
  })

  it('says why when the rows could not be read', () => {
    expect(
      contentsOf(
        opened(
          '/reminders',
          FailedObserveReminders.make({ reason: 'Permission denied' }),
        ),
      ),
    ).toContain('Scribe’s rows could not be read: Permission denied')
  })
})

describe('where a reminder can go', () => {
  it('links only inside the site, which is behind Access to him alone', () => {
    const model = opened('/reminders', observedRemindersOf(reminders))
    const links = Array.filter(
      chipsOf(model),
      chip => chip.kind === 'Reminder' && chip.href !== undefined,
    )
    expect(Array.isReadonlyArrayNonEmpty(links)).toBe(true)
    expect(links.every(chip => chip.href?.startsWith('/reminders'))).toBe(true)
  })

  it('never reads a preview host’s link as a reminder', () => {
    expect(
      readTextReferences(
        `https://og.pisspoursoftware.xyz/reminders/${REMINDER_ID}`,
      ).some(
        piece =>
          piece._tag === 'Referenced' && piece.reference._tag === 'ReminderId',
      ),
    ).toBe(false)
  })

  it('keeps its words out of the page’s title', () => {
    const screen = issuesScreen(
      opened('/reminders', observedRemindersOf(reminders)),
    )
    expect('title' in screen ? screen.title : 'Issues').toBe('Issues')
  })
})

describe('a reminder’s own page', () => {
  const entity = ReminderEntity.make({ reminderId: REMINDER_ID })
  const page = (): Model =>
    opened(
      `/reminders/${REMINDER_ID}`,
      ObservedPageFacts.make({ entity, facts: factsOfReminder }),
    )

  it('says its title, state, list and when it is due', () => {
    const contents = contentsOf(page())
    expect(contents).toContain('Water the plants before the trip')
    expect(contents).toContainEqual(expect.stringContaining('Inbox'))
    expect(contents).toContainEqual(expect.stringContaining('Due 2026-11-01'))
  })

  it('shows his words, a moment deep linking the words at its time', () => {
    const model = page()
    expect(contentsOf(model)).toContain('I have to water the plants.')
    expect(chipsOf(model)).toContainEqual(
      expect.objectContaining({
        href: `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SEGMENT_ID}?t=107.78`,
      }),
    )
  })

  it('says when he rejected a moment', () => {
    expect(contentsOf(page())).toContainEqual(
      expect.stringContaining('not a reminder'),
    )
  })

  it('keeps its notes as words: a receipt’s #1520 is not Issue 1520', () => {
    const model = page()
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Receipt #1520 is not an Issue'),
    )
    expect(chipsOf(model).some(chip => chip.href === '/issues/1520')).toBe(
      false,
    )
  })

  it('lists the Issues whose words cite it', () => {
    expect(
      Array.map(backlinksOf(catalog, entity), backlink => backlink.issue.id),
    ).toEqual(['1277'])
    expect(contentsOf(page())).toContainEqual(
      expect.stringContaining('1 Issue points here'),
    )
  })

  it('says when the rows hold no such reminder', () => {
    expect(
      contentsOf(
        update(
          opened(`/reminders/${SHORT_ID}`),
          ObservedPageFacts.make({
            entity: ReminderEntity.make({ reminderId: SHORT_ID }),
            facts: { _tag: 'NoPageFacts' },
          }),
        )[0],
      ),
    ).toContain('Scribe’s rows hold no such reminder.')
  })
})
