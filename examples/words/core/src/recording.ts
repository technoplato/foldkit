import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** One recognized word and its time in the recording, in seconds. */
export const Word = S.Struct({
  id: S.String,
  text: S.String,
  startSeconds: S.Number,
  endSeconds: S.Number,
})
/** One recognized word and its time in the recording, in seconds. */
export type Word = typeof Word.Type

/**
 * Why a line's words are sealed (ADR 0097, issue #1183): `Voice` for a voice
 * the account's filter withholds, whose words never reach any reader, and
 * `Held` while the line's voice is still being checked. A sealed line keeps
 * its place, time and speaker; only his own devices open its words.
 */
export const WordsSeal = S.Literals(['Voice', 'Held'])
/** Why a line's words are sealed. */
export type WordsSeal = typeof WordsSeal.Type

/**
 * One transcript section: a run of words from one speaker. A sealed section
 * (`maybeWordsSeal` is some) has no words, and its `text` is what it shows in
 * their place, `[sealed]` or `[checking the voice]`, so a copy, an export or
 * an announcement of it never holds anyone's words.
 */
export const Section = S.Struct({
  id: S.String,
  index: S.Number,
  startSeconds: S.Number,
  endSeconds: S.Number,
  maybeSpeakerID: S.Option(S.Number),
  text: S.String,
  words: S.Array(Word),
  isFinal: S.Boolean,
  maybeWordsSeal: S.Option(WordsSeal),
})
/** One transcript section: a run of words from one speaker. */
export type Section = typeof Section.Type

/**
 * A retired line (ADR 0064 section 8): never shown, but a link to it still
 * opens, at the line that replaced it. `maybeKeptLineID` is the line it names
 * (`supersededBy`), else the next kept line, else the last one; none only
 * when the recording has no kept line at all.
 */
export const RetiredLine = S.Struct({
  id: S.String,
  maybeKeptLineID: S.Option(S.String),
})
/** A retired line, and the kept line a link to it opens. */
export type RetiredLine = typeof RetiredLine.Type

/** A speaker and the label the iPhone shows for them. */
export const Speaker = S.Struct({ id: S.Number, label: S.String })
/** A speaker and the label the iPhone shows for them. */
export type Speaker = typeof Speaker.Type

/** Text that reached the clipboard while the recording ran. */
export const ClipboardEntry = S.Struct({
  id: S.String,
  timestampSeconds: S.Number,
  text: S.String,
})
/** Text that reached the clipboard while the recording ran. */
export type ClipboardEntry = typeof ClipboardEntry.Type

/** An image attached while the recording ran, stored in Instant storage. */
export const ImageEntry = S.Struct({
  id: S.String,
  timestampSeconds: S.Number,
  fileID: S.String,
})
/** An image attached while the recording ran, stored in Instant storage. */
export type ImageEntry = typeof ImageEntry.Type

/** Whether the recording is idle, being recorded, or playing on some device. */
export const Activity = S.Literals(['Idle', 'Recording', 'Playing'])
/** Whether the recording is idle, being recorded, or playing on some device. */
export type Activity = typeof Activity.Type

/** One of the two newest finished sections a list row previews, with where it starts. */
export const PreviewLine = S.Struct({
  sectionID: S.String,
  startSeconds: S.Number,
  text: S.String,
})
/** One of the sections a list row previews. */
export type PreviewLine = typeof PreviewLine.Type

/**
 * A stretch the recording's clock waited (a pause, a microphone outage, a
 * capture restart, the app closed), by the writer's wall clock. One still
 * open has no end: the recording is paused, or its microphone is away.
 */
export const CaptureGap = S.Struct({
  startedAtMs: S.Number,
  maybeEndedAtMs: S.Option(S.Number),
})
/** A stretch the recording's clock waited. */
export type CaptureGap = typeof CaptureGap.Type

/**
 * One beat a recording's device published in its live room: its length, and
 * when that was true by the device's clock. The origin hands the browser only
 * the newest beat of a member signed in as the recording's owner.
 */
export const LiveBeat = S.Struct({
  durationSeconds: S.Number,
  beatAtMs: S.Number,
})
/** One beat a recording's device published in its live room. */
export type LiveBeat = typeof LiveBeat.Type

/**
 * One row of the recording list. `maybeUpdatedAtMs` is when the row last
 * changed, by the writer's clock; a recording in progress saves its length
 * with it every few seconds, or every minute once its device publishes a 5 s
 * beat in a live room (`isLiveRoomSet`). `captureGaps` are the stretches its
 * clock waited; the writer saves one the moment it opens or closes.
 * `maybeOwnerUserID` is the account that owns it; a recording someone else
 * shared with this account has another owner, and rows written before owners
 * were stamped have none.
 */
export const RecordingSummary = S.Struct({
  id: S.String,
  title: S.String,
  startedAtMs: S.Number,
  durationSeconds: S.Number,
  maybeUpdatedAtMs: S.Option(S.Number),
  maybeOwnerUserID: S.Option(S.String),
  activity: Activity,
  maybeDeviceIcon: S.Option(S.String),
  previewLines: S.Array(PreviewLine),
  isLiveRoomSet: S.Boolean,
  captureGaps: S.Array(CaptureGap),
})
/** One row of the recording list. */
export type RecordingSummary = typeof RecordingSummary.Type

/** The recording has no audio attachment. */
export const NoAudio = ts('NoAudio')
/** The audio attachment exists but its file has not finished uploading. */
export const UploadingAudio = ts('UploadingAudio', { byteCount: S.Number })
/** The audio file is in Instant storage. */
export const StoredAudio = ts('StoredAudio', {
  fileID: S.String,
  byteCount: S.Number,
})
/** Where a recording's audio stands. */
export const RecordingAudio = S.Union([NoAudio, UploadingAudio, StoredAudio])
/** Where a recording's audio stands. */
export type RecordingAudio = typeof RecordingAudio.Type

/** A transcript section in the timeline. */
export const SectionEntry = ts('SectionEntry', { section: Section })
/** A clipboard copy in the timeline. */
export const ClipboardTimelineEntry = ts('ClipboardTimelineEntry', {
  clipboard: ClipboardEntry,
})
/** An image in the timeline. */
export const ImageTimelineEntry = ts('ImageTimelineEntry', {
  image: ImageEntry,
})
/** One item of a recording's timeline, in time order. */
export const TimelineEntry = S.Union([
  SectionEntry,
  ClipboardTimelineEntry,
  ImageTimelineEntry,
])
/** One item of a recording's timeline, in time order. */
export type TimelineEntry = typeof TimelineEntry.Type

/**
 * Everything playback needs for one recording. `sections` holds only kept
 * lines; `retiredLines` holds where a link to each retired line goes.
 */
export const RecordingDetail = S.Struct({
  summary: RecordingSummary,
  sections: S.Array(Section),
  retiredLines: S.Array(RetiredLine),
  speakers: S.Array(Speaker),
  clipboard: S.Array(ClipboardEntry),
  images: S.Array(ImageEntry),
  audio: RecordingAudio,
})
/** Everything playback needs for one recording. */
export type RecordingDetail = typeof RecordingDetail.Type
