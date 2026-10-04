/**
 * Telemetry is a record of what a running Program did, written as one JSON
 * object per line (NDJSON) to a sink such as a local file. Every line is
 * one event: the session starting and stopping, each transition with its
 * Message and the Commands update returned, each Command's span from
 * start to finish, each Subscription and ManagedResource lifecycle
 * diagnostic, a crash, and each paint a renderer reports.
 *
 * Every event carries `at`, the ISO time it happened, `session`, the id of
 * one attached run, and `sequence`, which counts up from 1 within that
 * session in the order events were recorded. Two sessions may share one
 * file, so order lines by `session` and `sequence`, not by position:
 *
 * ```json
 * {"_tag":"SessionStarted","at":"2026-10-04T20:15:02.114Z","sequence":1,"session":"9f3c2a71","app":"books","host":"react","programId":"sync:books","programVersion":1}
 * {"_tag":"Transition","at":"2026-10-04T20:15:03.020Z","sequence":2,"session":"9f3c2a71","transition":1,"message":"PressedPlay","payload":{"bookId":"a-new-earth"},"source":{"_tag":"Host"},"commands":[{"name":"PlayAudio","args":{"bookId":"a-new-earth"}}],"isModelChanged":true,"changedPathCount":2,"updateDurationMs":0.05}
 * {"_tag":"CommandStarted","at":"2026-10-04T20:15:03.021Z","sequence":3,"session":"9f3c2a71","command":"PlayAudio","span":1,"args":{"bookId":"a-new-earth"}}
 * {"_tag":"CommandFinished","at":"2026-10-04T20:15:03.233Z","sequence":4,"session":"9f3c2a71","command":"PlayAudio","span":1,"durationMs":212.4,"outcome":"Success","result":"StartedPlayback"}
 * ```
 */
import { Option, Schema as S } from 'effect'

import { TransitionSource } from '../runtime/programJournal.js'
import { RuntimeFailureSource } from '../runtime/runtimeDiagnostic.js'

// MODEL

const telemetryNamePattern = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * An app or host name as telemetry writes it, and as its file name uses
 * it: lowercase letters, digits, and hyphens, starting with a letter or a
 * digit, at most 64 characters. `books` and `react` name the file
 * `books-react.ndjson`; `Books` and `../react` are refused.
 */
export const TelemetryName = S.String.check(S.isPattern(telemetryNamePattern))

/** An app or host name as telemetry writes it. */
export type TelemetryName = typeof TelemetryName.Type

/**
 * True when a string is a {@link TelemetryName}.
 *
 * @example
 * ```typescript
 * isTelemetryName('books') // true
 * isTelemetryName('Books') // false
 * ```
 */
export const isTelemetryName = (name: string): boolean =>
  telemetryNamePattern.test(name)

const NonNegativeNumber = S.Number.check(S.isGreaterThanOrEqualTo(0))

const NonNegativeInt = S.Int.check(S.isGreaterThanOrEqualTo(0))

const envelope = {
  at: S.String,
  sequence: S.Int.check(S.isGreaterThanOrEqualTo(1)),
  session: S.String,
}

/** One Command a transition returned, with its args after redaction. */
export const TelemetryCommand = S.Struct({
  name: S.String,
  args: S.optionalKey(S.Json),
})

/** One Command a transition returned, with its args after redaction. */
export type TelemetryCommand = typeof TelemetryCommand.Type

/**
 * A telemetry session began: one attachment to one running Program.
 * `pid` is the process id on Node and Bun, and absent in a browser.
 */
export const SessionStarted = S.TaggedStruct('SessionStarted', {
  ...envelope,
  app: TelemetryName,
  host: TelemetryName,
  programId: S.String,
  programVersion: S.Number,
  pid: S.optionalKey(NonNegativeInt),
})

/** A telemetry session began. */
export type SessionStarted = typeof SessionStarted.Type

/**
 * A telemetry session ended, because the Program shut down or telemetry
 * was detached. `durationMs` is how long the session lasted.
 */
export const SessionStopped = S.TaggedStruct('SessionStopped', {
  ...envelope,
  app: TelemetryName,
  host: TelemetryName,
  programId: S.String,
  programVersion: S.Number,
  pid: S.optionalKey(NonNegativeInt),
  durationMs: NonNegativeNumber,
})

/** A telemetry session ended. */
export type SessionStopped = typeof SessionStopped.Type

/**
 * One Message update processed. `transition` is the journal sequence,
 * `message` the Message tag, and `payload` the rest of the Message after
 * redaction, absent when the Message has no fields. `source` says where
 * the Message came from: the Host with its Action name, a Command, a
 * Subscription, and so on. `changedPathCount` is the size of the Model
 * diff, `updateDurationMs` how long update took. `model` is the whole
 * Model after redaction, present only when telemetry runs `withModels`.
 */
export const Transition = S.TaggedStruct('Transition', {
  ...envelope,
  transition: S.Int,
  message: S.String,
  payload: S.optionalKey(S.Json),
  source: TransitionSource,
  commands: S.Array(TelemetryCommand),
  isModelChanged: S.Boolean,
  changedPathCount: NonNegativeInt,
  updateDurationMs: S.optionalKey(NonNegativeNumber),
  model: S.optionalKey(S.Json),
})

/** One Message update processed. */
export type Transition = typeof Transition.Type

/**
 * One Command's span began. `span` numbers the span within its session
 * and matches the {@link CommandFinished} that ends it.
 */
