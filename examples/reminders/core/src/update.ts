import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command, Navigation } from 'foldkit'

import {
  type Priority,
  type Reminder,
  type ReminderList,
  type Role,
  completedOf,
  remindersInList,
  tagNamed,
} from './board.js'
import { defaultDueTime } from './calendar.js'
import {
  ClearCompletedQuestion,
  DeleteListQuestion,
  type Destination,
  DueDateSheet,
  ListDetailsSheet,
  ListPage,
  MoveSheet,
  PrioritySheet,
  ProfilePage,
  ReminderPage,
  SearchPage,
  SharingSheet,
  SmartListPage,
  SortSheet,
  TagPage,
  isListPage,
  isReminderListing,
  isReminderPage,
  isSearchPage,
  isSmartListPage,
  isTagPage,
} from './destination.js'
import type {
  ListId,
  MemberId,
  MembershipId,
  ReminderId,
  ReminderTitle,
  ShareId,
} from './ids.js'
import { shownPathOf } from './links.js'
import {
  CompletedWriteReminders,
  FailedShareLink,
  FailedWriteReminders,
  type Message,
  SharedLink,
  addingListOf,
  newListColorOf,
  shownList,
  shownReminder,
} from './message.js'
import {
  BoardReady,
  BoardSignedOut,
  BoardUnavailable,
  Model,
  boardOf,
  listOf,
  listsOf,
  reminderOf,
  remindersOf,
} from './model.js'
import { navigation } from './navigation.js'
import type { RemindersServices } from './services.js'
import { LinkSharing, type SharedHow } from './share.js'
import { shownSmartListOf, shownTagOf } from './stack.js'
import {
  InsertList,
  InsertMembership,
  InsertReminder,
  InsertShare,
  LinkTag,
  RelinkReminder,
  RemindersStore,
  RemindersWrite,
  RemoveList,
  RemoveReminders,
  RemoveTag,
  RevokeMembership,
  type SharedRole,
  UnlinkTag,
  UpdateCompletion,
  UpdateDue,
  UpdateFlag,
  UpdateListColor,
  UpdateListTitle,
  UpdateMembershipRole,
  UpdatePriority,
  UpdateReminderNotes,
  UpdateReminderTitle,
} from './store.js'
import type { PriorityChoice } from './words.js'

// COMMAND

/**
 * Asks the store to make one change. A refusal becomes
 * FailedWriteReminders with the store's reason, so a lost connection or a
 * rule that says no never crashes the app.
 */
export const WriteReminders = Command.define(
  'WriteReminders',
  { write: RemindersWrite },
  CompletedWriteReminders,
  FailedWriteReminders,
)(({ write }) =>
  Effect.gen(function* () {
    const store = yield* RemindersStore
    yield* store.write(write)
    return CompletedWriteReminders()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedWriteReminders({ reason: error.reason })),
    ),
  ),
)

/**
 * Shares a link to a page through the host's link sharing. A refusal
 * becomes FailedShareLink with its reason, so a blocked clipboard never
 * crashes the app.
 */
export const ShareLink = Command.define(
  'ShareLink',
  { path: S.String, title: S.String },
  SharedLink,
  FailedShareLink,
)(({ path, title }) =>
  Effect.gen(function* () {
    const sharing = yield* LinkSharing
    const how = yield* sharing.share({ path, title })
    return SharedLink({ how })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedShareLink({ reason: error.reason })),
    ),
  ),
)

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, RemindersServices>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const withStack = (
  model: Model,
  stack: Navigation.NavigationStack<Destination>,
): Model => ({ ...model, navigation: stack })

const withPages = (model: Model, pages: ReadonlyArray<Destination>): Model =>
  withStack(model, { ...model.navigation, pages, maybeModal: Option.none() })

const presented = (
  model: Model,
  destination: Destination,
  style: Navigation.PresentationStyle,
): Model =>
  withStack(
    model,
    Navigation.pushed(
      { ...model.navigation, maybeModal: Option.none() },
      Navigation.presented<Destination>(destination, style),
    ),
  )

const presentedSheet = (model: Model, sheet: Destination): Model =>
  presented(model, sheet, Navigation.Sheet())

const presentedQuestion = (model: Model, question: Destination): Model =>
  presented(model, question, Navigation.Dialog())

