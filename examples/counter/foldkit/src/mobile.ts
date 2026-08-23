import {
  CounterProgram,
  type Message,
  type Model,
  actionByToken,
  counterScreen,
  counterValid,
} from 'counter-core-example'
import { type Document } from 'foldkit/html'
import { paintMobileScreen } from 'foldkit/renderers/html'

const messageFromToken = (token: string): Message | undefined => {
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

/**
 * Host view for CLI/TUI on a phone browser. Paints counterScreen with
 * phone chrome, then a pad derived from that tree. No HostHeader.
 */
export const view = (model: Model): Document => ({
  title: CounterProgram.id,
  body: paintMobileScreen(model, {
    screen: counterScreen,
    actions: counterValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
