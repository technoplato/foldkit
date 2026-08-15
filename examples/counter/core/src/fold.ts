import { Array } from 'effect'

import { init } from './init.js'
import { type Message } from './message.js'
import { type Model } from './model.js'
import { update } from './update.js'

/** Projects accepted tape Messages without executing Commands. */
export const foldCounterMessages = (
  messages: ReadonlyArray<Message>,
): Model => {
  const [initial] = init()
  return Array.reduce(messages, initial, (model, message) => {
    const [next] = update(model, message)
    return next
  })
}
