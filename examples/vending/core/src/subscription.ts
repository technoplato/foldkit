import { Duration, Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { NetworkFailure, WalletClient } from 'wallet-core-example'

import {
  AdvancedClipPlayback,
  FailedObserveIncoming,
  type Message,
  ObservedIncoming,
} from './message.js'
import { type Model } from './model.js'

/** Observes Incoming SOL and ticks clip playback while Dispensed. */
export const subscriptions = Subscription.make<Model, Message, WalletClient>()(
  entry => ({
    incoming: entry(
      { accountId: S.String, isEnabled: S.Boolean },
      {
        modelToDependencies: model => ({
          accountId:
            model.wallet._tag === 'ready' ? model.wallet.accountId : '',
          isEnabled: model.wallet._tag === 'ready',
        }),
        dependenciesToStream: ({ accountId, isEnabled }) => {
          if (!isEnabled || accountId === '') {
            return Stream.empty
          }
          return Stream.unwrap(
            WalletClient.pipe(
              Effect.map(client =>
                client.observeTransactions([accountId]).pipe(
                  Stream.map(transaction =>
                    ObservedIncoming.make({ transaction }),
                  ),
                  Stream.catch(error =>
                    Stream.make(
                      FailedObserveIncoming.make({
                        failure: NetworkFailure.make({
                          operation: 'ObserveTransactions',
                          code: error.code,
                        }),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          )
        },
      },
    ),
    clipPlayback: entry(
      { isPlaying: S.Boolean },
      {
        modelToDependencies: model => ({
          isPlaying:
            model.vendPhase._tag === 'Dispensed' &&
            model.clipPlayback._tag === 'Playing',
        }),
        dependenciesToStream: ({ isPlaying }) => {
          if (!isPlaying) {
            return Stream.empty
          }
          return Stream.tick(Duration.millis(200)).pipe(
            Stream.mapAccum(
              () => -200,
              elapsed => {
                const next = elapsed + 200
                return [next, [next]] as const
              },
            ),
            Stream.map(elapsedMs => AdvancedClipPlayback.make({ elapsedMs })),
          )
        },
      },
    ),
  }),
)
