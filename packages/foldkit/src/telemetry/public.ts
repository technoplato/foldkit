export {
  CommandFinished,
  CommandOutcome,
  CommandStarted,
  Crashed,
  Diagnostic,
  DiagnosticKind,
  Rendered,
  SessionStarted,
  SessionStopped,
  TelemetryBatch,
  TelemetryCommand,
  TelemetryEvent,
  TelemetryLine,
  TelemetryName,
  Transition,
  decodeLine,
  encodeLine,
  isTelemetryName,
  telemetryEndpointPath,
} from './event.js'

export {
  TelemetryRole,
  TelemetrySurface,
  surfaceOf,
  surfaceOfHostName,
} from './surface.js'

export { decodeLines, type DecodedLines } from './lines.js'

export {
  TelemetryOrigin,
  TelemetrySink,
  defaultFlushIntervalMs,
  defaultMaximumBatchEvents,
  defaultMaximumBufferedEvents,
  defaultTelemetryBatching,
  makeBufferedSink,
  makeMemorySink,
  type BufferedSink,
  type TelemetryBatching,
  type TelemetrySinkLayer,
} from './sink.js'

export {
  browserSink,
  maximumKeepaliveBodyBytes,
  type BrowserSinkOptions,
} from './browserSink.js'

export {
  attach,
  observer,
  type ObservableHandle,
  type ObserverOptions,
  type TelemetryAttachment,
  type TelemetryOptions,
} from './attach.js'

export type { RenderReport } from './recorder.js'

export {
  defaultSecretKeyPattern,
  makeRedactionPolicy,
  maximumArrayItems,
  maximumDepth,
  maximumObjectKeys,
  maximumStringLength,
  omittedModelMarker,
  redactedMarker,
  toTelemetryJson,
  truncatedMarker,
  type RedactionPolicy,
} from './redact.js'

export {
  CommandDurations,
  CommandFailure,
  CountRow,
  CrashRow,
  DurationSummary,
  SessionRow,
  SubscriptionLifecycle,
  SurfaceSummary,
  TelemetrySummary,
  UnfinishedCommand,
  defaultSummaryRowLimit,
  durationSummaryOf,
  formatSummary,
  summarize,
  wholeWindow,
  type TelemetryWindow,
} from './summary.js'
