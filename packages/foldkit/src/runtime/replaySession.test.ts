import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { fromHost, makeProgramJournal } from './programJournal.js'
import { makeReplaySession } from './replaySession.js'
import { fromJournal } from './replayTape.js'

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

const makeTape = () => {
  const journal = makeProgramJournal({
    program: Counter,
    initialModel: { count: 0 },
  })
  journal.record({
    message: Incremented(),
    source: fromHost('increment'),
    operationId: 1,
    isOperationSettled: true,
    commands: [],
    model: { count: 1 },
  })
  journal.record({
    message: Incremented(),
    source: fromHost('increment'),
    operationId: 2,
    isOperationSettled: true,
    commands: [],
    model: { count: 2 },
  })
  journal.record({
    message: Decremented(),
    source: fromHost('decrement'),
    operationId: 3,
    isOperationSettled: true,
    commands: [],
    model: { count: 1 },
  })
  return fromJournal(Counter, journal.read())
}

describe('makeReplaySession', () => {
  it.effect('scrubs and steps through reconstructed Models', () =>
    Effect.gen(function* () {
      const session = yield* makeReplaySession(Counter, makeTape())
      const observedFrames: Array<number> = []
      session.observe(frame => {
        observedFrames.push(frame)
      })

      expect(session.mode).toBe('Inspecting')
      expect(session.readFrame()).toBe(3)
      expect(session.readModel()).toStrictEqual({ count: 1 })
      expect(yield* session.stepBackward).toStrictEqual({ count: 2 })
      expect(yield* session.stepBackward).toStrictEqual({ count: 1 })
      expect(yield* session.stepForward).toStrictEqual({ count: 2 })
      expect(yield* session.seek(0)).toStrictEqual({ count: 0 })
      expect(observedFrames).toStrictEqual([2, 1, 2, 0])
    }),
  )

  it.effect('branches only from settled causal boundaries', () =>
    Effect.gen(function* () {
      const tape = makeTape()
      const unsettledTape = {
        ...tape,
        transitions: [
          {
            ...Option.getOrThrow(Array.head(tape.transitions)),
            isOperationSettled: false,
          },
          ...Array.drop(tape.transitions, 1),
        ],
      }
      const session = yield* makeReplaySession(Counter, unsettledTape)
      const error = yield* Effect.flip(session.branch(1))
      const branch = yield* session.branch(2)
      const initialCommandSession = yield* makeReplaySession(Counter, {
        ...tape,
        initialCommands: [{ name: 'LoadCounter' }],
      })
      const initialCommandError = yield* Effect.flip(
        initialCommandSession.branch(0),
      )

      expect(error._tag).toBe('UnsettledReplayFrameError')
      expect(initialCommandError._tag).toBe('UnsettledReplayFrameError')
      expect(branch.transitions).toHaveLength(2)
    }),
  )
})
