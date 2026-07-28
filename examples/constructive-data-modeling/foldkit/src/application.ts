import {
  Message,
  type Message as MessageValue,
  Model,
  type Model as ModelValue,
  ObservedPlayback,
  init,
  locationKey,
  startSecondsForLocation,
  update,
} from 'constructive-data-modeling-core-example'
import { Layer, Match as M, Schema as S } from 'effect'
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
) => {
  let previousLocationKey: string | undefined
  return Runtime.makeFoldkitApplication({
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
      M.value(model.location).pipe(
        M.tagsExhaustive({
          AuthoredPageLocation: ({ page }) =>
            nextUrl.searchParams.set('page', page.toString()),
          QuestionAnswerLocation: () =>
            nextUrl.searchParams.set('page', 'q-and-a'),
        }),
      )
      nextUrl.searchParams.delete('slide')
      if (globalThis.location.href !== nextUrl.href) {
        globalThis.history.replaceState({}, '', nextUrl)
      }

      const nextLocationKey = locationKey(model.location)
      if (
        previousLocationKey !== undefined &&
        previousLocationKey !== nextLocationKey &&
        model.lastControl._tag !== 'VideoPlaybackControl' &&
        model.lastControl._tag !== 'InitialControl'
      ) {
        requestVideoSeek(startSecondsForLocation(model.location))
      }
      previousLocationKey = nextLocationKey
    },
  })
}
