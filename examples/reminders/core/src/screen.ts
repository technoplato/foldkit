import { Array, Match as M, Option, Schema as S, String, pipe } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import {
  type ButtonNode,
  Column,
  Dock,
  type IconName,
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
  addDays,
  dateLabel,
  dayLabel,
  dueLabel,
  dueTokenOf,
  quickDueDates,
  timeLabel,
} from './calendar.js'
import {
  DueDateSheet,
  ListPage,
  MoveSheet,
  type Place,
  PrioritySheet,
  SearchPage,
  SmartListPage,
  TagPage,
} from './destination.js'
import type { ListId, ReminderId, SearchQuery, TagTitle } from './ids.js'
import {
  pathOfPages,
  pathOfPresented,
  placesOf,
  reminderPathAbove,
} from './links.js'
import {
  dueTile,
  flagTile,
  listTileOf,
  palette,
  personTileOf,
  priorityTile,
  smartListTileOf,
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
  OpenReminder,
  OpenSmartList,
  OpenTag,
  RecolorList,
  RenameList,
  RenameReminder,
  Reopen,
  Search,
  SetDue,
  SetNotes,
  SetPriority,
  SharePage,
  ShareWith,
  ShowCompleted,
  ShowDueDates,
  ShowListDetails,
  ShowLists,
  ShowMoveOptions,
  ShowPriorities,
  ShowProfile,
  ShowSharing,
  ShowSortOptions,
  SortBy,
  StartSharing,
  StopSharingWith,
  Unflag,
  Untag,
  addingListOf,
  catalog,
  orderingTitleOf,
  priorityTitleOf,
  sharedPeopleOf,
  shownList,
  shownReminder,
  smartCountOf,
} from './message.js'
import { type Model, boardOf, canWrite, writableListsOf } from './model.js'
import {
  OrderingWord,
  PriorityChoice,
  PriorityWord,
  SmartListWord,
} from './words.js'

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

const withIcon = (
  buttons: ReadonlyArray<ButtonNode>,
  icon: IconName,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button => ({ ...button, icon }))

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

const hrefOf = (maybePath: Option.Option<string>): Pick<ListItem, 'href'> =>
  Option.match(maybePath, {
    onNone: () => ({}),
    onSome: href => ({ href }),
  })

/**
 * A row that opens a place while its Action is offered: a link to the
 * place's address where a painter shows links, so a person can open it in
 * a new tab, copy it, or share it, and the Action in a terminal.
 */
const placeRowOf = (
  model: Model,
  tag: string,
  maybePath: Option.Option<string>,
): Pick<ListItem, 'action' | 'href'> =>
  isOffered(model, tag) ? { action: tag, ...hrefOf(maybePath) } : {}

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

const noticeLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(model.maybeNotice, {
    onNone: () => [],
    onSome: notice => [Text(notice, { dim: true })],
  })

const headingOf = (title: string): UiNode =>
  Text(title, { emphasis: 'Headline' })

const sectionOf = (title: string): UiNode => Text(title, { dim: true })

const missingNodes = (title: string, detail: string): ReadonlyArray<UiNode> => [
  Text(title),
  Text(detail, { dim: true }),
]

const controlsOf = (
  buttons: ReadonlyArray<ButtonNode>,
): ReadonlyArray<UiNode> =>
  Array.match(buttons, {
    onEmpty: () => [],
    onNonEmpty: present => [Row({ gap: 1 }, ...present)],
  })

const shareButtonsOf = (model: Model): ReadonlyArray<ButtonNode> =>
  withIcon(offeredButtonsOf(model, [SharePage], 'Ghost'), 'Share')

const sortButtonsOf = (model: Model): ReadonlyArray<ButtonNode> =>
  withIcon(offeredButtonsOf(model, [ShowSortOptions], 'Ghost'), 'Settings')

// TABS

type Tab = 'Lists' | 'Profile'

const tabs: ReadonlyArray<
  Readonly<{ action: AnyAction; icon: IconName; tab: Tab }>
> = [
  { action: ShowLists, icon: 'Chapters', tab: 'Lists' },
  { action: ShowProfile, icon: 'Profile', tab: 'Profile' },
]

