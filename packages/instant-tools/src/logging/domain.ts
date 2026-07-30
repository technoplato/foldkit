import { Array, Effect, Option, Schema as S } from 'effect'

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

/** A canonical viewer-ready reference from one Log Event to one Issue. */
export const IssueLogReference = S.Struct({
  issueID: S.String,
  viewerURL: S.String,
})
/** A canonical viewer-ready reference from one Log Event to one Issue. */
export type IssueLogReference = typeof IssueLogReference.Type

/** How a source path currently relates to an Issue under investigation. */
export const LogPathRelationship = S.Literals([
  'Suspected',
  'Contributing',
  'RuledOut',
])
/** How a source path currently relates to an Issue under investigation. */
export type LogPathRelationship = typeof LogPathRelationship.Type

/** A source path and the current strength of evidence connecting it to an Issue. */
export const LogContributingPath = S.Struct({
  path: S.String,
  reason: S.OptionFromNullOr(S.String),
  relationship: LogPathRelationship,
})
/** A source path and the current strength of evidence connecting it to an Issue. */
export type LogContributingPath = typeof LogContributingPath.Type

const LogContributingPaths = S.Array(LogContributingPath).pipe(
  S.withDecodingDefaultKey(Effect.succeed([])),
  S.withConstructorDefault(Effect.succeed([])),
)
const IssueLogReferences = S.Array(IssueLogReference).pipe(
  S.withDecodingDefaultKey(Effect.succeed([])),
  S.withConstructorDefault(Effect.succeed([])),
)

/** One portable structured Log Event. */
export const LogEvent = S.Struct({
  category: S.String,
  contributingPaths: LogContributingPaths,
  directQuote: S.OptionFromNullOr(S.String),
  id: S.String,
  issueReferences: IssueLogReferences,
  level: LogLevel,
  message: S.String,
  metadata: S.Record(S.String, S.String),
  name: S.String,
  source: S.OptionFromNullOr(SourceLocation),
  timestampMs: S.Number,
})
/** One portable structured Log Event. */
export type LogEvent = typeof LogEvent.Type

/** One denormalized log row returned directly by an Issue evidence query. */
export const IssueLogEvidence = S.Struct({
  category: S.String,
  contributingPaths: S.Array(LogContributingPath),
  issueID: S.String,
  level: S.String,
  logID: S.String,
  logNamespace: S.String,
  message: S.String,
  name: S.String,
  timestampMs: S.Number,
  viewerURL: S.String,
})
/** One denormalized log row returned directly by an Issue evidence query. */
export type IssueLogEvidence = typeof IssueLogEvidence.Type

/** Creates an ergonomic suspected-path value for a structured Log Event. */
export const suspectedPath = (
  path: string,
  reason?: string,
): LogContributingPath =>
  LogContributingPath.make({
    path,
    reason: Option.fromNullishOr(reason),
    relationship: 'Suspected',
  })

/** Creates an ergonomic contributing-path value for a structured Log Event. */
export const contributingPath = (
  path: string,
  reason?: string,
): LogContributingPath =>
  LogContributingPath.make({
    path,
    reason: Option.fromNullishOr(reason),
    relationship: 'Contributing',
  })

/** Creates an ergonomic ruled-out path value for a structured Log Event. */
export const ruledOutPath = (
  path: string,
  reason?: string,
): LogContributingPath =>
  LogContributingPath.make({
    path,
    reason: Option.fromNullishOr(reason),
    relationship: 'RuledOut',
  })

/** Adds canonical Issue references inferred from the message, quote, and Issue metadata. */
export const withInferredIssueReferences = (event: LogEvent): LogEvent => {
  const values = [event.message]
  if (Option.isSome(event.directQuote)) {
    values.push(event.directQuote.value)
  }
  for (const [key, value] of Object.entries(event.metadata)) {
    if (key.toLowerCase().includes('issue')) {
      values.push(value)
    }
  }

  const issueIDs = new Set(
    Array.map(event.issueReferences, reference => reference.issueID),
  )
  for (const value of values) {
    for (const match of value.matchAll(
      /(?:\bissue\s*(?:#|-)?\s*|#)([0-9]{1,6})\b/gi,
    )) {
      const maybeDigits = Array.get(match, 1)
      if (Option.isSome(maybeDigits)) {
        issueIDs.add(normalizeIssueID(maybeDigits.value))
      }
    }
    if (/^[0-9]+$/.test(value.trim())) {
      issueIDs.add(normalizeIssueID(value))
    }
  }

  const explicit = new Map(
    Array.map(event.issueReferences, reference => [
      reference.issueID,
      reference,
    ]),
  )
  return LogEvent.make({
    ...event,
    issueReferences: Array.fromIterable(issueIDs)
      .sort()
      .map(
        issueID =>
          explicit.get(issueID) ??
          IssueLogReference.make({
            issueID,
            viewerURL: `https://issues.knophy.com/issues/${issueID}`,
          }),
      ),
  })
}

const normalizeIssueID = (value: string): string => {
  const maybeMatch = Option.fromNullishOr(value.match(/[0-9]+/))
  const maybeDigits = Option.flatMap(maybeMatch, match => Array.head(match))
  const number = Number(Option.getOrElse(maybeDigits, () => value))
  return number < 1_000 ? String(number).padStart(3, '0') : String(number)
}
