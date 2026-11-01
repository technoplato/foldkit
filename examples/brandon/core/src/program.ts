import { Array } from 'effect'
import { Program } from 'foldkit'
import type * as Command from 'foldkit/command'

import { Message, logMessageTags } from './message.js'
import { Model, initialModel } from './model.js'
import type { BrandonServer } from './server.js'
import { subscriptions } from './subscriptions.js'
import { update } from './update.js'

// PROGRAM

const init = (): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [
  initialModel,
  [],
]

const isLogMessage = (message: Message): boolean =>
  Array.contains(logMessageTags, message._tag)

/**
 * Brandon dot: the party page at brandon.pisspoursoftware.xyz. Points,
 * pointers, and change notices are facts on the Instant log, so every open
 * phone follows them. A section's words stay on the origin, which sends
 * each person only what their flags allow, and never reach the log.
 */
export const BrandonProgram = Program.make<Model, Message, BrandonServer>({
  id: 'brandon-dot',
  version: 1,
  Model,
  Message,
  init,
  update,
  subscriptions,
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => ({ players: model.players }),
    isLocalOnly: message => !isLogMessage(message),
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      page: current.page,
      games: current.games,
      wallets: current.wallets,
      maybeHighlighted: current.maybeHighlighted,
    }),
  },
})