const tabsOf = (model: Model, current: Tab): UiNode =>
  Row(
    {},
    ...Array.flatMap(tabs, ({ action, icon, tab }) =>
      Array.map(buttonsOf(model, [action], 'Tab'), button => ({
        ...button,
        icon,
        isCurrent: tab === current,
      })),
    ),
  )

/** The bar pinned under home and the profile: the Lists and Profile tabs. */
const dockOf = (model: Model, current: Tab): UiNode =>
  Dock(tabsOf(model, current))

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
  listing: Place,
): ListItem => ({
  key: reminder.reminderId,
  title: `${priorityMarks(reminder)}${reminder.title}`,
  lines: Array.getSomes([
    detailLineOf(model, board, reminder, context),
    notesLineOf(reminder),
  ]),
  check: checkOf(model, reminder),
  ...placeRowOf(
    model,
    Catalog.choiceTagOf(OpenReminder.tag, reminder.reminderId),
    reminderPathAbove(listing, reminder),
  ),
})

const remindersListOf = (
  model: Model,
  board: Board,
  label: string,
  reminders: ReadonlyArray<Reminder>,
  context: RowContext,
  listing: Place,
): UiNode =>
  List({
    label,
    items: Array.map(reminders, reminder =>
      reminderItemOf(model, board, reminder, context, listing),
    ),
  })

const isAddable = (model: Model): boolean =>
  Option.exists(addingListOf(model), list => canWrite(model, list.listId))

const addFieldOf = (
  model: Model,
  placeholder: string,
  label: string,
): ReadonlyArray<UiNode> =>
  isAddable(model)
    ? [TextInput({ value: '', placeholder, action: AddReminder.tag, label })]
    : []

/**
 * The done reminders of a listing: while they are hidden, a button that
 * says how many there are and shows them; while they show, the count as
 * a heading, the reminders ticked, and Hide completed and Clear.
 */
const completedNodesOf = (
  model: Model,
  board: Board,
  label: string,
  done: ReadonlyArray<Reminder>,
  context: RowContext,
  listing: Place,
): ReadonlyArray<UiNode> => {
  const count = counted(done.length, 'completed', 'completed')
  if (Array.isReadonlyArrayEmpty(done)) {
    return []
  } else if (model.completed === 'Hidden') {
    return controlsOf(
      Array.map(offeredButtonsOf(model, [ShowCompleted], 'Ghost'), button => ({
        ...button,
        label: `Show ${count}`,
      })),
    )
  } else {
    return [
      sectionOf(count),
      remindersListOf(model, board, label, done, context, listing),
      ...controlsOf(
        offeredButtonsOf(model, [HideCompleted, ClearCompleted], 'Ghost'),
      ),
    ]
  }
}

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
  ...placeRowOf(
    model,
    Catalog.choiceTagOf(
      OpenSmartList.tag,
      S.encodeSync(SmartListWord)(smartList),
    ),
    pathOfPages([SmartListPage({ smartList })]),
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
  ...placeRowOf(
    model,
    Catalog.choiceTagOf(OpenList.tag, list.listId),
    pathOfPages([ListPage({ listId: list.listId })]),
  ),
})

const tagItemOf = (model: Model, board: Board, tag: Tag): ListItem => ({
  key: tag.tagId,
  title: `#${tag.title}`,
  lines: [toDoOf(openOf(remindersTagged(board, tag)).length)],
  ...placeRowOf(
    model,
    Catalog.choiceTagOf(OpenTag.tag, tag.title),
    pathOfPages([TagPage({ tagTitle: tag.title })]),
  ),
})

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

const searchFieldOf = (query: string): UiNode =>
  TextInput({
    value: query,
    placeholder: 'Search reminders or #tags',
    action: Search.tag,
    label: 'Search reminders',
  })

/**
 * Home, the Lists tab: search, the smart lists with what each holds, every
 * list with how much is left and who it is shared with, a field to add a
 * list, and the tags. Each row is a link to its page; the tabs stay pinned
 * at the bottom.
 *
 * @example
 * ```typescript
 * homeScreen(model)
 * // Column: Reminders, [Search], List(Today…Completed), My Lists, List(Groceries…), [New list], Tags, List(#chores…), Dock(Lists | Profile)
 * ```
 */
export const homeScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Reminders'),
    ...boardOrStatus(model, board => [
      searchFieldOf(''),
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
    ]),
    dockOf(model, 'Lists'),
  )

