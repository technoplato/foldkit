import { Program } from 'foldkit'
import { Document, html } from 'foldkit/html'
import { paintHtml } from 'foldkit/renderers/html'
import {
  App,
  type AppMessage,
  type AppModel,
  actionByToken,
  surfaceFor,
  uriOf,
} from 'puzzle-core-example'

// VIEW

/** Paints the App screen tree, including the Action menu when Open. */
export const view = (model: AppModel): Document => {
  const h = html<AppMessage>()
  const surface = surfaceFor('foldkit')
  const screen =
    App.screen === undefined
      ? { _tag: 'Text' as const, content: uriOf(model.product) }
      : App.screen(model)
  return {
    title: `${surface.title}: ${uriOf(model.product)}`,
    body: h.div(
      [
        h.Class(
          'puzzle-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [paintHtml(screen, token => messageFromScreenToken(token))],
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
