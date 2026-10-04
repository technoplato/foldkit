import { Array, Match as M, Option, Schema as S, String, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  type ItemCheck,
  List,
  type ListItem,
  Row,
  Text,
  TextInput,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import {
  type Board,
  type Ordering,
  type Reminder,
  type ReminderList,
  type SmartList,
  type Tag,
  completedOf,
  identityTitleOf,
  isOverdue,
  listIn,
  listsInOrder,
  openOf,
  personOf,
  reminderIn,
  remindersInList,
  remindersInSmartList,
  remindersTagged,
  roleIn,
  searchResultsOf,
  sharedWithOf,
  sortedBy,
  tagNamed,
  tagsInUse,
  tagsOf,
} from './board.js'
import {
  type LocalDay,
  dayLabel,
  dueLabel,
  dueTokenOf,
  quickDueDates,
} from './calendar.js'
import type { ListId, ReminderId, SearchQuery, TagTitle } from './ids.js'
import {
  listTileOf,
  palette,
  personTileOf,
  smartListTileOf,
  tagTileOf,
} from './look.js'
import {
  AddList,
  AddReminder,
  AddTag,
  AllowEditing,
  AllowViewingOnly,
  CancelClearCompleted,
  CancelDeleteList,
  ClearCompleted,
  ClearDue,
  ClearNotes,
  Complete,
  ConfirmClearCompleted,
  ConfirmDeleteList,
  DeleteList,
  DeleteReminder,
  DeleteTag,
  Flag,
  HideCompleted,
  MoveReminder,
  OpenList,
  OpenProfile,
  OpenReminder,
  OpenSmartList,
  OpenTag,
  OrderingWord,
  PriorityChoice,
  PriorityWord,
  RecolorList,
  RenameList,
  RenameReminder,
  Reopen,
  Search,
  SetDue,
  SetNotes,
  SetPriority,
  ShareWith,
  ShowCompleted,
  ShowDueDates,
  ShowListDetails,
  ShowLists,
  ShowPriorities,
  ShowSharing,
  ShowSortOptions,
  SmartListWord,
  SortBy,
  StartSharing,
  StopSharingWith,
  Unflag,
  Untag,
  catalog,
  orderingTitleOf,
  priorityTitleOf,
  sharedPeopleOf,
  shownList,
  shownReminder,
  smartCountOf,
} from './message.js'
import { type Model, boardOf } from './model.js'

// VIEW

type AnyAction = Readonly<{ tag: string }>

type Variant = ButtonNode['variant']

const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

const withVariant = (
  buttons: ReadonlyArray<ButtonNode>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button =>
    variant === undefined ? button : { ...button, variant },
  )

const isEnabledAction = (model: Model, action: AnyAction): boolean =>
  Array.some(
    entriesOf(model),
    entry => entry.tag === action.tag && Catalog.isEnabled(entry.availability),
  )

const offeredButtonsOf = (
  model: Model,
  actions: ReadonlyArray<AnyAction>,
  variant?: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(
        entriesOf(model),
        entry =>
          Catalog.isEnabled(entry.availability) &&
          Array.some(actions, action => action.tag === entry.tag),
      ),
    ),
    variant,
  )

const buttonsOf = (
  model: Model,
  actions: ReadonlyArray<AnyAction>,
  variant?: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(entriesOf(model), entry =>
        Array.some(actions, action => action.tag === entry.tag),
      ),
    ),
    variant,
  )

const choiceButtonsOf = (
  model: Model,
  token: string,
  actions: ReadonlyArray<AnyAction>,
  variant?: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(
        Catalog.entriesFor(entriesOf(model), token),
        entry =>
          Catalog.isEnabled(entry.availability) &&
          Array.some(actions, action =>
            Option.exists(
              Catalog.parseChoiceTag(entry.tag),
              choice => choice.tag === action.tag,
            ),
          ),
      ),
    ),
    variant,
  )

const isOffered = (model: Model, tag: string): boolean =>
  Option.isSome(Catalog.messageFor(catalog, model, tag))

const offeredActionOf = (
  model: Model,
  tag: string,
): Pick<ListItem, 'action'> => (isOffered(model, tag) ? { action: tag } : {})

const counted = (count: number, one: string, many: string): string =>
  `${count.toString()} ${count === 1 ? one : many}`

const toDoOf = (count: number): string =>
  count === 0 ? 'All done' : counted(count, 'to do', 'to do')

const problemLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(model.maybeProblem, {
    onNone: () => [],
    onSome: problem => [
      Text(`Your last change was not saved: ${problem}`, { dim: true }),
    ],
  })

const headingOf = (title: string): UiNode =>
  Text(title, { emphasis: 'Headline' })

const sectionOf = (title: string): UiNode => Text(title, { dim: true })

