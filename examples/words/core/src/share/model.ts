import {
  Array,
  Match as M,
  Option,
  Order,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { ts } from 'foldkit/schema'

import { Section } from '../recording.js'

// MODEL

/** Who a share reaches: named people by email, or anyone holding the secret link. */
export const ShareVisibility = S.Literals(['People', 'Link'])
/** Who a share reaches. */
export type ShareVisibility = typeof ShareVisibility.Type

/** One range share of a recording (ADR 0014), as its owner sees it. */
export const RecordingShare = S.Struct({
  id: S.String,
  recordingID: S.String,
  visibility: ShareVisibility,
  maybeRecipientEmail: S.Option(S.String),
  maybeLinkToken: S.Option(S.String),
  firstSegmentIndex: S.Number,
  lastSegmentIndex: S.Number,
  startSeconds: S.Number,
  endSeconds: S.Number,
  maybeNote: S.Option(S.String),
  maybeSharedBy: S.Option(S.String),
  createdAtMs: S.Number,
})
/** One range share of a recording, as its owner sees it. */
export type RecordingShare = typeof RecordingShare.Type

/** Someone the owner has shared with before, for autocomplete. */
export const ShareRecipient = S.Struct({
  id: S.String,
  email: S.String,
  maybeDisplayName: S.Option(S.String),
  lastSharedAtMs: S.Number,
  shareCount: S.Number,
  createdAtMs: S.Number,
})
/** Someone the owner has shared with before. */
export type ShareRecipient = typeof ShareRecipient.Type

/** The share sheet is editing. */
export const EditingShare = ts('EditingShare')
/** The share is being written to Instant. */
export const SavingShare = ts('SavingShare')
/** Writing the share failed. */
export const FailedShareSave = ts('FailedShareSave', { reason: S.String })
/** Where the share sheet's Share button stands. */
export const ShareSubmission = S.Union([
  EditingShare,
  SavingShare,
  FailedShareSave,
])
/** Where the share sheet's Share button stands. */
export type ShareSubmission = typeof ShareSubmission.Type

/** No share sheet. */
export const ShareSheetClosed = ts('ShareSheetClosed')
/**
 * The share sheet for one recording: the range of sections, who it reaches,
 * the recipients typed so far, and a note.
 */
export const ShareSheetOpen = ts('ShareSheetOpen', {
  recordingID: S.String,
  visibility: ShareVisibility,
  recipientsInput: S.String,
  rangeStartIndex: S.Number,
  rangeEndIndex: S.Number,
  note: S.String,
  submission: ShareSubmission,
})
/** Whether the share sheet is open. */
export const ShareSheet = S.Union([ShareSheetClosed, ShareSheetOpen])
/** Whether the share sheet is open. */
export type ShareSheet = typeof ShareSheet.Type

/** Waiting for a recording's shares. */
export const LoadingShares = ts('LoadingShares')
/** A recording's shares, newest first. */
export const LoadedShares = ts('LoadedShares', {
  shares: S.Array(RecordingShare),
})
/** A recording's shares could not load. */
export const FailedShares = ts('FailedShares', { reason: S.String })
/** Where the open recording's shares stand. */
export const SharesState = S.Union([LoadingShares, LoadedShares, FailedShares])
/** Where the open recording's shares stand. */
export type SharesState = typeof SharesState.Type

/** The share carries no audio clip. */
export const NoSharedAudio = ts('NoSharedAudio')
/** The share's audio clip is still being cut or uploaded by the sharer's device. */
export const PreparingSharedAudio = ts('PreparingSharedAudio')
/**
 * The share's audio clip (ADR 0044), ready to play: its file's URL and its
 * length when the sharer's device wrote one. A share of lines that are not next
 * to each other is still one clip, its blocks back to back.
 */
export const ReadySharedAudio = ts('ReadySharedAudio', {
  url: S.String,
  maybeDurationSeconds: S.Option(S.Number),
})
/** The sharer's device could not make or upload the clip. */
export const FailedSharedAudio = ts('FailedSharedAudio')
/** Where a share's audio clip stands. */
export const SharedAudio = S.Union([
  NoSharedAudio,
  PreparingSharedAudio,
  ReadySharedAudio,
  FailedSharedAudio,
])
/** Where a share's audio clip stands. */
export type SharedAudio = typeof SharedAudio.Type

/**
 * One image in a share as its readers see it (ADR 0014 section 14.1): faces
 * and personal text filled black in a new JPEG, at its time in the recording.
 */
export const ScrubbedImage = S.Struct({
  id: S.String,
  attachmentID: S.String,
  offsetSeconds: S.Number,
  url: S.String,
  maybeWidth: S.Option(S.Number),
  maybeHeight: S.Option(S.Number),
})
/** One image in a share as its readers see it. */
export type ScrubbedImage = typeof ScrubbedImage.Type

/** The scrubber has not passed the whole share yet; lines show as each passes. */
export const PendingScrub = ts('PendingScrub')
/** The scrubber passed the share. */
export const PassedScrub = ts('PassedScrub')
/** The scrubber could not check the share, so nothing in it is shown. */
export const WithheldScrub = ts('WithheldScrub', {
  maybeReason: S.Option(S.String),
})
/**
 * Where a share's scrubbed copy stands (ADR 0014 section 13.11): nothing of a
 * share reaches a reader until the scrubbing step has passed it.
 */
export const ScrubState = S.Union([PendingScrub, PassedScrub, WithheldScrub])
/** Where a share's scrubbed copy stands. */
export type ScrubState = typeof ScrubState.Type

/**
 * The share a share link opens, as its readers may read it (ADR 0014 section
 * 13.11): the share row, its scrubbed title and note, its passed scrubbed lines
 * in order, its passed scrubbed images, and its audio clip. Never the original
 * sections, the recording, or the owner's note.
 */
export const SharedRange = S.Struct({
  share: RecordingShare,
  maybeTitle: S.Option(S.String),
  maybeNote: S.Option(S.String),
  scrub: ScrubState,
  lines: S.Array(Section),
  images: S.Array(ScrubbedImage),
  isClaimedByViewer: S.Boolean,
  audio: SharedAudio,
})
/** The shared range a share link opens. */
export type SharedRange = typeof SharedRange.Type

/** The share is not claimed, and does not need to be. */
export const NoClaim = ts('NoClaim')
/** Linking the viewer as a reader of the share. */
export const ClaimingShare = ts('ClaimingShare')
/** The viewer is a reader of the share on every device of their account. */
export const ClaimedShare = ts('ClaimedShare')
/** Claiming the share failed. */
export const FailedClaim = ts('FailedClaim', { reason: S.String })
/** Where the viewer's claim on a share stands. */
export const ClaimState = S.Union([
  NoClaim,
  ClaimingShare,
  ClaimedShare,
  FailedClaim,
])
/** Where the viewer's claim on a share stands. */
export type ClaimState = typeof ClaimState.Type

/** No share link is open. */
export const NoSharedRange = ts('NoSharedRange')
/** A share link is opening. */
export const OpeningSharedRange = ts('OpeningSharedRange', {
  shareID: S.String,
})
/** The share link opened. */
export const ReadySharedRange = ts('ReadySharedRange', {
  shareID: S.String,
  range: SharedRange,
  claim: ClaimState,
})
/** The share does not exist or is not shared with this account. */
export const MissingSharedRange = ts('MissingSharedRange', {
  shareID: S.String,
})
/** The share could not load. */
export const FailedSharedRange = ts('FailedSharedRange', {
  shareID: S.String,
  reason: S.String,
})
/** Where an opened share link stands. */
export const SharedRangeState = S.Union([
  NoSharedRange,
  OpeningSharedRange,
  ReadySharedRange,
  MissingSharedRange,
  FailedSharedRange,
])
/** Where an opened share link stands. */
export type SharedRangeState = typeof SharedRangeState.Type

/**
 * The share Submodel. `received` holds the shares other accounts made to this
 * one, newest first: the list marks their recordings as shared and opens them
 * at the share.
 */
export const Model = S.Struct({
  sheet: ShareSheet,
  shares: SharesState,
  recipients: S.Array(ShareRecipient),
  sharedRange: SharedRangeState,
  received: S.Array(RecordingShare),
})
/** The share Submodel. */
export type Model = typeof Model.Type

// INIT

/** Nothing shared or open. */
export const init = (): Model => ({
  sheet: ShareSheetClosed(),
  shares: LoadingShares(),
  recipients: [],
  sharedRange: NoSharedRange(),
  received: [],
})

// SELECTOR

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The recipients typed in the share sheet, lowercased and trimmed, without repeats. */
export const recipientEmailsOf = (input: string): ReadonlyArray<string> =>
  pipe(
    String.split(input, /[\s,;]+/),
    Array.map(email => email.trim().toLowerCase()),
    Array.filter(email => emailPattern.test(email)),
    Array.dedupe,
  )

/** The last, unfinished recipient the listener is typing, for autocomplete. */
export const typedRecipientPrefixOf = (input: string): string =>
  Option.getOrElse(Array.last(String.split(input, /[\s,;]+/)), () => '')
    .trim()
    .toLowerCase()

/** Recipients whose email or name starts with what is being typed, newest first. */
export const suggestedRecipientsOf = (
  recipients: ReadonlyArray<ShareRecipient>,
  input: string,
): ReadonlyArray<ShareRecipient> => {
  const prefix = typedRecipientPrefixOf(input)
  const alreadyTyped = recipientEmailsOf(input)
  return pipe(
    recipients,
    Array.filter(
      recipient =>
        !Array.contains(alreadyTyped, recipient.email) &&
        (prefix === '' ||
          recipient.email.startsWith(prefix) ||
          Option.exists(recipient.maybeDisplayName, name =>
            name.toLowerCase().startsWith(prefix),
          )),
    ),
    Array.take(5),
  )
}

/** Whether the share sheet can be submitted as typed. */
export const isShareReady = (sheet: typeof ShareSheetOpen.Type): boolean =>
  M.value(sheet.visibility).pipe(
    M.withReturnType<boolean>(),
    M.when('People', () =>
      Array.isReadonlyArrayNonEmpty(recipientEmailsOf(sheet.recipientsInput)),
    ),
    M.when('Link', () => true),
    M.exhaustive,
  ) && sheet.rangeStartIndex <= sheet.rangeEndIndex

/** A scrubbed line in a share's page. */
export const SharedLineItem = ts('SharedLineItem', { line: Section })
/** A scrubbed image in a share's page. */
export const SharedImageItem = ts('SharedImageItem', { image: ScrubbedImage })
/** One thing a share's page lists, in time order. */
export const SharedItem = S.Union([SharedLineItem, SharedImageItem])
/** One thing a share's page lists, in time order. */
export type SharedItem = typeof SharedItem.Type

const IMAGE_AFTER_LINE_AT_SAME_TIME = 1

const itemTimeOf = (item: SharedItem): readonly [number, number] =>
  M.value(item).pipe(
    M.withReturnType<readonly [number, number]>(),
    M.tagsExhaustive({
      SharedLineItem: ({ line }) => [line.startSeconds, 0],
      SharedImageItem: ({ image }) => [
        image.offsetSeconds,
        IMAGE_AFTER_LINE_AT_SAME_TIME,
      ],
    }),
  )

const byItemTime = Order.mapInput(
  Order.Tuple([Order.Number, Order.Number]),
  itemTimeOf,
)

/** A share's lines and images in time order: each image after the lines that start before it. */
export const sharedItemsOf = (range: SharedRange): ReadonlyArray<SharedItem> =>
  Array.sort(
    [
      ...Array.map(range.lines, line => SharedLineItem({ line })),
      ...Array.map(range.images, image => SharedImageItem({ image })),
    ],
    byItemTime,
  )
