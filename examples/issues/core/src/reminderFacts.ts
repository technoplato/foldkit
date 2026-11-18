import { Array, Option, Order, Schema as S, pipe } from 'effect'

import {
  MOMENT_FIELDS,
  SaidMoment,
  StoredMoment,
  momentsOf,
  oldestMomentFirst,
} from './decisionFacts.js'
import {
  OptionalNumber,
  OptionalText,
  StoredRows,
  keptRowsOf,
  listOf,
  manyOf,
} from './storedRows.js'
import { readTextReferences } from './textReferences.js'

// REMINDER

/**
 * One reminder as a chip and a list draw it: its title and state (`open`,
 * `started`, `done` or `deleted`), and its times. Nothing in Scribe's schema
 * ties a reminder to an Issue: `url` ties one only when it is that Issue's page.
 */
export const ReminderRow = S.Struct({
  createdAtMs: S.Number,
  maybeCompletedAtMs: S.Option(S.Number),
  maybeContext: S.Option(S.String),
  maybeDeletedAtMs: S.Option(S.Number),
  maybeDueAtMs: S.Option(S.Number),
  maybeStartedAtMs: S.Option(S.Number),
  maybeUrl: S.Option(S.String),
  reminderId: S.String,
  state: S.String,
  title: S.String,
})
/** One reminder as a chip and a list draw it. */
export type ReminderRow = typeof ReminderRow.Type

/** What Scribe's rows say about one reminder: the row, its list, his words. */
export const ReminderFacts = S.TaggedStruct('ReminderFacts', {
  maybeListName: S.Option(S.String),
  maybeNotes: S.Option(S.String),
  moments: S.Array(SaidMoment),
  reminder: ReminderRow,
})
/** What Scribe's rows say about one reminder. */
export type ReminderFacts = typeof ReminderFacts.Type

// STORED

const StoredReminder = S.Struct({
  completedAtMs: OptionalNumber,
  context: OptionalText,
  createdAtMs: S.Number,
  deletedAtMs: OptionalNumber,
  dueAtMs: OptionalNumber,
  id: S.String,
  isCompleted: S.Boolean,
  startedAtMs: OptionalNumber,
  title: S.String,
  url: OptionalText,
})

const StoredReminders = S.Struct({ remindersItems: StoredRows })

const StoredReminderMoment = S.Struct({
  evidenceJSON: OptionalText,
  id: S.String,
  kind: S.String,
  mentionKind: OptionalText,
  recordingID: S.String,
  review: OptionalText,
  segmentID: OptionalText,
  startSeconds: S.Number,
  startedAtMs: S.Number,
})

const StoredReminderPages = S.Struct({
  remindersItems: S.Array(
    S.Struct({
      ...StoredReminder.fields,
      list: manyOf(S.Struct({ title: S.String })),
      moments: manyOf(StoredReminderMoment),
      notes: OptionalText,
      sourceMoments: manyOf(StoredMoment),
    }),
  ),
})

const StoredEvidence = S.Struct({ heard: OptionalText })

const NOT_A_REMINDER = 'not a reminder'
const REJECTED = 'rejected'

const stateOf = (stored: typeof StoredReminder.Type): string => {
  if (stored.deletedAtMs !== null && stored.deletedAtMs !== undefined) {
    return 'deleted'
  } else if (stored.isCompleted) {
    return 'done'
  } else if (stored.startedAtMs !== null && stored.startedAtMs !== undefined) {
    return 'started'
  }
  return 'open'
}

const reminderOf = (stored: typeof StoredReminder.Type): ReminderRow =>
  ReminderRow.make({
    createdAtMs: stored.createdAtMs,
    maybeCompletedAtMs: Option.fromNullishOr(stored.completedAtMs),
    maybeContext: Option.fromNullishOr(stored.context),
    maybeDeletedAtMs: Option.fromNullishOr(stored.deletedAtMs),
    maybeDueAtMs: Option.fromNullishOr(stored.dueAtMs),
    maybeStartedAtMs: Option.fromNullishOr(stored.startedAtMs),
    maybeUrl: Option.fromNullishOr(stored.url),
    reminderId: stored.id,
    state: stateOf(stored),
    title: stored.title,
  })

const heardOf = (stored: string | null | undefined): string =>
  pipe(
    Option.fromNullishOr(stored),
    Option.flatMap(
      Option.liftThrowable((text: string): unknown => JSON.parse(text)),
    ),
    Option.flatMap(S.decodeUnknownOption(StoredEvidence)),
    Option.flatMapNullishOr(evidence => evidence.heard),
    Option.getOrElse(() => ''),
  )

