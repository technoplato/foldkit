import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  Schedule,
  Stream,
} from 'effect'
import { Subscription } from 'foldkit'
import * as Wallet from 'wallet-core-example'

import {
  CompletedScrollToSection,
  FailedFootball,
  FailedHeldAccounts,
  FailedPage,
  FailedWalletActivity,
  FailedWallets,
  FailedWatchWalletAccounts,
  GotWalletMessage,
  IgnoredStalePointer,
  IgnoredStaleReload,
  type Message,
  ReceivedFootball,
  ReceivedHeldAccounts,
  ReceivedPage,
  ReceivedWalletActivity,
  ReceivedWallets,
  SucceededWatchWalletAccounts,
} from './message.js'
import { type Model, Pointer, hasSection } from './model.js'
import { WalletPublicAccount } from './page.js'
import { BrandonServer } from './server.js'
import { publicAccountsOf } from './walletActivity.js'

// SUBSCRIPTION

const footballEvery = '5 seconds'

/** A pointer or reload this old happened before this page was open. */
const freshForMs = 30_000

/** A read of the origin gets two more tries, 5 seconds apart. */
const originRetry = { times: 2, schedule: Schedule.spaced('5 seconds') }

const isFresh = (atMs: number, nowMs: number): boolean =>
  nowMs - atMs < freshForMs

const pageSubscriptions = Subscription.make<Model, Message, BrandonServer>()(
  entry => ({
    page: entry(
      { revision: S.Int },
      {
        modelToDependencies: model => ({ revision: model.pageRevision }),
        dependenciesToStream: () =>
          Stream.fromEffect(
            Effect.gen(function* () {
              const server = yield* BrandonServer
              return yield* server.loadPage.pipe(
                Effect.match({
                  onFailure: reason => FailedPage({ reason }),
                  onSuccess: page => ReceivedPage({ page }),
                }),
              )
            }),
          ),
      },
    ),
    football: entry(
      { isShown: S.Boolean },
      {
        modelToDependencies: model => ({
          isShown: hasSection(model, 'FootballSection'),
        }),
        dependenciesToStream: ({ isShown }) =>
          isShown
            ? Stream.tick(footballEvery).pipe(
                Stream.mapEffect(() =>
                  Effect.gen(function* () {
                    const server = yield* BrandonServer
                    return yield* server.loadFootball.pipe(
                      Effect.match({
                        onFailure: () => FailedFootball(),
                        onSuccess: games => ReceivedFootball({ games }),
                      }),
                    )
                  }),
                ),
              )
            : Stream.empty,
      },
    ),
    wallets: entry(
      { isShown: S.Boolean, revision: S.Int },
      {
        modelToDependencies: model => ({
          isShown: hasSection(model, 'WalletsSection'),
          revision: model.walletsRevision,
        }),
        dependenciesToStream: ({ isShown }) =>
          isShown
            ? Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  return yield* server.loadWallets.pipe(
                    Effect.match({
                      onFailure: () => FailedWallets(),
                      onSuccess: wallets => ReceivedWallets({ wallets }),
                    }),
                  )
                }),
              )
            : Stream.empty,
      },
    ),
    walletActivity: entry(
      { isShown: S.Boolean, revision: S.Int },
      {
        modelToDependencies: model => ({
          isShown: hasSection(model, 'PersonalWalletSection'),
          revision: model.walletActivityRevision,
        }),
        dependenciesToStream: ({ isShown }) =>
          isShown
            ? Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  return yield* server.loadWalletActivity.pipe(
                    Effect.retry(originRetry),
                    Effect.match({
                      onFailure: () => FailedWalletActivity(),
                      onSuccess: entries => ReceivedWalletActivity({ entries }),
                    }),
                  )
                }),
              )
            : Stream.empty,
      },
    ),
    heldAccounts: entry(
      { isShown: S.Boolean, activityRevision: S.Int, heldRevision: S.Int },
      {
        modelToDependencies: model => ({
          isShown: hasSection(model, 'PersonalWalletSection'),
          activityRevision: model.walletActivityRevision,
          heldRevision: model.heldRevision,
        }),
        dependenciesToStream: ({ isShown }) =>
          isShown
            ? Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  return yield* server.loadHeldAccounts.pipe(
                    Effect.retry(originRetry),
                    Effect.match({
                      onFailure: () => FailedHeldAccounts(),
                      onSuccess: accounts => ReceivedHeldAccounts({ accounts }),
                    }),
                  )
                }),
              )
            : Stream.empty,
      },
    ),
    walletWatch: entry(
      { accounts: S.Array(WalletPublicAccount) },
      {
        modelToDependencies: model => ({
          accounts: publicAccountsOf(model.wallet),
        }),
        dependenciesToStream: ({ accounts }) =>
          Array.isReadonlyArrayEmpty(accounts)
            ? Stream.empty
            : Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  return yield* server.watchWalletAccounts(accounts).pipe(
                    Effect.retry(originRetry),
                    Effect.match({
                      onFailure: () => FailedWatchWalletAccounts(),
                      onSuccess: () => SucceededWatchWalletAccounts(),
                    }),
                  )
                }),
              ),
      },
    ),
    pointer: entry(
      { maybePointer: S.Option(Pointer) },
      {
        modelToDependencies: model => ({ maybePointer: model.maybePointer }),
        dependenciesToStream: ({ maybePointer }) =>
          Option.match(maybePointer, {
            onNone: () => Stream.empty,
            onSome: ({ sectionKey, atMs }) =>
              Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  const nowMs = yield* server.nowMs
                  if (isFresh(atMs, nowMs)) {
                    yield* server.scrollToSection(sectionKey)
                    return CompletedScrollToSection({ sectionKey })
                  } else {
                    return IgnoredStalePointer()
                  }
                }),
              ),
          }),
      },
    ),
    reload: entry(
      { maybeReloadAtMs: S.Option(S.Number) },
      {
        modelToDependencies: model => ({
          maybeReloadAtMs: model.maybeReloadAtMs,
        }),
        dependenciesToStream: ({ maybeReloadAtMs }) =>
          Option.match(maybeReloadAtMs, {
            onNone: () => Stream.empty,
            onSome: atMs =>
              Stream.fromEffect(
                Effect.gen(function* () {
                  const server = yield* BrandonServer
                  const nowMs = yield* server.nowMs
                  if (isFresh(atMs, nowMs)) {
                    yield* server.reloadPage
                  }
                  return IgnoredStaleReload()
                }),
              ),
          }),
      },
    ),
  }),
)

const walletSubscriptions = Subscription.lift(Wallet.subscriptions)<
  Model,
  Message
>({
  toChildModel: model =>
    M.value(model.wallet).pipe(
      M.tagsExhaustive({
        ClosedWallet: () => Wallet.initialModel,
        OpenWallet: ({ model: walletModel }) => walletModel,
      }),
    ),
  toParentMessage: message => GotWalletMessage({ message }),
})

/**
 * What Brandon dot listens to while it runs. The log's facts move a
 * revision or a pointer; each change here reads the origin again, so the
 * words themselves never travel on the log. The wallet's own
 * Subscriptions run only while its section is open.
 */
export const subscriptions = Subscription.aggregate<
  Model,
  Message,
  BrandonServer | Wallet.WalletClient
>()(pageSubscriptions, walletSubscriptions)
