import { Array, Option, Schema as S } from "effect"

// MODEL

/** Job status owned by the transcribe Program. */
export const TranscriptStatus = S.Literals(["queued", "running", "ready", "error"])
/** Job status owned by the transcribe Program. */
export type TranscriptStatus = typeof TranscriptStatus.Type

/** One extracted frame belonging to a transcript job. */
export const TranscriptFrame = S.Struct({
  caption: S.String,
  id: S.String,
  imagePath: S.optionalKey(S.String),
  imageUrl: S.optionalKey(S.String),
  index: S.Number,
  tSec: S.Number,
  transcriptId: S.String,
})
/** One extracted frame belonging to a transcript job. */
export type TranscriptFrame = typeof TranscriptFrame.Type

/** One Knophy transcript job. */
export const Transcript = S.Struct({
  analysis: S.String,
  createdAt: S.Number,
  frames: S.Array(TranscriptFrame),
  id: S.String,
  slug: S.String,
  status: TranscriptStatus,
  title: S.String,
  transcriptText: S.String,
  url: S.String,
  videoId: S.String,
})
/** A Knophy transcript job. */
export type Transcript = typeof Transcript.Type

/** One spoken token on the media timeline. Times are seconds, half-open [start, end). */
export const Word = S.Struct({
  id: S.String,
  text: S.String,
  start: S.Number,
  end: S.Number,
})
/** One spoken token on the media timeline. */
export type Word = typeof Word.Type

/** Finds the word whose half-open interval contains a media time. */
export const wordAt = (
  words: ReadonlyArray<Word>,
  seconds: number,
): Option.Option<Word> =>
  Array.findFirst(words, word => seconds >= word.start && seconds < word.end)

/** Local follow-along file for a YouTube id. */
export const localMediaUrl = (videoId: string): string => `/media/${videoId}.mp4`

/** Public job URL copied by Send. */
export const jobShareUrl = (videoId: string): string =>
  `https://transcribe.knophy.com/jobs/${videoId}`

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Extracts an 11-character YouTube video id from a URL, path, or bare id. */
export const videoIdFromInput = (input: string): Option.Option<string> => {
  const trimmed = input.trim()
  if (YOUTUBE_ID.test(trimmed)) {
    return Option.some(trimmed)
  }
  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(part => part.length > 0)[0]
      return id !== undefined && YOUTUBE_ID.test(id) ? Option.some(id) : Option.none()
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v")
      if (v !== null && YOUTUBE_ID.test(v)) {
        return Option.some(v)
      }
      const parts = url.pathname.split("/").filter(part => part.length > 0)
      if (
        (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") &&
        parts[1] !== undefined &&
        YOUTUBE_ID.test(parts[1])
      ) {
        return Option.some(parts[1])
      }
    }
  } catch {
    return Option.none()
  }
  return Option.none()
}

/** Canonical watch URL for a YouTube id. */
export const youtubeUrl = (videoId: string): string => `https://youtu.be/${videoId}`

/** Parsed GET contract for `/`, `/?url=`, and `/v/:id`. */
export const TranscribeRequest = S.Struct({
  draftUrl: S.String,
  videoId: S.Option(S.String),
})
/** Parsed GET contract for `/`, `/?url=`, and `/v/:id`. */
export type TranscribeRequest = typeof TranscribeRequest.Type

/** Parses a host href into the transcribe GET contract. */
export const requestFromHref = (href: string): TranscribeRequest => {
  try {
    const url = new URL(href, "https://transcribe.knophy.com")
    const queryUrl = url.searchParams.get("url")
    const pathParts = url.pathname.split("/").filter(part => part.length > 0)
    const pathVideoId =
       (pathParts[0] === "v" || pathParts[0] === "jobs") && pathParts[1] !== undefined
        ? videoIdFromInput(pathParts[1])
        : Option.none()
    const queryVideoId =
      queryUrl === null || queryUrl === "" ? Option.none() : videoIdFromInput(queryUrl)
    const hrefVideoId = videoIdFromInput(href)
    const videoId = Option.orElse(pathVideoId, () => Option.orElse(queryVideoId, () => hrefVideoId))
    const draftUrl =
      queryUrl !== null && queryUrl !== ""
        ? queryUrl
        : Option.match(videoId, {
            onNone: () => "",
            onSome: id => youtubeUrl(id),
          })
    return TranscribeRequest.make({ draftUrl, videoId })
  } catch {
    return TranscribeRequest.make({ draftUrl: "", videoId: Option.none() })
  }
}

/** Prints one canonical path for a transcribe request. */
export const requestToPath = (request: TranscribeRequest): string =>
  Option.match(request.videoId, {
    onNone: () =>
      request.draftUrl === "" ? "/" : `/?url=${encodeURIComponent(request.draftUrl)}`,
    onSome: id => `/jobs/${id}`,
  })

const SEED_ID = "b0fa0000-0000-4000-a000-0000b0fa0001"
const SEED_VIDEO_ID = "B0FaK0sazXg"

/** Canonical seed job. Instant is the live source of truth. */
export const seedTranscripts: ReadonlyArray<Transcript> = [
  Transcript.make({
    analysis:
      "Queued Knophy transcribe job. Open this URL to watch captions, frames, and analysis land as ingest finishes.",
    createdAt: 1_755_000_000_000,
    frames: [],
    id: SEED_ID,
    slug: SEED_VIDEO_ID,
    status: "queued",
    title: "Recorded session",
    transcriptText: "",
    url: youtubeUrl(SEED_VIDEO_ID),
    videoId: SEED_VIDEO_ID,
  }),
]

/** Builds a local queued job for a video the catalog does not yet have. */
export const queuedTranscript = (videoId: string, url: string): Transcript =>
  Transcript.make({
    analysis: "Queued. Knophy will attach transcript, frames, and analysis when ingest runs.",
    createdAt: 0,
    frames: [],
    id: `queued-${videoId}`,
    slug: videoId,
    status: "queued",
    title: `Video ${videoId}`,
    transcriptText: "",
    url,
    videoId,
  })
