import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import { type InstantToolsDatabaseWithFiles } from '@foldkit/instant-tools/instant'

/**
 * Where a page can show one file stored with an Issue: its `$files` id and the
 * signed address Instant gives the signed-in owner, such as
 * `{ fileId: 'f6b42826-…', url: 'https://files.instantdb.com/…' }`.
 */
export const IssueFileAddress = S.Struct({
  fileId: S.String,
  url: S.String,
})
/** Where a page can show one file stored with an Issue. */
export type IssueFileAddress = typeof IssueFileAddress.Type

/** Reading an Issue's stored files failed, such as when the rules refuse them. */
export class IssueFilesError extends Data.TaggedError('IssueFilesError')<{
  readonly cause: unknown
}> {}

/** The addresses of the files stored with one Issue, as they change. */
export type IssueFilesService = Readonly<{
  observeIssueFiles: (
    issueId: string,
  ) => Stream.Stream<ReadonlyArray<IssueFileAddress>, IssueFilesError>
}>

/** A controlled dependency for the addresses of an Issue's stored files. */
export class IssueFiles extends Context.Service<
  IssueFiles,
  IssueFilesService
>()('issues-example/IssueFiles') {}

/** Hosts with no file storage, such as previews and tests: no addresses. */
export const NoIssueFiles: IssueFilesService = {
  observeIssueFiles: () => Stream.succeed([]),
}

const StoredFiles = S.Struct({
  instantToolsIssues: S.Array(
    S.Struct({
      files: S.optionalKey(
        S.Array(S.Struct({ id: S.String, url: S.optionalKey(S.Unknown) })),
      ),
    }),
  ),
})

const addressesOf = (data: unknown): ReadonlyArray<IssueFileAddress> =>
  Array.flatMap(
    S.decodeUnknownSync(StoredFiles)(data).instantToolsIssues,
    record =>
      Array.flatMap(record.files ?? [], file =>
        typeof file.url === 'string' && file.url !== ''
          ? [IssueFileAddress.make({ fileId: file.id, url: file.url })]
          : [],
      ),
  )

/**
 * The files linked to an Issue's record (`instantToolsIssues.files`) with
 * their signed addresses. The tracker's rules let only the owner's signed-in
 * email view `$files`, so a guest gets none and the pictures stay private.
 */
export const instantIssueFiles = (
  database: InstantToolsDatabaseWithFiles,
): IssueFilesService => ({
  observeIssueFiles: issueId =>
    Stream.callback<ReadonlyArray<IssueFileAddress>, IssueFilesError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              instantToolsIssues: {
                $: { where: { issueID: issueId } },
                files: {},
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(new IssueFilesError({ cause: response.error })),
                )
              } else {
                const maybeAddresses = Option.liftThrowable(addressesOf)(
                  response.data,
                )
                if (Option.isSome(maybeAddresses)) {
                  Queue.offerUnsafe(queue, maybeAddresses.value)
                } else {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new IssueFilesError({
                        cause: new Error(
                          `Issue ${issueId}: Instant answered with files this page cannot read.`,
                        ),
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

/** Why an Issue's files could not be read, in words a person reads. */
export const describeIssueFilesError = (error: IssueFilesError): string => {
  const cause = error.cause
  if (cause instanceof Error) {
    return cause.message
  }
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    return String(cause.message)
  }
  return String(cause)
}
