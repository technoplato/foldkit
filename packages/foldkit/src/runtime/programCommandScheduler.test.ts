import {
  Deferred,
  Effect,
  Layer,
  Match as M,
  Option,
  Ref,
  Schema,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { EffectManifest } from '../command/effectManifest.js'
import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import {
  AnyProcessor,
  CapabilityId,
  CapabilityRequirement,
  MessageEnvelope,
  Placement,
  SystemActor,
} from '../processor/processor.js'
import { make } from '../program/program.js'
import type { ProgramCommand } from '../program/program.js'
import type {
  ProgramRuntimeCommandScheduler,
  ScheduledProgramCommand,
} from './programCommandScheduler.js'
import { type ProgramRuntime, makeProgramRuntime } from './programRuntime.js'

const RequestedCapture = m('RequestedCapture', {
  requestId: Schema.String,
})
const SucceededCapture = m('SucceededCapture', {
  requestId: Schema.String,
})
const Message = Schema.Union([RequestedCapture, SucceededCapture])
type Message = typeof Message.Type

const Model = Schema.Struct({
  status: Schema.Literals(['Idle', 'Pending', 'Complete']),
})
type Model = typeof Model.Type

const makeEnvelope = (
  occurrenceId: string,
  eventId: string,
  acceptedSequence: number,
) =>
  MessageEnvelope.make({
    formatVersion: 1,
    occurrenceId,
    programId: 'capture',
    programVersion: 1,
    eventId,
    eventVersion: 1,
    actor: SystemActor.make({ processorId: 'authority' }),
    originClientId: 'client-browser',
    originDeviceId: 'device-browser',
    ingressProcessorId: 'processor-browser',
    sessionId: 'session-1',
    originSequence: acceptedSequence,
    acceptedSequence: Option.some(acceptedSequence),
    causationOccurrenceId: Option.none(),
    correlationId: Option.some('capture-1'),
    createdAtMs: acceptedSequence,
    acceptedAtMs: Option.some(acceptedSequence),
  })

const makeManifest = (requestId: string) =>
  EffectManifest.make({
    formatVersion: 1,
    id: 'Camera.Capture',
    version: 1,
    publicArguments: { requestId },
    placement: Placement.make({
      version: 1,
      cardinality: 'One',
      capability: CapabilityRequirement.make({
        id: CapabilityId.make(['Camera', 'Capture']),
        minimumVersion: 1,
      }),
      affinity: AnyProcessor.make({}),
      unavailable: 'Wait',
    }),
  })

describe('ProgramRuntime Command scheduler', () => {
  it.effect(
    'keeps manifested Effects inert until the selected scheduler executes and acceptance broadcasts the result',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const releaseCapture = yield* Deferred.make<void>()
          const acceptedResult = yield* Deferred.make<void>()
          const browserScheduledReady = yield* Deferred.make<void>()
          const phoneScheduledReady = yield* Deferred.make<void>()
          const executionStarted = yield* Deferred.make<void>()
          const executionCount = yield* Ref.make(0)
          const browserRuntimeRef = yield* Ref.make(
            Option.none<ProgramRuntime<Model, Message>>(),
          )
          const phoneRuntimeRef = yield* Ref.make(
            Option.none<ProgramRuntime<Model, Message>>(),
          )
          const browserScheduled: Array<ScheduledProgramCommand<Message>> = []
          const phoneScheduled: Array<ScheduledProgramCommand<Message>> = []

          const Capture = Command.define(
            'Capture',
            { requestId: Schema.String },
            SucceededCapture,
          )(({ requestId }) =>
            Effect.gen(function* () {
              yield* Ref.update(executionCount, count => count + 1)
              yield* Deferred.succeed(executionStarted, undefined)
              yield* Deferred.await(releaseCapture)
              return SucceededCapture({ requestId })
            }),
          )
          type UpdateReturn = readonly [
            Model,
            ReadonlyArray<ProgramCommand<Message>>,
          ]
          const Program = make({
            id: 'capture',
            version: 1,
            Model,
            Message,
            init: (): UpdateReturn => [Model.make({ status: 'Idle' }), []],
            update: (_model, message) =>
              M.value(message).pipe(
                M.withReturnType<UpdateReturn>(),
                M.tagsExhaustive({
                  RequestedCapture: ({ requestId }) => [
                    Model.make({ status: 'Pending' }),
                    [
                      Command.withEffectManifest(
                        Capture({ requestId }),
                        makeManifest(requestId),
                      ),
                    ],
                  ],
                  SucceededCapture: () => [
                    Model.make({ status: 'Complete' }),
                    [],
                  ],
                }),
              ),
          })

          const acceptResult = (message: Message): Effect.Effect<void> =>
            Effect.gen(function* () {
              const maybeBrowser = yield* Ref.get(browserRuntimeRef)
              const maybePhone = yield* Ref.get(phoneRuntimeRef)
              if (Option.isSome(maybeBrowser)) {
                maybeBrowser.value.send(message, {
                  envelope: makeEnvelope(
                    'occurrence-succeeded',
                    'SucceededCapture',
                    2,
                  ),
                })
              }
              if (Option.isSome(maybePhone)) {
                maybePhone.value.send(message, {
                  envelope: makeEnvelope(
                    'occurrence-succeeded',
                    'SucceededCapture',
                    2,
                  ),
                })
              }
              yield* Deferred.succeed(acceptedResult, undefined)
            })

          const browserScheduler: ProgramRuntimeCommandScheduler<Message> = {
            schedule: command =>
              Effect.gen(function* () {
                browserScheduled.push(command)
                yield* Deferred.succeed(browserScheduledReady, undefined)
              }),
          }
          const phoneScheduler: ProgramRuntimeCommandScheduler<Message> = {
            schedule: command =>
              Effect.gen(function* () {
                phoneScheduled.push(command)
                yield* Deferred.succeed(phoneScheduledReady, undefined)
                const message = yield* command.execute
                yield* acceptResult(message)
              }),
          }
          const browserRuntime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            commandScheduler: browserScheduler,
          })
          const phoneRuntime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            commandScheduler: phoneScheduler,
          })
          yield* Ref.set(browserRuntimeRef, Option.some(browserRuntime))
          yield* Ref.set(phoneRuntimeRef, Option.some(phoneRuntime))

          const requested = RequestedCapture({ requestId: 'capture-1' })
          const envelope = makeEnvelope(
            'occurrence-requested',
            'RequestedCapture',
            1,
          )
          const browserModel = yield* browserRuntime.run(requested, {
            envelope,
          })
          const phoneModel = yield* phoneRuntime.run(requested, { envelope })
          yield* Deferred.await(browserScheduledReady)
          yield* Deferred.await(phoneScheduledReady)
          yield* Deferred.await(executionStarted)

          expect(browserModel.status).toBe('Pending')
          expect(phoneModel.status).toBe('Pending')
          expect(
            browserRuntime.journal.read().transitions[0]?.isOperationSettled,
          ).toBe(true)
          expect(
            phoneRuntime.journal.read().transitions[0]?.isOperationSettled,
          ).toBe(true)
          expect(
            phoneRuntime.journal.read().transitions[0]?.source,
          ).toStrictEqual({
            _tag: 'AcceptedMessage',
            occurrenceId: 'occurrence-requested',
          })
          expect(
            phoneRuntime.journal.read().transitions[0]?.envelope,
          ).toStrictEqual(envelope)
          expect(browserScheduled).toHaveLength(1)
          expect(phoneScheduled).toHaveLength(1)
          expect(browserScheduled[0]?.commandIndex).toBe(0)
          expect(phoneScheduled[0]?.effectManifest).toStrictEqual(
            browserScheduled[0]?.effectManifest,
          )
          expect(phoneScheduled[0]?.cause).toStrictEqual({
            _tag: 'Message',
            envelope: Option.some(envelope),
            source: {
              _tag: 'AcceptedMessage',
              occurrenceId: 'occurrence-requested',
            },
          })
          expect(yield* Ref.get(executionCount)).toBe(1)

          yield* Deferred.succeed(releaseCapture, undefined)
          yield* Deferred.await(acceptedResult)

          expect(browserRuntime.readModel().status).toBe('Complete')
          expect(phoneRuntime.readModel().status).toBe('Complete')
          expect(yield* Ref.get(executionCount)).toBe(1)
        }),
      ),
  )

  it.effect(
    'preserves local recursive Command completion when no scheduler is configured',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const Capture = Command.define(
            'Capture',
            { requestId: Schema.String },
            SucceededCapture,
          )(({ requestId }) => Effect.succeed(SucceededCapture({ requestId })))
          type UpdateReturn = readonly [
            Model,
            ReadonlyArray<ProgramCommand<Message>>,
          ]
          const Program = make({
            id: 'capture',
            version: 1,
            Model,
            Message,
            init: (): UpdateReturn => [Model.make({ status: 'Idle' }), []],
            update: (_model, message) =>
              M.value(message).pipe(
                M.withReturnType<UpdateReturn>(),
                M.tagsExhaustive({
                  RequestedCapture: ({ requestId }) => [
                    Model.make({ status: 'Pending' }),
                    [
                      Command.withEffectManifest(
                        Capture({ requestId }),
                        makeManifest(requestId),
                      ),
                    ],
                  ],
                  SucceededCapture: () => [
                    Model.make({ status: 'Complete' }),
                    [],
                  ],
                }),
              ),
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
          })

          const model = yield* runtime.run(
            RequestedCapture({ requestId: 'capture-1' }),
          )

          expect(model.status).toBe('Complete')
          expect(runtime.journal.read().transitions).toHaveLength(2)
        }),
      ),
  )
})