const missingNodes = (title: string, detail: string): ReadonlyArray<UiNode> => [
  Text(title),
  Text(detail, { dim: true }),
]

// ROWS

const priorityMarks = (reminder: Reminder): string =>
  Option.match(reminder.maybePriority, {
    onNone: () => '',
    onSome: priority =>
      M.value(priority).pipe(
        M.withReturnType<string>(),
        M.when('Low', () => '! '),
        M.when('Medium', () => '!! '),
        M.when('High', () => '!!! '),
        M.exhaustive,
      ),
  })

const dueTextOf = (model: Model, reminder: Reminder): Option.Option<string> =>
  Option.flatMap(reminder.maybeDue, due =>
    Option.map(model.maybeToday, today =>
      isOverdue(reminder, today)
        ? `Overdue · ${dueLabel(due, today)}`
        : dueLabel(due, today),
    ),
  )

type RowContext = 'InList' | 'Across'

const detailLineOf = (
  model: Model,
  board: Board,
  reminder: Reminder,
  context: RowContext,
): Option.Option<string> =>
  pipe(
    [
      dueTextOf(model, reminder),
      reminder.isFlagged ? Option.some('Flagged') : Option.none(),
      context === 'Across'
        ? Option.map(listIn(board, reminder.listId), list => list.title)
        : Option.none(),
      ...Array.map(tagsOf(board, reminder), tag =>
        Option.some(`#${tag.title}`),
      ),
    ],
    Array.getSomes,
    Array.match({
      onEmpty: () => Option.none(),
      onNonEmpty: parts => Option.some(Array.join(parts, ' · ')),
    }),
  )

const notesLineOf = (reminder: Reminder): Option.Option<string> =>
  Option.filter(Option.some(reminder.notes.trim()), String.isNonEmpty)

const checkOf = (model: Model, reminder: Reminder): ItemCheck => {
  const tag = Catalog.choiceTagOf(
    reminder.isCompleted ? Reopen.tag : Complete.tag,
    reminder.reminderId,
  )
  return {
    isChecked: reminder.isCompleted,
    label: reminder.isCompleted
      ? `Mark ${reminder.title} not done`
      : `Mark ${reminder.title} done`,
    ...offeredActionOf(model, tag),
  }
}

const reminderItemOf = (
  model: Model,
  board: Board,
  reminder: Reminder,
  context: RowContext,
): ListItem => ({
  key: reminder.reminderId,
  title: `${priorityMarks(reminder)}${reminder.title}`,
  lines: Array.getSomes([
    detailLineOf(model, board, reminder, context),
    notesLineOf(reminder),
  ]),
  check: checkOf(model, reminder),
  ...offeredActionOf(
    model,
    Catalog.choiceTagOf(OpenReminder.tag, reminder.reminderId),
  ),
})

const remindersListOf = (
  model: Model,
  board: Board,
  label: string,
  reminders: ReadonlyArray<Reminder>,
  context: RowContext,
): UiNode =>
  List({
    label,
    items: Array.map(reminders, reminder =>
      reminderItemOf(model, board, reminder, context),
    ),
  })

// HOME

const smartLists: ReadonlyArray<SmartList> = [
  'Today',
  'Scheduled',
  'All',
  'Flagged',
  'Completed',
]

const smartSentence = (model: Model, smartList: SmartList): string => {
  const count = smartCountOf(model, smartList)
  const sentenceOf = (empty: string, words: string): string =>
    count === 0 ? empty : `${count.toString()} ${words}`
  return M.value(smartList).pipe(
    M.withReturnType<string>(),
    M.when('Today', () => sentenceOf('Nothing due', 'due by today')),
    M.when('Scheduled', () => sentenceOf('Nothing scheduled', 'scheduled')),
    M.when('All', () => sentenceOf('All done', 'to do')),
    M.when('Flagged', () => sentenceOf('Nothing flagged', 'flagged')),
    M.when('Completed', () => sentenceOf('Nothing done yet', 'done')),
    M.exhaustive,
  )
}

const smartItemOf = (model: Model, smartList: SmartList): ListItem => ({
  key: smartList,
  title: smartList,
  lines: [smartSentence(model, smartList)],
  image: smartListTileOf(smartList, model.maybeToday),
  ...offeredActionOf(
    model,
    Catalog.choiceTagOf(
      OpenSmartList.tag,
      S.encodeSync(SmartListWord)(smartList),
    ),
  ),
})

const ownerNameOf = (board: Board, list: ReminderList): string =>
  Option.getOrElse(
    Option.map(personOf(board, list.ownerId), identityTitleOf),
    () => 'Someone',
  )

