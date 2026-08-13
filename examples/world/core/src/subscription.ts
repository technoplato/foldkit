import { Subscription } from 'foldkit'
import { init as initVending, subscriptions as vendingSubscriptions } from 'vending-core-example'

import { GotVendingMessage, type Message } from './message.js'
import { type Model } from './model.js'

const [parkedVending] = initVending()

/** Lifts vending Incoming observation only while Operating. */
export const subscriptions = Subscription.lift(vendingSubscriptions)<
  Model,
  Message
>({
  toChildModel: model =>
    model._tag === 'Operating' ? model.vending : parkedVending,
  toParentMessage: message => GotVendingMessage({ message }),
})
