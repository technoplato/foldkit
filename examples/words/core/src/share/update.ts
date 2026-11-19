import {
  Array,
  Effect,
  Equivalence,
  Match as M,
  Option,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { failureTextOf } from '../failure.js'
import { ShareRoute, scribeRouteToShareUrl } from '../link.js'
import { type SharingMode, isSameEmail } from '../origin.js'
import type { Section } from '../recording.js'
import { WordsStore, storeFailureReasonOf } from '../store.js'
import {
  ConfirmedMissingSharedRange,
  ConfirmedSharedRangeExists,
  FailedClaimShare,
  FailedCreateShares,
  FailedObserveSharedRange,
  FailedRevokeShare,
  type Message,
  type OutMessage,
  RequestedShareCopy,
  RequestedShareNotice,
  SucceededClaimShare,
  SucceededCreateShares,
  SucceededRevokeShare,
} from './message.js'
import {
  ClaimedShare,
  ClaimingShare,
  EditingShare,
  FailedClaim,
  FailedShareSave,
  FailedSharedRange,
  FailedShares,
  LoadedShares,
  LoadingShares,
  MissingSharedRange,
  type Model,
  NoClaim,
  NoSharedRange,
  OpeningSharedRange,
  ReadySharedRange,
  type RecordingShare,
  SavingShare,
  ShareRecipient,
  ShareSheetClosed,
  ShareSheetOpen,
  ShareVisibility,
  type SharedRange,
  isShareReady,
  recipientEmailsOf,
} from './model.js'
import { type ShareWriteError, ShareWriter } from './writer.js'

/** What the page knows that sharing needs. */
export type ShareContext = Readonly<{
  sharing: SharingMode
  maybeOwnerUserID: Option.Option<string>
  maybeSharedBy: Option.Option<string>
  sections: ReadonlyArray<Section>
  maybeViewer: Option.Option<
    Readonly<{ userID: string; maybeEmail: Option.Option<string> }>
  >
  maybeLinkToken: Option.Option<string>
}>

type Commands = ReadonlyArray<
  Command.Command<Message, never, ShareWriter | WordsStore>
>

/** The share update's result: the next Model, its Commands, and what it tells the page. */
export type UpdateReturn = readonly [Model, Commands, Option.Option<OutMessage>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const shareFailureOf = (error: ShareWriteError): string =>
  M.value(error.operation).pipe(
    M.withReturnType<string>(),
    M.when('CreateShares', () => 'The share did not save.'),
    M.when('RevokeShare', () => 'The share is still on.'),
    M.when('ClaimShare', () => 'It was not added to Shared with You.'),
    M.exhaustive,
  )

const reasonOf = (error: ShareWriteError): string =>
  failureTextOf(shareFailureOf(error), error.cause)

/** The link a share opens; a link share carries its secret token as `k`. */
export const shareLinkOf = (share: RecordingShare): string =>
  scribeRouteToShareUrl(
    ShareRoute({
      recordingID: share.recordingID,
      shareID: share.id,
      k: share.maybeLinkToken,
      m: Option.none(),
    }),
  )

const ShareEndpoint = S.Struct({
  id: S.String,
  index: S.Number,
  startSeconds: S.Number,
  endSeconds: S.Number,
})

const ShareTarget = S.Struct({
  email: S.String,
  maybeExisting: S.Option(ShareRecipient),
})

// COMMAND

/** Writes one share row per recipient, or one link share, with the recipient history (ADR 0014). */
export const CreateShares = Command.define(
  'CreateShares',
  {
    recordingID: S.String,
    ownerUserID: S.String,
    sharedBy: S.String,
    first: ShareEndpoint,
    last: ShareEndpoint,
    segmentIDs: S.Array(S.String),
    maybeNote: S.Option(S.String),
    visibility: ShareVisibility,
    targets: S.Array(ShareTarget),
  },
  SucceededCreateShares,
  FailedCreateShares,
)(creation =>
  ShareWriter.pipe(
    Effect.flatMap(writer => writer.createShares(creation)),
    Effect.map(created =>
      SucceededCreateShares({
        shareCount: Array.length(created.shareIDs),
        maybeLink: Option.map(created.maybeLinkShare, ({ shareID, token }) =>
          scribeRouteToShareUrl(
            ShareRoute({
              recordingID: creation.recordingID,
              shareID,
              k: Option.some(token),
              m: Option.none(),
            }),
          ),
        ),
      }),
    ),
    Effect.catch(error =>
      Effect.succeed(FailedCreateShares({ reason: reasonOf(error) })),
    ),
  ),
)

/** Deletes a share; its recipients can no longer read the range. */
export const RevokeShare = Command.define(
  'RevokeShare',
  { shareID: S.String },
  SucceededRevokeShare,
  FailedRevokeShare,
)(({ shareID }) =>
  ShareWriter.pipe(
    Effect.flatMap(writer => writer.revokeShare(shareID)),
    Effect.as(SucceededRevokeShare()),
    Effect.catch(error =>
      Effect.succeed(FailedRevokeShare({ reason: reasonOf(error) })),
    ),
  ),
)

/** Links the viewer as a reader of a share addressed to their email, so it shows on all their devices. */
export const ClaimShare = Command.define(
  'ClaimShare',
  {
    shareID: S.String,
    readerUserID: S.String,
    maybeLinkToken: S.Option(S.String),
  },
  SucceededClaimShare,
  FailedClaimShare,
)(({ shareID, readerUserID, maybeLinkToken }) =>
  ShareWriter.pipe(
    Effect.flatMap(writer =>
      writer.claimShare(shareID, readerUserID, maybeLinkToken),
    ),
    Effect.as(SucceededClaimShare()),
    Effect.catch(error =>
      Effect.succeed(FailedClaimShare({ reason: reasonOf(error) })),
    ),
  ),
)

/**
 * Asks the server whether a share link that came back empty exists for the
 * viewer signed in as `maybeViewerUserID`. Right after sign-in a new query
 * can first answer from what the browser read before signing in, so an empty
 * answer is checked before the page says the share is not available.
 */
export const ConfirmSharedRange = Command.define(
  'ConfirmSharedRange',
  {
    shareID: S.String,
    maybeLinkToken: S.Option(S.String),
    maybeViewerUserID: S.Option(S.String),
  },
  ConfirmedMissingSharedRange,
  ConfirmedSharedRangeExists,
  FailedObserveSharedRange,
)(({ shareID, maybeLinkToken, maybeViewerUserID }) =>
  WordsStore.pipe(
    Effect.flatMap(store => store.hasSharedRange(shareID, maybeLinkToken)),
    Effect.map(isPresent =>
      isPresent
        ? ConfirmedSharedRangeExists({ shareID, maybeViewerUserID })
        : ConfirmedMissingSharedRange({ shareID, maybeViewerUserID }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedObserveSharedRange({
          shareID,
          reason: storeFailureReasonOf(error),
        }),
      ),
    ),
  ),
)

// UPDATE

const noOutMessage = Option.none<OutMessage>()

const isSameViewer = Option.makeEquivalence(Equivalence.String)

const viewerUserIDOf = (context: ShareContext): Option.Option<string> =>
  Option.map(context.maybeViewer, viewer => viewer.userID)

const inOpenSheet = (
  model: Model,
  transform: (sheet: typeof ShareSheetOpen.Type) => typeof ShareSheetOpen.Type,
): UpdateReturn =>
  M.value(model.sheet).pipe(
    withUpdateReturn,
    M.tag('ShareSheetOpen', sheet => [
      evo(model, { sheet: () => transform(sheet) }),
      [],
      noOutMessage,
    ]),
    M.orElse(() => [model, [], noOutMessage]),
  )

const withTypedRecipient = (input: string, email: string): string => {
  const typed = String.split(input, /[\s,;]+/)
  const kept = Array.filter(Array.dropRight(typed, 1), part => part !== '')
  return `${Array.join([...kept, email], ', ')}, `
}

const endpointOf = (section: Section) => ({
  id: section.id,
  index: section.index,
  startSeconds: section.startSeconds,
  endSeconds: section.endSeconds,
})

const submit = (
  model: Model,
  sheet: typeof ShareSheetOpen.Type,
  context: ShareContext,
): UpdateReturn => {
  const failWith = (reason: string): UpdateReturn => [
    evo(model, {
      sheet: () =>
        evo(sheet, { submission: () => FailedShareSave({ reason }) }),
    }),
    [],
    noOutMessage,
  ]
  const inRange = Array.filter(
    context.sections,
    section =>
      section.isFinal &&
      section.index >= sheet.rangeStartIndex &&
      section.index <= sheet.rangeEndIndex,
  )
  const maybeEndpoints = Option.all([Array.head(inRange), Array.last(inRange)])
  if (context.sharing === 'AwaitingSchema') {
    return failWith(
      'Sharing is built and waiting for one approval: Scribe’s database needs the sharing fields from ADR 0014 before this page can save shares.',
    )
  } else if (!isShareReady(sheet)) {
    return failWith('Type at least one email address to share with.')
  } else {
    return pipe(
      Option.all({
        ownerUserID: context.maybeOwnerUserID,
        sharedBy: context.maybeSharedBy,
        endpoints: maybeEndpoints,
      }),
      Option.match({
        onNone: () =>
          failWith(
            'Pick a range of finished sections, and make sure you are signed in to Scribe.',
          ),
        onSome: ({ ownerUserID, sharedBy, endpoints: [first, last] }) => [
          evo(model, {
            sheet: () => evo(sheet, { submission: () => SavingShare() }),
          }),
          [
            CreateShares({
              recordingID: sheet.recordingID,
              ownerUserID,
              sharedBy,
              first: endpointOf(first),
              last: endpointOf(last),
              segmentIDs: Array.map(inRange, section => section.id),
              maybeNote: Option.filter(
                Option.some(sheet.note.trim()),
                note => note !== '',
              ),
              visibility: sheet.visibility,
              targets: Array.map(
                recipientEmailsOf(sheet.recipientsInput),
                email => ({
                  email,
                  maybeExisting: Array.findFirst(model.recipients, recipient =>
                    isSameEmail(recipient.email, email),
                  ),
                }),
              ),
            }),
          ],
          noOutMessage,
        ],
      }),
    )
  }
}

const nextClaimOf = (
  isClaimedByViewer: boolean,
  shouldClaim: boolean,
  currentClaim: (typeof ReadySharedRange.Type)['claim'],
): (typeof ReadySharedRange.Type)['claim'] => {
  if (isClaimedByViewer) {
    return ClaimedShare()
  } else if (shouldClaim) {
    return ClaimingShare()
  } else {
    return currentClaim
  }
}

const observedSharedRange = (
  model: Model,
  shareID: string,
  maybeRange: Option.Option<SharedRange>,
  context: ShareContext,
): UpdateReturn =>
  Option.match(maybeRange, {
    onNone: () =>
      M.value(model.sharedRange).pipe(
        withUpdateReturn,
        M.tag('OpeningSharedRange', opening =>
          opening.shareID === shareID
            ? [
                model,
                [
                  ConfirmSharedRange({
                    shareID,
                    maybeLinkToken: context.maybeLinkToken,
                    maybeViewerUserID: viewerUserIDOf(context),
                  }),
                ],
                noOutMessage,
              ]
            : [model, [], noOutMessage],
        ),
        M.orElse(() => [
          evo(model, { sharedRange: () => MissingSharedRange({ shareID }) }),
          [],
          noOutMessage,
        ]),
      ),
    onSome: range => {
      const currentClaim = M.value(model.sharedRange).pipe(
        M.tag('ReadySharedRange', ready => ready.claim),
        M.orElse(() => NoClaim()),
      )
      const maybeClaimer = Option.filter(context.maybeViewer, viewer =>
        Option.exists(viewer.maybeEmail, email =>
          Option.exists(range.share.maybeRecipientEmail, recipient =>
            isSameEmail(email, recipient),
          ),
        ),
      )
      const shouldClaim =
        context.sharing === 'Enabled' &&
        !range.isClaimedByViewer &&
        currentClaim._tag === 'NoClaim' &&
        Option.isSome(maybeClaimer)
      const nextClaim = nextClaimOf(
        range.isClaimedByViewer,
        shouldClaim,
        currentClaim,
      )
      return [
        evo(model, {
          sharedRange: () =>
            ReadySharedRange({ shareID, range, claim: nextClaim }),
        }),
        Option.match(maybeClaimer, {
          onNone: () => [],
          onSome: viewer =>
            shouldClaim
              ? [
                  ClaimShare({
                    shareID,
                    readerUserID: viewer.userID,
                    maybeLinkToken: context.maybeLinkToken,
                  }),
                ]
              : [],
        }),
        noOutMessage,
      ]
    },
  })

const inReadySharedRange = (
  model: Model,
  transform: (
    ready: typeof ReadySharedRange.Type,
  ) => typeof ReadySharedRange.Type,
): UpdateReturn =>
  M.value(model.sharedRange).pipe(
    withUpdateReturn,
    M.tag('ReadySharedRange', ready => [
      evo(model, { sharedRange: () => transform(ready) }),
      [],
      noOutMessage,
    ]),
    M.orElse(() => [model, [], noOutMessage]),
  )

/** Folds one share Message into the share Model. */
export const update = (
  model: Model,
  message: Message,
  context: ShareContext,
): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedShareRecording: ({
        recordingID,
        rangeStartIndex,
        rangeEndIndex,
      }) => [
        evo(model, {
          sheet: () =>
            ShareSheetOpen({
              recordingID,
              visibility: 'People',
              recipientsInput: '',
              rangeStartIndex,
              rangeEndIndex,
              note: '',
              submission: EditingShare(),
            }),
          shares: () => LoadingShares(),
        }),
        [],
        noOutMessage,
      ],
      ClickedCloseShareSheet: () => [
        evo(model, { sheet: () => ShareSheetClosed() }),
        [],
        noOutMessage,
      ],
      ChangedShareVisibility: ({ visibility }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, {
            visibility: () => visibility,
            submission: () => EditingShare(),
          }),
        ),
      UpdatedShareRecipients: ({ value }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, {
            recipientsInput: () => value,
            submission: () => EditingShare(),
          }),
        ),
      ClickedSuggestedRecipient: ({ email }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, {
            recipientsInput: input => withTypedRecipient(input, email),
            submission: () => EditingShare(),
          }),
        ),
      ChangedShareRangeStart: ({ segmentIndex }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, {
            rangeStartIndex: () => segmentIndex,
            rangeEndIndex: end => Math.max(end, segmentIndex),
          }),
        ),
      ChangedShareRangeEnd: ({ segmentIndex }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, {
            rangeEndIndex: () => segmentIndex,
            rangeStartIndex: start => Math.min(start, segmentIndex),
          }),
        ),
      UpdatedShareNote: ({ value }) =>
        inOpenSheet(model, sheet => evo(sheet, { note: () => value })),
      SubmittedShareForm: () =>
        M.value(model.sheet).pipe(
          withUpdateReturn,
          M.tag('ShareSheetOpen', sheet => submit(model, sheet, context)),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      SucceededCreateShares: ({ shareCount, maybeLink }) => {
        const [nextModel] = inOpenSheet(model, sheet =>
          evo(sheet, {
            recipientsInput: () => '',
            note: () => '',
            submission: () => EditingShare(),
          }),
        )
        return [
          nextModel,
          [],
          Option.some(
            Option.match(maybeLink, {
              onNone: () =>
                RequestedShareNotice({
                  text:
                    shareCount === 1
                      ? 'Shared with 1 person'
                      : `Shared with ${shareCount} people`,
                  isFailure: false,
                }),
              onSome: link =>
                RequestedShareCopy({
                  text: link,
                  noticeText:
                    'Copied the link. Anyone with it can read the range.',
                }),
            }),
          ),
        ]
      },
      FailedCreateShares: ({ reason }) =>
        inOpenSheet(model, sheet =>
          evo(sheet, { submission: () => FailedShareSave({ reason }) }),
        ),
      ClickedCopyShareLink: ({ link }) => [
        model,
        [],
        Option.some(
          RequestedShareCopy({ text: link, noticeText: 'Copied link' }),
        ),
      ],
      ClickedRevokeShare: ({ shareID }) => [
        model,
        [RevokeShare({ shareID })],
        noOutMessage,
      ],
      SucceededRevokeShare: () => [
        model,
        [],
        Option.some(
          RequestedShareNotice({ text: 'Stopped sharing', isFailure: false }),
        ),
      ],
      FailedRevokeShare: ({ reason }) => [
        model,
        [],
        Option.some(
          RequestedShareNotice({
            text: `Could not stop sharing: ${reason}`,
            isFailure: true,
          }),
        ),
      ],
      ObservedRecordingShares: ({ shares }) => [
        evo(model, { shares: () => LoadedShares({ shares }) }),
        [],
        noOutMessage,
      ],
      FailedObserveRecordingShares: ({ reason }) => [
        evo(model, { shares: () => FailedShares({ reason }) }),
        [],
        noOutMessage,
      ],
      ObservedShareRecipients: ({ recipients }) => [
        evo(model, { recipients: () => recipients }),
        [],
        noOutMessage,
      ],
      ObservedReceivedShares: ({ shares }) => [
        evo(model, { received: () => shares }),
        [],
        noOutMessage,
      ],
      OpenedSharedRange: ({ shareID }) => [
        evo(model, { sharedRange: () => OpeningSharedRange({ shareID }) }),
        [],
        noOutMessage,
      ],
      ClosedSharedRange: () => [
        evo(model, { sharedRange: () => NoSharedRange() }),
        [],
        noOutMessage,
      ],
      ObservedSharedRange: ({ shareID, maybeRange }) =>
        observedSharedRange(model, shareID, maybeRange, context),
      FailedObserveSharedRange: ({ shareID, reason }) => [
        evo(model, {
          sharedRange: () => FailedSharedRange({ shareID, reason }),
        }),
        [],
        noOutMessage,
      ],
      ConfirmedMissingSharedRange: ({ shareID, maybeViewerUserID }) =>
        M.value(model.sharedRange).pipe(
          withUpdateReturn,
          M.tag('OpeningSharedRange', opening =>
            opening.shareID === shareID &&
            isSameViewer(maybeViewerUserID, viewerUserIDOf(context))
              ? [
                  evo(model, {
                    sharedRange: () => MissingSharedRange({ shareID }),
                  }),
                  [],
                  noOutMessage,
                ]
              : [model, [], noOutMessage],
          ),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      ConfirmedSharedRangeExists: () => [model, [], noOutMessage],
      SucceededClaimShare: () =>
        inReadySharedRange(model, ready =>
          evo(ready, { claim: () => ClaimedShare() }),
        ),
      FailedClaimShare: ({ reason }) =>
        inReadySharedRange(model, ready =>
          evo(ready, { claim: () => FailedClaim({ reason }) }),
        ),
    }),
  )
