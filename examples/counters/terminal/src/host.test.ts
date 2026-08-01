import {
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  StaticCounterFactClient,
} from 'counters-core-example'
import { Array, Effect, Option, Result } from 'effect'
import { Runtime } from 'foldkit'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  enqueueCountersTerminalSelection,
  openCountersTerminalCarrier,
  renderCountersTerminal,
} from './host.js'

describe('Multiple Counters Effect Terminal host', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves and enqueues numeric graph selection from its occurrence', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: MultipleCountersProgram,
            resources: StaticCounterFactClient,
          })
          yield* runtime.initialization
          const occurrenceId = InteractionGraph.InteractionOccurrenceId.make(
            'terminal-action-test',
          )

          const maybeMessage = yield* enqueueCountersTerminalSelection(
            runtime,
            '1',
            occurrenceId,
          )

          expect(Option.isSome(maybeMessage)).toBe(true)
          if (Option.isNone(maybeMessage)) {
            throw new Error('Expected numeric selection to enqueue a Message')
          }
          expect(maybeMessage.value).toMatchObject({
            _tag: 'ClickedAddCounter',
            counterId: 'counter-terminal-action-test',
          })
          expect(runtime.journal.read().transitions).toMatchObject([
            { message: maybeMessage.value },
          ])
          expect(runtime.replay.readTape().transitions).toMatchObject([
            { message: maybeMessage.value },
          ])
        }),
      ),
    )
  })

  it('propagates a typed graph resolver failure without enqueueing', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: MultipleCountersProgram,
            resources: StaticCounterFactClient,
          })
          yield* runtime.initialization
          const graphFailure =
            new InteractionGraph.InteractionResolverDefectError({
              cause: new Error('Expected terminal graph failure'),
            })
          const resolveSpy = vi
            .spyOn(MultipleCountersInteractionGraph, 'resolveWithContext')
            .mockReturnValue(Result.fail(graphFailure))

          const error = yield* Effect.flip(
            enqueueCountersTerminalSelection(
              runtime,
              '1',
              InteractionGraph.InteractionOccurrenceId.make(
                'terminal-action-failed',
              ),
            ),
          )

          expect(error).toBe(graphFailure)
          expect(resolveSpy).toHaveBeenCalledOnce()
          expect(runtime.journal.read().transitions).toStrictEqual([])
          expect(runtime.replay.readTape().transitions).toStrictEqual([])
        }),
      ),
    )
  })

  it('boots a canonical list and records one carrier Message in the tape', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: MultipleCountersProgram,
            resources: StaticCounterFactClient,
          })
          const initialModel = yield* runtime.initialization

          expect(initialModel.navigation._tag).toBe('CounterList')
          yield* openCountersTerminalCarrier(
            runtime,
            '/counters/counter-1/delete',
          )

          const transitions = runtime.journal.read().transitions
          expect(transitions).toHaveLength(1)
          const maybeTransition = Array.head(transitions)
          expect(Option.isSome(maybeTransition)).toBe(true)
          if (Option.isNone(maybeTransition)) {
            throw new Error('Expected one navigation transition')
          }
          expect(maybeTransition.value).toMatchObject({
            message: { _tag: 'OpenedNavigation' },
          })
          expect(runtime.replay.readTape().transitions).toHaveLength(1)

          const screen = renderCountersTerminal(runtime.readModel())
          expect(screen).toContain('/counters/counter-1/delete')
          expect(screen).toContain('Delete counter-1?')
          expect(screen).toContain('[1] Cancel')
          expect(screen).toContain('[2] Delete counter')
        }),
      ),
    )
  })

  it('rejects a noncanonical carrier without recording a fallback', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: MultipleCountersProgram,
            resources: StaticCounterFactClient,
          })
          yield* runtime.initialization

          const error = yield* Effect.flip(
            openCountersTerminalCarrier(
              runtime,
              'https://counters.test/counters/counter-1',
            ),
          )

          expect(error._tag).toBe('NonCanonicalNavigationCarrierUriError')
          expect(runtime.journal.read().transitions).toStrictEqual([])
        }),
      ),
    )
  })
})
