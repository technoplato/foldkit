import {
  Array,
  Deferred,
  Effect,
  Function,
  Layer,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { makeProgramRuntime } from '../runtime/programRuntime.js'
import { createProgramDevToolsStore } from './programStore.js'
import {
  type EventFrame,
  RequestFrame,
  RequestGetRuntimeDiagnostics,
  RequestGetRuntimeState,
  type ResponseFrame,
} from './protocol.js'
import {
  type DevToolsTransport,
  startDevToolsBridge,
} from './webSocketBridge.js'

const ClickedIncrement = m('ClickedIncrement')
const Message = S.Union([ClickedIncrement])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Program = make({
  id: 'devtools-transport-counter',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ count: 0 }), []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        ClickedIncrement: () => [Model.make({ count: model.count + 1 }), []],
      }),
    ),
})

describe('startDevToolsBridge', () => {
  it('serves the DevTools protocol through an injected transport', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
          })
          const store = yield* createProgramDevToolsStore({
            runtime,
            bridge: {
              render: () => Effect.void,
              markRenderPending: Effect.void,
            },
          })

          const events: Array<EventFrame> = []
          const responseReady = yield* Deferred.make<ResponseFrame>()
          const diagnosticsResponseReady = yield* Deferred.make<ResponseFrame>()
          let requestListener: (frame: unknown) => void = Function.constVoid
          let closeListener: () => void = Function.constVoid
          let hasStoppedRequests = false
          const transport: DevToolsTransport = {
            runtime: {
              title: 'CLI Counter',
              url: 'foldkit://counter/replay',
            },
            sendEvent: frame => {
              events.push(frame)
            },
            sendResponse: frame => {
              if (frame.id === 'runtime-diagnostics') {
                Deferred.doneUnsafe(
                  diagnosticsResponseReady,
                  Effect.succeed(frame),
                )
              } else {
                Deferred.doneUnsafe(responseReady, Effect.succeed(frame))
              }
            },
            subscribeRequests: listener => {
              requestListener = listener
              return () => {
                hasStoppedRequests = true
              }
            },
            subscribeClose: listener => {
              closeListener = listener
              return Function.constVoid
            },
          }

          yield* startDevToolsBridge(
            store,
            transport,
            () => Effect.void,
            Option.some(Message),
          )

          const connectedFrame = Option.getOrThrow(Array.head(events))
          expect(connectedFrame.event._tag).toBe('EventConnected')
          if (connectedFrame.event._tag !== 'EventConnected') {
            throw new Error('Expected the connected runtime event')
          }
          expect(connectedFrame.event.runtime).toMatchObject({
            title: 'CLI Counter',
            url: 'foldkit://counter/replay',
          })

          requestListener(
            S.encodeUnknownSync(RequestFrame)(
              RequestFrame.make({
                id: 'runtime-state',
                maybeConnectionId: Option.some(
                  connectedFrame.event.runtime.connectionId,
                ),
                request: RequestGetRuntimeState(),
              }),
            ),
          )
          const response = yield* Deferred.await(responseReady)
          expect(response.id).toBe('runtime-state')
          expect(response.response._tag).toBe('ResponseRuntimeState')

          requestListener(
            S.encodeUnknownSync(RequestFrame)(
              RequestFrame.make({
                id: 'runtime-diagnostics',
                maybeConnectionId: Option.some(
                  connectedFrame.event.runtime.connectionId,
                ),
                request: RequestGetRuntimeDiagnostics(),
              }),
            ),
          )
          const diagnosticsResponse = yield* Deferred.await(
            diagnosticsResponseReady,
          )
          expect(diagnosticsResponse.id).toBe('runtime-diagnostics')
          expect(diagnosticsResponse.response).toMatchObject({
            _tag: 'ResponseRuntimeDiagnostics',
            diagnostics: [],
            failures: [],
          })

          closeListener()
          expect(hasStoppedRequests).toBe(true)
          expect(Array.map(events, frame => frame.event._tag)).toStrictEqual([
            'EventConnected',
            'EventDisconnected',
          ])
        }),
      ),
    ))
})
