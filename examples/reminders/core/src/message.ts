import { Array, Option, Schema as S, String } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { m } from 'foldkit/message'

import {
  Board,
  ListColor,
  type Member,
  Ordering,
  type Reminder,
  type ReminderList,
  type Role,
  SmartList,
  canDeleteTagIn,
  canWriteIn,
  identityTitleOf,
  listIn,
  personOf,
  remindersInSmartList,
  roleIn,
  sharedWithOf,
  tagNamed,
  tagsInUse,
  tagsOf,
} from './board.js'
import {
  DueAt,
  DueToken,
  LocalDay,
  dueLabel,
  quickDueDates,
} from './calendar.js'
import { isListPage, isTagPage } from './destination.js'
import {
  EmailAddress,
  ListId,
  ListTitle,
  MemberId,
  NotesText,
  ReminderId,
  ReminderTitle,
  SearchQuery,
  TagTitle,
  TagTitleFromText,
} from './ids.js'
import { shownPathOf } from './links.js'
import { ColorName, palette } from './look.js'
import {
  type Model,
  boardOf,
  listOf,
  listsOf,
  reminderOf,
  writableListsOf,
} from './model.js'
import { SharedHow } from './share.js'
import {
  askedListOf,
  clearingListOf,
  isAsking,
  shownListOf,
  shownReminderOf,
  shownSmartListOf,
  shownTagOf,
  topPageOf,
} from './stack.js'
import {
  OrderingWord,
  PriorityChoice,
  PriorityWord,
  SmartListWord,
} from './words.js'

// RULES

const answerFirst = 'answer the question first'

const notOpenYet = 'your reminders are not open yet'

const viewOnly = 'you can only view this list'

const ownerOnly = 'only its owner can change this'

const unlessAsking = (model: Model): Catalog.Availability =>
  isAsking(model)
    ? Catalog.Disabled({ because: answerFirst })
    : Catalog.Enabled()

const withBoard = (model: Model): Catalog.Availability =>
  Option.isNone(boardOf(model))
    ? Catalog.Disabled({ because: notOpenYet })
    : unlessAsking(model)

const enabledWhen = (
  isAllowed: boolean,
  because: string,
): Catalog.Availability =>
  isAllowed ? Catalog.Enabled() : Catalog.Disabled({ because })

const listedIn = (
  model: Model,
  reminder: Reminder,
): Option.Option<ReminderList> => listOf(model, reminder.listId)

const isWritableReminder = (model: Model, reminder: Reminder): boolean =>
  Option.exists(boardOf(model), board =>
    Option.exists(listIn(board, reminder.listId), list =>
      canWriteIn(board, list),
    ),
  )

/** The reminder whose page is open, while the person can see it. */
export const shownReminder = (model: Model): Option.Option<Reminder> =>
  Option.flatMap(shownReminderOf(model), reminderId =>
    reminderOf(model, reminderId),
  )

/** The list whose page is open, while the person can see it. */
export const shownList = (model: Model): Option.Option<ReminderList> =>
  Option.flatMap(shownListOf(model), listId => listOf(model, listId))

const onWritableReminder = (model: Model): Catalog.Availability => {
  const availability = withBoard(model)
  if (!Catalog.isEnabled(availability)) {
    return availability
  } else {
    return Option.match(shownReminder(model), {
      onNone: () => Catalog.Disabled({ because: 'no reminder is open' }),
      onSome: reminder =>
        enabledWhen(isWritableReminder(model, reminder), viewOnly),
    })
  }
}

const onOwnedList = (model: Model): Catalog.Availability => {
  const availability = withBoard(model)
  if (!Catalog.isEnabled(availability)) {
    return availability
  } else {
    return Option.match(
      Option.flatMap(boardOf(model), board =>
        Option.map(shownList(model), list => roleIn(board, list)),
      ),
      {
        onNone: () => Catalog.Disabled({ because: 'no list is open' }),
        onSome: role => enabledWhen(role === 'Owner', ownerOnly),
      },
    )
  }
}

const onListPage = (model: Model): Catalog.Availability => {
  const availability = withBoard(model)
  if (!Catalog.isEnabled(availability)) {
    return availability
  } else {
    return Option.isSome(shownList(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'no list is open' })
  }
}

const isWritableList = (model: Model, list: ReminderList): boolean =>
  Option.exists(boardOf(model), board => canWriteIn(board, list))

const listTitleOf = (model: Model, reminder: Reminder): string =>
  Option.getOrElse(
    Option.map(listedIn(model, reminder), list => list.title),
    () => '',
  )

const reminderChoice = (
  model: Model,
  reminder: Reminder,
  availabilityOf: (reminder: Reminder) => Catalog.Availability,
): Catalog.Choice<ReminderId> => ({
  value: reminder.reminderId,
  title: reminder.title,
  detail: listTitleOf(model, reminder),
  availability: availabilityOf(reminder),
})

