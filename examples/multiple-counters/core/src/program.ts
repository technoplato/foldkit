import { Match as M } from 'effect'
import { Program } from 'foldkit'

import { init } from './init.js'
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
      IncrementCounter: () => 'Domain',
      DecrementCounter: () => 'Domain',
      ResetCounter: () => 'Domain',
      OpenCounter: () => 'Navigation',
      DeleteCounter: () => 'Navigation',
      ConfirmDeleteCounter: () => 'Domain',
      CancelDeleteCounter: () => 'Navigation',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * The Multiple Counters Program: a list of counters, each one the Counter
 * Program's own Model, counted by the Counter's own Actions asked of one
 * counter, a page per counter, and a Dialog that asks before deleting.
 * Every surface derives from the Catalog: the menu shows each Action once
 * and asks which counter next. It knows nothing about React, terminals, or a
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
