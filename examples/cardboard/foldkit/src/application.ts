import {
  CardboardProgram,
  type Message,
  type Model,
} from 'cardboard-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

/** The canonical Program consumed by the Foldkit presentation. */
export const cardboardFoldkitProgram: typeof CardboardProgram = CardboardProgram

/** Creates a Foldkit application from one portable Cardboard start. */
export const makeCardboardApplication = (
  container: HTMLElement | null,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: { overlay, Message: cardboardFoldkitProgram.Message },
    program: cardboardFoldkitProgram,
    resources: Layer.empty,
    start,
    view,
  })
