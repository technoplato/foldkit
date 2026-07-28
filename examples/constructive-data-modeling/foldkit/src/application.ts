import {
  ConstructiveDataModelingProgram,
  type Message,
  type Model,
} from 'constructive-data-modeling-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

/** Creates the browser deck from one portable Program start. */
export const makeConstructiveDataModelingApplication = (
  container: HTMLElement,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: ConstructiveDataModelingProgram.Message,
    },
    program: ConstructiveDataModelingProgram,
    resources: Layer.empty,
    start,
    view,
    onModel: model => {
      const nextUrl = new URL(globalThis.location.href)
      nextUrl.searchParams.set('slide', model.currentSlideId)
      if (globalThis.location.href !== nextUrl.href) {
        globalThis.history.replaceState({}, '', nextUrl)
      }
    },
  })