const sharingLineOf = (
  board: Board,
  list: ReminderList,
): Option.Option<string> =>
  M.value(roleIn(board, list)).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('Owner', () =>
      Array.match(
        Array.getSomes(
          Array.map(sharedWithOf(list), membership =>
            Option.map(personOf(board, membership.memberId), identityTitleOf),
          ),
        ),
        {
          onEmpty: () => Option.none(),
          onNonEmpty: names =>
            Option.some(`Shared with ${Array.join(names, ', ')}`),
        },
      ),
    ),
    M.when('Writer', () =>
      Option.some(`${ownerNameOf(board, list)}’s list, you can edit`),
    ),
    M.when('Reader', () =>
      Option.some(`${ownerNameOf(board, list)}’s list, view only`),
    ),
    M.exhaustive,
  )

const listItemOf = (
  model: Model,
  board: Board,
  list: ReminderList,
): ListItem => ({
  key: list.listId,
  title: list.title,
  lines: [
    Array.join(
      [
        toDoOf(openOf(remindersInList(board, list.listId)).length),
        ...Option.toArray(sharingLineOf(board, list)),
      ],
      ' · ',
    ),
  ],
  image: listTileOf(list.title, list.color),
  ...offeredActionOf(model, Catalog.choiceTagOf(OpenList.tag, list.listId)),
})

const tagItemOf = (model: Model, board: Board, tag: Tag): ListItem => ({
  key: tag.tagId,
  title: `#${tag.title}`,
  lines: [toDoOf(openOf(remindersTagged(board, tag)).length)],
  image: tagTileOf(tag.title),
  ...offeredActionOf(model, Catalog.choiceTagOf(OpenTag.tag, tag.title)),
})

const profileItemOf = (model: Model, board: Board): ListItem => {
  const name = identityTitleOf(board.member)
  return {
    key: board.member.memberId,
    title: name,
    lines: [
      Option.getOrElse(
        Option.filter(board.member.maybeEmail, email => email !== name),
        () => 'Signed in',
      ),
    ],
    image: personTileOf(name),
    ...offeredActionOf(model, OpenProfile.tag),
  }
}

const boardOrStatus = (
  model: Model,
  onBoard: (board: Board) => ReadonlyArray<UiNode>,
): ReadonlyArray<UiNode> =>
  M.value(model.board).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      BoardLoading: () => [Text('Opening your reminders…', { dim: true })],
      BoardSignedOut: () => [
        Text('Sign in to see your reminders.'),
        Text(
          'Reminders signs you in with your Knophy account when you open it from its hosted address.',
          { dim: true },
        ),
      ],
      BoardUnavailable: ({ reason }) => [
        Text(`Your reminders could not be opened: ${reason}`),
      ],
      BoardReady: ({ board }) => onBoard(board),
    }),
  )

/**
 * Home: search, the smart lists with what each holds, every list with how
 * much is left and who it is shared with, a field to add a list, the tags,
 * and who is signed in. Pressing a row opens it.
 *
 * @example
 * ```typescript
 * homeScreen(model)
 * // Column: Reminders, [Search], List(Today…Completed), My Lists, List(Groceries…), [New list], Tags, List(#errands…), List(Ada Quill)
 * ```
 */
export const homeScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Reminders'),
    ...boardOrStatus(model, board => [
      TextInput({
        value: '',
        placeholder: 'Search reminders or #tags',
        action: Search.tag,
        label: 'Search reminders',
      }),
      ...problemLines(model),
      List({
        label: 'Smart lists',
        items: Array.map(smartLists, smartList =>
          smartItemOf(model, smartList),
        ),
      }),
      sectionOf('My Lists'),
      ...Array.match(listsInOrder(board), {
        onEmpty: () => [
          Text('No lists yet. Name one below to start.', { dim: true }),
        ],
        onNonEmpty: lists => [
          List({
            label: 'My lists',
            items: Array.map(lists, list => listItemOf(model, board, list)),
          }),
        ],
      }),
      TextInput({
        value: '',
        placeholder: 'New list',
        action: AddList.tag,
        label: 'Name a new list',
      }),
      ...Array.match(tagsInUse(board), {
        onEmpty: () => [],
        onNonEmpty: tags => [
          sectionOf('Tags'),
          List({
            label: 'Tags',
            items: Array.map(tags, tag => tagItemOf(model, board, tag)),
          }),
        ],
      }),
      List({ label: 'Signed in', items: [profileItemOf(model, board)] }),
    ]),
  )

// LIST

const addFieldOf = (
  model: Model,
  placeholder: string,
  label: string,
): ReadonlyArray<UiNode> =>
  isEnabledAction(model, AddReminder)
    ? [TextInput({ value: '', placeholder, action: AddReminder.tag, label })]
    : []

const completedSectionOf = (
  model: Model,
  board: Board,
  label: string,
  done: ReadonlyArray<Reminder>,
  context: RowContext,
): ReadonlyArray<UiNode> =>
  model.completed === 'Shown' && Array.isReadonlyArrayNonEmpty(done)
    ? [
        Row(
          { gap: 1 },
          sectionOf(counted(done.length, 'completed', 'completed')),
          ...offeredButtonsOf(model, [ClearCompleted], 'Ghost'),
        ),
        remindersListOf(model, board, label, done, context),
      ]
    : []

