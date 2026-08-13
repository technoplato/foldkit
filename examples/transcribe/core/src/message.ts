import { Schema as S } from "effect"

import { Transcript, Word } from "./catalog.js"
import { CatalogSource } from "./model.js"

// MESSAGE

/** Records a live catalog snapshot. */
export const ObservedJobs = S.TaggedStruct("ObservedJobs", {
  jobs: S.Array(Transcript),
  source: CatalogSource,
})

/** Records that catalog observation failed. */
export const FailedObserveJobs = S.TaggedStruct("FailedObserveJobs", {
  reason: S.String,
})

/** Records that one job was selected. */
export const ClickedJob = S.TaggedStruct("ClickedJob", {
  id: S.String,
})

/** Records that the selected job was closed. */
export const ClosedJob = S.TaggedStruct("ClosedJob", {})

/** Records that the URL field changed. */
export const UpdatedDraftUrl = S.TaggedStruct("UpdatedDraftUrl", {
  draftUrl: S.String,
})

/** Records that a video URL was submitted. */
export const SubmittedUrl = S.TaggedStruct("SubmittedUrl", {
  url: S.String,
})

/** Records a GET href (`/`, `/?url=`, `/v/:id`, `/jobs/:id`). */
export const OpenedHref = S.TaggedStruct("OpenedHref", {
  href: S.String,
})

/** Records media clock seconds from the player. */
export const HeardPlaybackPosition = S.TaggedStruct("HeardPlaybackPosition", {
  mediaPosition: S.Number,
})

/** Records that the preferred media source failed to load. */
export const HeardMediaError = S.TaggedStruct("HeardMediaError", {})

/** Records a click on a transcript word or scrubber. */
export const PressedSeekWord = S.TaggedStruct("PressedSeekWord", {
  start: S.Number,
})

/** Records that follow-along should pin to the current word. */
export const PressedFollowLive = S.TaggedStruct("PressedFollowLive", {})

/** Records that the transcript scroller was moved by the reader. */
export const ScrolledAway = S.TaggedStruct("ScrolledAway", {})

/** Records that the current word was scrolled into view. */
export const CompletedScrollCurrentWord = S.TaggedStruct(
  "CompletedScrollCurrentWord",
  {},
)

/** Records that the host seeked the video element. */
export const CompletedSeekVideo = S.TaggedStruct("CompletedSeekVideo", {})

/** Records that Send should copy the public job URL. */
export const PressedCopyLink = S.TaggedStruct("PressedCopyLink", {})

/** Records that the job URL was copied. */
export const CompletedCopyLink = S.TaggedStruct("CompletedCopyLink", {})

/** Records that copying the job URL failed. */
export const FailedCopyLink = S.TaggedStruct("FailedCopyLink", {})

/** Records follow-along words and media URLs for the selected job. */
export const HeardJobPlayback = S.TaggedStruct("HeardJobPlayback", {
  analysis: S.String,
  fallbackUrl: S.String,
  mediaUrl: S.String,
  title: S.String,
  transcriptText: S.String,
  videoId: S.String,
  words: S.Array(Word),
})

/** Records that job playback details could not be loaded. */
export const FailedJobPlayback = S.TaggedStruct("FailedJobPlayback", {})

/** Every Message accepted by the Transcribe Program. */
export const Message = S.Union([
  ObservedJobs,
  FailedObserveJobs,
  ClickedJob,
  ClosedJob,
  UpdatedDraftUrl,
  SubmittedUrl,
  OpenedHref,
  HeardPlaybackPosition,
  HeardMediaError,
  PressedSeekWord,
  PressedFollowLive,
  ScrolledAway,
  CompletedScrollCurrentWord,
  CompletedSeekVideo,
  PressedCopyLink,
  CompletedCopyLink,
  FailedCopyLink,
  HeardJobPlayback,
  FailedJobPlayback,
])
/** A Transcribe Message value. */
export type Message = typeof Message.Type
