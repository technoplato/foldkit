import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'
import { type Message, type Model, WorldProgram } from 'world-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

/** Creates the Foldkit World application. */
export const makeWorldApplication = (
  container: HTMLElement | null,
  resources: Layer.Layer<WalletResources>,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: WorldProgram.Message,
    },
    program: WorldProgram,
    resources,
    start,
    view,
  })
