import { Option } from 'effect'
import { type Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'
import {
  type Message,
  type Model,
  issuesScreen,
  messageForScreenToken,
} from 'issues-core-example'

/** Paints the shared issuesScreen. Host title may use chrome; the body does not. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const screen = issuesScreen(model)
  return {
    title: 'Issues',
    body: h.div(
      [h.Class('issues-screen min-h-screen bg-stone-50 px-5 py-10')],
      [
        paintHtml(screen, token =>
          Option.getOrUndefined(messageForScreenToken(model, token)),
        ),
      ],
    ),
  }
}
