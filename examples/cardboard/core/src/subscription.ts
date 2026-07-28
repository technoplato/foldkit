import { Duration, Effect, Match as M, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { ts } from 'foldkit/schema'

import {
  holdThresholdMilliseconds,
  holdTickMilliseconds,
  openingTickPermille,
} from './machine.js'
import {
  AdvancedZeroButtonHold,
  AdvancedZeroOpening,
  CompletedZeroOpening,
  type Message,
} from './message.js'
import { type Model } from './model.js'

const IdleTick = ts('IdleTick')
const HoldingTick = ts('HoldingTick', { nextElapsedMilliseconds: S.Int })
const OpeningTick = ts('OpeningTick', { nextProgressPermille: S.Int })
const CompletingTick = ts('CompletingTick')
const Tick = S.Union([IdleTick, HoldingTick, OpeningTick, CompletingTick])

const tickForModel = (model: Model): typeof Tick.Type =>
  M.value(model.zero).pipe(
    M.withReturnType<typeof Tick.Type>(),
    M.tagsExhaustive({
      WaitingAtZero: () => IdleTick(),
      PressingZero: ({ elapsedMilliseconds }) =>
        HoldingTick({
          nextElapsedMilliseconds: Math.min(
            elapsedMilliseconds + holdTickMilliseconds,
            holdThresholdMilliseconds,
          ),
        }),
      OpeningZero: ({ progressPermille }) =>
        progressPermille + openingTickPermille >= 1_000
          ? CompletingTick()
          : OpeningTick({
              nextProgressPermille: progressPermille + openingTickPermille,
            }),
      ConfiguringAtZero: () => IdleTick(),
      ChoosingInputMethod: () => IdleTick(),
      RejectedInputMethodChoice: () => IdleTick(),
      CompletedAtZero: () => IdleTick(),
    }),
  )

const sleepThen = (message: Message): Stream.Stream<Message> =>
  Stream.fromEffect(
    Effect.as(Effect.sleep(Duration.millis(holdTickMilliseconds)), message),
  )

/** Advances active hold and opening states without host-owned timers. */
export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  zeroProgress: entry(
    { tick: Tick },
    {
      modelToDependencies: model => ({ tick: tickForModel(model) }),
      dependenciesToStream: ({ tick }) =>
        M.value(tick).pipe(
          M.withReturnType<Stream.Stream<Message>>(),
          M.tagsExhaustive({
            IdleTick: () => Stream.empty,
            HoldingTick: ({ nextElapsedMilliseconds }) =>
              sleepThen(
                AdvancedZeroButtonHold({
                  elapsedMilliseconds: nextElapsedMilliseconds,
                }),
              ),
            OpeningTick: ({ nextProgressPermille }) =>
              sleepThen(
                AdvancedZeroOpening({
                  progressPermille: nextProgressPermille,
                }),
              ),
            CompletingTick: () => sleepThen(CompletedZeroOpening()),
          }),
        ),
    },
  ),
}))
