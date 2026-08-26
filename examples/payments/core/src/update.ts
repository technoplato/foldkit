import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { CreateSession, VerifyPayment } from './command.js'
import { type Message } from './message.js'
import {
  AwaitingCheckout,
  CreatingSession,
  FailedCheckout,
  IdleCheckout,
  type Model,
  OkEffect,
  Quote,
  RefuseEffect,
  SettledCheckout,
  VerifyingCheckout,
  quotedCents,
} from './model.js'
import {
  type PaymentResources,
  SessionRequest,
  VerifyRequest,
} from './processor.js'
import {
  WalletConnected,
  WalletDisconnected,
  emptyPresence,
  isRailReady,
  recordPresence,
} from './rail/index.js'

const commitOk = (model: Model, line: string): Model =>
  evo(model, {
    lastOutcome: () => Option.some(OkEffect.make({ line })),
  })

const commitRefuse = (model: Model, why: string): Model =>
  evo(model, {
    lastOutcome: () => Option.some(RefuseEffect.make({ why })),
  })

type UpdateResult = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, PaymentResources>>,
]

/** Applies one Payments Message to the current Model. */
export const update = (model: Model, message: Message): UpdateResult =>
  M.value(message).pipe(
    M.withReturnType<UpdateResult>(),
    M.tagsExhaustive({
      SelectedRail: ({ rail }) => [
        evo(commitOk(model, `selected ${rail}`), {
          selectedRail: () => rail,
          phase: () => IdleCheckout.make({}),
        }),
        [],
      ],
      RecordedCredentialPresence: ({ field, isPresent }) => [
        evo(commitOk(model, `${field} ${isPresent ? 'present' : 'absent'}`), {
          presence: presence => recordPresence(presence, field, isPresent),
        }),
        [],
      ],
      ClearedCredentials: () => [
        evo(commitOk(model, 'cleared credentials'), {
          presence: () => emptyPresence,
        }),
        [],
      ],
      ConnectedWallet: () => [
        evo(commitOk(model, 'wallet connected'), {
          wallet: () => WalletConnected.make({}),
        }),
        [],
      ],
      DisconnectedWallet: () => [
        evo(commitOk(model, 'wallet disconnected'), {
          wallet: () => WalletDisconnected.make({}),
        }),
        [],
      ],
      SelectedResource: ({ slug, title, amountAtomic, origin }) => [
        evo(commitOk(model, `resource ${slug}`), {
          quote: () => Quote.make({ slug, title, amountAtomic, origin }),
          phase: () => IdleCheckout.make({}),
        }),
        [],
      ],
      RequestedSession: () => {
        if (!isRailReady(model.selectedRail, model.presence, model.wallet)) {
          return [commitRefuse(model, 'rail-not-ready'), []]
        }
        if (model.phase._tag !== 'idle' && model.phase._tag !== 'failed') {
          return [commitRefuse(model, 'checkout-in-flight'), []]
        }
        const request = SessionRequest.make({
          rail: model.selectedRail,
          slug: model.quote.slug,
          title: model.quote.title,
          origin: model.quote.origin,
          amountCents: quotedCents(model),
        })
        return [
          evo(commitOk(model, `creating ${model.selectedRail} session`), {
            phase: () => CreatingSession.make({ rail: model.selectedRail }),
          }),
          [CreateSession({ request })],
        ]
      },
      SucceededCreateSession: ({ offer }) => {
        if (model.phase._tag !== 'creating-session') {
          return [commitRefuse(model, 'unexpected-session'), []]
        }
        return [
          evo(commitOk(model, `awaiting ${offer._tag}`), {
            phase: () =>
              AwaitingCheckout.make({
                rail: model.phase.rail,
                offer,
              }),
          }),
          [],
        ]
      },
      FailedCreateSession: ({ why }) => [
        evo(commitRefuse(model, why), {
          phase: () => FailedCheckout.make({ why }),
        }),
        [],
      ],
      RequestedVerify: ({
        sessionId,
        orderId,
        paymentIntentId,
        checkoutId,
      }) => {
        if (model.phase._tag !== 'awaiting-checkout') {
          return [commitRefuse(model, 'nothing-to-verify'), []]
        }
        const request = VerifyRequest.make({
          rail: model.phase.rail,
          slug: model.quote.slug,
          origin: model.quote.origin,
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(orderId === undefined ? {} : { orderId }),
          ...(paymentIntentId === undefined ? {} : { paymentIntentId }),
          ...(checkoutId === undefined ? {} : { checkoutId }),
        })
        return [
          evo(commitOk(model, `verifying ${model.phase.rail}`), {
            phase: () =>
              VerifyingCheckout.make({
                rail: model.phase.rail,
                offer: model.phase.offer,
              }),
          }),
          [VerifyPayment({ request })],
        ]
      },
      SucceededVerify: ({ receipt }) => [
        evo(commitOk(model, `settled ${receipt.reference}`), {
          phase: () => SettledCheckout.make({ receipt }),
        }),
        [],
      ],
      FailedVerify: ({ why }) => [
        evo(commitRefuse(model, why), {
          phase: () => FailedCheckout.make({ why }),
        }),
        [],
      ],
      ResetCheckout: () => [
        evo(commitOk(model, 'reset checkout'), {
          phase: () => IdleCheckout.make({}),
        }),
        [],
      ],
    }),
  )
