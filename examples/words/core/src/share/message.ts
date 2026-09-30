import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import {
  RecordingShare,
  ShareRecipient,
  ShareVisibility,
  SharedRange,
} from './model.js'

// MESSAGE

/** The listener opened the share sheet for a recording, covering the given sections. */
export const ClickedShareRecording = m('ClickedShareRecording', {
  recordingID: S.String,
  rangeStartIndex: S.Number,
  rangeEndIndex: S.Number,
})
/** The listener closed the share sheet. */
export const ClickedCloseShareSheet = m('ClickedCloseShareSheet')
/** The listener chose who the share reaches. */
export const ChangedShareVisibility = m('ChangedShareVisibility', {
  visibility: ShareVisibility,
})
/** The listener typed recipients. */
export const UpdatedShareRecipients = m('UpdatedShareRecipients', {
  value: S.String,
})
/** The listener picked someone they shared with before. */
export const ClickedSuggestedRecipient = m('ClickedSuggestedRecipient', {
  email: S.String,
})
/** The listener moved the start of the shared range. */
export const ChangedShareRangeStart = m('ChangedShareRangeStart', {
  segmentIndex: S.Number,
})
/** The listener moved the end of the shared range. */
export const ChangedShareRangeEnd = m('ChangedShareRangeEnd', {
  segmentIndex: S.Number,
})
/** The listener typed a note for the recipients. */
export const UpdatedShareNote = m('UpdatedShareNote', { value: S.String })
/** The listener pressed Share. */
export const SubmittedShareForm = m('SubmittedShareForm')
/** The share rows are in Instant; `maybeLink` is the link a link share opens. */
export const SucceededCreateShares = m('SucceededCreateShares', {
  shareCount: S.Number,
  maybeLink: S.Option(S.String),
})
/** Instant did not accept the shares. */
export const FailedCreateShares = m('FailedCreateShares', { reason: S.String })
/** The listener copied a share's link. */
export const ClickedCopyShareLink = m('ClickedCopyShareLink', {
  link: S.String,
})
/** The listener revoked a share. */
export const ClickedRevokeShare = m('ClickedRevokeShare', {
  shareID: S.String,
})
/** The share is gone. */
export const SucceededRevokeShare = m('SucceededRevokeShare')
/** Revoking the share failed. */
export const FailedRevokeShare = m('FailedRevokeShare', { reason: S.String })
/** A snapshot of the open recording's shares arrived. */
export const ObservedRecordingShares = m('ObservedRecordingShares', {
  shares: S.Array(RecordingShare),
})
/** The open recording's shares could not load. */
export const FailedObserveRecordingShares = m('FailedObserveRecordingShares', {
  reason: S.String,
})
/** A snapshot of the people the owner shared with before arrived. */
export const ObservedShareRecipients = m('ObservedShareRecipients', {
  recipients: S.Array(ShareRecipient),
})
/** A snapshot of the shares other accounts made to this one arrived, newest first. */
export const ObservedReceivedShares = m('ObservedReceivedShares', {
  shares: S.Array(RecordingShare),
})
/** A share link opened; `None` means the share is missing or not shared with this account. */
export const ObservedSharedRange = m('ObservedSharedRange', {
  shareID: S.String,
  maybeRange: S.Option(SharedRange),
})
/** The share link could not load. */
export const FailedObserveSharedRange = m('FailedObserveSharedRange', {
  shareID: S.String,
  reason: S.String,
})
/**
 * The server confirmed the share is missing, turned off, or not shared with
 * the viewer the question was asked for; `None` before sign-in.
 */
export const ConfirmedMissingSharedRange = m('ConfirmedMissingSharedRange', {
  shareID: S.String,
  maybeViewerUserID: S.Option(S.String),
})
/** The server has the share; its snapshot will follow. */
export const ConfirmedSharedRangeExists = m('ConfirmedSharedRangeExists', {
  shareID: S.String,
  maybeViewerUserID: S.Option(S.String),
})
/** The listener opened a share link. */
export const OpenedSharedRange = m('OpenedSharedRange', { shareID: S.String })
/** The listener left the share link. */
export const ClosedSharedRange = m('ClosedSharedRange')
/** The viewer is now a reader of the share. */
export const SucceededClaimShare = m('SucceededClaimShare')
/** Claiming the share failed. */
export const FailedClaimShare = m('FailedClaimShare', { reason: S.String })

/** Every share Message. */
export const Message = S.Union([
  ClickedShareRecording,
  ClickedCloseShareSheet,
  ChangedShareVisibility,
  UpdatedShareRecipients,
  ClickedSuggestedRecipient,
  ChangedShareRangeStart,
  ChangedShareRangeEnd,
  UpdatedShareNote,
  SubmittedShareForm,
  SucceededCreateShares,
  FailedCreateShares,
  ClickedCopyShareLink,
  ClickedRevokeShare,
  SucceededRevokeShare,
  FailedRevokeShare,
  ObservedRecordingShares,
  FailedObserveRecordingShares,
  ObservedShareRecipients,
  ObservedReceivedShares,
  ObservedSharedRange,
  FailedObserveSharedRange,
  ConfirmedMissingSharedRange,
  ConfirmedSharedRangeExists,
  OpenedSharedRange,
  ClosedSharedRange,
  SucceededClaimShare,
  FailedClaimShare,
])
/** Every share Message. */
export type Message = typeof Message.Type

// OUT MESSAGE

/** The share asks the page to copy text and show a notice. */
export const RequestedShareCopy = m('RequestedShareCopy', {
  text: S.String,
  noticeText: S.String,
})
/** The share asks the page to show a notice. */
export const RequestedShareNotice = m('RequestedShareNotice', {
  text: S.String,
  isFailure: S.Boolean,
})

/** What the share Submodel tells the page. */
export const OutMessage = S.Union([RequestedShareCopy, RequestedShareNotice])
/** What the share Submodel tells the page. */
export type OutMessage = typeof OutMessage.Type
