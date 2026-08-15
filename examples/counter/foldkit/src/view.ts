import {
  type Message,
  type Model,
  actionByToken,
  counterScreen,
} from 'counter-core-example'
import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'

// VIEW

/** Paints the Program screen tree. The window does not invent buttons. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: `Counter: ${model.count}`,
    body: h.div(
      [
        h.Class(
          'counter-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [
        paintHtml(counterScreen(model), token => {
          const action = actionByToken(token)
          if (action === undefined) {
            return undefined
          }
          return action()
        }),
      ],
    ),
  }
}
