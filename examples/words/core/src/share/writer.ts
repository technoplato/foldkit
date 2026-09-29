import {
  Array,
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  Option,
  Record,
} from 'effect'

import { shareRecipientIDOf } from '../ids.js'
import type { WordsDatabase } from '../store.js'
import type { ShareRecipient, ShareVisibility } from './model.js'

/** Which share write failed. */
export type ShareWriteOperation = 'CreateShares' | 'RevokeShare' | 'ClaimShare'

/** Instant refused a share write, or did not confirm it in time. */
export class ShareWriteError extends Data.TaggedError('ShareWriteError')<{
  readonly operation: ShareWriteOperation
  readonly cause: unknown
}> {}

/** One end of a shared range: a final section. */
export type ShareEndpoint = Readonly<{
  id: string
  index: number
  startSeconds: number
  endSeconds: number
}>

/** Someone a new share reaches, with their earlier recipient row if there is one. */
export type ShareTarget = Readonly<{
  email: string
  maybeExisting: Option.Option<ShareRecipient>
}>

/** Everything one Share press writes (ADR 0014 section 8). */
export type ShareCreation = Readonly<{
  recordingID: string
  ownerUserID: string
  sharedBy: string
  first: ShareEndpoint
  last: ShareEndpoint
  segmentIDs: ReadonlyArray<string>
  maybeNote: Option.Option<string>
  visibility: ShareVisibility
  targets: ReadonlyArray<ShareTarget>
}>

/** The rows one Share press created; a link share also has its secret token. */
export type CreatedShares = Readonly<{
  shareIDs: ReadonlyArray<string>
  maybeLinkShare: Option.Option<Readonly<{ shareID: string; token: string }>>
}>

/** The share writes web Scribe makes. */
export type ShareWriterService = Readonly<{
  createShares: (
    creation: ShareCreation,
  ) => Effect.Effect<CreatedShares, ShareWriteError>
  revokeShare: (shareID: string) => Effect.Effect<void, ShareWriteError>
  claimShare: (
    shareID: string,
    readerUserID: string,
    maybeLinkToken: Option.Option<string>,
  ) => Effect.Effect<void, ShareWriteError>
}>

/** The share writes web Scribe makes, chosen by the host. */
export class ShareWriter extends Context.Service<
  ShareWriter,
  ShareWriterService
>()('words-core-example/ShareWriter') {}

const WRITE_TIMEOUT = Duration.seconds(5)
const LINK_TOKEN_BYTES = 32
const HEX_RADIX = 16

const bounded = <A>(
  operation: ShareWriteOperation,
  run: () => Promise<A>,
): Effect.Effect<A, ShareWriteError> =>
  Effect.tryPromise({
    try: run,
    catch: cause => new ShareWriteError({ operation, cause }),
  }).pipe(
    Effect.timeout(WRITE_TIMEOUT),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(
        new ShareWriteError({
          operation,
          cause: 'Instant did not confirm the write within 5 seconds.',
        }),
      ),
    ),
  )

const present = <Chunk>(maybeChunk: Chunk | undefined): Chunk => {
  if (maybeChunk === undefined) {
    throw new Error('Instant has no transaction builder for this entity.')
  } else {
    return maybeChunk
  }
}

const presentField = <Key extends string>(
  key: Key,
  maybeValue: Option.Option<string>,
): Partial<Record<Key, string>> =>
  Option.match(maybeValue, {
    onNone: () => ({}),
    onSome: value => Record.singleton(key, value),
  })

const newLinkToken = (): string =>
  Array.join(
    Array.map(
      Array.fromIterable(
        globalThis.crypto.getRandomValues(new Uint8Array(LINK_TOKEN_BYTES)),
      ),
      byte => byte.toString(HEX_RADIX).padStart(2, '0'),
    ),
    '',
  )

type PlannedShare = Readonly<{
  shareID: string
  maybeEmail: Option.Option<string>
  maybeToken: Option.Option<string>
}>

const planShares = (creation: ShareCreation): ReadonlyArray<PlannedShare> =>
  creation.visibility === 'Link'
    ? [
        {
          shareID: globalThis.crypto.randomUUID(),
          maybeEmail: Option.none(),
          maybeToken: Option.some(newLinkToken()),
        },
      ]
    : Array.map(creation.targets, target => ({
        shareID: globalThis.crypto.randomUUID(),
        maybeEmail: Option.some(target.email),
        maybeToken: Option.none(),
      }))

