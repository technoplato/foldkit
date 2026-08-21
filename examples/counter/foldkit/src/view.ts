import {
  App,
  type AppMessage,
  type AppModel,
  actionByToken,
  surfaceFor,
} from 'counter-core-example'
import { Program } from 'foldkit'
import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'

// VIEW

/** Paints the App screen tree, including the Action menu when Open. */
export const view = (model: AppModel): Document => {
  const h = html<AppMessage>()
  const surface = surfaceFor('foldkit')
  const screen =
    App.screen === undefined
      ? { _tag: 'Text' as const, content: model.product.count.toString() }
      : App.screen(model)
  return {
    title: `${surface.title}: ${model.product.count}`,
    body: h.div(
      [
        h.Class(
          'counter-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [
        h.header(
          [h.Class('text-center space-y-2 max-w-md')],
          [
            h.h1([h.Class('text-xl font-semibold')], [surface.title]),
            h.p(
              [h.Class('text-sm text-gray-600')],
              [
                `${surface.description} `,
                h.a(
                  [h.Href(surface.sourceUrl), h.Class('underline break-all')],
                  [surface.sourceUrl],
                ),
              ],
            ),
          ],
        ),
        paintHtml(screen, token => messageFromScreenToken(token)),
      ],
    ),
  }
}

const messageFromScreenToken = (token: string): AppMessage | undefined => {
  if (token === Program.actionMenuDismissToken) {
    return Program.ActionMenuDismissed()
  }
  if (token.startsWith(Program.actionMenuSelectPrefix)) {
    return Program.ActionCommandMenuSelectionMade({
      token: Program.tokenFromActionMenuToken(token),
    })
  }
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}
