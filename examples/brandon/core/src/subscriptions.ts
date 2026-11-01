import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  CompletedScrollToSection,
  FailedFootball,
  FailedPage,
  FailedWallets,
  IgnoredStalePointer,
  IgnoredStaleReload,
  type Message,
  ReceivedFootball,
  ReceivedPage,
  ReceivedWallets,
} from './message.js'
import { type Model, Pointer, hasSection } from './model.js'
import { BrandonServer } from './server.js'

// SUBSCRIPTION

const footballEvery = '5 seconds'

/** A pointer or reload this old happened before this page was open. */
const freshForMs = 30_000

const isFresh = (atMs: number, nowMs: number): boolean =>
  nowMs - atMs < freshForMs

/**
 * What Brandon dot listens to while it runs. The log's facts move a
 * revision or a pointer; each change here reads the origin again, so the
 * words themselves never travel on the log.
 */
export const subscriptions = Subscription.make<Model, Message, BrandonServer>()(
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
