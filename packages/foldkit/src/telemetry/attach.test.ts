import {
  Array,
  Duration,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  Stream,
} from 'effect'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, vi } from 'vitest'

import { describe, it } from '@effect/vitest'

import { programCliSurface } from '../cli/surface.js'
import * as Command from '../command/index.js'
import { bind } from '../interaction/bind.js'
import { Host } from '../processor/public.js'
import { compose as composeProgram } from '../program/compose.js'
import { make } from '../program/program.js'
import { startHandle } from '../runtime/handle.js'
import { makeProgramRuntime } from '../runtime/programRuntime.js'
import { Memory } from '../runtime/syncEngine.js'
import { m } from '../schema/index.js'
import * as Subscription from '../subscription/subscription.js'
import { attach, observer } from './attach.js'
import { type TelemetryEvent, encodeLine } from './event.js'
import { fileSink, readTelemetryFiles } from './node.js'
import * as Telemetry from './public.js'
import { makeRecorder } from './recorder.js'
import { makeRedactionPolicy } from './redact.js'
import { makeMemorySink } from './sink.js'

// PROGRAM

const ClickedFetch = m('ClickedFetch', { bookId: S.String })
const SucceededFetch = m('SucceededFetch', { title: S.String })
const FailedFetch = m('FailedFetch', { reason: S.String })
const ToggledTicking = m('ToggledTicking')
const SignedIn = m('SignedIn', {
  user: S.Struct({ name: S.String, refreshToken: S.String }),
})
const ClickedExplode = m('ClickedExplode')
const CompletedExplode = m('CompletedExplode')
const Message = S.Union([
  ClickedFetch,
  SucceededFetch,
  FailedFetch,
  ToggledTicking,
  SignedIn,
  ClickedExplode,
  CompletedExplode,
])
type Message = typeof Message.Type

const Model = S.Struct({
  title: S.String,
  isTicking: S.Boolean,
  userName: S.String,
})
type Model = typeof Model.Type

const fetchDelay = Duration.millis(5)

const FetchBook = Command.define(
  'FetchBook',
  { bookId: S.String },
  SucceededFetch,
  FailedFetch,
)(({ bookId }) =>
  Effect.sleep(fetchDelay).pipe(
    Effect.withSpan('ReadCatalog'),
    Effect.as(
      bookId === 'missing'
        ? FailedFetch({ reason: 'not found' })
        : SucceededFetch({ title: 'Dune' }),
    ),
  ),
)

const Explode = Command.define(
  'Explode',
  CompletedExplode,
)(Effect.die(new Error('the reactor exploded')))

const subscriptions = Subscription.make<Model, Message>()(entry => ({
  ticks: entry(
    { isTicking: S.Boolean },
    {
      modelToDependencies: model => ({ isTicking: model.isTicking }),
      dependenciesToStream: ({ isTicking }) =>
        isTicking ? Stream.never : Stream.empty,
    },
  ),
}))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ClickedFetch: ({ bookId }) => [model, [FetchBook({ bookId })]],
      SucceededFetch: ({ title }) => [{ ...model, title }, []],
      FailedFetch: () => [model, []],
      ToggledTicking: () => [{ ...model, isTicking: !model.isTicking }, []],
      SignedIn: ({ user }) => [{ ...model, userName: user.name }, []],
      ClickedExplode: () => [model, [Explode()]],
      CompletedExplode: () => [model, []],
    }),
  )

const Library = make({
  id: 'telemetry-library',
  version: 3,
  Model,
  Message,
  init: () => [
    Model.make({ title: 'none', isTicking: false, userName: '' }),
    [],
  ],
  update,
  subscriptions,
})

// DESCRIBE

const describeEvent = (event: TelemetryEvent): string =>
  M.value(event).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      SessionStarted: () => 'SessionStarted',
      SessionStopped: () => 'SessionStopped',
      Transition: ({ message, source }) =>
        `Transition ${message} from ${source._tag}`,
      CommandStarted: ({ command }) => `CommandStarted ${command}`,
      CommandFinished: ({ command, outcome }) =>
        `CommandFinished ${command} ${outcome}`,
      Diagnostic: ({ kind, name, instanceId }) =>
        `${kind} ${name} ${instanceId}`,
      Crashed: ({ source }) => `Crashed ${source._tag}`,
      Rendered: ({ painter }) => `Rendered ${painter}`,
    }),
  )

