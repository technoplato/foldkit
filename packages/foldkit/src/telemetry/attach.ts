import {
  Array,
  Context,
  Effect,
  Function,
  Layer,
  Option,
  Predicate,
  type Scope,
} from 'effect'

import type { Host } from '../processor/host.js'
import type { ObserveRuntime } from '../runtime/handle.js'
import type {
  ProgramRuntimeObservation,
  ProgramRuntimeObserver,
} from '../runtime/programRuntime.js'
import { type TelemetryName, isTelemetryName } from './event.js'
import {
  type RenderReport,
  type SessionFacts,
  type TelemetryRecorder,
  makeRecorder,
} from './recorder.js'
import { makeRedactionPolicy } from './redact.js'
import {
  TelemetryOrigin,
  TelemetrySink,
  type TelemetrySinkLayer,
} from './sink.js'
import {
  type TelemetryRole,
  type TelemetrySurface,
  surfaceOf,
} from './surface.js'

/**
 * What one telemetry session records, and where. `app` names the
 * session's app, a {@link TelemetryName} such as `books`, and with the
 * session's surface its file: Books on `web-react` writes
 * `books-web-react.ndjson`. The surface itself comes from the Host the
 * Program runs on, never from these options. `role` names a special job
 * the process does, such as `daemon` for a CLI daemon. `sink` says where
 * events go, such as `fileSink()` from `foldkit/telemetry/node` or
 * {@link browserSink} in a browser.
 *
 * Telemetry records Message tags and payloads, the Commands each update
 * returns with their args, and a summary of each Model diff, never whole
 * Models. A payload field named `model`, such as the whole Model
 * `SnapshotReceived` carries, is written as `[MODEL]`. `withModels: true`
 * records both. Any field whose key looks like a secret, such as
 * `refreshToken`, `password`, or `authorization`, is written as
 * `[REDACTED]` at any depth, and so is any key in `redactKeys` and any
 * such query parameter inside a URL, such as a signed URL's `Signature`.
 */
export type TelemetryOptions = Readonly<{
  app: string
  sink: TelemetrySinkLayer
  role?: TelemetryRole
  withModels?: boolean
  redactKeys?: ReadonlyArray<string>
}>

/**
 * {@link TelemetryOptions} for {@link observer}, which has no handle to read
 * a Host from, so it takes the Host its runtime runs on, such as
 * `Processor.Host.Headless()`, and records that Host's surface.
 */
export type ObserverOptions = TelemetryOptions & Readonly<{ host: Host }>

/** One attached telemetry session. */
export type TelemetryAttachment = Readonly<{
  /** The session id every event of this attachment carries. */
  session: string
  /**
   * Records one paint a renderer reports, such as a React Profiler commit.
   * A paint reported before the Program starts is held, up to a limit, and
   * written once the session starts.
   */
  recordRendered: (render: RenderReport) => void
  /**
   * Stops recording, writes SessionStopped, and resolves once the sink has
   * written everything and released what it holds, such as its file handle.
   */
  detach: () => Promise<void>
}>

const sessionIdLength = 8

const maximumHeldRenders = 100

const makeSessionId = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, sessionIdLength)

const processId = (): Option.Option<number> => {
  const nodeProcess: unknown = Reflect.get(globalThis, 'process')
  return Predicate.hasProperty(nodeProcess, 'pid') &&
    Predicate.isNumber(nodeProcess.pid)
    ? Option.some(nodeProcess.pid)
    : Option.none()
}

const appNameOf = (name: string): TelemetryName => {
  if (!isTelemetryName(name)) {
    throw new RangeError(
      `A telemetry app must be lowercase letters, digits, and hyphens, such as 'books'; got '${name}'.`,
    )
  }
  return name
}

const monotonicNow: () => number =
  typeof performance === 'undefined' ? Date.now : () => performance.now()

type SessionConfig = Readonly<{
  app: TelemetryName
  surface: TelemetrySurface
  maybeRole: Option.Option<TelemetryRole>
  session: string
  sink: TelemetrySinkLayer
  isRecordingModels: boolean
  redactKeys: ReadonlyArray<string>
}>

