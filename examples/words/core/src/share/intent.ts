import {
  ChangedShareRangeEnd,
  ChangedShareRangeStart,
  ChangedShareVisibility,
  ClickedCloseShareSheet,
  ClickedCopyShareLink,
  ClickedRevokeShare,
  ClickedShareRecording,
  ClickedSuggestedRecipient,
  FailedObserveRecordingShares,
  FailedObserveSharedRange,
  type Message,
  ObservedReceivedShares,
  ObservedRecordingShares,
  ObservedShareRecipients,
  ObservedSharedRange,
  SubmittedShareForm,
  UpdatedShareNote,
  UpdatedShareRecipients,
} from './message.js'

/** The listener opens the share sheet for a recording, covering the given sections. */
export const openShareSheet = (
  payload: Parameters<typeof ClickedShareRecording>[0],
): Message => ClickedShareRecording(payload)
/** The listener closes the share sheet. */
export const closeShareSheet = (): Message => ClickedCloseShareSheet()
/** The listener chooses who the share reaches. */
export const chooseVisibility = (
  payload: Parameters<typeof ChangedShareVisibility>[0],
): Message => ChangedShareVisibility(payload)
/** The listener types recipients. */
export const typeRecipients = (
  payload: Parameters<typeof UpdatedShareRecipients>[0],
): Message => UpdatedShareRecipients(payload)
/** The listener picks someone they shared with before. */
export const pickRecipient = (
  payload: Parameters<typeof ClickedSuggestedRecipient>[0],
): Message => ClickedSuggestedRecipient(payload)
/** The listener moves the start of the range. */
export const moveRangeStart = (
  payload: Parameters<typeof ChangedShareRangeStart>[0],
): Message => ChangedShareRangeStart(payload)
/** The listener moves the end of the range. */
export const moveRangeEnd = (
  payload: Parameters<typeof ChangedShareRangeEnd>[0],
): Message => ChangedShareRangeEnd(payload)
/** The listener types a note. */
export const typeNote = (
  payload: Parameters<typeof UpdatedShareNote>[0],
): Message => UpdatedShareNote(payload)
/** The listener presses Share. */
export const submitShare = (): Message => SubmittedShareForm()
/** The listener copies a share's link. */
export const copyShareLink = (
  payload: Parameters<typeof ClickedCopyShareLink>[0],
): Message => ClickedCopyShareLink(payload)
/** The listener revokes a share. */
export const revokeShare = (
  payload: Parameters<typeof ClickedRevokeShare>[0],
): Message => ClickedRevokeShare(payload)
/** A snapshot of the open recording's shares arrived. */
export const reportShares = (
  payload: Parameters<typeof ObservedRecordingShares>[0],
): Message => ObservedRecordingShares(payload)
/** The open recording's shares could not load. */
export const reportSharesFailure = (
  payload: Parameters<typeof FailedObserveRecordingShares>[0],
): Message => FailedObserveRecordingShares(payload)
/** A snapshot of the people shared with before arrived. */
export const reportRecipients = (
  payload: Parameters<typeof ObservedShareRecipients>[0],
): Message => ObservedShareRecipients(payload)
/** A snapshot of the shares other accounts made to this one arrived. */
export const reportReceivedShares = (
  payload: Parameters<typeof ObservedReceivedShares>[0],
): Message => ObservedReceivedShares(payload)
/** An opened share arrived, or is not readable. */
export const reportSharedRange = (
  payload: Parameters<typeof ObservedSharedRange>[0],
): Message => ObservedSharedRange(payload)
/** An opened share could not load. */
export const reportSharedRangeFailure = (
  payload: Parameters<typeof FailedObserveSharedRange>[0],
): Message => FailedObserveSharedRange(payload)