// LIST

const listNodes = (
  model: Model,
  board: Board,
  list: ReminderList,
): ReadonlyArray<UiNode> => {
  const listing = ListPage({ listId: list.listId })
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
          listing,
        ),
      ],
    }),
    ...completedNodesOf(
      model,
      board,
      `${list.title} done`,
      done,
      'InList',
      listing,
    ),
    ...controlsOf([
      ...sortButtonsOf(model),
      ...withIcon(offeredButtonsOf(model, [ShowListDetails], 'Ghost'), 'More'),
      ...shareButtonsOf(model),
    ]),
    ...noticeLines(model),
  ]
}

/**
 * One list's page: its name, who it is shared with, a field to add a
 * reminder, its open reminders in this device's order, its done ones a
 * press away, and Sort, List info, and Share.
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
  listing: Place,
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
            remindersListOf(model, board, heading, group, 'Across', listing),
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
): ReadonlyArray<UiNode> => {
  const listing = SmartListPage({ smartList })
  return smartList === 'Scheduled'
    ? Option.match(model.maybeToday, {
        onNone: () => [
          remindersListOf(model, board, smartList, rows, 'Across', listing),
        ],
        onSome: today => scheduledSections(model, board, rows, today, listing),
      })
    : [remindersListOf(model, board, smartList, rows, 'Across', listing)]
}

/**
 * One smart list's page: what it holds across every list, Scheduled
 * grouped by day with the overdue first, a field to add one where it
 * makes sense, due today on Today and flagged on Flagged, and Share.
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
      ...controlsOf([...sortButtonsOf(model), ...shareButtonsOf(model)]),
      ...noticeLines(model),
    ]),
  )

// TAG

const tagNodes = (
  model: Model,
  board: Board,
  tag: Tag,
): ReadonlyArray<UiNode> => {
  const listing = TagPage({ tagTitle: tag.title })
  const tagged = remindersTagged(board, tag)
  const open = sortedBy(openOf(tagged), model.ordering)
  const done = sortedBy(completedOf(tagged), model.ordering)
  return [
    Text(toDoOf(open.length), { dim: true }),
    ...problemLines(model),
    ...Array.match(open, {
      onEmpty: () => [Text('Nothing left to do with this tag.', { dim: true })],
      onNonEmpty: rows => [
        remindersListOf(model, board, `#${tag.title}`, rows, 'Across', listing),
      ],
    }),
    ...completedNodesOf(
      model,
      board,
      `#${tag.title} done`,
      done,
      'Across',
      listing,
    ),
    ...controlsOf([
      ...sortButtonsOf(model),
      ...shareButtonsOf(model),
      ...offeredButtonsOf(model, [DeleteTag], 'Destructive'),
    ]),
    ...noticeLines(model),
  ]
}

/**
 * One tag's page: every reminder with the tag, open first, and Sort,
 * Share, and Delete tag.
 */
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
 * best first, each with the words that show why it matched, and Share.
 */
export const searchScreen = (model: Model, query: SearchQuery): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Search'),
    searchFieldOf(query),
    ...boardOrStatus(model, board =>
      Array.match(searchResultsOf(board, query), {
        onEmpty: () => [Text(`Nothing matches “${query}”.`, { dim: true })],
        onNonEmpty: found => [
          Text(counted(found.length, 'result', 'results'), { dim: true }),
          List({
            label: 'Search results',
            items: Array.map(found, ({ reminder, match }) => {
              const item = reminderItemOf(
                model,
                board,
                reminder,
                'Across',
                SearchPage({ query }),
              )
              return {
                ...item,
                lines: Array.dedupe([match.summary, ...(item.lines ?? [])]),
              }
            }),
          }),
          ...controlsOf(shareButtonsOf(model)),
          ...noticeLines(model),
        ],
      }),
    ),
  )

// REMINDER

const priorityTextOf = (reminder: Reminder): string =>
  Option.getOrElse(reminder.maybePriority, () => 'None')

/**
 * A detail row that opens its Sheet while its Action is offered: a link to
 * the Sheet's address over this page, `…/reminder/7e1f04c2-…/due`, where a
 * painter shows links, and the Action in a terminal.
 */
