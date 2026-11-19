import { Effect, Layer, Queue, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/public.js'
import { make } from '../program/program.js'
import * as Subscription from '../subscription/subscription.js'
import { makeProgramRuntime } from './programRuntime.js'

// NOTE: A device that cannot keep up with a stream of ticks fell behind
// real time: each position tick waited its turn, the queue grew to more
// than ten seconds of stale places, and a pause from another device
// waited behind all of them. A Subscription says which of its Messages a
// newer one makes pointless, and one of those that is still waiting is
// replaced where it stands, so the queue holds one, and what a person
// pressed is taken next.

const ReachedPlace = m('ReachedPlace', { placeMs: S.Number })
const ReachedEnd = m('ReachedEnd')
const Pause = m('Pause')
const Message = S.Union([ReachedPlace, ReachedEnd, Pause])
type Message = typeof Message.Type

const Model = S.Struct({ taken: S.Array(S.String) })
type Model = typeof Model.Type

const said = (message: Message): string =>
  message._tag === 'ReachedPlace'
    ? `place ${message.placeMs.toString()}`
    : message._tag

// A host whose turns are taken by hand: every drain that goes over its
// budget waits until the test lets the next one run, as a busy device's
// next turn waits for its paint.
const byHand = () => {
  const waiting: Array<() => void> = []
  return {
    scheduling: {
      now: (() => {
        let clock = 0
        return () => {
          clock += 10
          return clock
        }
      })(),
      defer: (resume: () => void) => {
        waiting.push(resume)
        return () => undefined
      },
      synchronousWorkBudgetMs: 1,
    },
    nextTurn: (): void => {
      waiting.shift()?.()
    },
    turnsWaiting: () => waiting.length,
  }
}

const started = (
  supersedes?: (waiting: Message, arrived: Message) => boolean,
) =>
  Effect.gen(function* () {
    const ticks = yield* Queue.unbounded<Message>()
    const subscriptions = Subscription.make<Model, Message>()(entry => ({
      clock: entry(
        {},
        {
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.fromQueue(ticks),
          ...(supersedes === undefined ? {} : { supersedes }),
        },
      ),
    }))
    const Program = make<Model, Message>({
      id: 'superseded-ticks',
      version: 1,
      Model,
      Message,
      init: () => [{ taken: [] }, []],
      update: (model, message) => [
        { taken: [...model.taken, said(message)] },
        [],
      ],
      subscriptions,
    })
    const host = byHand()
    const runtime = yield* makeProgramRuntime({
      program: Program,
      resources: Layer.empty,
      scheduling: host.scheduling,
    })
    yield* runtime.initialization
    const tick = (message: Message) =>
      Effect.gen(function* () {
        yield* Queue.offer(ticks, message)
        yield* Effect.yieldNow
        yield* Effect.sleep('1 millis')
      })
    const settle = Effect.gen(function* () {
      for (let turn = 0; turn < 50 && host.turnsWaiting() > 0; turn += 1) {
        host.nextTurn()
        yield* Effect.sleep('1 millis')
      }
    })
    return { runtime, tick, settle, host }
  })

const isNewerPlace = (waiting: Message, arrived: Message): boolean =>
  waiting._tag === 'ReachedPlace' && arrived._tag === 'ReachedPlace'

describe('Messages a newer one makes pointless', () => {
  it('wait their turn one after another when the Subscription says nothing, so a press waits behind them all', async () => {
    const taken = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { runtime, tick, settle } = yield* started()
          for (const placeMs of [1_000, 2_000, 3_000, 4_000]) {
            yield* tick(ReachedPlace({ placeMs }))
          }
          runtime.send(Pause())
          yield* settle
          return runtime.readModel().taken
        }),
      ),
    )
    expect(taken).toEqual([
      'place 1000',
      'place 2000',
      'place 3000',
      'place 4000',
      'Pause',
    ])
  })

  it('are replaced where they wait by the newest, so the queue holds one and the press is next', async () => {
    const taken = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { runtime, tick, settle } = yield* started(isNewerPlace)
          for (const placeMs of [1_000, 2_000, 3_000, 4_000]) {
            yield* tick(ReachedPlace({ placeMs }))
          }
          runtime.send(Pause())
          yield* tick(ReachedPlace({ placeMs: 5_000 }))
          yield* settle
          return runtime.readModel().taken
        }),
      ),
    )
    // The first place was taken at once. The second waited and was
    // replaced by each newer one up to the press; a place that arrives
    // after the press waits behind it.
    expect(taken).toEqual(['place 1000', 'place 4000', 'Pause', 'place 5000'])
  })

  it('never replace a Message the Subscription does not say is pointless, such as the end', async () => {
    const taken = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { tick, settle, runtime } = yield* started(isNewerPlace)
          yield* tick(ReachedPlace({ placeMs: 1_000 }))
          yield* tick(ReachedPlace({ placeMs: 2_000 }))
          yield* tick(ReachedEnd())
          yield* tick(ReachedPlace({ placeMs: 3_000 }))
          yield* settle
          return runtime.readModel().taken
        }),
      ),
    )
    expect(taken).toEqual([
      'place 1000',
      'place 2000',
      'ReachedEnd',
      'place 3000',
    ])
  })
})
