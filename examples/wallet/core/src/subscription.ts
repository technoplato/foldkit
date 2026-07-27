import { Array as Array_, Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  FailedObserveTransactions,
  type Message,
  ObservedTransaction,
} from './message.js'
import { type Model, NetworkFailure, WalletAccount } from './model.js'
import { WalletClient } from './walletClient.js'

/** Observes public transaction changes while loaded accounts require it. */
export const subscriptions = Subscription.make<Model, Message, WalletClient>()(
  entry => ({
    transactionChanges: entry(
      {
        accounts: S.Array(WalletAccount),
        isEnabled: S.Boolean,
      },
      {
        modelToDependencies: model => ({
          accounts:
            model.portfolio._tag === 'LoadedPortfolio'
              ? model.portfolio.snapshot.accounts
              : [],
          isEnabled:
            model.transactionObservation._tag === 'ObservingTransactions',
        }),
        dependenciesToStream: ({ accounts, isEnabled }) => {
          if (!isEnabled) {
            return Stream.empty
          } else {
            return Array_.match(accounts, {
              onEmpty: () => Stream.empty,
              onNonEmpty: observedAccounts =>
                Stream.unwrap(
                  WalletClient.pipe(
                    Effect.map(client =>
                      client.observeTransactions(observedAccounts).pipe(
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