const sheetRowOf = (
  model: Model,
  tag: string,
  sheet: Place,
): Pick<ListItem, 'action' | 'href'> =>
  placeRowOf(
    model,
    tag,
    Option.flatMap(placesOf(model.navigation.pages), pages =>
      pathOfPresented(pages, sheet, Navigation.Sheet()),
    ),
  )

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

const readOnlyFieldsOf = (
  board: Board,
  reminder: Reminder,
): ReadonlyArray<UiNode> => [
  headingOf(reminder.title),
  ...Array.map(
    Option.toArray(
      Option.flatMap(listIn(board, reminder.listId), list =>
        sharingLineOf(board, list),
      ),
    ),
    line => Text(line, { dim: true }),
  ),
  ...Array.map(Option.toArray(notesLineOf(reminder)), notes => Text(notes)),
]

const detailsOf = (model: Model, board: Board, reminder: Reminder): UiNode => {
  const maybeList = listIn(board, reminder.listId)
  const flagTag = Catalog.choiceTagOf(
    reminder.isFlagged ? Unflag.tag : Flag.tag,
    reminder.reminderId,
  )
  return List({
    label: 'Details',
    items: [
      {
        key: 'completed',
        title: 'Completed',
        check: checkOf(model, reminder),
      },
      {
        key: 'due',
        title: 'Due',
        lines: [Option.getOrElse(dueTextOf(model, reminder), () => 'None')],
        image: dueTile,
        ...sheetRowOf(model, ShowDueDates.tag, DueDateSheet()),
      },
      {
        key: 'priority',
        title: 'Priority',
        lines: [priorityTextOf(reminder)],
        image: priorityTile,
        ...sheetRowOf(model, ShowPriorities.tag, PrioritySheet()),
      },
      {
        key: 'list',
        title: 'List',
        lines: Option.toArray(Option.map(maybeList, list => list.title)),
        ...Option.match(maybeList, {
          onNone: () => ({}),
          onSome: list => ({ image: listTileOf(list.title, list.color) }),
        }),
        ...sheetRowOf(model, ShowMoveOptions.tag, MoveSheet()),
      },
      {
        key: 'flag',
        title: 'Flagged',
        lines: [reminder.isFlagged ? 'On' : 'Off'],
        image: flagTile,
        ...offeredActionOf(model, flagTag),
      },
    ],
  })
}

const tagChipsOf = (
  model: Model,
  board: Board,
  reminder: Reminder,
): ReadonlyArray<UiNode> =>
  Array.match(tagsOf(board, reminder), {
    onEmpty: () => [],
    onNonEmpty: tags => [
      sectionOf('Tags'),
      List({
        label: 'Tags',
        items: Array.map(tags, tag => ({
          key: tag.tagId,
          title: `#${tag.title}`,
          ...placeRowOf(
            model,
            Catalog.choiceTagOf(OpenTag.tag, tag.title),
            pathOfPages([TagPage({ tagTitle: tag.title })]),
          ),
          trailing: Array.map(
            choiceButtonsOf(model, tag.title, [Untag], 'Ghost'),
            (button): ButtonNode => ({
              ...button,
              label: `Remove #${tag.title}`,
              icon: 'Close',
              isIconOnly: true,
            }),
          ),
        })),
      }),
    ],
  })

const reminderNodes = (
  model: Model,
  board: Board,
  reminder: Reminder,
): ReadonlyArray<UiNode> => {
  const isWritable = isEnabledAction(model, RenameReminder)
  return [
    ...(isWritable
      ? editableFieldsOf(reminder)
      : readOnlyFieldsOf(board, reminder)),
    ...problemLines(model),
    detailsOf(model, board, reminder),
    ...tagChipsOf(model, board, reminder),
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
    ...controlsOf([
      ...shareButtonsOf(model),
      ...choiceButtonsOf(
        model,
        reminder.reminderId,
        [DeleteReminder],
        'Destructive',
      ),
    ]),
    ...noticeLines(model),
  ]
}

/**
 * One reminder's page: its title and notes to edit, its done box, and its
 * due date, priority, list, and flag as rows, each a link to the Sheet
 * that changes it, such as `…/reminder/7e1f04c2-…/due`; then its tags,
 * Share, and Delete.
 */