export const CommandStarted = S.TaggedStruct('CommandStarted', {
  ...envelope,
  command: S.String,
  span: S.Int,
  args: S.optionalKey(S.Json),
})

/** One Command's span began. */
export type CommandStarted = typeof CommandStarted.Type

/**
 * How a Command's Effect ended: `Success` with its result Message,
 * `Failure` with a defect, which also crashes the Program, or
 * `Interrupted`, such as by shutdown.
 */
export const CommandOutcome = S.Literals(['Success', 'Failure', 'Interrupted'])

/** How a Command's Effect ended. */
export type CommandOutcome = typeof CommandOutcome.Type

/**
 * One Command's span ended. `durationMs` is how long its Effect ran.
 * `result` is the tag of the Message it produced, such as
 * `FailedFetchWeather` for a failure the Command turned into a Message,
 * and `cause` the pretty cause of a `Failure`.
 */
export const CommandFinished = S.TaggedStruct('CommandFinished', {
  ...envelope,
  command: S.String,
  span: S.Int,
  args: S.optionalKey(S.Json),
  durationMs: NonNegativeNumber,
  outcome: CommandOutcome,
  result: S.optionalKey(S.String),
  cause: S.optionalKey(S.String),
})

/** One Command's span ended. */
export type CommandFinished = typeof CommandFinished.Type

/** Which Subscription or ManagedResource lifecycle fact a diagnostic records. */
export const DiagnosticKind = S.Literals([
  'StartedSubscription',
  'StoppedSubscription',
  'FailedSubscription',
  'StartedAcquiringManagedResource',
  'AcquiredManagedResource',
  'FailedAcquiringManagedResource',
  'StartedReleasingManagedResource',
  'ReleasedManagedResource',
  'FailedReleasingManagedResource',
])

/** Which Subscription or ManagedResource lifecycle fact a diagnostic records. */
export type DiagnosticKind = typeof DiagnosticKind.Type

/**
 * One Subscription or ManagedResource lifecycle fact. `name` is the
 * Subscription or ManagedResource name and `instanceId` numbers each run
 * of it, so a Subscription that restarts with new dependencies starts
 * again with a new `instanceId`.
 */
export const Diagnostic = S.TaggedStruct('Diagnostic', {
  ...envelope,
  kind: DiagnosticKind,
  name: S.String,
  instanceId: S.Int,
  cause: S.optionalKey(S.String),
})

/** One Subscription or ManagedResource lifecycle fact. */
export type Diagnostic = typeof Diagnostic.Type

/**
 * The Program runtime stopped on a terminal failure. `source` names the
 * subsystem, and `message` the tag of the Message being processed, if any.
 */
export const Crashed = S.TaggedStruct('Crashed', {
  ...envelope,
  source: RuntimeFailureSource,
  message: S.optionalKey(S.String),
  cause: S.String,
})

/** The Program runtime stopped on a terminal failure. */
export type Crashed = typeof Crashed.Type

/**
 * A renderer painted, as it reported it: `painter` names it, such as
 * `React`, `durationMs` is the paint time, and `phase` the painter's own
 * word for the paint, such as `mount` or `update`.
 */
export const Rendered = S.TaggedStruct('Rendered', {
  ...envelope,
  painter: S.String,
  durationMs: NonNegativeNumber,
  phase: S.optionalKey(S.String),
})

/** A renderer painted. */
export type Rendered = typeof Rendered.Type

/** One line of Program telemetry. */
export const TelemetryEvent = S.Union([
  SessionStarted,
  SessionStopped,
  Transition,
  CommandStarted,
  CommandFinished,
  Diagnostic,
  Crashed,
  Rendered,
])

/** One line of Program telemetry. */
export type TelemetryEvent = typeof TelemetryEvent.Type

/**
 * A batch of events from one app and host, as a browser sends it to the
 * development server's telemetry endpoint.
 */
export const TelemetryBatch = S.Struct({
  app: TelemetryName,
  host: TelemetryName,
  events: S.Array(TelemetryEvent),
})

/** A batch of events from one app and host. */
export type TelemetryBatch = typeof TelemetryBatch.Type

/**
 * The path a development server serves for browser telemetry, such as
 * `POST http://127.0.0.1:5183/__foldkit/telemetry`.
 */
export const telemetryEndpointPath = '/__foldkit/telemetry'

// CODEC

/** One NDJSON line decoded into a {@link TelemetryEvent}. */
export const TelemetryLine = S.fromJsonString(TelemetryEvent)

const decodeLineOption = S.decodeUnknownOption(TelemetryLine)

/**
 * Encodes one event as one NDJSON line, without the trailing newline.
 * Every field of an event is already JSON, so the line is the event as
 * JSON, and {@link decodeLine} reads it back to an equal event.
 *
 * @example
 * ```typescript
 * encodeLine(event) // '{"_tag":"Rendered","at":"2026-10-04T20:15:03.410Z","sequence":7,"session":"9f3c2a71","painter":"React","durationMs":3.2}'
 * ```
 */
export const encodeLine = (event: TelemetryEvent): string =>
  JSON.stringify(event)

/**
 * Decodes one NDJSON line into an event, or None for a line that is not
 * one, such as a line cut short when a process stopped mid-write.
 *
 * @example
 * ```typescript
 * decodeLine('{"_tag":"Rendered", …}') // Some({ _tag: 'Rendered', … })
 * decodeLine('{"_tag":"Rend') // None
 * ```
 */
export const decodeLine = (line: string): Option.Option<TelemetryEvent> =>
  decodeLineOption(line)
