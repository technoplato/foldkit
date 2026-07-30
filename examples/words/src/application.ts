import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { AudioPlayer, makeBrowserAudioPlayer } from './audioPlayer.js'
import { WordsDataClientLive } from './dataClient.js'
import { Message } from './message.js'
import { Model, type Model as ModelValue } from './model.js'
import { audioPorts, subscriptions } from './program.js'
import { update } from './update.js'
import { view } from './view.js'

/** Creates a browser element over the portable Words domain. */
export const makeWordsApplication = (
  container: HTMLElement,
  model: ModelValue,
  audio: HTMLAudioElement,
) =>
  Runtime.makeElement({
    container,
    Model,
    Message,
    init: () => [model, []],
    update,
    subscriptions,
    ports: audioPorts,
    resources: Layer.merge(
      WordsDataClientLive,
      Layer.succeed(AudioPlayer, makeBrowserAudioPlayer(audio)),
    ),
    view,
  })