// NOTE: A Node process can have a `window` that is no page, such as the
// empty object @foldkit/instant's Node client defines so @instantdb/core
// runs in a terminal, so a page is a `window` that takes listeners.
const isInPage = (): boolean =>
  typeof window !== 'undefined' &&
  Predicate.isFunction(Reflect.get(window, 'addEventListener'))

/**
 * Calls `onPageEnded` when the page this runs in is going away for good,
 * and not when it is only being kept in the back-forward cache, which can
 * bring it back. Does nothing outside a browser.
 */
const watchPageEnding = (onPageEnded: () => void): (() => void) => {
  if (!isInPage()) {
    return Function.constVoid
  }
  const onPageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) {
      onPageEnded()
    }
  }
  window.addEventListener('pagehide', onPageHide)
  return () => {
    window.removeEventListener('pagehide', onPageHide)
  }
}

const startRecording = <Model, Message extends Readonly<{ _tag: string }>>(
  observation: ProgramRuntimeObservation<Model, Message>,
  config: SessionConfig,
): Effect.Effect<TelemetryRecorder, never, Scope.Scope> =>
  Effect.gen(function* () {
    let maybeStopSession = Option.none<() => void>()
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        watchPageEnding(() => {
          if (Option.isSome(maybeStopSession)) {
            maybeStopSession.value()
          }
        }),
      ),
      stopWatching => Effect.sync(stopWatching),
    )
    const sinkContext = yield* Layer.build(
      Layer.provide(
        config.sink,
        Layer.succeed(TelemetryOrigin, {
          app: config.app,
          surface: config.surface,
          maybeRole: config.maybeRole,
        }),
      ),
    )
    const recorder = makeRecorder({
      session: config.session,
      app: config.app,
      surface: config.surface,
      maybeRole: config.maybeRole,
      sink: Context.get(sinkContext, TelemetrySink),
      policy: makeRedactionPolicy(config.redactKeys),
      isRecordingModels: config.isRecordingModels,
    })
    const facts: SessionFacts = {
      programId: observation.programId,
      programVersion: observation.programVersion,
      maybePid: processId(),
    }
    const startedAt = monotonicNow()
    let isSessionStopped = false
    const stopSession = (): void => {
      if (!isSessionStopped) {
        isSessionStopped = true
        recorder.recordSessionStopped(facts, monotonicNow() - startedAt)
      }
    }
    maybeStopSession = Option.some(stopSession)
    recorder.recordSessionStarted(facts)
    yield* Effect.acquireRelease(
      Effect.sync(() => observation.journal.observe(recorder.recordTransition)),
      stopObserving => Effect.sync(stopObserving),
    )
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        observation.observeDiagnostics(recorder.recordDiagnostic),
      ),
      stopObserving => Effect.sync(stopObserving),
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => observation.observeFailures(recorder.recordFailure)),
      stopObserving => Effect.sync(stopObserving),
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => observation.installCommandTracer(recorder.tracer)),
      uninstall => Effect.sync(uninstall),
    )
    yield* Effect.addFinalizer(() => Effect.sync(stopSession))
    return recorder
  })

const sessionConfigOf = (
  options: TelemetryOptions,
  host: Host,
): Omit<SessionConfig, 'session'> => ({
  app: appNameOf(options.app),
  surface: surfaceOf(host),
  maybeRole: Option.fromNullishOr(options.role),
  sink: options.sink,
  isRecordingModels: options.withModels === true,
  redactKeys: options.redactKeys ?? [],
})

