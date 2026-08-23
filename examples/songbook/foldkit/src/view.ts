import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'
import {
  type Message,
  type Model,
  messageFromToken,
  songbookScreen,
  title,
} from 'songbook-core-example'

/** Paints songbookScreen. Tab title is fine. The body is the screen tree only. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const screen = songbookScreen(model)
  return {
    title,
    body: h.div(
      [
        h.Class(
          'songbook-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [paintHtml(screen, token => messageFromToken(token, model))],
    ),
  }
}