const isTransitionOf =
  (tag: string) =>
  (
    event: TelemetryEvent,
  ): event is Extract<TelemetryEvent, { _tag: 'Transition' }> =>
    event._tag === 'Transition' && event.message === tag

const finishedOf = (
  events: ReadonlyArray<TelemetryEvent>,
): ReadonlyArray<Extract<TelemetryEvent, { _tag: 'CommandFinished' }>> =>
  events.filter(
    (event): event is Extract<TelemetryEvent, { _tag: 'CommandFinished' }> =>
      event._tag === 'CommandFinished',
  )

describe('Telemetry.observer', () => {
  it.live(
    'records a Host Action, Command success and failure, and a Subscription lifecycle in order',
    () =>
      Effect.gen(function* () {
        const memory = makeMemorySink()
        const runtime = yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* makeProgramRuntime({
              program: Library,
              resources: Layer.empty,
              observers: [
                observer({
                  app: 'telemetry-test',
                  host: Host.Headless(),
                  sink: memory.layer,
                }),
              ],
            })
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(runtime.readDiagnostics()).toHaveLength(2)
              }),
            )
            yield* runtime.run(ClickedFetch({ bookId: 'dune' }), {
              actionName: 'FetchDune',
            })
            yield* runtime.run(ClickedFetch({ bookId: 'missing' }))
            yield* runtime.run(ToggledTicking())
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(
                  runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
                ).toContain('StartedSubscription')
                expect(runtime.readDiagnostics()).toHaveLength(3)
              }),
            )
            yield* runtime.run(ToggledTicking())
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(runtime.readDiagnostics()).toHaveLength(6)
              }),
            )
            yield* runtime.run(
              SignedIn({ user: { name: 'Ada', refreshToken: 'r-123-secret' } }),
            )
            runtime.send(ClickedExplode())
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(runtime.readFailures()).toHaveLength(1)
              }),
            )
            return runtime
          }),
        )

        const events = memory.events()
        expect(Array.map(events, describeEvent)).toStrictEqual([
          'SessionStarted',
          'StartedSubscription ticks 1',
          'StoppedSubscription ticks 1',
          'Transition ClickedFetch from Host',
          'CommandStarted FetchBook',
          'CommandFinished FetchBook Success',
          'Transition SucceededFetch from Command',
          'Transition ClickedFetch from Host',
          'CommandStarted FetchBook',
          'CommandFinished FetchBook Success',
          'Transition FailedFetch from Command',
          'Transition ToggledTicking from Host',
          'StartedSubscription ticks 2',
          'Transition ToggledTicking from Host',
          'StoppedSubscription ticks 2',
          'StartedSubscription ticks 3',
          'StoppedSubscription ticks 3',
          'Transition SignedIn from Host',
          'Transition ClickedExplode from Host',
          'CommandStarted Explode',
          'CommandFinished Explode Failure',
          'Crashed Command',
          'SessionStopped',
        ])
        expect(runtime.readModel().title).toBe('Dune')

        expect(events.map(event => event.sequence)).toStrictEqual(
          events.map((_, index) => index + 1),
        )
        expect(new Set(events.map(event => event.session)).size).toBe(1)
        events.forEach(event => {
          expect(new Date(event.at).toISOString()).toBe(event.at)
          expect(event).toMatchObject({
            app: 'telemetry-test',
            surface: 'headless',
          })
          expect(event).not.toHaveProperty('role')
          expect(encodeLine(event)).toContain(
            '"app":"telemetry-test","surface":"headless"',
          )
        })

        expect(Array.head(events)).toStrictEqual(
          Option.some(
            expect.objectContaining({
              _tag: 'SessionStarted',
              app: 'telemetry-test',
              surface: 'headless',
              programId: 'telemetry-library',
              programVersion: 3,
              pid: process.pid,
            }),
          ),
        )

        const hostFetch = events.find(isTransitionOf('ClickedFetch'))
        expect(hostFetch).toMatchObject({
          transition: 1,
          payload: { bookId: 'dune' },
          source: { _tag: 'Host', actionName: 'FetchDune' },
          commands: [{ name: 'FetchBook', args: { bookId: 'dune' } }],
          isModelChanged: false,
          changedPathCount: 0,
        })
        expect(hostFetch?.updateDurationMs).toBeGreaterThanOrEqual(0)

        expect(
          events.find(event => event._tag === 'CommandStarted'),
        ).toMatchObject({ command: 'FetchBook', args: { bookId: 'dune' } })

        const [succeeded, failedFetch, exploded] = finishedOf(events)
        expect(succeeded).toMatchObject({
          command: 'FetchBook',
          args: { bookId: 'dune' },
          outcome: 'Success',
          result: 'SucceededFetch',
        })
        expect(succeeded?.durationMs).toBeGreaterThanOrEqual(
          Duration.toMillis(fetchDelay) - 1,
        )
        expect(failedFetch).toMatchObject({ result: 'FailedFetch' })
        expect(exploded).toMatchObject({ outcome: 'Failure' })
        expect(exploded?.cause).toContain('the reactor exploded')

        expect(events.find(isTransitionOf('SignedIn'))).toMatchObject({
          payload: { user: { name: 'Ada', refreshToken: '[REDACTED]' } },
          isModelChanged: true,
          changedPathCount: 1,
        })
        expect(JSON.stringify(events)).not.toContain('r-123-secret')
        expect(JSON.stringify(events)).not.toContain('ReadCatalog')
        expect(Array.last(events)).toStrictEqual(
          Option.some(
            expect.objectContaining({
              _tag: 'SessionStopped',
              programId: 'telemetry-library',
            }),
          ),
        )
      }),
  )

  it.live('records a Command interrupted by shutdown', () =>
    Effect.gen(function* () {
      const memory = makeMemorySink()
      const StartedWaiting = m('StartedWaiting')
      const Waited = m('Waited')
      const WaitingMessage = S.Union([StartedWaiting, Waited])
      type WaitingMessage = typeof WaitingMessage.Type
      const Wait = Command.define(
        'Wait',
        Waited,
      )(Effect.never.pipe(Effect.as(Waited())))
      const Waiting = make({
        id: 'telemetry-waiting',
        version: 1,
        Model: S.Struct({}),
        Message: WaitingMessage,
        init: () => [{}, [Wait()]],
        update: (model, message) =>
          M.value(message).pipe(
            M.withReturnType<
              readonly [
                typeof model,
                ReadonlyArray<Command.Command<WaitingMessage>>,
              ]
            >(),
            M.tagsExhaustive({
              StartedWaiting: () => [model, []],
              Waited: () => [model, []],
            }),
          ),
      })
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* makeProgramRuntime({
            program: Waiting,
            resources: Layer.empty,
            observers: [
              observer({
                app: 'telemetry-test',
                host: Host.Cli(),
                role: 'daemon',
                sink: memory.layer,
              }),
            ],
          })
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(memory.events().map(describeEvent)).toContain(
                'CommandStarted Wait',
              )
            }),
          )
        }),
      )
      expect(memory.events().map(describeEvent)).toStrictEqual([
        'SessionStarted',
        'CommandStarted Wait',
        'CommandFinished Wait Interrupted',
        'SessionStopped',
      ])
      Array.forEach(memory.events(), event => {
        expect(encodeLine(event)).toContain(
          '"app":"telemetry-test","surface":"terminal-cli","role":"daemon"',
        )
      })
    }),
  )

  it('refuses an app name a file could not carry', () => {
    expect(() =>
      observer({
        app: '../books',
        host: Host.React(),
        sink: makeMemorySink().layer,
      }),
    ).toThrow(RangeError)
  })
})