const listNodes = (
  model: Model,
  board: Board,
  list: ReminderList,
): ReadonlyArray<UiNode> => {
  const reminders = remindersInList(board, list.listId)
  const open = sortedBy(openOf(reminders), model.ordering)
  const done = sortedBy(completedOf(reminders), model.ordering)
  return [
    headingOf(list.title),
    Text(
      Array.join(
        [
          toDoOf(open.length),
          ...(Array.isReadonlyArrayEmpty(done)
            ? []
            : [counted(done.length, 'done', 'done')]),
          Option.getOrElse(sharingLineOf(board, list), () => 'Only you'),
        ],
        ' · ',
      ),
      { dim: true },
    ),
    ...problemLines(model),
    ...addFieldOf(model, 'New reminder', `New reminder in ${list.title}`),
    ...Array.match(open, {
      onEmpty: () => [Text('Nothing left to do here.', { dim: true })],
      onNonEmpty: rows => [
        remindersListOf(
          model,
          board,
          `${list.title} reminders`,
          rows,
          'InList',
        ),
      ],
    }),
    ...completedSectionOf(model, board, `${list.title} done`, done, 'InList'),
    Row(
      { gap: 1 },
      ...offeredButtonsOf(
        model,
        [ShowCompleted, HideCompleted, ShowSortOptions, ShowListDetails],
        'Ghost',
      ),
    ),
  ]
}

/**
 * One list's page: its name, who it is shared with, a field to add a
 * reminder, its open reminders in this device's order, the done ones when
 * shown, and Show completed, Sort, and List info.
 */
export const listPageScreen = (model: Model, listId: ListId): UiNode =>
  Column(
    { gap: 1 },
    ...boardOrStatus(model, board =>
      Option.match(listIn(board, listId), {
        onNone: () =>
          missingNodes(
            'This list is gone',
            'It may have been deleted on another device. Go back to your lists.',
          ),
        onSome: list => listNodes(model, board, list),
      }),
    ),
  )

// SMART

const smartAddPlaceholder = (smartList: SmartList): Option.Option<string> =>
  M.value(smartList).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('Today', () => Option.some('New reminder for today')),
    M.when('Scheduled', () => Option.some('New reminder for today')),
    M.when('Flagged', () => Option.some('New flagged reminder')),
    M.when('All', () => Option.some('New reminder')),
    M.when('Completed', () => Option.none()),
    M.exhaustive,
  )

const dayGroupOf = (reminder: Reminder, today: LocalDay): string =>
  Option.match(reminder.maybeDue, {
    onNone: () => 'No date',
    onSome: due => (due.day < today ? 'Overdue' : dayLabel(due.day, today)),
  })

const scheduledSections = (
  model: Model,
  board: Board,
  reminders: ReadonlyArray<Reminder>,
  today: LocalDay,
): ReadonlyArray<UiNode> =>
  Array.match(sortedBy(reminders, 'DueDate'), {
    onEmpty: () => [],
    onNonEmpty: sorted =>
      pipe(
        sorted,
        Array.groupWith(
          (self, that) => dayGroupOf(self, today) === dayGroupOf(that, today),
        ),
        Array.flatMap(group => {
          const heading = dayGroupOf(Array.headNonEmpty(group), today)
          return [
            sectionOf(heading),
            remindersListOf(model, board, heading, group, 'Across'),
          ]
        }),
      ),
  })

const orderedForSmartList = (
  model: Model,
  smartList: SmartList,
  reminders: ReadonlyArray<Reminder>,
): ReadonlyArray<Reminder> =>
  smartList === 'Today' || smartList === 'Scheduled'
    ? sortedBy(reminders, 'DueDate')
    : sortedBy(reminders, model.ordering)

const smartRowsOf = (
  model: Model,
  board: Board,
  smartList: SmartList,
  rows: Array.NonEmptyReadonlyArray<Reminder>,
): ReadonlyArray<UiNode> =>
  smartList === 'Scheduled'
    ? Option.match(model.maybeToday, {
        onNone: () => [
          remindersListOf(model, board, smartList, rows, 'Across'),
        ],
        onSome: today => scheduledSections(model, board, rows, today),
      })
    : [remindersListOf(model, board, smartList, rows, 'Across')]

/**
 * One smart list's page: what it holds across every list, Scheduled
 * grouped by day with the overdue first, and a field to add one where it
 * makes sense: due today on Today, flagged on Flagged.
 */