const withoutModal = (model: Model): Model =>
  withStack(model, { ...model.navigation, maybeModal: Option.none() })

const unchanged = (model: Model): UpdateReturn => [model, []]

const writing = (model: Model, write: RemindersWrite): UpdateReturn => [
  model,
  [WriteReminders({ write })],
]

const onShownReminder = (
  model: Model,
  change: (reminder: Reminder) => UpdateReturn,
): UpdateReturn =>
  Option.match(shownReminder(model), {
    onNone: () => unchanged(model),
    onSome: change,
  })

const onShownList = (
  model: Model,
  change: (list: ReminderList) => UpdateReturn,
): UpdateReturn =>
  Option.match(shownList(model), {
    onNone: () => unchanged(model),
    onSome: change,
  })

const onReminder = (
  model: Model,
  reminderId: ReminderId,
  change: (reminder: Reminder) => UpdateReturn,
): UpdateReturn =>
  Option.match(reminderOf(model, reminderId), {
    onNone: () => unchanged(model),
    onSome: change,
  })

const countIn = (model: Model, listId: ListId): number =>
  Option.match(boardOf(model), {
    onNone: () => 0,
    onSome: board => remindersInList(board, listId).length,
  })

/**
 * The reminder's page above the listing it was opened from, or else
 * above its own list. A reminder page already open gives way to it.
 */
const openedReminder = (model: Model, reminder: Reminder): Model => {
  const pagesBelow = Array.filter(
    model.navigation.pages,
    page => !isReminderPage(page),
  )
  const reminderPage = ReminderPage({ reminderId: reminder.reminderId })
  if (Array.some(pagesBelow, isReminderListing)) {
    return withPages(model, Array.append(pagesBelow, reminderPage))
  } else {
    return withPages(model, [
      ListPage({ listId: reminder.listId }),
      reminderPage,
    ])
  }
}

/**
 * The list page under a moved reminder follows it to its new list, so the
 * address names where the reminder is.
 */
const followedMove = (model: Model, toListId: ListId): Model =>
  withPages(
    withoutModal(model),
    Array.map(model.navigation.pages, page =>
      isListPage(page) ? ListPage({ listId: toListId }) : page,
    ),
  )

const withoutList = (model: Model, listId: ListId): Model =>
  Array.some(
    model.navigation.pages,
    page => isListPage(page) && page.listId === listId,
  )
    ? withPages(model, [])
    : withoutModal(model)

const withoutReminder = (model: Model, reminderId: ReminderId): Model =>
  withStack(
    model,
    Navigation.withoutDestinations(
      model.navigation,
      destination =>
        isReminderPage(destination) && destination.reminderId === reminderId,
    ),
  )

const addedReminder = (model: Model, title: ReminderTitle): UpdateReturn =>
  Option.match(addingListOf(model), {
    onNone: () => unchanged(model),
    onSome: list => {
      const maybeSmartList = shownSmartListOf(model)
      const isDueToday = Option.exists(
        maybeSmartList,
        smartList => smartList === 'Today' || smartList === 'Scheduled',
      )
      return writing(
        model,
        InsertReminder({
          listId: list.listId,
          title,
          position: countIn(model, list.listId),
          isFlagged: Option.contains(maybeSmartList, 'Flagged'),
          maybeDue: Option.filter(
            Option.map(model.maybeToday, today => ({
              day: today,
              time: defaultDueTime,
            })),
            () => isDueToday,
          ),
        }),
      )
    },
  })

const priorityOfChoice = (choice: PriorityChoice): Option.Option<Priority> =>
  M.value(choice).pipe(
    M.withReturnType<Option.Option<Priority>>(),
    M.when('NoPriority', () => Option.none()),
    M.when('Low', () => Option.some('Low')),
    M.when('Medium', () => Option.some('Medium')),
    M.when('High', () => Option.some('High')),
    M.exhaustive,
  )

type Membership = Readonly<{
  shareId: ShareId
  membershipId: MembershipId
  role: Role
}>

const membershipOf = (
  list: ReminderList,
  memberId: MemberId,
): Option.Option<Membership> =>
  Option.flatMap(list.maybeShare, share =>
    Option.map(
      Array.findFirst(
        share.memberships,
        membership =>
          membership.memberId === memberId &&
          Option.isNone(membership.maybeRevokedAtMs),
      ),
      membership => ({
        shareId: share.shareId,
        membershipId: membership.membershipId,
        role: membership.role,
      }),
    ),
  )

