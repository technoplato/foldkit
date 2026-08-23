import { type Document } from 'foldkit/html'
import { paintMobileScreen } from 'foldkit/renderers/html'
import {
  type Message,
  type Model,
  SongbookProgram,
  actionByToken,
  songbookScreen,
  songbookValid,
} from 'songbook-core-example'

const messageFromToken = (token: string): Message | undefined => {
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

/**
 * Host view for CLI/TUI on a phone browser. Paints songbookScreen with
 * phone chrome, then a pad derived from that tree. No HostHeader.
 */
export const view = (model: Model): Document => ({
  title: SongbookProgram.id,
  body: paintMobileScreen(model, {
    screen: songbookScreen,
    actions: songbookValid,
    device: 'phone',
    toMessage: messageFromToken,
  }),
})