export const smartListScreen = (model: Model, smartList: SmartList): UiNode =>
  Column(
    { gap: 1 },
    headingOf(smartList),
    ...boardOrStatus(model, board => [
      Text(smartSentence(model, smartList), { dim: true }),
      ...problemLines(model),
      ...Option.match(smartAddPlaceholder(smartList), {
        onNone: () => [],
        onSome: placeholder => addFieldOf(model, placeholder, placeholder),
      }),
      ...Array.match(
        orderedForSmartList(
          model,
          smartList,
          remindersInSmartList(board, smartList, model.maybeToday),
        ),
        {
          onEmpty: () => [Text('Nothing here.', { dim: true })],
          onNonEmpty: rows => smartRowsOf(model, board, smartList, rows),
        },
      ),
      Row({ gap: 1 }, ...offeredButtonsOf(model, [ShowSortOptions], 'Ghost')),
    ]),
  )

// TAG

const tagNodes = (
  model: Model,
  board: Board,
  tag: Tag,
): ReadonlyArray<UiNode> => {
  const tagged = remindersTagged(board, tag)
  const open = sortedBy(openOf(tagged), model.ordering)
  const done = sortedBy(completedOf(tagged), model.ordering)
  return [
    Text(toDoOf(open.length), { dim: true }),
    ...problemLines(model),
    ...Array.match(open, {
      onEmpty: () => [Text('Nothing left to do with this tag.', { dim: true })],
      onNonEmpty: rows => [
        remindersListOf(model, board, `#${tag.title}`, rows, 'Across'),
      ],
    }),
    ...completedSectionOf(model, board, `#${tag.title} done`, done, 'Across'),
    Row(
      { gap: 1 },
      ...offeredButtonsOf(
        model,
        [ShowCompleted, HideCompleted, ShowSortOptions],
        'Ghost',
      ),
      ...offeredButtonsOf(model, [DeleteTag], 'Destructive'),
    ),
  ]
}

/** One tag's page: every reminder with the tag, open first, and Delete tag. */
export const tagPageScreen = (model: Model, tagTitle: TagTitle): UiNode =>
  Column(
    { gap: 1 },
    headingOf(`#${tagTitle}`),
    ...boardOrStatus(model, board =>
      Option.match(tagNamed(board, tagTitle), {
        onNone: () =>
          missingNodes(
            `No reminder has #${tagTitle}`,
            'Go back to your lists.',
          ),
        onSome: tag => tagNodes(model, board, tag),
      }),
    ),
  )

// SEARCH

/**
 * What a search found: the field with the words, then every match, the
 * best first, each with the words that show why it matched.
 */
export const searchScreen = (model: Model, query: SearchQuery): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Search'),
    TextInput({
      value: query,
      placeholder: 'Search reminders or #tags',
      action: Search.tag,
      label: 'Search reminders',
    }),
    ...boardOrStatus(model, board =>
      Array.match(searchResultsOf(board, query), {
        onEmpty: () => [Text(`Nothing matches “${query}”.`, { dim: true })],
        onNonEmpty: found => [
          Text(counted(found.length, 'result', 'results'), { dim: true }),
          List({
            label: 'Search results',
            items: Array.map(found, ({ reminder, match }) => {
              const item = reminderItemOf(model, board, reminder, 'Across')
              return {
                ...item,
                lines: Array.dedupe([match.summary, ...(item.lines ?? [])]),
              }
            }),
          }),
        ],
      }),
    ),
  )

// REMINDER

const priorityTextOf = (reminder: Reminder): string =>
  Option.getOrElse(reminder.maybePriority, () => 'None')

const detailItemOf = (
  model: Model,
  key: string,
  title: string,
  value: string,
  tag: string,
): ListItem => ({
  key,
  title,
  lines: [value],
  ...offeredActionOf(model, tag),
})

const editableFieldsOf = (reminder: Reminder): ReadonlyArray<UiNode> => [
  TextInput({
    value: reminder.title,
    action: RenameReminder.tag,
    label: 'Title',
  }),
  TextInput({
    value: reminder.notes,
    placeholder: 'Notes',
    action: SetNotes.tag,
    clearAction: ClearNotes.tag,
    label: 'Notes',
  }),
]

const readOnlyFieldsOf = (reminder: Reminder): ReadonlyArray<UiNode> => [
  headingOf(reminder.title),
  ...Array.map(Option.toArray(notesLineOf(reminder)), notes => Text(notes)),
]

const tagRowsOf = (
  model: Model,
  board: Board,
  reminder: Reminder,
): ReadonlyArray<UiNode> =>
  Array.match(tagsOf(board, reminder), {
    onEmpty: () => [Text('No tags', { dim: true })],
    onNonEmpty: tags => [
      List({
        label: 'Tags',
        items: Array.map(tags, tag => ({
          key: tag.tagId,
          title: `#${tag.title}`,
          ...offeredActionOf(
            model,
            Catalog.choiceTagOf(OpenTag.tag, tag.title),
          ),
          trailing: choiceButtonsOf(model, tag.title, [Untag], 'Ghost'),
        })),
      }),
    ],
  })

