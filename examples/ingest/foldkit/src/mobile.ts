import { type Document } from 'foldkit/html'
import { paintMobileScreen } from 'foldkit/renderers/html'
import {
  IngestProgram,
  type Message,
  type Model,
  actionByToken,
  ingestScreen,
  ingestValid,
} from 'ingest-core-example'

const messageFromToken = (token: string): Message | undefined => {
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

/**
 * Host view for CLI/TUI on a phone browser. Paints ingestScreen with
 * phone chrome, then a pad derived from that tree. No HostHeader.
 */
export const view = (model: Model): Document => ({
  title: IngestProgram.id,
  body: paintMobileScreen(model, {
    screen: ingestScreen,
    actions: ingestValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
