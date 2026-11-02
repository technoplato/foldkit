import { Array, Match as M, Option } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  partsOfText,
} from './chips.js'
import { durationLabel } from './clock.js'
import { type ChipClock, spacedChips, whenWordsOn } from './graphChips.js'
import { headedSection } from './graphPageParts.js'
import { loadedIssuesIn } from './listing.js'
import { type Model, type ReminderFilter, Reminders } from './model.js'
import { momentNodes, rememberedRowsOf } from './momentParts.js'
import { type ReminderFacts, type ReminderRow } from './reminderFacts.js'
import { navigationToPath } from './route.js'
import { reminderIdChip } from './rowChips.js'

const STATE_ORDER = ['open', 'started', 'done', 'deleted']

const pathOf = (filter: ReminderFilter): string =>
  navigationToPath(Reminders.make({ filter }))

const countChip = (
  label: string,
  count: number,
  isChosen: boolean,
  filter: ReminderFilter,
): TextPart =>
  Reference({
    label,
    title: count.toString(),
    ...(isChosen ? { state: 'shown' } : {}),
    kind: 'Reminder',
    href: pathOf(filter),
    detail: [`${count.toString()} reminders`],
  })

const reminderCountWords = (count: number): string =>
  count === 1 ? '1 reminder' : `${count.toString()} reminders`

const shownWords = (
  shown: number,
  total: number,
  filter: ReminderFilter,
): string =>
  Option.isSome(filter.maybeStatus)
    ? `${shown.toString()} of ${reminderCountWords(total)}`
    : reminderCountWords(total)

const countsNodes = (
  reminders: ReadonlyArray<ReminderRow>,
  filter: ReminderFilter,
): ReadonlyArray<UiNode> => [
  RichText([
    Plain('State'),
    ...spacedChips([
      ...Array.flatMap(STATE_ORDER, state => {
        const count = Array.filter(
          reminders,
          reminder => reminder.state === state,
        ).length
        return count === 0
          ? []
          : [
              countChip(
                state,
                count,
                Option.contains(filter.maybeStatus, state),
                { maybeStatus: Option.some(state) },
              ),
            ]
      }),
      ...(Option.isSome(filter.maybeStatus)
        ? [
            countChip('All', reminders.length, false, {
              maybeStatus: Option.none(),
            }),
          ]
        : []),
    ]),
  ]),
]

const whenWordsOfRow = (
  reminder: ReminderRow,
  clock: ChipClock,
): ReadonlyArray<string> => [
  ...Option.toArray(
    Option.map(
      reminder.maybeDueAtMs,
      dueAtMs => `Due ${whenWordsOn(dueAtMs, clock)}`,
    ),
  ),
  ...Option.toArray(
    Option.map(
      reminder.maybeStartedAtMs,
      startedAtMs => `Started ${whenWordsOn(startedAtMs, clock)}`,
    ),
  ),
  ...Option.toArray(
    Option.map(reminder.maybeCompletedAtMs, completedAtMs =>
      Option.match(reminder.maybeStartedAtMs, {
        onNone: () => `Done ${whenWordsOn(completedAtMs, clock)}`,
        onSome: startedAtMs =>
          `Done ${whenWordsOn(completedAtMs, clock)}, took ${durationLabel(startedAtMs, completedAtMs)}`,
      }),
    ),
  ),
  ...Option.toArray(
    Option.map(
      reminder.maybeDeletedAtMs,
      deletedAtMs => `Deleted ${whenWordsOn(deletedAtMs, clock)}`,
    ),
  ),
]

const rememberedRow = rememberedRowsOf<ReminderRow>()

const reminderRow = (
  reminder: ReminderRow,
  context: ChipContext,
  clock: ChipClock,
): UiNode =>
  rememberedRow(reminder, [], context, clock, () =>
    Column(
      { gap: 0 },
      RichText([
        reminderIdChip(reminder, clock),
        Plain(`  ${Array.join(whenWordsOfRow(reminder, clock), '  ')}`),
      ]),
      Text(reminder.title),
    ),
  )

const loadedNodes = (
  model: Model,
  reminders: ReadonlyArray<ReminderRow>,
  filter: ReminderFilter,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    loadedIssuesIn(model),
    model.clock.nowMs,
    model.clock.timeZone,
    chipFactsOf(model),
  )
  const shown = Option.match(filter.maybeStatus, {
    onNone: () => reminders,
    onSome: state =>
      Array.filter(reminders, reminder => reminder.state === state),
  })
  return [
    Text(shownWords(shown.length, reminders.length, filter), { dim: true }),
    ...countsNodes(reminders, filter),
    ...Array.map(shown, reminder =>
      reminderRow(reminder, context, model.clock),
    ),
  ]
}

/**
 * His reminders, every one of them, the newest first: how many there are in
 * each state, each count a link that shows just those, then each reminder with
 * its state, its times and its title.
 */
export const remindersPageNodes = (
  model: Model,
  filter: ReminderFilter,
): ReadonlyArray<UiNode> => [
  Text('Reminders', { emphasis: 'Headline' }),
  ...M.value(model.remindersList).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingReminders: () => [Text('Observing…')],
      FailedReminders: ({ reason }) => [
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedReminders: ({ reminders }) => loadedNodes(model, reminders, filter),
    }),
  ),
]

/**
 * What Scribe's rows say about one reminder: its title, state, list and times,
 * where he said it, and its notes. The notes stay words: `Receipt #1520` is not
 * Issue 1520, so nothing here reads them for links.
 */
export const reminderFactNodes = (
  facts: ReminderFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { reminder } = facts
  return [
    Text(reminder.title, { emphasis: 'Headline' }),
    RichText([
      reminderIdChip(reminder, clock),
      ...Option.match(facts.maybeListName, {
        onNone: () => [],
        onSome: name => [Plain(`  In ${name}`)],
      }),
    ]),
    ...Array.map(whenWordsOfRow(reminder, clock), words =>
      Text(words, { dim: true }),
    ),
    ...Option.toArray(
      Option.map(reminder.maybeContext, moment =>
        Text(`When: ${moment}`, { dim: true }),
      ),
    ),
    ...Option.toArray(
      Option.map(reminder.maybeUrl, url =>
        RichText([Plain('Link '), ...partsOfText(url, context)]),
      ),
    ),
    ...headedSection(
      facts.moments.length === 1
        ? 'His words'
        : `His words: ${facts.moments.length.toString()} moments`,
      Array.map(facts.moments, moment => momentNodes(moment, context, clock)),
    ),
    ...headedSection(
      'Notes',
      Array.map(Option.toArray(facts.maybeNotes), notes => Text(notes)),
    ),
  ]
}
