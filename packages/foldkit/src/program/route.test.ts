import { Effect, Match as M, Option, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import { fromHost, makeProgramJournal } from '../runtime/programJournal.js'
import { fromJournal, replayToFrame } from '../runtime/replayTape.js'
import { make } from './program.js'
import {
  ContentAddressedReplayTapeId,
  type ProgramRoute,
  ReplayTapeId,
  makeDestinationRouter,
  makeRouter,
  replay,
  routeCase,
  savedReplay,
  state,
} from './route.js'

const Incremented = m('Incremented')
const Decremented = m('Decremented')
const Message = S.Union([Incremented, Decremented])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Counter = make({
  id: 'counter',
  version: 1,
  Model,
  Message,
  init: () => [{ count: 0 }, []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Incremented: () => [{ count: model.count + 1 }, []],
        Decremented: () => [{ count: model.count - 1 }, []],
      }),
    ),
})

const Calculator = make({
  ...Counter,
  id: 'calculator',
})

type Destination =
  | Readonly<{
      _tag: 'Counter'
      route: ProgramRoute<Model, Message>
    }>
  | Readonly<{
      _tag: 'Calculator'
      route: ProgramRoute<Model, Message>
    }>

const destinationRouter = makeDestinationRouter<Destination>(
  routeCase<Destination, Model, Message, never>(Counter, {
    embed: route => ({ _tag: 'Counter', route }),
    extract: destination =>
      destination._tag === 'Counter'
        ? Option.some(destination.route)
        : Option.none(),
  }),
  routeCase<Destination, Model, Message, never>(Calculator, {
    embed: route => ({ _tag: 'Calculator', route }),
    extract: destination =>
      destination._tag === 'Calculator'
        ? Option.some(destination.route)
        : Option.none(),
  }),
)

describe('Program.makeRouter', () => {
  it.effect('round-trips a Model through the canonical state URI', () =>
    Effect.gen(function* () {
      const router = makeRouter(Counter)
      const route = state({ count: 3 })
      const uri = yield* router.print(route)
      const parsed = yield* router.parse(uri)

      expect(uri).toBe('/counter/state?model=%7B%22count%22%3A3%7D')
      expect(parsed).toStrictEqual(route)
    }),
  )

  it.effect('round-trips a typed replay tape through the canonical URI', () =>
    Effect.gen(function* () {
      const journal = makeProgramJournal({
        program: Counter,
        initialModel: { count: 0 },
        now: () => 1,
      })
      journal.record({
        message: Incremented(),
        source: fromHost('increment'),
        operationId: 1,
        isOperationSettled: true,
        commands: [],
        model: { count: 1 },
      })
      const tape = fromJournal(Counter, journal.read())
      const router = makeRouter(Counter)
      const uri = yield* router.print(replay(tape))
      const parsed = yield* router.parse(uri)

      expect(uri.startsWith('/counter/replay?tape=')).toBe(true)
      expect(uri.endsWith('&frame=1')).toBe(true)
      expect(parsed).toStrictEqual(replay(tape))

      if (parsed._tag === 'Replay') {
        const replayedModel = yield* replayToFrame(Counter, parsed.tape, 1)
        expect(replayedModel).toStrictEqual({ count: 1 })
      }
    }),
  )

  it.effect('round-trips a saved replay UUID through the canonical URI', () =>
    Effect.gen(function* () {
      const router = makeRouter(Counter)
      const tapeId = ReplayTapeId.make('179f2ae7-8c0b-4e4f-8201-67a691732769')
      const route = savedReplay(tapeId, 4)
      const uri = yield* router.print(route)

      expect(uri).toBe(
        '/counter/replay/179f2ae7-8c0b-4e4f-8201-67a691732769?frame=4',
      )
      expect(yield* router.parse(uri)).toStrictEqual(route)
      expect(yield* router.canonicalize(uri)).toBe(uri)
    }),
  )

  it.effect('round-trips an autoplay content-addressed replay URI', () =>
    Effect.gen(function* () {
      const router = makeRouter(Counter)
      const tapeId = ContentAddressedReplayTapeId.make(
        'uuiduri:4d9673ec-b4fb-8f42-ae0d-607184250ee8',
      )
      const route = savedReplay(tapeId, 0, true)
      const uri = yield* router.print(route)

      expect(uri).toBe(
        '/counter/replay/uuiduri:4d9673ec-b4fb-8f42-ae0d-607184250ee8?frame=0&play=1',
      )
      expect(yield* router.parse(uri)).toStrictEqual(route)
      expect(yield* router.canonicalize(uri)).toBe(uri)
    }),
  )

  it.effect('canonicalizes accepted relative route aliases idempotently', () =>
    Effect.gen(function* () {
      const router = makeRouter(Counter)
      const alias = 'counter/state?model={"count":2}'
      const canonical = yield* router.canonicalize(alias)
      const canonicalAgain = yield* router.canonicalize(canonical)

      expect(canonical).toBe('/counter/state?model=%7B%22count%22%3A2%7D')
      expect(canonicalAgain).toBe(canonical)
    }),
  )

  it.effect(
    'canonicalizes a replay alias without a frame to the tape end',
    () =>
      Effect.gen(function* () {
        const journal = makeProgramJournal({
          program: Counter,
          initialModel: { count: 0 },
        })
        journal.record({
          message: Incremented(),
          source: fromHost('increment'),
          isOperationSettled: true,
          commands: [],
          model: { count: 1 },
        })
        const tape = fromJournal(Counter, journal.read())
        const router = makeRouter(Counter)
        const canonical = yield* router.print(replay(tape))
        const alias = canonical.replace('&frame=1', '')

        expect(yield* router.canonicalize(alias)).toBe(canonical)
      }),
  )

  it.effect('rejects unconsumed path segments', () =>
    Effect.gen(function* () {
      const router = makeRouter(Counter)
      const exit = yield* Effect.exit(
        router.parse('/counter/state/extra?model={"count":2}'),
      )

      expect(exit._tag).toBe('Failure')
    }),
  )

  it.effect('routes a registered Program union through case paths', () =>
    Effect.gen(function* () {
      const destination: Destination = {
        _tag: 'Calculator',
        route: state({ count: 9 }),
      }
      const uri = yield* destinationRouter.print(destination)
      const parsed = yield* destinationRouter.parse(uri)

      expect(uri).toBe('/calculator/state?model=%7B%22count%22%3A9%7D')
      expect(parsed).toStrictEqual(destination)
      expect(yield* destinationRouter.canonicalize(uri)).toBe(uri)
    }),
  )
})