// SYNCED

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const SyncedLibrary = composeProgram.sync({
  of: Library,
  snapshot: CountRow.pipe(
    S.decodeTo(
      Model,
      SchemaTransformation.transform({
        decode: (): typeof Model.Encoded => ({
          title: 'none',
          isTicking: false,
          userName: '',
        }),
        encode: () => ({ id: 'library', value: 0, asOf: '', at: 0 }),
      }),
    ),
  ),
  message: MessageRow.pipe(
    S.decodeTo(
      S.fromJsonString(Library.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
      }),
    ),
  ),
})

describe('Telemetry.attach', () => {
  it('records a started handle from its first transition and flushes when it stops', async () => {
    const memory = makeMemorySink()
    const handle = startHandle({
      program: SyncedLibrary,
      sync: Memory({ processor: 'react-telemetry' }),
      host: Host.React(),
    })
    const telemetry = attach(handle, {
      app: 'telemetry-test',
      sink: memory.layer,
    })
    telemetry.recordRendered({
      painter: 'React',
      durationMs: 1.25,
      phase: 'mount',
    })
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    const surface = programCliSurface(bind(SyncedLibrary, handle), 'library')
    await Effect.runPromise(surface.run(ClickedFetch({ bookId: 'dune' })))
    await vi.waitFor(() => {
      expect(memory.events().some(isTransitionOf('SucceededFetch'))).toBe(true)
    })
    await handle.stop()

    const events = memory.events()
    expect(Array.head(events)).toStrictEqual(
      Option.some(
        expect.objectContaining({
          _tag: 'SessionStarted',
          app: 'telemetry-test',
          surface: 'web-react',
          programId: 'sync:telemetry-library',
          session: telemetry.session,
        }),
      ),
    )
    expect(events.map(describeEvent)).toEqual(
      expect.arrayContaining([
        'Rendered React',
        'Transition SnapshotReceived from Sync',
        'Transition ClickedFetch from Host',
        'CommandStarted FetchBook',
        'CommandFinished FetchBook Success',
        'Transition SucceededFetch from Command',
      ]),
    )
    expect(events.find(isTransitionOf('SnapshotReceived'))).toMatchObject({
      payload: { model: '[MODEL]' },
    })
    expect(Option.map(Array.last(events), event => event._tag)).toStrictEqual(
      Option.some('SessionStopped'),
    )
  })

  it('records whole Models when asked', async () => {
    const memory = makeMemorySink()
    const handle = startHandle({
      program: SyncedLibrary,
      sync: Memory({ processor: 'cli-telemetry' }),
      host: Host.Cli(),
    })
    const telemetry = attach(handle, {
      app: 'telemetry-test',
      sink: memory.layer,
      withModels: true,
    })
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    await telemetry.detach()
    await handle.stop()

    const snapshot = memory.events().find(isTransitionOf('SnapshotReceived'))
    expect(snapshot).toMatchObject({
      payload: { model: { title: 'none', isTicking: false } },
      model: { _tag: 'Ready', title: 'none' },
    })
    const events = memory.events()
    expect(Array.head(events)).toStrictEqual(
      Option.some(expect.objectContaining({ surface: 'terminal-cli' })),
    )
    expect(Option.map(Array.last(events), event => event._tag)).toStrictEqual(
      Option.some('SessionStopped'),
    )
  })

  it('records a terminal whose process has a window that is no page, as Instant in Node makes', async () => {
    vi.stubGlobal('window', {})
    try {
      const memory = makeMemorySink()
      const handle = startHandle({
        program: SyncedLibrary,
        sync: Memory({ processor: 'cli-instant' }),
        host: Host.Cli(),
      })
      attach(handle, { app: 'telemetry-test', sink: memory.layer })
      await vi.waitFor(() => {
        expect(handle.readModel()._tag).toBe('Ready')
      })
      await handle.stop()

      expect(Array.map(memory.events(), event => event._tag)).toEqual(
        expect.arrayContaining([
          'SessionStarted',
          'Transition',
          'SessionStopped',
        ]),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('writes a terminal handle to its file, flushed by the time the handle stops', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'foldkit-telemetry-cli-'))
    try {
      const handle = startHandle({
        program: SyncedLibrary,
        sync: Memory({ processor: 'cli-file' }),
        host: Host.Cli(),
      })
      Telemetry.attach(handle, {
        app: 'books',
        sink: fileSink({ directory }),
      })
      await vi.waitFor(() => {
        expect(handle.readModel()._tag).toBe('Ready')
      })
      handle.send(ClickedFetch({ bookId: 'dune' }))
      await vi.waitFor(() => {
        expect(handle.readModel()).toMatchObject({ title: 'Dune' })
      })
      await handle.stop()

      const { events } = await Effect.runPromise(
        readTelemetryFiles([join(directory, 'books-terminal-cli.ndjson')]),
      )
      expect(Array.map(events, describeEvent)).toEqual(
        expect.arrayContaining([
          'SessionStarted',
          'Transition ClickedFetch from Host',
          'CommandFinished FetchBook Success',
          'Transition SucceededFetch from Command',
        ]),
      )
      expect(Option.map(Array.last(events), event => event._tag)).toStrictEqual(
        Option.some('SessionStopped'),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops the session when the page goes away, and not when it is only cached', async () => {
    const memory = makeMemorySink()
    const handle = startHandle({
      program: SyncedLibrary,
      sync: Memory({ processor: 'react-page' }),
      host: Host.React(),
    })
    attach(handle, { app: 'telemetry-test', sink: memory.layer })
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    const cached = new Event('pagehide')
    Object.defineProperty(cached, 'persisted', { value: true })
    window.dispatchEvent(cached)
    expect(
      Array.filter(memory.events(), event => event._tag === 'SessionStopped'),
    ).toHaveLength(0)

    const ended = new Event('pagehide')
    Object.defineProperty(ended, 'persisted', { value: false })
    window.dispatchEvent(ended)
    expect(
      Option.map(Array.last(memory.events()), event => event._tag),
    ).toStrictEqual(Option.some('SessionStopped'))

    await handle.stop()
    expect(
      Array.filter(memory.events(), event => event._tag === 'SessionStopped'),
    ).toHaveLength(1)
  })

  it('records what a client on another Host causes on that client’s surface, beside the session and role', async () => {
    const memory = makeMemorySink()
    const handle = startHandle({
      program: SyncedLibrary,
      sync: Memory({ processor: 'daemon-telemetry' }),
      host: Host.Cli(),
    })
    const telemetry = attach(handle, {
      app: 'books',
      role: 'daemon',
      sink: memory.layer,
    })
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    handle.onBehalfOf(Host.Tui(), () => {
      handle.send(ClickedFetch({ bookId: 'dune' }))
    })
    telemetry.recordRendered({
      painter: 'Terminal',
      durationMs: 2.5,
      phase: 'key',
      clientHost: Host.Tui(),
    })
    handle.send(ToggledTicking())
    await vi.waitFor(() => {
      expect(memory.events().some(isTransitionOf('SucceededFetch'))).toBe(true)
    })
    await handle.stop()

    const events = memory.events()
    const surfaceOfEvent = new Map(
      Array.map(events, event => [describeEvent(event), event.surface]),
    )
    expect(Object.fromEntries(surfaceOfEvent)).toMatchObject({
      SessionStarted: 'terminal-cli',
      'Transition SnapshotReceived from Sync': 'terminal-cli',
      'Transition ClickedFetch from Host': 'terminal-tui',
      'CommandStarted FetchBook': 'terminal-tui',
      'CommandFinished FetchBook Success': 'terminal-tui',
      'Transition SucceededFetch from Command': 'terminal-tui',
      'Rendered Terminal': 'terminal-tui',
      'Transition ToggledTicking from Host': 'terminal-cli',
      SessionStopped: 'terminal-cli',
    })
    Array.forEach(events, event => {
      expect(event).toMatchObject({
        session: telemetry.session,
        app: 'books',
        role: 'daemon',
      })
    })
    expect(events.find(isTransitionOf('ClickedFetch'))).toMatchObject({
      source: { _tag: 'Host', clientHost: { _tag: 'Tui' } },
    })
  })

  it('records nothing after SessionStopped', () => {
    const offered: Array<TelemetryEvent> = []
    const recorder = makeRecorder({
      session: 'cafe0001',
      app: 'books',
      surface: 'terminal-cli',
      maybeRole: Option.none(),
      sink: {
        offer: event => {
          offered.push(event)
        },
        flush: Effect.void,
      },
      policy: makeRedactionPolicy([]),
      isRecordingModels: false,
    })
    const facts = {
      programId: 'books',
      programVersion: 1,
      maybePid: Option.none(),
    }
    recorder.recordSessionStarted(facts)
    recorder.recordSessionStopped(facts, 12)
    recorder.recordRendered({ painter: 'Terminal', durationMs: 1 }, 0)
    expect(Array.map(offered, event => event._tag)).toStrictEqual([
      'SessionStarted',
      'SessionStopped',
    ])
  })

  it('takes no handle that was started without a Host', () => {
    const attachHandleWithNoHost = (): void => {
      const handle = startHandle({
        program: SyncedLibrary,
        sync: Memory({ processor: 'no-host' }),
      })
      // @ts-expect-error A handle with no Host has no surface to record.
      attach(handle, { app: 'telemetry-test', sink: makeMemorySink().layer })
    }
    expect(attachHandleWithNoHost).toBeTypeOf('function')
  })
})
