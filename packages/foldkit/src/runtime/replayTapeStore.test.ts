import { Effect, Layer, Match as M, Schema as S } from 'effect'
import { expect } from 'vitest'

import { BrowserCrypto } from '@effect/platform-browser'
import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { type ContentAddressedReplayTapeId, replay } from '../program/route.js'
import { makeProgramJournal } from './programJournal.js'
import { fromJournal } from './replayTape.js'
import {
  ReplayTapeStore,
  ReplayTapeStoreError,
  deriveReplayTapeId,
  resolveProgramRoute,
  saveReplayTape,
} from './replayTapeStore.js'

const Incremented = m('Incremented')
const Message = S.Union([Incremented])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Counter = make({
  id: 'counter',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ count: 0 }), []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Incremented: () => [Model.make({ count: model.count + 1 }), []],
      }),
    ),
})

const tape = (() => {
  const journal = makeProgramJournal({
    program: Counter,
    initialModel: Model.make({ count: 0 }),
  })
  journal.record({
    message: Incremented(),
    source: { _tag: 'Host', actionName: 'increment' },
    isOperationSettled: true,
    commands: [],
    model: Model.make({ count: 1 }),
  })
  return fromJournal(Counter, journal.read())
})()

describe('ReplayTapeStore', () => {
  it.effect('derives a stable UUIDv8 content address from exact bytes', () =>
    Effect.gen(function* () {
      const tapeId = yield* deriveReplayTapeId('Foldkit replay tape').pipe(
        Effect.provide(BrowserCrypto.layer),
      )
      const unicodeTapeId = yield* deriveReplayTapeId(
        '{"label":"🧮 café"}',
      ).pipe(Effect.provide(BrowserCrypto.layer))

      expect(tapeId).toBe('uuiduri:6ac90a86-9f42-824c-bce3-e70ced69f155')
      expect(unicodeTapeId).toBe('uuiduri:e68118bf-ef41-86e8-b919-34041d8d8e51')
    }),
  )

  it.effect('saves and resolves a typed tape through its UUID route', () =>
    Effect.gen(function* () {
      let storedTapeId: ContentAddressedReplayTapeId | undefined
      let storedTape = ''
      const StoreLive = Layer.succeed(ReplayTapeStore, {
        save: (tapeId, encodedTape) =>
          Effect.sync(() => {
            storedTapeId = tapeId
            storedTape = encodedTape
          }),
        load: requestedTapeId =>
          requestedTapeId === storedTapeId
            ? Effect.succeed(storedTape)
            : Effect.fail(
                new ReplayTapeStoreError({
                  operation: 'Load',
                  cause: 'missing',
                  tapeId: requestedTapeId,
                }),
              ),
      })
      const TestLive = Layer.merge(StoreLive, BrowserCrypto.layer)

      const savedRoute = yield* saveReplayTape(Counter, tape, 1).pipe(
        Effect.provide(TestLive),
      )
      const secondSavedRoute = yield* saveReplayTape(Counter, tape, 1).pipe(
        Effect.provide(TestLive),
      )
      const resolvedRoute = yield* resolveProgramRoute(
        Counter,
        savedRoute,
      ).pipe(Effect.provide(TestLive))

      expect(savedRoute).toStrictEqual({
        _tag: 'SavedReplay',
        tapeId: storedTapeId,
        frame: 1,
        isPlaying: false,
      })
      expect(savedRoute.tapeId).toMatch(
        /^uuiduri:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      )
      expect(secondSavedRoute.tapeId).toBe(savedRoute.tapeId)
      expect(resolvedRoute).toStrictEqual(replay(tape, 1))

      storedTape = `${storedTape} `
      const integrityError = yield* resolveProgramRoute(
        Counter,
        savedRoute,
      ).pipe(Effect.provide(TestLive), Effect.flip)
      expect(integrityError._tag).toBe('ReplayTapeIntegrityError')
    }),
  )
})
