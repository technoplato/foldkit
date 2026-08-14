import {
  type Message,
  type Model,
  MultipleCountersProgram,
} from 'counters-core-example'
import { Array } from 'effect'

/** Projects accepted tape Messages without executing Commands. */
export const foldCountersMessages = (
  messages: ReadonlyArray<Message>,
): Model => {
  const [initial] = MultipleCountersProgram.init()
  return Array.reduce(messages, initial, (model, message) => {
    const [next] = MultipleCountersProgram.update(model, message)
    return next
  })
}