/**
 * A runtime observer that records one telemetry session for the Program it
 * observes: SessionStarted, then every transition, Command span,
 * diagnostic, and crash, then SessionStopped when the Program shuts down,
 * or in a browser when the page goes away for good.
 * It builds its sink in the observer's Scope, so shutdown flushes the sink
 * and releases it. Use it with a runtime you start yourself; for a handle
 * from `Runtime.startHandle`, use {@link attach}.
 *
 * Throws a RangeError when `app` is not a {@link TelemetryName}.
 *
 * @example
 * ```typescript
 * const runtime = yield* makeProgramRuntime({
 *   program: Counter,
 *   resources: Layer.empty,
 *   observers: [Telemetry.observer({ app: 'counter', host: Processor.Host.Headless(), sink: fileSink() })],
 * })
 * // writes counter-headless.ndjson
 * ```
 */
export const observer = <Model, Message extends Readonly<{ _tag: string }>>(
  options: ObserverOptions,
): ProgramRuntimeObserver<Model, Message> => {
  const config = sessionConfigOf(options, options.host)
  return observation =>
    Effect.asVoid(
      Effect.suspend(() =>
        startRecording(observation, { ...config, session: makeSessionId() }),
      ),
    )
}

/**
 * A handle telemetry can attach to: one that says the Host it was started
 * on, such as `Runtime.startHandle({ ..., host: Processor.Host.Tui() })`.
 * A handle started without a Host is not one, so attaching to it does not
 * compile.
 */
export type ObservableHandle<Model, Message> = Readonly<{
  observeRuntime: ObserveRuntime<Model, Message>
  host: Host
}>

/**
 * Attaches telemetry to a running Program's handle on any surface: a
 * React, Foldkit, or Svelte page, the CLI, the TUI, OpenTUI, a CLI
 * daemon, or a phone. It records the Program's transitions, Command spans,
 * Subscription and ManagedResource diagnostics, and crashes to `sink`,
 * from the moment it attaches until the handle stops or
 * {@link TelemetryAttachment.detach} runs. Attach on the line after
 * `Runtime.startHandle` to record from the Program's first transition.
 *
 * The session's surface comes from the Host the handle was started on, so
 * a handle on `Processor.Host.Tui()` records `terminal-tui` on every line
 * and writes `books-terminal-tui.ndjson`. There is no surface to pass, and
 * a handle with no Host is a type error, so no session is ever recorded
 * under a surface it is not on. What a client on another Host causes
 * through `handle.onBehalfOf`, such as a `books tui` key a CLI daemon
 * answers, records that client's surface, `terminal-tui`, beside the
 * daemon's session and role.
 *
 * Throws a RangeError when `app` is not a {@link TelemetryName}.
 *
 * @example
 * ```typescript
 * const handle = startBooks({ appId, host: Processor.Host.React(), instance })
 * const telemetry = Telemetry.attach(handle, { app: 'books', sink: Telemetry.browserSink() })
 * telemetry.recordRendered({ painter: 'React', durationMs: 4.1, phase: 'update' })
 * await telemetry.detach()
 *
 * Telemetry.attach(daemonHandle, { app: 'counter', role: 'daemon', sink: fileSink() })
 * ```
 */
export const attach = <Model, Message extends Readonly<{ _tag: string }>>(
  handle: ObservableHandle<Model, Message>,
  options: TelemetryOptions,
): TelemetryAttachment => {
  const session = makeSessionId()
  const config = { ...sessionConfigOf(options, handle.host), session }
  const heldRenders: Array<Readonly<{ render: RenderReport; atMs: number }>> =
    []
  let maybeRecorder = Option.none<TelemetryRecorder>()

  const detach = handle.observeRuntime(observation =>
    Effect.gen(function* () {
      const recorder = yield* startRecording(observation, config)
      maybeRecorder = Option.some(recorder)
      Array.forEach(heldRenders.splice(0), ({ render, atMs }) => {
        recorder.recordRendered(render, atMs)
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          maybeRecorder = Option.none()
        }),
      )
    }),
  )

  const recordRendered = (render: RenderReport): void => {
    if (Option.isSome(maybeRecorder)) {
      maybeRecorder.value.recordRendered(render, Date.now())
    } else if (heldRenders.length < maximumHeldRenders) {
      heldRenders.push({ render, atMs: Date.now() })
    }
  }

  return { session, recordRendered, detach }
}
