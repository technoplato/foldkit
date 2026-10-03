import { Match as M } from 'effect'
import { Program } from 'foldkit'

import { init } from './init.js'
import { interaction } from './interaction.js'
import { Message, catalog } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { listScreen } from './screen.js'
import { update } from './update.js'

// PROGRAM

const categoryOf = (message: Message): 'Domain' | 'Navigation' =>
  M.value(message).pipe(
    M.withReturnType<'Domain' | 'Navigation'>(),
    M.tagsExhaustive({
      AddCounter: () => 'Domain',
      ConfirmDeleteCounter: () => 'Domain',
      CancelDeleteCounter: () => 'Navigation',
      GotCounterMessage: ({ message: rowMessage }) =>
        rowMessage._tag === 'OpenCounter' || rowMessage._tag === 'DeleteCounter'
          ? 'Navigation'
          : 'Domain',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * The Multiple Counters Program: a list of counters, each one the Counter
 * Program's own Model and Actions, a page per counter, and a Dialog that
 * asks before deleting. It knows nothing about React, terminals, or a
 * tape. Counting, adding, and deleting are Domain, so every device shares
 * them; opening a page and asking a question are Navigation, which the
 * session mirrors or keeps local.
 */
export const CountersProgram = Program.make({
  id: 'multiple-counters',
  version: 1,
  Model,
  Message,
  init,
  update,
  catalog,
  interaction,
  navigation,
  screen: listScreen,
  synchronization: {
    messageCategory: categoryOf,
    projectDomain: model => ({
      counters: model.counters,
      nextCounterId: model.nextCounterId,
    }),
  },
})
