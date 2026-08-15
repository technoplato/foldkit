import { Array, Effect, Option, Schema as S } from 'effect'
import { Processor } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { makeInMemoryProgramStore } from '../inMemoryProgramStore/index.js'
import {
  type ProgramStoreService,
  enqueuedTransactionOutcome,
} from '../programStore/index.js'
import { commitSharedMessage, makeSharedProgramTape } from './tape.js'

const Increment = S.TaggedStruct('Increment', {})
const Decrement = S.TaggedStruct('Decrement', {})
const Message = S.Union([Increment, Decrement, S.TaggedStruct('Reset', {})])
type Message = typeof Message.Type

const identity = {
  actor: Processor.SystemActor.make({ processorId: 'cli' }),
  actorId: 'local-counter',
  clientId: 'cli',
  originDeviceId: 'computer',
  originatingProcessorId: 'cli',
  programId: 'counter',
  programVersion: 2,
  sessionId: 'local-counter-session',
  subjectId: 'local-counter',
} as const

const makeTape = (
  store: ProgramStoreService,
  processorId: 'cli' | 'tui' = 'cli',
) =>
  makeSharedProgramTape<Message>({
    Message,
    eventId: message => message._tag,
    identity: {
      ...identity,
      actor: Processor.SystemActor.make({ processorId }),
      clientId: processorId,
      originatingProcessorId: processorId,
    },
    makeId: () => crypto.randomUUID(),
    now: () => 1_753_825_100_000,
    store,
  })

describe('same-actor Instant tape', () => {
  it('publishes commitSharedMessage from foldkit/instant/sharing', () => {
    expect(typeof commitSharedMessage).toBe('function')
    expect(typeof makeSharedProgramTape).toBe('function')
  })

  it.effect('writes the Message before update and after update', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const tape = yield* makeTape(store)
      const steps: Array<string> = []

      const commit = yield* commitSharedMessage(tape, Increment.make({}), () =>
        Effect.sync(() => {
          steps.push('update')
          return 1
        }),
      )

      expect(commit.proposed).toBe('delivered')
      expect(commit.accepted).toBe('delivered')
      expect(commit.result).toBe(1)
      expect(steps).toEqual(['update'])

      const proposed = yield* tape.readProposedOccurrences
      const accepted = yield* tape.readAcceptedOccurrences
      expect(proposed.length).toBe(1)
      expect(accepted.length).toBe(1)
      expect(
        Option.map(Array.get(proposed, 0), record => record.eventId),
      ).toEqual(Option.some('Increment'))
      expect(
        Option.map(Array.get(accepted, 0), record => record.acceptedSequence),
      ).toEqual(Option.some(1))
    }),
  )

  it.effect('does not call update until the proposal is on the tape', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const tape = yield* makeTape(store)
      let sawProposalBeforeUpdate = false

      yield* commitSharedMessage(tape, Increment.make({}), () =>
        Effect.gen(function* () {
          const proposed = yield* tape.readProposedOccurrences
          sawProposalBeforeUpdate = proposed.length === 1
          const accepted = yield* tape.readAcceptedOccurrences
          expect(accepted.length).toBe(0)
        }),
      )

      expect(sawProposalBeforeUpdate).toBe(true)
      expect((yield* tape.readAcceptedOccurrences).length).toBe(1)
    }),
  )

  it.effect('lets a second Processor read every accepted Message', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const cli = yield* makeTape(store, 'cli')
      const tui = yield* makeTape(store, 'tui')

      yield* commitSharedMessage(cli, Increment.make({}), () =>
        Effect.succeed(1),
      )
      yield* commitSharedMessage(tui, Decrement.make({}), () =>
        Effect.succeed(0),
      )

      const cliMessages = yield* cli.readAcceptedMessages
      const tuiMessages = yield* tui.readAcceptedMessages
      expect(cliMessages).toEqual([Increment.make({}), Decrement.make({})])
      expect(tuiMessages).toEqual(cliMessages)
    }),
  )

  it.effect('maps an Instant outbox write to queued', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore(
        enqueuedTransactionOutcome('cli'),
      )
      const tape = yield* makeTape(store)
      const commit = yield* commitSharedMessage(tape, Increment.make({}), () =>
        Effect.succeed(1),
      )
      expect(commit.proposed).toBe('queued')
      expect(commit.accepted).toBe('queued')
    }),
  )

  it.effect('can force an offline link on a local store', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const tape = yield* makeSharedProgramTape<Message>({
        Message,
        eventId: message => message._tag,
        identity,
        link: 'offline',
        makeId: () => crypto.randomUUID(),
        now: () => 1_753_825_100_000,
        store,
      })
      const commit = yield* commitSharedMessage(tape, Increment.make({}), () =>
        Effect.succeed(1),
      )
      expect(commit.proposed).toBe('offline')
      expect(commit.accepted).toBe('offline')
    }),
  )
})