const changedRole = (
  model: Model,
  memberId: MemberId,
  to: SharedRole,
): UpdateReturn =>
  onShownList(model, list =>
    Option.match(membershipOf(list, memberId), {
      onNone: () => unchanged(model),
      onSome: ({ shareId, membershipId, role }) =>
        writing(
          model,
          UpdateMembershipRole({
            listId: list.listId,
            shareId,
            membershipId,
            memberId,
            from: role,
            to,
          }),
        ),
    }),
  )

const isSharedWithEmail = (
  model: Model,
  list: ReminderList,
  email: string,
): boolean =>
  Option.exists(boardOf(model), board =>
    Option.exists(list.maybeShare, share =>
      Array.some(
        share.memberships,
        membership =>
          Option.isNone(membership.maybeRevokedAtMs) &&
          Array.some(
            [board.member, ...board.people],
            person =>
              person.memberId === membership.memberId &&
              Option.contains(person.maybeEmail, email),
          ),
      ),
    ),
  )

const pageTitleOf = (
  model: Model,
  page: Destination,
): Option.Option<string> => {
  if (isReminderPage(page)) {
    return Option.map(
      reminderOf(model, page.reminderId),
      reminder => reminder.title,
    )
  } else if (isListPage(page)) {
    return Option.map(listOf(model, page.listId), list => list.title)
  } else if (isSmartListPage(page)) {
    return Option.some(page.smartList)
  } else if (isTagPage(page)) {
    return Option.some(`#${page.tagTitle}`)
  } else if (isSearchPage(page)) {
    return Option.some(`Search: ${page.query}`)
  } else {
    return Option.none()
  }
}

const sharedPage = (model: Model): UpdateReturn =>
  Option.match(shownPathOf(model), {
    onNone: () => unchanged(model),
    onSome: path => [
      { ...model, maybeNotice: Option.none() },
      [
        ShareLink({
          path,
          title: Option.getOrElse(
            Option.flatMap(Array.last(model.navigation.pages), page =>
              pageTitleOf(model, page),
            ),
            () => 'Reminders',
          ),
        }),
      ],
    ],
  })

const noticeOf = (how: SharedHow): Option.Option<string> =>
  M.value(how).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('Copied', () => Option.some('Link copied')),
    M.when('Shared', () => Option.some('Link shared')),
    M.when('Cancelled', () => Option.none()),
    M.exhaustive,
  )

const isSameStack = S.toEquivalence(Model.fields.navigation)

