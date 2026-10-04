import {
  Array,
  Cause,
  type Context,
  Exit,
  HashSet,
  Option,
  Predicate,
  Record,
  type Schema,
  Tracer,
} from 'effect'

import type {
  CommandRecord,
  Transition as JournalTransition,
} from '../runtime/programJournal.js'
import type {
  RuntimeDiagnostic,
  RuntimeFailure,
} from '../runtime/runtimeDiagnostic.js'
import type {
  CommandOutcome,
  TelemetryCommand,
  TelemetryEvent,
  TelemetryName,
} from './event.js'
import {
  type RedactionPolicy,
  omittedModelMarker,
  scrubText,
  toTelemetryJson,
} from './redact.js'
import type { TelemetrySink } from './sink.js'

type Envelope = Readonly<{ at: string; sequence: number; session: string }>

type AnyMessage = Readonly<{ _tag: string }>

/** What a renderer reports about one paint. */
export type RenderReport = Readonly<{
  painter: string
  durationMs: number
  phase?: string
}>

/** The facts every SessionStarted and SessionStopped line repeats. */
export type SessionFacts = Readonly<{
  app: TelemetryName
  host: TelemetryName
  programId: string
  programVersion: number
  maybePid: Option.Option<number>
}>

/** Turns one running Program's facts into events and offers them to a sink. */
export type TelemetryRecorder = Readonly<{
  recordSessionStarted: (facts: SessionFacts) => void
  recordSessionStopped: (facts: SessionFacts, durationMs: number) => void
  recordTransition: (transition: JournalTransition<unknown, AnyMessage>) => void
  recordDiagnostic: (diagnostic: RuntimeDiagnostic) => void
  recordFailure: (failure: RuntimeFailure<AnyMessage>) => void
  recordRendered: (render: RenderReport, atMs: number) => void
  tracer: Tracer.Tracer
}>

/** How one recorder writes: its session, its sink, and its policy. */
export type TelemetryRecorderConfig = Readonly<{
  session: string
  sink: typeof TelemetrySink.Service
  policy: RedactionPolicy
  isRecordingModels: boolean
}>

const durationDecimals = 1_000

const noCommands: ReadonlyArray<TelemetryCommand> = []

const monotonicNow: () => number =
  typeof performance === 'undefined' ? Date.now : () => performance.now()

const roundDuration = (durationMs: number): number =>
  Math.max(0, Math.round(durationMs * durationDecimals) / durationDecimals)

const tagOf = (value: unknown): Option.Option<string> =>
  Predicate.hasProperty(value, '_tag') && Predicate.isString(value._tag)
    ? Option.some(value._tag)
    : Option.none()

const isObjectValued = (
  fields: Readonly<Record<string, unknown>>,
  key: string,
): boolean => Predicate.isObject(fields[key])

const sessionFields = (facts: SessionFacts) => ({
  app: facts.app,
  host: facts.host,
  programId: facts.programId,
  programVersion: facts.programVersion,
  ...Option.match(facts.maybePid, {
    onNone: () => ({}),
    onSome: pid => ({ pid }),
  }),
})

type Outcome = Readonly<{
  outcome: CommandOutcome
  result?: string
  cause?: string
}>

class TelemetrySpan implements Tracer.Span {
  readonly _tag = 'Span'
  readonly spanId: string
  readonly traceId: string
  readonly name: string
  readonly parent: Option.Option<Tracer.AnySpan>
  readonly annotations: Context.Context<never>
  readonly links: Array<Tracer.SpanLink>
  readonly sampled: boolean
  readonly kind: Tracer.SpanKind
  readonly attributes = new Map<string, unknown>()
  readonly startedAtMs = Date.now()
  readonly startedAt = monotonicNow()
  status: Tracer.SpanStatus