const reminderNodes = (
  model: Model,
  board: Board,
  reminder: Reminder,
  maybeLink: Option.Option<string>,
): ReadonlyArray<UiNode> => {
  const listTitle = Option.getOrElse(
    Option.map(listIn(board, reminder.listId), list => list.title),
    () => '',
  )
  const isWritable = isEnabledAction(model, RenameReminder)
  const flagTag = Catalog.choiceTagOf(
    reminder.isFlagged ? Unflag.tag : Flag.tag,
    reminder.reminderId,
  )
  return [
    Text(listTitle, { dim: true }),
    ...(isWritable ? editableFieldsOf(reminder) : readOnlyFieldsOf(reminder)),
    ...problemLines(model),
    List({
      label: 'Details',
      items: [
        {
          key: 'completed',
          title: 'Completed',
          lines: [reminder.isCompleted ? 'Done' : 'Not yet'],
          check: checkOf(model, reminder),
        },
        detailItemOf(
          model,
          'due',
          'Due',
          Option.getOrElse(dueTextOf(model, reminder), () => 'None'),
          ShowDueDates.tag,
        ),
        detailItemOf(
          model,
          'priority',
          'Priority',
          priorityTextOf(reminder),
          ShowPriorities.tag,
        ),
        detailItemOf(model, 'list', 'List', listTitle, ShowLists.tag),
        detailItemOf(
          model,
          'flag',
          'Flagged',
          reminder.isFlagged ? 'On' : 'Off',
          flagTag,
        ),
      ],
    }),
    sectionOf('Tags'),
    ...tagRowsOf(model, board, reminder),
    ...(isWritable
      ? [
          TextInput({
            value: '',
            placeholder: 'Add a tag',
            action: AddTag.tag,
            label: 'Add a tag',
          }),
        ]
      : []),
    Row(
      { gap: 1 },
      ...choiceButtonsOf(
        model,
        reminder.reminderId,
        [DeleteReminder],
        'Destructive',
      ),
    ),
    ...Array.map(Option.toArray(maybeLink), link =>
      Text(link, { mono: true, copyable: true }),
    ),
  ]
}

/**
 * One reminder's page: its list, its title and notes to edit, its done
 * box, due date, priority, list, and flag as rows that open their
 * choices, its tags, Delete, and `maybeLink`, the address to share it at,
 * `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const reminderPageScreen = (
  model: Model,
  reminderId: ReminderId,
  linkOf: (reminder: Reminder) => Option.Option<string>,
): UiNode =>
  Column(
    { gap: 1 },
    ...boardOrStatus(model, board =>
      Option.match(reminderIn(board, reminderId), {
        onNone: () =>
          missingNodes(
            'This reminder is gone',
            'It may have been deleted on another device. Go back to its list.',
          ),
        onSome: reminder =>
          reminderNodes(model, board, reminder, linkOf(reminder)),
      }),
    ),
  )

// PROFILE

/**
 * Who is signed in: their name and email, and how many lists they own and
 * were shared, and how many reminders are left and done.
 */
export const profileScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Profile'),
    ...boardOrStatus(model, board => {
      const lists = listsInOrder(board)
      const ownedCount = Array.filter(
        lists,
        list => roleIn(board, list) === 'Owner',
      ).length
      const name = identityTitleOf(board.member)
      return [
        List({
          label: 'Signed in',
          items: [
            {
              key: board.member.memberId,
              title: name,
              lines: Option.toArray(board.member.maybeEmail),
              image: personTileOf(name),
            },
          ],
        }),
        List({
          label: 'Your reminders',
          items: [
            {
              key: 'owned',
              title: 'Lists you own',
              lines: [ownedCount.toString()],
            },
            {
              key: 'shared',
              title: 'Lists shared with you',
              lines: [(lists.length - ownedCount).toString()],
            },
            {
              key: 'open',
              title: 'To do',
              lines: [openOf(board.reminders).length.toString()],
            },
            {
              key: 'done',
              title: 'Done',
              lines: [completedOf(board.reminders).length.toString()],
            },
          ],
        }),
        Text(
          'Your lists and reminders are the rows Reminders V3 reads, so the Swift app shows the same ones.',
          { dim: true },
        ),
      ]
    }),
  )

// SHEETS

type ChoiceRow = Readonly<{
  key: string
  token: string
  title: string
  isCurrent: boolean
  lines?: ReadonlyArray<string>
  image?: ListItem['image']
}>

const choiceItemsOf = (
  model: Model,
  actionTag: string,
  rows: ReadonlyArray<ChoiceRow>,
): ReadonlyArray<ListItem> =>
  Array.map(rows, row => ({
    key: row.key,
    title: row.title,
    ...(row.lines === undefined ? {} : { lines: row.lines }),
    ...(row.image === undefined ? {} : { image: row.image }),
    isCurrent: row.isCurrent,
    ...offeredActionOf(model, Catalog.choiceTagOf(actionTag, row.token)),
  }))

