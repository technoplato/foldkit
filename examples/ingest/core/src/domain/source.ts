import { Schema as S } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

/** Video is not saved locally. */
export const Unsaved = ts('Unsaved')
/** Video saved by yt-dlp. */
export const Saved = ts('Saved', { path: NonEmptyString })
/** Local video save. Unsaved and Saved are exclusive. */
export const VideoSave = S.Union([Unsaved, Saved])
/** Local video save. */
export type VideoSave = typeof VideoSave.Type

/** An X bookmark. Cannot hold a yt-dlp path. */
export const XBookmark = ts('XBookmark', {
  handle: NonEmptyString,
  tweetId: NonEmptyString,
})
/** A TikTok or other video capture. Cannot hold a tweet id. */
export const Video = ts('Video', {
  url: NonEmptyString,
  save: VideoSave,
})
/** A pasted capture. Cannot hold X or video fields. */
export const OtherCapture = ts('OtherCapture', {
  note: NonEmptyString,
})

/**
 * Capture source. Tagged so an X bookmark cannot be a video, and a
 * video cannot be an X bookmark.
 */
export const Source = S.Union([XBookmark, Video, OtherCapture])
/** Capture source. */
export type Source = typeof Source.Type

/** Prints the source tag. */
export const sourceLabel = (source: Source): string => source._tag
