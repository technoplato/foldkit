import {
  CardboardProgram,
  type Message,
  type Model,
  extraPortableRoute,
  sequencePortableRoute,
} from 'cardboard-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

const portableRouteForModel = (model: Model): string => {
  if (model.page._tag === 'SequencePage') {
    return sequencePortableRoute(model.page.value)
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return extraPortableRoute
  } else {
    return globalThis.location.pathname
  }
}

/** The canonical Program consumed by the Foldkit presentation. */
export const cardboardFoldkitProgram: typeof CardboardProgram = CardboardProgram

/** Creates a Foldkit application from one portable Cardboard start. */
export const makeCardboardApplication = (
  container: HTMLElement | null,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      banner:
        'Program Log: choose an action to inspect that frame, scrub backward or forward, then Resume to continue from the present.',
      mode: 'TimeTravel',
      overlay,
      show: 'Always',
      Message: cardboardFoldkitProgram.Message,
    },
    program: cardboardFoldkitProgram,
    resources: Layer.empty,
    start,
    view,
    onModel: model => {
      const nextPath = portableRouteForModel(model)
      if (globalThis.location.pathname !== nextPath) {
        globalThis.history.pushState({}, '', nextPath)
      }
    },
  })
