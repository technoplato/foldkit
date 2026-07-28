import {
  Message,
  type Message as MessageValue,
  Model,
  type Model as ModelValue,
  ObservedPlayback,
  init,
  slideForId,
  update,
} from 'constructive-data-modeling-core-example'
import { Layer, Schema as S } from 'effect'
import { Port, Program, Runtime, Subscription } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

/** The typed host boundary through which YouTube playback time enters Foldkit. */
export const playbackPorts = {
  inbound: {
    playbackObserved: Port.inbound(S.Number),
  },
}

const subscriptions = Subscription.make<ModelValue, MessageValue>()(_entry => ({
  playback: Port.subscription(playbackPorts.inbound.playbackObserved, seconds =>
    ObservedPlayback({ seconds }),
  ),
}))

const BrowserConstructiveDataModelingProgram = Program.make({
  id: 'constructive-data-modeling-video-deck',
  version: 1,
  Model,
  Message,
  init,
  update,
  subscriptions,
  ports: playbackPorts,
})

/** Creates the browser host over the portable talk Model and Message union. */
export const makeConstructiveDataModelingApplication = (
  container: HTMLElement,
  start: Runtime.ProgramStart<ModelValue, MessageValue> = Runtime.fresh(),
  requestVideoSeek: (seconds: number) => void = () => undefined,
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message,
    },
    program: BrowserConstructiveDataModelingProgram,
    resources: Layer.empty,
    start,
    view,
    onModel: model => {
      const nextUrl = new URL(globalThis.location.href)
      nextUrl.searchParams.set('slide', model.currentSlideId)
      if (globalThis.location.href !== nextUrl.href) {
        globalThis.history.replaceState({}, '', nextUrl)
      }

      if (
        model.lastControl._tag !== 'VideoPlaybackControl' &&
        model.lastControl._tag !== 'InitialControl'
      ) {
        requestVideoSeek(slideForId(model.currentSlideId).startSeconds)
      }
    },
  })