const whichReminder = (
  prompt: string,
  availabilityOf: (model: Model, reminder: Reminder) => Catalog.Availability,
): Catalog.Choose<Model, 'reminderId', ReminderId> => ({
  field: 'reminderId',
  prompt,
  token: ReminderId,
  choicesOf: model =>
    Array.map(
      Option.match(boardOf(model), {
        onNone: () => [],
        onSome: board => board.reminders,
      }),
      reminder =>
        reminderChoice(model, reminder, reminderOfChoice =>
          availabilityOf(model, reminderOfChoice),
        ),
    ),
  preferredOf: shownReminderOf,
  nothingToChoose: 'there are no reminders yet',
})

const writableAnd =
  (isAllowed: (reminder: Reminder) => boolean, because: string) =>
  (model: Model, reminder: Reminder): Catalog.Availability => {
    if (!isWritableReminder(model, reminder)) {
      return Catalog.Disabled({ because: viewOnly })
    } else {
      return enabledWhen(isAllowed(reminder), because)
    }
  }

const typed = <Value>(
  availabilityOf: (model: Model) => Catalog.Availability,
) => ({
  choicesOf: (): ReadonlyArray<Catalog.Choice<Value>> => [],
  accepts: (model: Model): Catalog.Availability => availabilityOf(model),
})

// NAVIGATE

const smartLists: ReadonlyArray<SmartList> = [
  'Today',
  'Scheduled',
  'All',
  'Flagged',
  'Completed',
]

/** How many reminders a smart list shows, `3` for Today with three due. */
export const smartCountOf = (model: Model, smartList: SmartList): number =>
  Option.match(boardOf(model), {
    onNone: () => 0,
    onSome: board =>
      remindersInSmartList(board, smartList, model.maybeToday).length,
  })

