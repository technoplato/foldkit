import {
  CasinoProgram,
  type Message,
  type Model,
  actionByToken,
  casinoScreen,
  casinoValid,
} from 'casino-core-example'
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
 * Host view for CLI/TUI on a phone browser. Paints casinoScreen with
 * phone chrome, then a pad derived from that tree. No HostHeader.
 */
export const view = (model: Model): Document => ({
  title: CasinoProgram.id,
  body: paintMobileScreen(model, {
    screen: casinoScreen,
    actions: casinoValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
