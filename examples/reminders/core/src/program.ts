import { Match as M } from 'effect'
import { Program } from 'foldkit'

import { init } from './init.js'
import { Message, catalog } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { homeScreen } from './screen.js'
import type { RemindersServices } from './services.js'
import { subscriptions } from './subscriptions.js'
import { update } from './update.js'

// PROGRAM

type Category = 'Domain' | 'Navigation'

const categoryOf = (message: Message): Category =>
  M.value(message).pipe(
    M.withReturnType<Category>(),
    M.tagsExhaustive({
      AddReminder: () => 'Domain',
      Complete: () => 'Domain',
      Reopen: () => 'Domain',
      Flag: () => 'Domain',
      Unflag: () => 'Domain',
      OpenReminder: () => 'Navigation',
      RenameReminder: () => 'Domain',
      SetNotes: () => 'Domain',
      ClearNotes: () => 'Domain',
      ShowDueDates: () => 'Navigation',
      SetDue: () => 'Domain',
      ClearDue: () => 'Domain',
      ShowPriorities: () => 'Navigation',
      SetPriority: () => 'Domain',
      ShowMoveOptions: () => 'Navigation',
      MoveReminder: () => 'Domain',
      AddTag: () => 'Domain',
      Untag: () => 'Domain',
      DeleteReminder: () => 'Domain',
      OpenSmartList: () => 'Navigation',
      OpenList: () => 'Navigation',
      OpenTag: () => 'Navigation',
      Search: () => 'Navigation',
      ShowLists: () => 'Navigation',
      ShowProfile: () => 'Navigation',
      SharePage: () => 'Navigation',
      AddList: () => 'Domain',
      ShowListDetails: () => 'Navigation',
      RenameList: () => 'Domain',
      RecolorList: () => 'Domain',
      DeleteList: () => 'Navigation',
      ConfirmDeleteList: () => 'Domain',
      CancelDeleteList: () => 'Navigation',
      ShowCompleted: () => 'Navigation',
      HideCompleted: () => 'Navigation',
      ClearCompleted: () => 'Navigation',
      ConfirmClearCompleted: () => 'Domain',
      CancelClearCompleted: () => 'Navigation',
      ShowSortOptions: () => 'Navigation',
      SortBy: () => 'Navigation',
      DeleteTag: () => 'Domain',
      ShowSharing: () => 'Navigation',
      StartSharing: () => 'Domain',
      ShareWith: () => 'Domain',
      AllowEditing: () => 'Domain',
      AllowViewingOnly: () => 'Domain',
      StopSharingWith: () => 'Domain',
      ReceivedBoard: () => 'Domain',
      ReceivedSignedOut: () => 'Domain',
      FailedReadBoard: () => 'Domain',
      ReachedDay: () => 'Domain',
      CompletedWriteReminders: () => 'Domain',
      FailedWriteReminders: () => 'Domain',
      SharedLink: () => 'Navigation',
      FailedShareLink: () => 'Navigation',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * The Reminders Program: home with the smart lists, every list, and the
 * tags; a page per list, smart list, tag, search, and reminder; and Sheets
 * for due dates, priorities, moving, ordering, list details, and sharing.
 * The board comes from the reminders store and every change to it goes
 * back there as a Command, so every device, and the Swift app, reads the
 * same reminders. It knows nothing about React, terminals, or Instant.
 */
export const RemindersProgram: Program.Program<
  Model,
  Message,
  RemindersServices
> &
  Readonly<{ catalog: typeof catalog }> = Program.make({
  id: 'reminders',
  version: 1,
  Model,
  Message,
  init,
  update,
  catalog,
  navigation,
  subscriptions,
  screen: homeScreen,
  synchronization: {
    messageCategory: categoryOf,
    projectDomain: model => ({ board: model.board }),
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      board: current.board,
      maybeToday: current.maybeToday,
    }),
  },
})