/** Opens a smart list: Today, Scheduled, All, Flagged, or Completed. */
export const OpenSmartList = Catalog.action('OpenSmartList', {
  fields: { smartList: SmartList },
  choose: {
    field: 'smartList',
    prompt: 'Which smart list?',
    token: SmartListWord,
    choicesOf: (model: Model) =>
      Array.map(smartLists, smartList => ({
        value: smartList,
        title: smartList,
        detail: `${smartCountOf(model, smartList).toString()} reminders`,
        availability: Option.contains(shownSmartListOf(model), smartList)
          ? Catalog.Disabled({ because: 'it is open' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no smart lists',
  },
  what: 'Opens a smart list',
  why: 'The person wants what is due today, scheduled, flagged, or done',
  enabled: withBoard,
  meta: { label: 'Open', keys: [], title: 'Open smart list' },
})

/** Opens one list's page. */
export const OpenList = Catalog.action('OpenList', {
  fields: { listId: ListId },
  choose: {
    field: 'listId',
    prompt: 'Which list?',
    token: ListId,
    choicesOf: (model: Model) =>
      Array.map(listsOf(model), list => ({
        value: list.listId,
        title: list.title,
        availability: Option.contains(shownListOf(model), list.listId)
          ? Catalog.Disabled({ because: 'it is open' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no lists yet',
  },
  what: 'Opens the list on its own page',
  why: 'The person wants its reminders',
  enabled: withBoard,
  meta: { label: 'Open', keys: [], title: 'Open list' },
})

/** Opens one tag's reminders. */
export const OpenTag = Catalog.action('OpenTag', {
  fields: { tagTitle: TagTitle },
  choose: {
    field: 'tagTitle',
    prompt: 'Which tag?',
    token: TagTitleFromText,
    choicesOf: (model: Model) =>
      Array.map(
        Option.match(boardOf(model), { onNone: () => [], onSome: tagsInUse }),
        tag => ({
          value: tag.title,
          title: `#${tag.title}`,
          availability: Option.contains(shownTagOf(model), tag.title)
            ? Catalog.Disabled({ because: 'it is open' })
            : Catalog.Enabled(),
        }),
      ),
    nothingToChoose: 'no reminder has a tag yet',
  },
  what: 'Shows every reminder with the tag',
  why: 'The person wants the reminders they tagged together',
  enabled: withBoard,
  meta: { label: 'Open', keys: [], title: 'Open tag' },
})

/**
 * Searches every reminder's title, notes, and tags, the way Reminders V3
 * does: `milk`, or `#errands` for one tag.
 */
export const Search = Catalog.action('Search', {
  fields: { query: SearchQuery },
  choose: {
    field: 'query',
    prompt: 'Search for what?',
    token: SearchQuery,
    ...typed<SearchQuery>(withBoard),
    nothingToChoose: 'type what to search for',
  },
  what: 'Searches every reminder by title, notes, and tag',
  why: 'The person wants to find a reminder',
  enabled: withBoard,
  meta: { label: 'Search', keys: [], title: 'Search reminders' },
})

/**
 * Opens one reminder's page: above the list, smart list, tag, or search
 * on screen, or else above its own list.
 */
export const OpenReminder = Catalog.action('OpenReminder', {
  fields: { reminderId: ReminderId },
  choose: {
    ...whichReminder('Which reminder?', (model, reminder) =>
      Option.contains(shownReminderOf(model), reminder.reminderId)
        ? Catalog.Disabled({ because: 'it is open' })
        : Catalog.Enabled(),
    ),
    preferredOf: () => Option.none(),
  },
  what: 'Opens the reminder on its own page',
  why: 'The person wants to change its date, notes, priority, or tags',
  enabled: withBoard,
  meta: { label: 'Open', keys: [], title: 'Open reminder' },
})

/**
 * Goes to every list, home: the Lists tab. Pressed on home, it stays
 * there.
 */
export const ShowLists = Catalog.action('ShowLists', {
  what: 'Goes to the smart lists, every list, and the tags',
  why: 'The person wants another list',
  enabled: unlessAsking,
  meta: { label: 'Lists', keys: [], title: 'Go to your lists' },
})

/** Shows who is signed in and how their reminders stand: the Profile tab. */
export const ShowProfile = Catalog.action('ShowProfile', {
  what: 'Shows who is signed in',
  why: 'The person wants to know which account they are using',
  enabled: unlessAsking,
  meta: { label: 'Profile', keys: [], title: 'Show the profile' },
})

/**
 * Shares a link to the page on screen: a reminder at its own list's
 * address, `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`, any other
 * page at the one the address bar shows. The share sheet on a phone, the
 * clipboard elsewhere. `c` presses it.
 */
export const SharePage = Catalog.action('SharePage', {
  what: 'Shares a link to the page on screen',
  why: 'The person wants to send it, or to open it on another device',
  enabled: (model: Model) =>
    Option.isSome(shownPathOf(model))
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'open a list or a reminder to share it' }),
  meta: { label: 'Share', keys: ['c'], title: 'Share a link to this page' },
})

// LISTS

/** The color a new list takes: the next one along the palette. */
export const newListColorOf = (model: Model): ListColor =>
  Option.getOrElse(
    Array.get(palette, listsOf(model).length % palette.length),
    () => Array.headNonEmpty(palette),
  ).color

/** Adds a list, owned by the signed-in person, at the end. */
export const AddList = Catalog.action('AddList', {
  fields: { title: ListTitle },
  choose: {
    field: 'title',
    prompt: 'What is the new list called?',
    token: ListTitle,
    ...typed<ListTitle>(withBoard),
    nothingToChoose: 'type the list’s name',
  },
  what: 'Adds a list you own',
  why: 'The person wants a new list of reminders',
  enabled: withBoard,
  meta: { label: 'Add list', keys: [], title: 'Add list' },
})

/** Shows the open list's name, color, sharing, and Delete. `i` presses it. */
export const ShowListDetails = Catalog.action('ShowListDetails', {
  what: 'Shows the list’s name, color, and sharing',
  why: 'The person wants to rename, recolor, share, or delete it',
  enabled: onListPage,
  meta: { label: 'List info', keys: ['i'], title: 'Show list details' },
})

/** Renames the open list. */
export const RenameList = Catalog.action('RenameList', {
  fields: { title: ListTitle },
  choose: {
    field: 'title',
    prompt: 'What should the list be called?',
    token: ListTitle,
    ...typed<ListTitle>(onOwnedList),
    nothingToChoose: 'type the list’s new name',
  },
  what: 'Renames the open list',
  why: 'The person wants another name for it',
  enabled: onOwnedList,
  meta: { label: 'Rename', keys: [], title: 'Rename list' },
})

/** Gives the open list another color, and closes its details. */
export const RecolorList = Catalog.action('RecolorList', {
  fields: { color: ListColor },
  choose: {
    field: 'color',
    prompt: 'Which color?',
    token: ColorName,
    choicesOf: (model: Model) =>
      Array.map(palette, entry => ({
        value: entry.color,
        title: String.capitalize(entry.name),
        availability: Option.exists(
          shownList(model),
          list => list.color === entry.color,
        )
          ? Catalog.Disabled({ because: 'it is the list’s color' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no colors',
  },
  what: 'Gives the open list another color',
  why: 'The person wants to tell it apart at a glance',
  enabled: onOwnedList,
  meta: { label: 'Color', keys: [], title: 'Recolor list' },
})

/** Asks before deleting the open list. */
export const DeleteList = Catalog.action('DeleteList', {
  what: 'Asks before deleting the open list and its reminders',
  why: 'The person no longer needs the list',
  enabled: onOwnedList,
  meta: { label: 'Delete list', keys: [], title: 'Delete list' },
})

/**
 * Deletes the list the open question names, and every reminder in it, on
 * every device. `y` presses it.
 */
export const ConfirmDeleteList = Catalog.action('ConfirmDeleteList', {
  fields: { listId: ListId },
  choose: {
    field: 'listId',
    prompt: 'Delete which list?',
    token: ListId,
    choicesOf: (model: Model) =>
      Array.map(
        Option.toArray(
          Option.flatMap(askedListOf(model), listId => listOf(model, listId)),
        ),
        list => ({ value: list.listId, title: list.title }),
      ),
    preferredOf: askedListOf,
    nothingToChoose: 'no delete is waiting for an answer',
  },
  what: 'Deletes the list the question names, and its reminders',
  why: 'The person is sure they want it gone',
  meta: { label: 'Delete', keys: ['y'] },
})

/** Closes the question and keeps the list. `n` presses it. */
export const CancelDeleteList = Catalog.action('CancelDeleteList', {
  what: 'Closes the question and keeps the list',
  why: 'The person changed their mind',
  enabled: (model: Model) =>
    enabledWhen(Option.isSome(askedListOf(model)), 'no delete is waiting'),
  meta: { label: 'Cancel', keys: ['n'] },
})

// REMINDERS

/**
 * The list a new reminder goes to: the open list, or else the first list
 * the person may change.
 */
export const addingListOf = (model: Model): Option.Option<ReminderList> =>
  Option.orElse(shownList(model), () => Array.head(writableListsOf(model)))

const canAddHere = (model: Model): Catalog.Availability => {
  const availability = withBoard(model)
  if (!Catalog.isEnabled(availability)) {
    return availability
  } else {
    return Option.match(addingListOf(model), {
      onNone: () => Catalog.Disabled({ because: 'add a list first' }),
      onSome: list =>
        enabledWhen(
          Option.exists(boardOf(model), board => canWriteIn(board, list)),
          viewOnly,
        ),
    })
  }
}

/**
 * Adds a reminder to the open list, or else to the first list the person
 * may change: due today when added on Today, flagged when added on Flagged.
 */
export const AddReminder = Catalog.action('AddReminder', {
  fields: { title: ReminderTitle },
  choose: {
    field: 'title',
    prompt: 'What do you want to remember?',
    token: ReminderTitle,
    ...typed<ReminderTitle>(canAddHere),
    nothingToChoose: 'type the reminder',
  },
  what: 'Adds a reminder to the open list',
  why: 'The person wants to remember something',
  enabled: canAddHere,
  meta: { label: 'Add', keys: [], title: 'Add reminder' },
})

/** Marks a reminder done. `x` on its row presses it. */
export const Complete = Catalog.action('Complete', {
  fields: { reminderId: ReminderId },
  choose: whichReminder(
    'Complete which reminder?',
    writableAnd(reminder => !reminder.isCompleted, 'it is already done'),
  ),
  what: 'Marks the reminder done',
  why: 'The person did it',
  enabled: withBoard,
  meta: { label: 'Complete', keys: ['x'], title: 'Complete reminder' },
})

/** Marks a done reminder open again. `x` on its row presses it. */
export const Reopen = Catalog.action('Reopen', {
  fields: { reminderId: ReminderId },
  choose: whichReminder(
    'Reopen which reminder?',
    writableAnd(reminder => reminder.isCompleted, 'it is not done'),
  ),
  what: 'Marks the reminder not done',
  why: 'The person ticked it by mistake, or it came back',
  enabled: withBoard,
  meta: { label: 'Reopen', keys: ['x'], title: 'Reopen reminder' },
})

/** Flags a reminder. `f` on its row presses it. */
export const Flag = Catalog.action('Flag', {
  fields: { reminderId: ReminderId },
  choose: whichReminder(
    'Flag which reminder?',
    writableAnd(reminder => !reminder.isFlagged, 'it is already flagged'),
  ),
  what: 'Flags the reminder',
  why: 'The person wants it in Flagged',
  enabled: withBoard,
  meta: { label: 'Flag', keys: ['f'], title: 'Flag reminder' },
})

/** Takes the flag off a reminder. `f` on its row presses it. */
export const Unflag = Catalog.action('Unflag', {
  fields: { reminderId: ReminderId },
  choose: whichReminder(
    'Unflag which reminder?',
    writableAnd(reminder => reminder.isFlagged, 'it is not flagged'),
  ),
  what: 'Takes the flag off the reminder',
  why: 'It no longer needs to stand out',
  enabled: withBoard,
  meta: { label: 'Unflag', keys: ['f'], title: 'Unflag reminder' },
})

/** Deletes a reminder on every device. */
export const DeleteReminder = Catalog.action('DeleteReminder', {
  fields: { reminderId: ReminderId },
  choose: whichReminder('Delete which reminder?', (model, reminder) =>
    enabledWhen(isWritableReminder(model, reminder), viewOnly),
  ),
  what: 'Deletes the reminder',
  why: 'The person no longer needs it',
  enabled: withBoard,
  meta: { label: 'Delete', keys: [], title: 'Delete reminder' },
})

/** Renames the open reminder. */
export const RenameReminder = Catalog.action('RenameReminder', {
  fields: { title: ReminderTitle },
  choose: {
    field: 'title',
    prompt: 'What should the reminder say?',
    token: ReminderTitle,
    ...typed<ReminderTitle>(onWritableReminder),
    nothingToChoose: 'type the reminder',
  },
  what: 'Renames the open reminder',
  why: 'The person wants it to say something else',
  enabled: onWritableReminder,
  meta: { label: 'Rename', keys: [], title: 'Rename reminder' },
})

/** Replaces the open reminder's notes. */
export const SetNotes = Catalog.action('SetNotes', {
  fields: { notes: NotesText },
  choose: {
    field: 'notes',
    prompt: 'What are the notes?',
    token: NotesText,
    ...typed<NotesText>(onWritableReminder),
    nothingToChoose: 'type the notes',
  },
  what: 'Replaces the open reminder’s notes',
  why: 'The person wants the details with it',
  enabled: onWritableReminder,
  meta: { label: 'Notes', keys: [], title: 'Set notes' },
})

/** Clears the open reminder's notes. */
export const ClearNotes = Catalog.action('ClearNotes', {
  what: 'Clears the open reminder’s notes',
  why: 'The notes no longer apply',
  enabled: (model: Model) => {
    const availability = onWritableReminder(model)
    return Catalog.isEnabled(availability)
      ? enabledWhen(
          Option.exists(shownReminder(model), reminder =>
            String.isNonEmpty(reminder.notes),
          ),
          'it has no notes',
        )
      : availability
  },
  meta: { label: 'Clear notes', keys: [], title: 'Clear notes' },
})

/** Shows the due dates to choose from for the open reminder. `d` presses it. */
export const ShowDueDates = Catalog.action('ShowDueDates', {
  what: 'Shows the due dates to choose from',
  why: 'The person wants to be reminded on a day',
  enabled: onWritableReminder,
  meta: { label: 'Due', keys: ['d'], title: 'Choose due date' },
})

/**
 * Sets when the open reminder is due, and closes the due dates: a quick
 * choice, today, tomorrow, this weekend, or next week, or any day typed as
 * `2026-10-05` or `2026-10-05 14:30`.
 */
export const SetDue = Catalog.action('SetDue', {
  fields: { due: DueAt },
  choose: {
    field: 'due',
    prompt: 'When is it due?',
    token: DueToken,
    choicesOf: (model: Model) =>
      Option.match(model.maybeToday, {
        onNone: () => [],
        onSome: today =>
          Array.map(quickDueDates(today), ({ name, due }) => ({
            value: due,
            title: name,
            detail: dueLabel(due, today),
          })),
      }),
    accepts: onWritableReminder,
    nothingToChoose: 'today’s date is not known yet',
  },
  what: 'Sets when the open reminder is due',
  why: 'The person wants to be reminded on that day',
  enabled: onWritableReminder,
  meta: { label: 'Set', keys: [], title: 'Set due date' },
})

/** Clears the open reminder's due date, and closes the due dates. */
export const ClearDue = Catalog.action('ClearDue', {
  what: 'Clears the open reminder’s due date',
  why: 'It is no longer due on a day',
  enabled: (model: Model) => {
    const availability = onWritableReminder(model)
    return Catalog.isEnabled(availability)
      ? enabledWhen(
          Option.exists(shownReminder(model), reminder =>
            Option.isSome(reminder.maybeDue),
          ),
          'it has no due date',
        )
      : availability
  },
  meta: { label: 'No date', keys: [], title: 'Clear due date' },
})

/** Shows the priorities to choose from for the open reminder. `p` presses it. */
export const ShowPriorities = Catalog.action('ShowPriorities', {
  what: 'Shows the priorities to choose from',
  why: 'The person wants to say how much it matters',
  enabled: onWritableReminder,
  meta: { label: 'Priority', keys: ['p'], title: 'Choose priority' },
})

const priorityChoiceOf = (reminder: Reminder): PriorityChoice =>
  Option.getOrElse(reminder.maybePriority, (): PriorityChoice => 'NoPriority')

/** The words a priority choice reads as: `None`, `Low`, `Medium`, `High`. */
export const priorityTitleOf = (choice: PriorityChoice): string =>
  choice === 'NoPriority' ? 'None' : choice

/** Sets how much the open reminder matters, and closes the priorities. */
export const SetPriority = Catalog.action('SetPriority', {
  fields: { priority: PriorityChoice },
  choose: {
    field: 'priority',
    prompt: 'Which priority?',
    token: PriorityWord,
    choicesOf: (model: Model) =>
      Array.map(PriorityChoice.literals, choice => ({
        value: choice,
        title: priorityTitleOf(choice),
        availability: Option.exists(
          shownReminder(model),
          reminder => priorityChoiceOf(reminder) === choice,
        )
          ? Catalog.Disabled({ because: 'it is the priority now' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no priorities',
  },
  what: 'Sets how much the open reminder matters',
  why: 'The person wants it sorted with the ones that matter most',
  enabled: onWritableReminder,
  meta: { label: 'Set', keys: [], title: 'Set priority' },
})

/** Shows the lists the open reminder can move to. */
export const ShowMoveOptions = Catalog.action('ShowMoveOptions', {
  what: 'Shows the lists the open reminder can move to',
  why: 'The person filed it in the wrong list',
  enabled: onWritableReminder,
  meta: { label: 'Move', keys: [], title: 'Move to list' },
})

/** Moves the open reminder to the end of another list, and closes the lists. */
export const MoveReminder = Catalog.action('MoveReminder', {
  fields: { listId: ListId },
  choose: {
    field: 'listId',
    prompt: 'Move to which list?',
    token: ListId,
    choicesOf: (model: Model) =>
      Array.map(writableListsOf(model), list => ({
        value: list.listId,
        title: list.title,
        availability: Option.exists(
          shownReminder(model),
          reminder => reminder.listId === list.listId,
        )
          ? Catalog.Disabled({ because: 'it is in this list' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'there is no list to move it to',
  },
  what: 'Moves the open reminder to another list',
  why: 'It belongs with other reminders',
  enabled: onWritableReminder,
  meta: { label: 'Move', keys: [], title: 'Move reminder' },
})

/** Tags the open reminder, with a tag it does not have yet or a new one. */
export const AddTag = Catalog.action('AddTag', {
  fields: { tagTitle: TagTitle },
  choose: {
    field: 'tagTitle',
    prompt: 'Which tag?',
    token: TagTitleFromText,
    choicesOf: (model: Model) =>
      Option.match(
        Option.flatMap(boardOf(model), board =>
          Option.map(shownReminder(model), reminder => ({ board, reminder })),
        ),
        {
          onNone: () => [],
          onSome: ({ board, reminder }) =>
            Array.map(
              Array.filter(
                tagsInUse(board),
                tag => !Array.contains(reminder.tagIds, tag.tagId),
              ),
              tag => ({ value: tag.title, title: `#${tag.title}` }),
            ),
        },
      ),
    accepts: onWritableReminder,
    nothingToChoose: 'type a tag',
  },
  what: 'Tags the open reminder',
  why: 'The person wants to find it with others like it',
  enabled: onWritableReminder,
  meta: { label: 'Tag', keys: [], title: 'Add tag' },
})

/** Takes one tag off the open reminder. */
export const Untag = Catalog.action('Untag', {
  fields: { tagTitle: TagTitle },
  choose: {
    field: 'tagTitle',
    prompt: 'Remove which tag?',
    token: TagTitleFromText,
    choicesOf: (model: Model) =>
      Option.match(
        Option.flatMap(boardOf(model), board =>
          Option.map(shownReminder(model), reminder => tagsOf(board, reminder)),
        ),
        {
          onNone: () => [],
          onSome: tags =>
            Array.map(tags, tag => ({
              value: tag.title,
              title: `#${tag.title}`,
            })),
        },
      ),
    nothingToChoose: 'it has no tags',
  },
  what: 'Takes the tag off the open reminder',
  why: 'It no longer belongs with that tag',
  enabled: onWritableReminder,
  meta: { label: 'Remove', keys: [], title: 'Untag reminder' },
})

/** Deletes the open tag from every reminder, when they are all the person's. */
export const DeleteTag = Catalog.action('DeleteTag', {
  what: 'Deletes the tag from every reminder that has it',
  why: 'The person no longer uses the tag',
  enabled: (model: Model) => {
    const availability = withBoard(model)
    if (!Catalog.isEnabled(availability)) {
      return availability
    } else {
      return Option.match(
        Option.flatMap(boardOf(model), board =>
          Option.flatMap(shownTagOf(model), title =>
            Option.map(tagNamed(board, title), tag =>
              canDeleteTagIn(board, tag),
            ),
          ),
        ),
        {
          onNone: () => Catalog.Disabled({ because: 'no tag is open' }),
          onSome: isDeletable =>
            enabledWhen(isDeletable, 'someone else’s list uses this tag'),
        },
      )
    }
  },
  meta: { label: 'Delete tag', keys: [], title: 'Delete tag' },
})

// COMPLETED

const completedInShownList = (model: Model): ReadonlyArray<Reminder> =>
  Option.match(
    Option.flatMap(boardOf(model), board =>
      Option.map(shownList(model), list => ({ board, list })),
    ),
    {
      onNone: () => [],
      onSome: ({ board, list }) =>
        Array.filter(
          board.reminders,
          reminder => reminder.listId === list.listId && reminder.isCompleted,
        ),
    },
  )

/** Shows done reminders under the open ones. */
export const ShowCompleted = Catalog.action('ShowCompleted', {
  what: 'Shows done reminders under the open ones',
  why: 'The person wants to see what they finished',
  enabled: (model: Model) =>
    model.completed === 'Shown'
      ? Catalog.Disabled({ because: 'done reminders are showing' })
      : unlessAsking(model),
  meta: { label: 'Show completed', keys: ['h'], title: 'Show completed' },
})

/** Hides done reminders. */
export const HideCompleted = Catalog.action('HideCompleted', {
  what: 'Hides done reminders',
  why: 'The person wants only what is left to do',
  enabled: (model: Model) =>
    model.completed === 'Hidden'
      ? Catalog.Disabled({ because: 'done reminders are hidden' })
      : unlessAsking(model),
  meta: { label: 'Hide completed', keys: ['h'], title: 'Hide completed' },
})

/** Asks before deleting every done reminder in the open list. */
export const ClearCompleted = Catalog.action('ClearCompleted', {
  what: 'Asks before deleting every done reminder in the open list',
  why: 'The person wants the list tidy',
  enabled: (model: Model) => {
    const availability = onListPage(model)
    if (!Catalog.isEnabled(availability)) {
      return availability
    } else if (
      !Option.exists(shownList(model), list => isWritableList(model, list))
    ) {
      return Catalog.Disabled({ because: viewOnly })
    } else {
      return enabledWhen(
        Array.isReadonlyArrayNonEmpty(completedInShownList(model)),
        'nothing is done yet',
      )
    }
  },
  meta: { label: 'Clear', keys: [], title: 'Clear completed' },
})

/**
 * Deletes every done reminder in the list the open question names. `y`
 * presses it.
 */
export const ConfirmClearCompleted = Catalog.action('ConfirmClearCompleted', {
  fields: { listId: ListId },
  choose: {
    field: 'listId',
    prompt: 'Clear which list?',
    token: ListId,
    choicesOf: (model: Model) =>
      Array.map(
        Option.toArray(
          Option.flatMap(clearingListOf(model), listId =>
            listOf(model, listId),
          ),
        ),
        list => ({ value: list.listId, title: list.title }),
      ),
    preferredOf: clearingListOf,
    nothingToChoose: 'no clear is waiting for an answer',
  },
  what: 'Deletes every done reminder in the list the question names',
  why: 'The person is sure they want them gone',
  meta: { label: 'Delete', keys: ['y'] },
})

/** Closes the question and keeps the done reminders. `n` presses it. */
export const CancelClearCompleted = Catalog.action('CancelClearCompleted', {
  what: 'Closes the question and keeps the done reminders',
  why: 'The person changed their mind',
  enabled: (model: Model) =>
    enabledWhen(Option.isSome(clearingListOf(model)), 'no clear is waiting'),
  meta: { label: 'Cancel', keys: ['n'] },
})

// SORT

const isOnSortable = (model: Model): boolean =>
  Option.exists(
    topPageOf(model),
    page =>
      isListPage(page) ||
      isTagPage(page) ||
      Option.exists(
        shownSmartListOf(model),
        smartList => smartList === 'All' || smartList === 'Flagged',
      ),
  )

/** Shows the orders to choose from. `o` presses it. */
export const ShowSortOptions = Catalog.action('ShowSortOptions', {
  what: 'Shows the orders to choose from',
  why: 'The person wants the reminders in another order',
  enabled: (model: Model) =>
    isOnSortable(model)
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'this page keeps its own order' }),
  meta: { label: 'Sort', keys: ['o'], title: 'Choose order' },
})

/** The words an order reads as: `Manual`, `Due date`, `Priority`, `Title`. */
export const orderingTitleOf = (ordering: Ordering): string =>
  ordering === 'DueDate' ? 'Due date' : ordering

/** Orders lists by one of Reminders V3's orders, and closes the orders. */
export const SortBy = Catalog.action('SortBy', {
  fields: { ordering: Ordering },
  choose: {
    field: 'ordering',
    prompt: 'Which order?',
    token: OrderingWord,
    choicesOf: (model: Model) =>
      Array.map(Ordering.literals, ordering => ({
        value: ordering,
        title: orderingTitleOf(ordering),
        availability:
          model.ordering === ordering
            ? Catalog.Disabled({ because: 'it is the order now' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no orders',
  },
  what: 'Orders the reminders on screen',
  why: 'The person wants them by date, priority, title, or their own order',
  enabled: unlessAsking,
  meta: { label: 'Sort', keys: [], title: 'Sort by' },
})

// SHARING

/** Shows who the open list is shared with. */
export const ShowSharing = Catalog.action('ShowSharing', {
  what: 'Shows who the open list is shared with',
  why: 'The person wants to share it, or to see who can change it',
  enabled: onListPage,
  meta: { label: 'Sharing', keys: [], title: 'Show sharing' },
})

const shareOfShown = (model: Model) =>
  Option.flatMap(shownList(model), list => list.maybeShare)

/** Starts sharing the open list, so its owner can invite people by email. */
export const StartSharing = Catalog.action('StartSharing', {
  what: 'Starts sharing the open list',
  why: 'The person wants others to see or change it',
  enabled: (model: Model) => {
    const availability = onOwnedList(model)
    return Catalog.isEnabled(availability)
      ? enabledWhen(Option.isNone(shareOfShown(model)), 'it is shared')
      : availability
  },
  meta: { label: 'Start sharing', keys: [], title: 'Start sharing' },
})

const onSharedOwnedList = (model: Model): Catalog.Availability => {
  const availability = onOwnedList(model)
  return Catalog.isEnabled(availability)
    ? enabledWhen(Option.isSome(shareOfShown(model)), 'start sharing it first')
    : availability
}

/**
 * Shares the open list with the person who signs in with an email, who can
 * then view it. Allow editing lets them change it.
 */
export const ShareWith = Catalog.action('ShareWith', {
  fields: { email: EmailAddress },
  choose: {
    field: 'email',
    prompt: 'Whose email?',
    token: EmailAddress,
    ...typed<EmailAddress>(onSharedOwnedList),
    nothingToChoose: 'type their email',
  },
  what: 'Shares the open list with someone to view',
  why: 'The person wants them to see it',
  enabled: onSharedOwnedList,
  meta: { label: 'Share', keys: [], title: 'Share with' },
})

/** One person the open list is shared with, and what they may do. */
export type SharedPerson = Readonly<{
  member: Member
  role: Role
}>

/** The people the open list is shared with now, its owner left out. */
export const sharedPeopleOf = (model: Model): ReadonlyArray<SharedPerson> =>
  Option.match(
    Option.flatMap(boardOf(model), board =>
      Option.map(shownList(model), list => ({ board, list })),
    ),
    {
      onNone: () => [],
      onSome: ({ board, list }) =>
        Array.getSomes(
          Array.map(sharedWithOf(list), membership =>
            Option.map(personOf(board, membership.memberId), member => ({
              member,
              role: membership.role,
            })),
          ),
        ),
    },
  )

const whichPerson = (
  prompt: string,
  availabilityOf: (person: SharedPerson) => Catalog.Availability,
): Catalog.Choose<Model, 'memberId', MemberId> => ({
  field: 'memberId',
  prompt,
  token: MemberId,
  choicesOf: model =>
    Array.map(sharedPeopleOf(model), person => ({
      value: person.member.memberId,
      title: identityTitleOf(person.member),
      detail: person.role === 'Writer' ? 'Can edit' : 'Can view',
      availability: availabilityOf(person),
    })),
  nothingToChoose: 'the list is not shared with anyone',
})

/** Lets someone the open list is shared with change it. */
export const AllowEditing = Catalog.action('AllowEditing', {
  fields: { memberId: MemberId },
  choose: whichPerson('Who may edit?', person =>
    enabledWhen(person.role === 'Reader', 'they can edit'),
  ),
  what: 'Lets them change the list',
  why: 'The person wants them to add and tick reminders too',
  enabled: onSharedOwnedList,
  meta: { label: 'Allow editing', keys: [], title: 'Allow editing' },
})

/** Lets someone the open list is shared with only view it. */
export const AllowViewingOnly = Catalog.action('AllowViewingOnly', {
  fields: { memberId: MemberId },
  choose: whichPerson('Who may only view?', person =>
    enabledWhen(person.role === 'Writer', 'they can only view'),
  ),
  what: 'Lets them only view the list',
  why: 'The person wants the list to stay as they keep it',
  enabled: onSharedOwnedList,
  meta: { label: 'Make view only', keys: [], title: 'Allow viewing only' },
})

/** Stops sharing the open list with one person. */
export const StopSharingWith = Catalog.action('StopSharingWith', {
  fields: { memberId: MemberId },
  choose: whichPerson('Stop sharing with whom?', () => Catalog.Enabled()),
  what: 'Stops sharing the list with them',
  why: 'They no longer need it',
  enabled: onSharedOwnedList,
  meta: { label: 'Remove', keys: [], title: 'Stop sharing with' },
})

/**
 * Every Reminders Action in the order surfaces list them. The action menu
 * shows each once; the ones that act on a list, reminder, tag, or person
 * ask which next, and the ones that take words take them typed. The CLI
 * reads them as `reminders add-reminder Buy milk` and `reminders complete
 * 00000000-0000-4000-8003-000000000001`.
 */
export const catalog = Catalog.make([
  AddReminder,
  Complete,
  Reopen,
  Flag,
  Unflag,
  OpenReminder,
  RenameReminder,
  SetNotes,
  ClearNotes,
  ShowDueDates,
  SetDue,
  ClearDue,
  ShowPriorities,
  SetPriority,
  ShowMoveOptions,
  MoveReminder,
  AddTag,
  Untag,
  DeleteReminder,
  OpenSmartList,
  OpenList,
  OpenTag,
  Search,
  ShowLists,
  ShowProfile,
  SharePage,
  AddList,
  ShowListDetails,
  RenameList,
  RecolorList,
  DeleteList,
  ConfirmDeleteList,
  CancelDeleteList,
  ShowCompleted,
  HideCompleted,
  ClearCompleted,
  ConfirmClearCompleted,
  CancelClearCompleted,
  ShowSortOptions,
  SortBy,
  DeleteTag,
  ShowSharing,
  StartSharing,
  ShareWith,
  AllowEditing,
  AllowViewingOnly,
  StopSharingWith,
])

// FACTS

/** The store sent the board. */
export const ReceivedBoard = m('ReceivedBoard', { board: Board })
/** The store reported that nobody is signed in. */
export const ReceivedSignedOut = m('ReceivedSignedOut')
/** The store could not be read, and why, safe to show. */
export const FailedReadBoard = m('FailedReadBoard', { reason: S.String })
/** This device's clock reached a day: the day the Program started, then each midnight. */
export const ReachedDay = m('ReachedDay', { today: LocalDay })
/** The store saved a change. */
export const CompletedWriteReminders = m('CompletedWriteReminders')
/** The store refused a change, and why, safe to show. */
export const FailedWriteReminders = m('FailedWriteReminders', {
  reason: S.String,
})
/** The link to a page went out, through a share sheet or a clipboard. */
export const SharedLink = m('SharedLink', { how: SharedHow })
/** The link to a page could not go out, and why, safe to show. */
export const FailedShareLink = m('FailedShareLink', { reason: S.String })

/**
 * Every Message Reminders accepts: the Catalog's Actions, the facts the
 * store, the clock, and link sharing report, and the carrier facts its
 * stack folds.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  ReceivedBoard,
  ReceivedSignedOut,
  FailedReadBoard,
  ReachedDay,
  CompletedWriteReminders,
  FailedWriteReminders,
  SharedLink,
  FailedShareLink,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Reminders Message value. */
export type Message = typeof Message.Type