export const reminderPageScreen = (
  model: Model,
  reminderId: ReminderId,
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
        onSome: reminder => reminderNodes(model, board, reminder),
      }),
    ),
  )

// PROFILE

/**
 * Who is signed in, the Profile tab: their name and email, how many lists
 * they own and were shared, and how many reminders are left and done.
 *
 * @example
 * ```typescript
 * profileScreen(model)
 * // Column: Profile, List(Ada Quill, ada@example.com), Your reminders, List(Lists you own 3…), Dock(Lists | Profile)
 * ```
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
        sectionOf('Your reminders'),
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
          'These are the same lists and reminders the Reminders V3 app shows.',
          { dim: true },
        ),
      ]
    }),
    dockOf(model, 'Profile'),
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

const exampleDayOffset = 8

/**
 * The due dates to choose from, each with its date, the one set now
 * marked: quick days, any day typed, and No date.
 */
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
                lines: [`${dateLabel(due.day, today)}, ${timeLabel(due.time)}`],
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
            placeholder: `Another day, like ${addDays(today, exampleDayOffset)}`,
            action: SetDue.tag,
            label:
              'Another due date, a day such as 2026-10-12 or a day and time such as 2026-10-12 14:30',
          }),
          ...controlsOf(offeredButtonsOf(model, [ClearDue], 'Ghost')),
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

/**
 * The lists a reminder can move to, the ones the person may change; its
 * own list is marked.
 */
export const moveScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    headingOf('Move to'),
    ...Option.match(shownReminder(model), {
      onNone: () => [Text('No reminder is open.', { dim: true })],
      onSome: reminder => [
        List({
          label: 'Lists',
          items: choiceItemsOf(
            model,
            MoveReminder.tag,
            Array.map(writableListsOf(model), list => ({
              key: list.listId,
              token: list.listId,
              title: list.title,
              image: listTileOf(list.title, list.color),
              isCurrent: list.listId === reminder.listId,
            })),
          ),
        }),
      ],
    }),
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
        ...controlsOf([
          ...offeredButtonsOf(model, [ShowSharing], 'Ghost'),
          ...offeredButtonsOf(model, [DeleteList], 'Destructive'),
        ]),
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
                  person.role === 'Writer' ? 'Can edit' : 'Can view',
                  ...Option.toArray(person.member.maybeEmail),
                ],
                ' · ',
              ),
            ],
            image: personTileOf(name),
            trailing: [
              ...choiceButtonsOf(
                model,
                person.member.memberId,
                [AllowEditing, AllowViewingOnly],
                'Ghost',
              ),
              ...Array.map(
                choiceButtonsOf(
                  model,
                  person.member.memberId,
                  [StopSharingWith],
                  'Ghost',
                ),
                (button): ButtonNode => ({
                  ...button,
                  label: `Stop sharing with ${name}`,
                  icon: 'Close',
                  isIconOnly: true,
                }),
              ),
            ],
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
      ...controlsOf(offeredButtonsOf(model, [StartSharing], 'Primary')),
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
          ...controlsOf(buttonsOf(model, [CancelDeleteList], 'Ghost')),
        ],
        onSome: ({ board, list }) => [
          headingOf(`Delete ${list.title}?`),
          Text(
            `Its ${counted(remindersInList(board, list.listId).length, 'reminder goes', 'reminders go')} with it, on every device.`,
            { dim: true },
          ),
          ...controlsOf([
            ...choiceButtonsOf(
              model,
              list.listId,
              [ConfirmDeleteList],
              'Destructive',
            ),
            ...buttonsOf(model, [CancelDeleteList], 'Ghost'),
          ]),
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
          ...controlsOf(buttonsOf(model, [CancelClearCompleted], 'Ghost')),
        ],
        onSome: ({ board, list }) => [
          headingOf(
            `Delete ${counted(completedOf(remindersInList(board, list.listId)).length, 'completed reminder', 'completed reminders')}?`,
          ),
          Text(`They leave ${list.title} on every device.`, { dim: true }),
          ...controlsOf([
            ...choiceButtonsOf(
              model,
              list.listId,
              [ConfirmClearCompleted],
              'Destructive',
            ),
            ...buttonsOf(model, [CancelClearCompleted], 'Ghost'),
          ]),
        ],
      },
    ),
  )
