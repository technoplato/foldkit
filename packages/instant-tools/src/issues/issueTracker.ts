import {
  Context,
  Data,
  Effect,
  Option,
  Predicate,
  Schema as S,
  Stream,
} from 'effect'

import { Issue, IssueStatus } from './domain.js'

/** A portable filter for Issue store queries. */
export const IssueQuery = S.Struct({
  limit: S.Int,
  productId: S.Option(S.String),
  projectId: S.Option(S.String),
  statuses: S.Array(IssueStatus),
})
/** A portable filter for Issue store queries. */
export type IssueQuery = typeof IssueQuery.Type

/** An Issue tracker transport failed to query or persist its data. */
export class IssueTrackerError extends Data.TaggedError('IssueTrackerError')<{
  readonly cause: unknown
  readonly operation:
    | 'Delete'
    | 'Fetch'
    | 'FetchIssue'
    | 'File'
    | 'Observe'
    | 'ObserveIssue'
    | 'Save'
    | 'Update'
}> {}

/**
 * One change to a stored Issue and the check that it landed. Adding a
 * work-log entry applies `workLog: [...workLog, entry]` and has landed once the
 * Issue read back from the store holds an entry with that id.
 */
export type IssueChange = Readonly<{
  apply: (issue: Issue) => Issue
  hasLanded: (issue: Issue) => boolean
}>

/** The side-effecting capability required by an Issue tracking Feature. */
export type IssueTrackerService = Readonly<{
  /** Deletes one Issue by number and returns what it held. */
  delete: (issueId: string) => Effect.Effect<Issue, IssueTrackerError>
  fetch: (
    query: IssueQuery,
  ) => Effect.Effect<ReadonlyArray<Issue>, IssueTrackerError>
  /** Reads one Issue by number, in any spelling `normalizeIssueId` reads. */
  fetchIssue: (
    issueId: string,
  ) => Effect.Effect<Option.Option<Issue>, IssueTrackerError>
  /**
   * Files a new Issue under the next free number. It never changes a stored
   * Issue: when another writer takes the number first, it takes the next one.
   */
  file: (
    makeIssue: (issueId: string) => Issue,
  ) => Effect.Effect<Issue, IssueTrackerError>
  observe: (
    query: IssueQuery,
  ) => Stream.Stream<ReadonlyArray<Issue>, IssueTrackerError>
  observeIssue: (
    issueId: string,
  ) => Stream.Stream<Option.Option<Issue>, IssueTrackerError>
  save: (issue: Issue) => Effect.Effect<void, IssueTrackerError>
  /** Applies one change to a stored Issue and reads it back until it landed. */
  update: (
    issueId: string,
    change: IssueChange,
  ) => Effect.Effect<Issue, IssueTrackerError>
}>

/** An injected Issue store whose implementation is selected by the host. */
export class IssueTracker extends Context.Service<
  IssueTracker,
  IssueTrackerService
>()('@foldkit/instant-tools/IssueTracker') {}

const describeBody = (body: unknown): Option.Option<string> => {
  if (!Predicate.isObject(body)) {
    return Option.none()
  }
  const message = Predicate.hasProperty(body, 'message')
    ? String(body.message)
    : ''
  const hint = Predicate.hasProperty(body, 'hint')
    ? JSON.stringify(body.hint)
    : ''
  if (message === '' && hint === '') {
    return Option.none()
  }
  return Option.some(hint === '' ? message : `${message} (${hint})`)
}

/**
 * Names a failure's real cause, following nested causes. A tracker error
 * whose cause is the store's `CreateIssue` failure, caused in turn by Instant
 * refusing the write, reads `File: CreateIssue: Permission denied`. Instant's
 * own errors add the server's message and hint.
 */
export const describeIssueTrackerCause = (cause: unknown): string => {
  if (
    Predicate.hasProperty(cause, 'operation') &&
    Predicate.hasProperty(cause, 'cause') &&
    Predicate.isString(cause.operation)
  ) {
    return `${cause.operation}: ${describeIssueTrackerCause(cause.cause)}`
  }
  const maybeBody = Predicate.hasProperty(cause, 'body')
    ? describeBody(cause.body)
    : Option.none()
  if (cause instanceof Error) {
    const message = cause.message === '' ? cause.name : cause.message
    const withBody = Option.match(maybeBody, {
      onNone: () => message,
      onSome: body =>
        message.includes(body) ? message : `${message}: ${body}`,
    })
    return cause.cause === undefined
      ? withBody
      : `${withBody}: ${describeIssueTrackerCause(cause.cause)}`
  }
  if (Option.isSome(maybeBody)) {
    return maybeBody.value
  }
  if (Predicate.isString(cause)) {
    return cause
  }
  try {
    return JSON.stringify(cause) ?? String(cause)
  } catch {
    return String(cause)
  }
}

/** Names an Issue tracker failure's operation and its real cause. */
export const describeIssueTrackerError = (error: IssueTrackerError): string =>
  describeIssueTrackerCause(error)