/** The due dates to choose from: quick days, any day typed, and No date. */
export const dueDateScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Due date'),
    ...Option.match(
      Option.flatMap(shownReminder(model), reminder =>
        Option.map(model.maybeToday, today => ({ reminder, today })),
      ),
      {
        onNone: () => [Text('No reminder is open.', { dim: true })],
        onSome: ({ reminder, today }) => [
          List({
            label: 'Due dates',
            items: choiceItemsOf(
              model,
              SetDue.tag,
              Array.map(quickDueDates(today), ({ name, due }) => ({
                key: name,
                token: dueTokenOf(due),
                title: name,
                lines: [dueLabel(due, today)],
                isCurrent: Option.exists(
                  reminder.maybeDue,
                  current =>
                    current.day === due.day && current.time === due.time,
                ),
              })),
            ),
          }),
          TextInput({
            value: '',
            placeholder: 'Another day: 2026-10-12, or 2026-10-12 14:30',
            action: SetDue.tag,
            label: 'Another due date',
          }),
          Row({ gap: 1 }, ...offeredButtonsOf(model, [ClearDue], 'Ghost')),
        ],
      },
    ),
  )

const priorityMarksOf = (choice: PriorityChoice): Option.Option<string> =>
  M.value(choice).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('NoPriority', () => Option.none()),
    M.when('Low', () => Option.some('!')),
    M.when('Medium', () => Option.some('!!')),
    M.when('High', () => Option.some('!!!')),
    M.exhaustive,
  )

const isCurrentPriority = (model: Model, choice: PriorityChoice): boolean =>
  Option.exists(shownReminder(model), reminder =>
    Option.match(reminder.maybePriority, {
      onNone: () => choice === 'NoPriority',
      onSome: priority => priority === choice,
    }),
  )

/** The priorities to choose from; the one set now is marked. */
export const priorityScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Priority'),
    List({
      label: 'Priorities',
      items: choiceItemsOf(
        model,
        SetPriority.tag,
        Array.map(PriorityChoice.literals, choice => ({
          key: choice,
          token: S.encodeSync(PriorityWord)(choice),
          title: priorityTitleOf(choice),
          lines: Option.toArray(priorityMarksOf(choice)),
          isCurrent: isCurrentPriority(model, choice),
        })),
      ),
    }),
  )

/** The lists a reminder can move to; its own list is marked. */
export const moveScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Move to'),
    ...Option.match(
      Option.flatMap(boardOf(model), board =>
        Option.map(shownReminder(model), reminder => ({ board, reminder })),
      ),
      {
        onNone: () => [Text('No reminder is open.', { dim: true })],
        onSome: ({ board, reminder }) => [
          List({
            label: 'Lists',
            items: choiceItemsOf(
              model,
              MoveReminder.tag,
              Array.map(listsInOrder(board), list => ({
                key: list.listId,
                token: list.listId,
                title: list.title,
                image: listTileOf(list.title, list.color),
                isCurrent: list.listId === reminder.listId,
              })),
            ),
          }),
        ],
      },
    ),
  )

const orderings: ReadonlyArray<Ordering> = [
  'Manual',
  'DueDate',
  'Priority',
  'Title',
]

/** The orders to choose from; the one in use is marked. */
export const sortScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Sort by'),
    List({
      label: 'Orders',
      items: choiceItemsOf(
        model,
        SortBy.tag,
        Array.map(orderings, ordering => ({
          key: ordering,
          token: S.encodeSync(OrderingWord)(ordering),
          title: orderingTitleOf(ordering),
          isCurrent: model.ordering === ordering,
        })),
      ),
    }),
  )

/**
 * A list's details: its name to edit, its colors to choose from, and
 * Sharing and Delete list.
 */
export const listDetailsScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('List info'),
    ...Option.match(shownList(model), {
      onNone: () => [Text('No list is open.', { dim: true })],
      onSome: list => [
        isEnabledAction(model, RenameList)
          ? TextInput({
              value: list.title,
              action: RenameList.tag,
              label: 'List name',
            })
          : Text(list.title),
        sectionOf('Color'),
        List({
          label: 'Colors',
          items: choiceItemsOf(
            model,
            RecolorList.tag,
            Array.map(palette, entry => ({
              key: entry.name,
              token: entry.name,
              title: String.capitalize(entry.name),
              image: listTileOf(entry.name, entry.color),
              isCurrent: list.color === entry.color,
            })),
          ),
        }),
        Row(
          { gap: 1 },
          ...offeredButtonsOf(model, [ShowSharing], 'Ghost'),
          ...offeredButtonsOf(model, [DeleteList], 'Destructive'),
        ),
      ],
    }),
  )

