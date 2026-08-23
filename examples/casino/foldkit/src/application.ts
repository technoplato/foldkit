import { CasinoProgram, type CasinoResources } from 'casino-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { casinoBrowserResources } from './resources.js'
import { view } from './view.js'

export { casinoBrowserResources } from './resources.js'

/** Creates the Foldkit Casino application. */
export const makeCasinoApplication = (
  container: HTMLElement | null,
  resources: Layer.Layer<CasinoResources> = casinoBrowserResources(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
    },
    program: CasinoProgram,
    resources,
    view,
  })
