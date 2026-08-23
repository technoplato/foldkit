import { Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { NetworkFailure, WalletClient } from 'wallet-core-example'

import {
  FailedObserveIncoming,
  type Message,
  ObservedIncoming,
} from './message.js'
import { type Model } from './model.js'

/** Observes Incoming SOL while a live unpaid wallet session is connected. */
export const subscriptions = Subscription.make<Model, Message, WalletClient>()(
  entry => ({
    incoming: entry(
      { accountId: S.String, isEnabled: S.Boolean },
      {
        modelToDependencies: model => {
          if (
            model.table._tag !== 'Unpaid' ||
            model.table.deposit._tag !== 'Wallet'
          ) {
            return { accountId: '', isEnabled: false }
          }
          return {
            accountId: model.table.deposit.accountId,
            isEnabled: true,
          }
        },
        dependenciesToStream: ({ accountId, isEnabled }) => {
          if (!isEnabled) {
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
  }),
)