const peopleNodes = (model: Model): ReadonlyArray<UiNode> =>
  Array.match(sharedPeopleOf(model), {
    onEmpty: () => [Text('Not shared with anyone yet.', { dim: true })],
    onNonEmpty: people => [
      List({
        label: 'People',
        items: Array.map(people, person => {
          const name = identityTitleOf(person.member)
          return {
            key: person.member.memberId,
            title: name,
            lines: [
              Array.join(
                [
                  ...Option.toArray(person.member.maybeEmail),
                  person.role === 'Writer' ? 'Can edit' : 'Can view',
                ],
                ' · ',
              ),
            ],
            image: personTileOf(name),
            trailing: choiceButtonsOf(
              model,
              person.member.memberId,
              [AllowEditing, AllowViewingOnly, StopSharingWith],
              'Ghost',
            ),
          }
        }),
      }),
    ],
  })

const ownerSharingNodes = (
  model: Model,
  list: ReminderList,
): ReadonlyArray<UiNode> =>
  Option.match(list.maybeShare, {
    onNone: () => [
      Text(
        `Share ${list.title} by email, and choose for each person whether they can edit it or only view it.`,
        { dim: true },
      ),
      Row({ gap: 1 }, ...offeredButtonsOf(model, [StartSharing], 'Primary')),
    ],
    onSome: () => [
      ...peopleNodes(model),
      ...problemLines(model),
      TextInput({
        value: '',
        placeholder: 'Share with an email address',
        action: ShareWith.tag,
        label: 'Share with an email address',
      }),
    ],
  })

const sharedWithMeNodes = (
  board: Board,
  list: ReminderList,
): ReadonlyArray<UiNode> => [
  Text(
    `${ownerNameOf(board, list)} shares ${list.title} with you. You can ${
      roleIn(board, list) === 'Writer' ? 'edit it' : 'view it'
    }.`,
  ),
  Text('Only the list’s owner changes who it is shared with.', { dim: true }),
]

/**
 * Who a list is shared with. Its owner sees everyone with what they may
 * do, and can share it by email, let someone edit or only view, and stop
 * sharing; anyone else sees who shares it with them.
 */
export const sharingScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Sharing'),
    ...Option.match(
      Option.flatMap(boardOf(model), board =>
        Option.map(shownList(model), list => ({ board, list })),
      ),
      {
        onNone: () => [Text('No list is open.', { dim: true })],
        onSome: ({ board, list }) =>
          roleIn(board, list) === 'Owner'
            ? ownerSharingNodes(model, list)
            : sharedWithMeNodes(board, list),
      },
    ),
  )

// QUESTIONS

/** The question "Delete Groceries?", with Delete and Cancel. */
export const deleteListScreen = (model: Model, listId: ListId): UiNode =>
  Column(
    { gap: 1 },
    ...Option.match(
      Option.flatMap(boardOf(model), board =>
        Option.map(listIn(board, listId), list => ({ board, list })),
      ),
      {
        onNone: () => [
          Text('That list is gone.'),
          Row({ gap: 1 }, ...buttonsOf(model, [CancelDeleteList], 'Ghost')),
        ],
        onSome: ({ board, list }) => [
          headingOf(`Delete ${list.title}?`),
          Text(
            `Its ${counted(remindersInList(board, list.listId).length, 'reminder goes', 'reminders go')} with it, on every device.`,
            { dim: true },
          ),
          Row(
            { gap: 1 },
            ...choiceButtonsOf(
              model,
              list.listId,
              [ConfirmDeleteList],
              'Destructive',
            ),
            ...buttonsOf(model, [CancelDeleteList], 'Ghost'),
          ),
        ],
      },
    ),
  )

/** The question "Delete 2 completed reminders?", with Delete and Cancel. */
export const clearCompletedScreen = (model: Model, listId: ListId): UiNode =>
  Column(
    { gap: 1 },
    ...Option.match(
      Option.flatMap(boardOf(model), board =>
        Option.map(listIn(board, listId), list => ({ board, list })),
      ),
      {
        onNone: () => [
          Text('That list is gone.'),
          Row({ gap: 1 }, ...buttonsOf(model, [CancelClearCompleted], 'Ghost')),
        ],
        onSome: ({ board, list }) => [
          headingOf(
            `Delete ${counted(completedOf(remindersInList(board, list.listId)).length, 'completed reminder', 'completed reminders')}?`,
          ),
          Text(`They leave ${list.title} on every device.`, { dim: true }),
          Row(
            { gap: 1 },
            ...choiceButtonsOf(
              model,
              list.listId,
              [ConfirmClearCompleted],
              'Destructive',
            ),
            ...buttonsOf(model, [CancelClearCompleted], 'Ghost'),
          ),
        ],
      },
    ),
  )
