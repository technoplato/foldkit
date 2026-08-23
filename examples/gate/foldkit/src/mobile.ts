import { type Document } from 'foldkit/html'
import { paintMobileScreen } from 'foldkit/renderers/html'
import {
  type Model,
  gateScreen,
  gateValid,
  messageFromToken,
  title,
} from 'gate-core-example'

/**
 * Host view for CLI/TUI on a phone browser. Paints gateScreen with
 * phone chrome, then a pad derived from that tree.
 */
export const view = (model: Model): Document => ({
  title,
  body: paintMobileScreen(model, {
    screen: gateScreen,
    actions: gateValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
