import { Schema as S } from 'effect'

/** The severity of a structured Log Event. */
export const LogLevel = S.Literals([
  'Debug',
  'Info',
  'Notice',
  'Warning',
  'Error',
  'Critical',
])
/** The severity of a structured Log Event. */
export type LogLevel = typeof LogLevel.Type

/** The source-code location that emitted a structured Log Event. */
export const SourceLocation = S.Struct({
  file: S.String,
  function: S.String,
  line: S.Int,
})
/** The source-code location that emitted a structured Log Event. */
export type SourceLocation = typeof SourceLocation.Type

/** One portable structured Log Event. */
export const LogEvent = S.Struct({
  category: S.String,
  directQuote: S.OptionFromNullOr(S.String),
  id: S.String,
  level: LogLevel,
  message: S.String,
  metadata: S.Record(S.String, S.String),
  name: S.String,
  source: S.OptionFromNullOr(SourceLocation),
  timestampMs: S.Number,
})
/** One portable structured Log Event. */
export type LogEvent = typeof LogEvent.Type
