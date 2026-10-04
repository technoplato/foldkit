import { Match as M } from 'effect'
import { Program } from 'foldkit'

import { init } from './init.js'
import { Message, catalog } from './message.js'
import { Model } from './model.js'
import { navigation, programShelfScreen } from './navigation.js'
import { subscriptions } from './subscriptions.js'
import { update } from './update.js'

// PROGRAM

const categoryOf = (message: Message): 'Domain' | 'Navigation' =>
  M.value(message).pipe(
    M.withReturnType<'Domain' | 'Navigation'>(),
    M.tagsExhaustive({
      OpenBook: () => 'Navigation',
      PreviousPage: () => 'Navigation',
      NextPage: () => 'Navigation',
      TurnToPage: () => 'Navigation',
      FollowReading: () => 'Navigation',
      ReceivedReadings: () => 'Domain',
      FailedReadReadings: () => 'Domain',
      ReceivedPreview: () => 'Navigation',
      FailedCheckPreview: () => 'Navigation',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * The Read Aloud Program: while someone reads a picture book aloud, its
 * page here follows them. The books and pages come from the reading
 * source, the page on screen lives in the stack, so its address is always
 * a link to it, and the preview of that page comes from Google Books
 * where the publisher allows one. Turning pages and opening books are
 * Navigation, which the session mirrors or keeps local. It knows nothing
 * about React, terminals, Scribe's files, or Instant.
 */
export const ReadAloudProgram = Program.make({
  id: 'read-aloud',
  version: 1,
  Model,
  Message,
  init,
  update,
  catalog,
  navigation,
  subscriptions,
  screen: programShelfScreen,
  synchronization: {
    messageCategory: categoryOf,
    projectDomain: model => ({ readings: model.readings }),
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      readings: current.readings,
      previewChecks: current.previewChecks,
    }),
  },
})