const updated = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      AddReminder: ({ title }) => addedReminder(model, title),
      Complete: ({ reminderId }) =>
        onReminder(model, reminderId, () =>
          writing(model, UpdateCompletion({ reminderId, isCompleted: true })),
        ),
      Reopen: ({ reminderId }) =>
        onReminder(model, reminderId, () =>
          writing(model, UpdateCompletion({ reminderId, isCompleted: false })),
        ),
      Flag: ({ reminderId }) =>
        onReminder(model, reminderId, () =>
          writing(model, UpdateFlag({ reminderId, isFlagged: true })),
        ),
      Unflag: ({ reminderId }) =>
        onReminder(model, reminderId, () =>
          writing(model, UpdateFlag({ reminderId, isFlagged: false })),
        ),
      OpenReminder: ({ reminderId }) =>
        onReminder(model, reminderId, reminder => [
          openedReminder(model, reminder),
          [],
        ]),
      RenameReminder: ({ title }) =>
        onShownReminder(model, reminder =>
          writing(
            model,
            UpdateReminderTitle({ reminderId: reminder.reminderId, title }),
          ),
        ),
      SetNotes: ({ notes }) =>
        onShownReminder(model, reminder =>
          writing(
            model,
            UpdateReminderNotes({ reminderId: reminder.reminderId, notes }),
          ),
        ),
      ClearNotes: () =>
        onShownReminder(model, reminder =>
          writing(
            model,
            UpdateReminderNotes({ reminderId: reminder.reminderId, notes: '' }),
          ),
        ),
      ShowDueDates: () => unchanged(presentedSheet(model, DueDateSheet())),
      SetDue: ({ due }) =>
        onShownReminder(model, reminder =>
          writing(
            withoutModal(model),
            UpdateDue({
              reminderId: reminder.reminderId,
              maybeDue: Option.some(due),
            }),
          ),
        ),
      ClearDue: () =>
        onShownReminder(model, reminder =>
          writing(
            withoutModal(model),
            UpdateDue({
              reminderId: reminder.reminderId,
              maybeDue: Option.none(),
            }),
          ),
        ),
      ShowPriorities: () => unchanged(presentedSheet(model, PrioritySheet())),
      SetPriority: ({ priority }) =>
        onShownReminder(model, reminder =>
          writing(
            withoutModal(model),
            UpdatePriority({
              reminderId: reminder.reminderId,
              maybePriority: priorityOfChoice(priority),
            }),
          ),
        ),
      ShowMoveOptions: () => unchanged(presentedSheet(model, MoveSheet())),
      MoveReminder: ({ listId }) =>
        onShownReminder(model, reminder =>
          writing(
            followedMove(model, listId),
            RelinkReminder({
              reminderId: reminder.reminderId,
              fromListId: reminder.listId,
              toListId: listId,
              position: countIn(model, listId),
            }),
          ),
        ),
      AddTag: ({ tagTitle }) =>
        onShownReminder(model, reminder =>
          writing(
            model,
            LinkTag({
              reminderId: reminder.reminderId,
              title: tagTitle,
              maybeTagId: Option.map(
                Option.flatMap(boardOf(model), board =>
                  tagNamed(board, tagTitle),
                ),
                tag => tag.tagId,
              ),
            }),
          ),
        ),
      Untag: ({ tagTitle }) =>
        onShownReminder(model, reminder =>
          Option.match(
            Option.flatMap(boardOf(model), board => tagNamed(board, tagTitle)),
            {
              onNone: () => unchanged(model),
              onSome: tag =>
                writing(
                  model,
                  UnlinkTag({
                    reminderId: reminder.reminderId,
                    tagId: tag.tagId,
                  }),
                ),
            },
          ),
        ),
      DeleteReminder: ({ reminderId }) =>
        onReminder(model, reminderId, () =>
          writing(
            withoutReminder(model, reminderId),
            RemoveReminders({ reminderIds: [reminderId] }),
          ),
        ),
      OpenSmartList: ({ smartList }) =>
        unchanged(withPages(model, [SmartListPage({ smartList })])),
      OpenList: ({ listId }) =>
        unchanged(
          Option.isSome(listOf(model, listId))
            ? withPages(model, [ListPage({ listId })])
            : model,
        ),
      OpenTag: ({ tagTitle }) =>
        unchanged(withPages(model, [TagPage({ tagTitle })])),
      Search: ({ query }) =>
        unchanged(withPages(model, [SearchPage({ query })])),
      ShowLists: () => unchanged(withPages(model, [])),
      ShowProfile: () => unchanged(withPages(model, [ProfilePage()])),
      SharePage: () => sharedPage(model),
      AddList: ({ title }) =>
        writing(
          model,
          InsertList({
            title,
            color: newListColorOf(model),
            position: listsOf(model).length,
          }),
        ),
      ShowListDetails: () =>
        unchanged(presentedSheet(model, ListDetailsSheet())),
      RenameList: ({ title }) =>
        onShownList(model, list =>
          writing(model, UpdateListTitle({ listId: list.listId, title })),
        ),
      RecolorList: ({ color }) =>
        onShownList(model, list =>
          writing(
            withoutModal(model),
            UpdateListColor({ listId: list.listId, color }),
          ),
        ),
      DeleteList: () =>
        onShownList(model, list =>
          unchanged(
            presentedQuestion(
              model,
              DeleteListQuestion({ listId: list.listId }),
            ),
          ),
        ),
      ConfirmDeleteList: ({ listId }) =>
        writing(withoutList(model, listId), RemoveList({ listId })),
      CancelDeleteList: () => unchanged(withoutModal(model)),
      ShowCompleted: () => unchanged({ ...model, completed: 'Shown' }),
      HideCompleted: () => unchanged({ ...model, completed: 'Hidden' }),
      ClearCompleted: () =>
        onShownList(model, list =>
          unchanged(
            presentedQuestion(
              model,
              ClearCompletedQuestion({ listId: list.listId }),
            ),
          ),
        ),
      ConfirmClearCompleted: ({ listId }) =>
        writing(
          withoutModal(model),
          RemoveReminders({
            reminderIds: Array.map(
              completedOf(
                Array.filter(
                  remindersOf(model),
                  reminder => reminder.listId === listId,
                ),
              ),
              reminder => reminder.reminderId,
            ),
          }),
        ),
      CancelClearCompleted: () => unchanged(withoutModal(model)),
      ShowSortOptions: () => unchanged(presentedSheet(model, SortSheet())),
      SortBy: ({ ordering }) => unchanged(withoutModal({ ...model, ordering })),
      DeleteTag: () =>
        Option.match(
          Option.flatMap(boardOf(model), board =>
            Option.flatMap(shownTagOf(model), title => tagNamed(board, title)),
          ),
          {
            onNone: () => unchanged(model),
            onSome: tag =>
              writing(
                withPages(
                  model,
                  Array.filter(
                    model.navigation.pages,
                    page => !isTagPage(page),
                  ),
                ),
                RemoveTag({ tagId: tag.tagId }),
              ),
          },
        ),
      ShowSharing: () => unchanged(presentedSheet(model, SharingSheet())),
      StartSharing: () =>
        onShownList(model, list =>
          writing(model, InsertShare({ listId: list.listId })),
        ),
      ShareWith: ({ email }) =>
        onShownList(model, list =>
          Option.match(list.maybeShare, {
            onNone: () => unchanged(model),
            onSome: share =>
              isSharedWithEmail(model, list, email)
                ? unchanged(model)
                : writing(
                    model,
                    InsertMembership({
                      listId: list.listId,
                      shareId: share.shareId,
                      email,
                      role: 'Reader',
                    }),
                  ),
          }),
        ),
      AllowEditing: ({ memberId }) => changedRole(model, memberId, 'Writer'),
      AllowViewingOnly: ({ memberId }) =>
        changedRole(model, memberId, 'Reader'),
      StopSharingWith: ({ memberId }) =>
        onShownList(model, list =>
          Option.match(membershipOf(list, memberId), {
            onNone: () => unchanged(model),
            onSome: ({ shareId, membershipId, role }) =>
              writing(
                model,
                RevokeMembership({
                  listId: list.listId,
                  shareId,
                  membershipId,
                  memberId,
                  role,
                }),
              ),
          }),
        ),
      ReceivedBoard: ({ board }) =>
        unchanged({ ...model, board: BoardReady({ board }) }),
      ReceivedSignedOut: () => unchanged({ ...model, board: BoardSignedOut() }),
      FailedReadBoard: ({ reason }) =>
        unchanged({ ...model, board: BoardUnavailable({ reason }) }),
      ReachedDay: ({ today }) =>
        unchanged({ ...model, maybeToday: Option.some(today) }),
      CompletedWriteReminders: () =>
        unchanged({ ...model, maybeProblem: Option.none() }),
      FailedWriteReminders: ({ reason }) =>
        unchanged({ ...model, maybeProblem: Option.some(reason) }),
      SharedLink: ({ how }) =>
        unchanged({ ...model, maybeNotice: noticeOf(how) }),
      FailedShareLink: ({ reason }) =>
        unchanged({
          ...model,
          maybeNotice: Option.some(`Could not share: ${reason}`),
        }),
      OpenedUri: fact =>
        unchanged(Navigation.foldMessage(navigation, model, fact)),
      NavigatedBack: fact =>
        unchanged(Navigation.foldMessage(navigation, model, fact)),
    }),
  )

/**
 * Applies one Reminders Message. Navigation moves the stack; a change to
 * the reminders goes to the store as a Command, and the board comes back
 * from the store on every device and from the Swift app, so the Model
 * never keeps a copy that disagrees with it. A reminder or list another
 * device removed first changes nothing. A notice such as `Link copied`
 * lasts until the screen changes.
 */
export const update = (model: Model, message: Message): UpdateReturn => {
  const [next, commands] = updated(model, message)
  return isSameStack(next.navigation, model.navigation)
    ? [next, commands]
    : [{ ...next, maybeNotice: Option.none() }, commands]
}