/** Share writes against Scribe's Instant app. */
export const makeLiveShareWriter = (database: WordsDatabase) =>
  Layer.succeed(ShareWriter, {
    createShares: creation =>
      Effect.gen(function* () {
        const planned = planShares(creation)
        const recipientIDs = yield* Effect.forEach(
          creation.visibility === 'People' ? creation.targets : [],
          target =>
            Effect.map(
              shareRecipientIDOf(creation.ownerUserID, target.email),
              id => ({ id, target }),
            ),
        )
        yield* bounded('CreateShares', () => {
          const writtenAtMs = Date.now()
          const shareChunks = Array.map(planned, share =>
            present(database.tx.recordingSegmentShares[share.shareID])
              .update({
                ownerUserID: creation.ownerUserID,
                recordingID: creation.recordingID,
                firstSegmentID: creation.first.id,
                lastSegmentID: creation.last.id,
                firstSegmentIndex: creation.first.index,
                lastSegmentIndex: creation.last.index,
                startSeconds: creation.first.startSeconds,
                endSeconds: creation.last.endSeconds,
                visibility: creation.visibility === 'Link' ? 'link' : 'people',
                ...presentField('recipientEmail', share.maybeEmail),
                ...presentField('linkToken', share.maybeToken),
                sharedByDisplayName: creation.sharedBy,
                ...presentField('note', creation.maybeNote),
                createdAtMs: writtenAtMs,
                updatedAtMs: writtenAtMs,
              })
              .link({
                owner: creation.ownerUserID,
                recording: creation.recordingID,
                segments: [...creation.segmentIDs],
              }),
          )
          const recipientChunks = Array.map(recipientIDs, ({ id, target }) =>
            present(database.tx.shareRecipients[id])
              .update({
                ownerUserID: creation.ownerUserID,
                email: target.email,
                lastSharedAtMs: writtenAtMs,
                shareCount:
                  Option.getOrElse(
                    Option.map(target.maybeExisting, row => row.shareCount),
                    () => 0,
                  ) + 1,
                createdAtMs: Option.getOrElse(
                  Option.map(target.maybeExisting, row => row.createdAtMs),
                  () => writtenAtMs,
                ),
                updatedAtMs: writtenAtMs,
              })
              .link({ owner: creation.ownerUserID }),
          )
          return database.transact([...shareChunks, ...recipientChunks])
        })
        return {
          shareIDs: Array.map(planned, share => share.shareID),
          maybeLinkShare: Option.flatMap(Array.head(planned), share =>
            Option.map(share.maybeToken, token => ({
              shareID: share.shareID,
              token,
            })),
          ),
        }
      }),
    revokeShare: shareID =>
      bounded('RevokeShare', () =>
        database.transact(
          present(database.tx.recordingSegmentShares[shareID]).delete(),
        ),
      ).pipe(Effect.asVoid),
    claimShare: (shareID, readerUserID, maybeLinkToken) =>
      bounded('ClaimShare', () => {
        const share = present(database.tx.recordingSegmentShares[shareID])
        return database.transact(
          Option.match(maybeLinkToken, {
            onNone: () => share.link({ readers: readerUserID }),
            onSome: k =>
              share.ruleParams({ k }).link({ readers: readerUserID }),
          }),
        )
      }).pipe(Effect.asVoid),
  })

/** A share writer that accepts every write, for tests and previews. */
export const makeAcceptingShareWriter = (
  written: Array<string> = [],
): Layer.Layer<ShareWriter> =>
  Layer.succeed(ShareWriter, {
    createShares: creation =>
      Effect.sync(() => {
        written.push(
          `createShares ${creation.visibility} ${creation.targets.length} ${creation.first.index}-${creation.last.index}`,
        )
        return {
          shareIDs: ['share-1'],
          maybeLinkShare:
            creation.visibility === 'Link'
              ? Option.some({ shareID: 'share-1', token: 'token-1' })
              : Option.none(),
        }
      }),
    revokeShare: shareID =>
      Effect.sync(() => {
        written.push(`revokeShare ${shareID}`)
      }),
    claimShare: shareID =>
      Effect.sync(() => {
        written.push(`claimShare ${shareID}`)
      }),
  })
