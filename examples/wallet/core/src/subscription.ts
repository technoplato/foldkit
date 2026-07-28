import { Array as Array_, Effect, Schema as S, Stream } from 'effect'
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
          accountIds:
            model.portfolio._tag === 'LoadedPortfolio'
              ? Array_.map(
                  model.portfolio.snapshot.accounts,
                  account => account.accountId,
                )
              : [],
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
