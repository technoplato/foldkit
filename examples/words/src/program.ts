import { Port, Program, Subscription } from 'foldkit'

import { AudioEvent, Message, type Message as MessageValue } from './message.js'
import { Model, type Model as ModelValue } from './model.js'
import { type WordsRoute } from './route.js'
import { type WordsResources, init, update } from './update.js'

/** The typed host boundary through which a supplied audio element is observed. */
export const audioPorts = {
  inbound: { audioObserved: Port.inbound(AudioEvent) },
}

/** Subscribes the Words Program to host-supplied audio events. */
export const subscriptions = Subscription.make<ModelValue, MessageValue>()(
  _entry => ({
    audio: Port.subscription(audioPorts.inbound.audioObserved, event => event),
  }),
)

/** Creates the portable Words Program for one initial route. */
export const makeWordsProgram = (
  route: WordsRoute,
): Program.Program<
  ModelValue,
  MessageValue,
  WordsResources,
  never,
  typeof audioPorts
> =>
  Program.make({
    id: 'words',
    version: 1,
    Model,
    Message,
    init: () => init(route),
    update,
    subscriptions,
    ports: audioPorts,
  })