  constructor(
    options: Parameters<Tracer.Tracer['span']>[0],
    readonly spanNumber: number,
    session: string,
    private readonly onEnd: (
      span: TelemetrySpan,
      exit: Exit.Exit<unknown, unknown>,
    ) => void,
  ) {
    this.name = options.name
    this.parent = options.parent
    this.annotations = options.annotations
    this.links = Array.copy(options.links)
    this.sampled = options.sampled
    this.kind = options.kind
    this.status = { _tag: 'Started', startTime: options.startTime }
    this.spanId = spanNumber.toString(16)
    this.traceId = Option.match(options.parent, {
      onNone: () => session,
      onSome: parent => parent.traceId,
    })
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = {
      _tag: 'Ended',
      startTime: this.status.startTime,
      endTime,
      exit,
    }
    this.onEnd(this, exit)
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value)
  }

  event(): void {}

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    Array.forEach(links, link => {
      this.links.push(link)
    })
  }
}

/**
 * Makes the recorder one telemetry session writes through. Every event it
 * offers carries the session, the next sequence number, and the ISO time
 * the fact happened.
 *
 * A Command span's attributes, its args, are set just after the span
 * begins, so the recorder holds a CommandStarted until the next event it
 * records or the next microtask, whichever comes first. The line still
 * lands before anything that happened after the span began.
 */
