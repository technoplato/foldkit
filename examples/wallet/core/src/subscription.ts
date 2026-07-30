import { Array as Array_, Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  FailedObserveTransactions,
  type Message,
  ObservedTransaction,
} from './message.js'
import { type Model, NetworkFailure } from './model.js'
import { WalletClient } from './walletClient.js'

/** Observes public transaction changes while loaded accounts require it. */
export const subscriptions = Subscription.make<Model, Message, WalletClient>()(
  entry => ({
    transactionChanges: entry(
      {
        accountIds: S.Array(S.String),
        isEnabled: S.Boolean,
      },
      {
        modelToDependencies: model => ({
          accountIds: Array_.getSomes([
            model.portfolio._tag === 'LoadedPortfolio'
              ? Option.map(
                  model.maybeSendNetworkSelection,
                  selection => selection.accountId,
                )
              : Option.none(),
          ]),
          isEnabled:
            model.transactionObservation._tag === 'ObservingTransactions',
        }),
        dependenciesToStream: ({ accountIds, isEnabled }) => {
          if (!isEnabled) {
            return Stream.empty
          } else {
            return Array_.match(accountIds, {
              onEmpty: () => Stream.empty,
              onNonEmpty: observedAccountIds =>
                Stream.unwrap(
                  WalletClient.pipe(
                    Effect.map(client =>
                      client.observeTransactions(observedAccountIds).pipe(
                        Stream.map(transaction =>
                          ObservedTransaction.make({ transaction }),
                        ),
                        Stream.catch(error =>
                          Stream.make(
                            FailedObserveTransactions.make({
                              accountIds: observedAccountIds,
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
                ),
            })
          }
        },
      },
    ),
  }),
)
