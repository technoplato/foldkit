import { type Document } from 'foldkit/html'
import { paintMobileScreen } from 'foldkit/renderers/html'
import {
  type Model,
  messageFromToken,
  settingsScreen,
  settingsValid,
  title,
} from 'settings-core-example'

/**
 * Host view for CLI/TUI on a phone browser. Paints settingsScreen with
 * phone chrome, then a pad derived from that tree.
 */
export const view = (model: Model): Document => ({
  title,
  body: paintMobileScreen(model, {
    screen: settingsScreen,
    actions: settingsValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