export const makeRecorder = (
  config: TelemetryRecorderConfig,
): TelemetryRecorder => {
  const { session, sink, policy, isRecordingModels } = config
  const pendingStarts: Array<TelemetrySpan> = []
  let nextSequence = 1
  let nextSpanNumber = 1
  let isPendingStartFlushScheduled = false
  let maybeLastTime = Option.none<Readonly<{ atMs: number; at: string }>>()

  const isoTimeOf = (atMs: number): string => {
    if (Option.isSome(maybeLastTime) && maybeLastTime.value.atMs === atMs) {
      return maybeLastTime.value.at
    }
    const at = new Date(atMs).toISOString()
    maybeLastTime = Option.some({ atMs, at })
    return at
  }

  const write = (
    atMs: number,
    build: (envelope: Envelope) => TelemetryEvent,
  ): void => {
    const sequence = nextSequence
    nextSequence += 1
    sink.offer(build({ at: isoTimeOf(atMs), sequence, session }))
  }

  const argsOf = (span: TelemetrySpan): Partial<Record<'args', Schema.Json>> =>
    span.attributes.size === 0
      ? {}
      : { args: toTelemetryJson(Record.fromEntries(span.attributes), policy) }

  const writePendingStarts = (): void => {
    Array.forEach(pendingStarts.splice(0), span => {
      write(span.startedAtMs, envelope => ({
        _tag: 'CommandStarted',
        ...envelope,
        command: span.name,
        span: span.spanNumber,
        ...argsOf(span),
      }))
    })
  }

  const record = (
    atMs: number,
    build: (envelope: Envelope) => TelemetryEvent,
  ): void => {
    writePendingStarts()
    write(atMs, build)
  }

  const holdStart = (span: TelemetrySpan): void => {
    pendingStarts.push(span)
    if (!isPendingStartFlushScheduled) {
      isPendingStartFlushScheduled = true
      queueMicrotask(() => {
        isPendingStartFlushScheduled = false
        writePendingStarts()
      })
    }
  }

  const outcomeOf = (exit: Exit.Exit<unknown, unknown>): Outcome =>
    Exit.match(exit, {
      onSuccess: (value): Outcome =>
        Option.match(tagOf(value), {
          onNone: () => ({ outcome: 'Success' }),
          onSome: result => ({ outcome: 'Success', result }),
        }),
      onFailure: (cause): Outcome =>
        Cause.hasInterruptsOnly(cause)
          ? { outcome: 'Interrupted' }
          : {
              outcome: 'Failure',
              cause: scrubText(Cause.pretty(cause), policy),
            },
    })

  const finishSpan = (
    span: TelemetrySpan,
    exit: Exit.Exit<unknown, unknown>,
  ): void => {
    const durationMs = roundDuration(monotonicNow() - span.startedAt)
    const outcome = outcomeOf(exit)
    record(Date.now(), envelope => ({
      _tag: 'CommandFinished',
      ...envelope,
      command: span.name,
      span: span.spanNumber,
      ...argsOf(span),
      durationMs,
      ...outcome,
    }))
  }

  const tracer = Tracer.make({
    span: options => {
      const span = new TelemetrySpan(
        options,
        nextSpanNumber,
        session,
        finishSpan,
      )
      nextSpanNumber += 1
      holdStart(span)
      return span
    },
  })

  const commandOf = (command: CommandRecord): TelemetryCommand =>
    command.args === undefined
      ? { name: command.name }
      : { name: command.name, args: toTelemetryJson(command.args, policy) }

  const commandsOf = (
    commands: ReadonlyArray<CommandRecord>,
  ): ReadonlyArray<TelemetryCommand> =>
    Array.isReadonlyArrayEmpty(commands)
      ? noCommands
      : Array.map(commands, commandOf)

  const payloadOf = (message: AnyMessage) => {
    const { _tag, ...messageFields } = message
    const fields: Readonly<Record<string, unknown>> = messageFields
    if (Record.isEmptyReadonlyRecord(fields)) {
      return {}
    }
    const keptFields =
      isRecordingModels || !isObjectValued(fields, 'model')
        ? fields
        : { ...fields, model: omittedModelMarker }
    return { payload: toTelemetryJson(keptFields, policy) }
  }

  // NOTE: events are built as typed literals, not through their Schema
  // constructors. A constructor validates through a synchronous Effect run,
  // about 8 µs an event, and transitions are recorded on the dispatch
  // path. decodeLine validates every line that is read back.
  return {
    recordSessionStarted: facts => {
      record(Date.now(), envelope => ({
        _tag: 'SessionStarted',
        ...envelope,
        ...sessionFields(facts),
      }))
    },
    recordSessionStopped: (facts, durationMs) => {
      record(Date.now(), envelope => ({
        _tag: 'SessionStopped',
        ...envelope,
        ...sessionFields(facts),
        durationMs: roundDuration(durationMs),
      }))
    },
    recordTransition: transition => {
      record(transition.timestamp, envelope => ({
        _tag: 'Transition',
        ...envelope,
        transition: transition.sequence,
        message: transition.message._tag,
        ...payloadOf(transition.message),
        source: transition.source,
        commands: commandsOf(transition.commands),
        isModelChanged: transition.isModelChanged,
        changedPathCount: HashSet.size(transition.diff.changedPaths),
        ...(transition.updateDurationMs === undefined
          ? {}
          : { updateDurationMs: roundDuration(transition.updateDurationMs) }),
        ...(isRecordingModels
          ? { model: toTelemetryJson(transition.model, policy) }
          : {}),
      }))
    },
    recordDiagnostic: diagnostic => {
      record(diagnostic.timestamp, envelope => ({
        _tag: 'Diagnostic',
        ...envelope,
        kind: diagnostic._tag,
        name: diagnostic.name,
        instanceId: diagnostic.instanceId,
        ...('cause' in diagnostic
          ? { cause: scrubText(diagnostic.cause, policy) }
          : {}),
      }))
    },
    recordFailure: failure => {
      record(failure.timestamp, envelope => ({
        _tag: 'Crashed',
        ...envelope,
        source: failure.source,
        ...Option.match(failure.message, {
          onNone: () => ({}),
          onSome: message => ({ message: message._tag }),
        }),
        cause: scrubText(Cause.pretty(failure.cause), policy),
      }))
    },
    recordRendered: (render, atMs) => {
      record(atMs, envelope => ({
        _tag: 'Rendered',
        ...envelope,
        painter: render.painter,
        durationMs: roundDuration(render.durationMs),
        ...(render.phase === undefined ? {} : { phase: render.phase }),
      }))
    },
    tracer,
  }
}
