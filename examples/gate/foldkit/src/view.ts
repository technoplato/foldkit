import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'
import {
  type Message,
  type Model,
  gateScreen,
  messageFromToken,
  title,
} from 'gate-core-example'

/** Paints gateScreen. Tab title is fine. The body is the screen tree only. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title,
    body: h.main(
      [
        h.Class(
          'gate-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [paintHtml(gateScreen(model), messageFromToken)],
    ),
  }
}
