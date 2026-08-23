import {
  type Message,
  type Model,
  casinoScreen,
  messageFromToken,
  title,
} from 'casino-core-example'
import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'

/** Paints casinoScreen. Tab title is fine. The body is the screen tree only. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const screen = casinoScreen(model)
  return {
    title,
    body: h.div(
      [
        h.Class(
          'casino-screen min-h-screen flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [paintHtml(screen, token => messageFromToken(token, model))],
    ),
  }
}