const reminderMomentOf = (
  stored: typeof StoredReminderMoment.Type,
): SaidMoment =>
  SaidMoment.make({
    kind: 'said',
    maybeFirstLine: Option.none(),
    maybeLastLine: Option.none(),
    maybeRecordingId: Option.some(stored.recordingID),
    maybeSegmentId: Option.fromNullishOr(stored.segmentID),
    maybeStartSeconds: Option.some(stored.startSeconds),
    momentId: stored.id,
    quote: heardOf(stored.evidenceJSON),
    role:
      stored.review === REJECTED
        ? NOT_A_REMINDER
        : (stored.mentionKind ?? stored.kind),
    startedAtMs: stored.startedAtMs,
  })

/** The newest reminder first. */
export const newestReminderFirst: Order.Order<ReminderRow> = Order.flip(
  Order.mapInput(Order.Number, (reminder: ReminderRow) => reminder.createdAtMs),
)

const decodedReminder = (stored: unknown): ReminderRow =>
  reminderOf(S.decodeUnknownSync(StoredReminder)(stored))

/** The rows of a list of `remindersItems`, the newest first. */
export const reminderRowsOf = (
  stored: ReadonlyArray<unknown>,
): ReadonlyArray<ReminderRow> =>
  Array.sort(Array.map(stored, decodedReminder), newestReminderFirst)

/** Every reminder Instant answers with, the newest first. */
export const remindersOf = (data: unknown): ReadonlyArray<ReminderRow> =>
  reminderRowsOf(S.decodeUnknownSync(StoredReminders)(data).remindersItems)

/**
 * A read of every reminder that keeps each row a live change left alone, the
 * newest first, so one change decodes one row.
 */
export const keptRemindersOf = (): ((
  data: unknown,
) => ReadonlyArray<ReminderRow>) => {
  const kept = keptRowsOf(decodedReminder)
  return data =>
    Array.sort(
      kept(S.decodeUnknownSync(StoredReminders)(data).remindersItems),
      newestReminderFirst,
    )
}

/** A reminder's page from the row Instant answers with, none when it holds none. */
export const reminderFactsOf = (data: unknown): Option.Option<ReminderFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredReminderPages)(data).remindersItems),
    stored =>
      ReminderFacts.make({
        maybeListName: Option.map(
          Array.head(listOf(stored.list)),
          list => list.title,
        ),
        maybeNotes: Option.fromNullishOr(stored.notes),
        moments: Array.sort(
          [
            ...Array.map(listOf(stored.moments), reminderMomentOf),
            ...momentsOf(listOf(stored.sourceMoments)),
          ],
          oldestMomentFirst,
        ),
        reminder: reminderOf(stored),
      }),
  )

/**
 * The Issue a reminder's link is the page of, the only tie its row can hold:
 * `https://issues.pisspoursoftware.xyz/issues/1005` is Issue `1005`. A `#1520`
 * in its notes can be a receipt's number, so its words tie it to nothing.
 */
export const issueIdOfReminder = (
  reminder: ReminderRow,
): Option.Option<string> =>
  pipe(
    reminder.maybeUrl,
    Option.map(readTextReferences),
    Option.flatMap(
      Array.findFirst(piece =>
        piece._tag === 'Referenced' && piece.reference._tag === 'IssueNumber'
          ? Option.some(piece.reference.issueId)
          : Option.none(),
      ),
    ),
  )

// QUERY

/** What a reminder's chip and list row draw, without its notes. */
export const REMINDER_FIELDS = [
  'completedAtMs',
  'context',
  'createdAtMs',
  'deletedAtMs',
  'dueAtMs',
  'isCompleted',
  'startedAtMs',
  'title',
  'url',
]

/** What `/reminders` asks for: every reminder's scalars, and no link per row. */
export const remindersQuery = {
  remindersItems: { $: { fields: REMINDER_FIELDS } },
}

/** What a reminder's page asks for: the row, its notes, list and his words. */
export const reminderFactsQuery = (reminderId: string) => ({
  remindersItems: {
    $: {
      where: { id: reminderId },
      fields: [...REMINDER_FIELDS, 'notes'],
    },
    list: { $: { fields: ['title'] } },
    moments: {
      $: {
        fields: [
          'evidenceJSON',
          'kind',
          'mentionKind',
          'recordingID',
          'review',
          'segmentID',
          'startSeconds',
          'startedAtMs',
        ],
      },
    },
    sourceMoments: { $: { fields: MOMENT_FIELDS } },
  },
})
