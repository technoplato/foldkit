import { Option } from "effect"

import { localMediaUrl, videoIdFromInput, youtubeUrl, type Word } from "./catalog.js"
import { parseVtt, transcriptTextFromCues } from "./vtt.js"

/** Full GET /jobs/:id payload. */
export type JobPayload = Readonly<{
  analysis: { summary: string } | null
  fallbackUrl: string
  frames: ReadonlyArray<{ filename: string; id: string; index: number }>
  id: string
  mediaUrl: string
  status: "queued" | "running" | "complete" | "failed"
  title: string
  transcript: {
    cues: ReadonlyArray<{ endMs: number; startMs: number; text: string }>
    source: "whisper" | "captions"
    text: string
  } | null
  url: string
  words: ReadonlyArray<Word>
}>

/** Result of idempotent start-or-lookup. */
export type StartOrLookup =
  | Readonly<{ _tag: "InvalidUrl" }>
  | Readonly<{ _tag: "Ok"; created: boolean; job: JobPayload }>

/** In-memory job registry used by the GET contract. */
export type JobRegistry = Readonly<{
  getById: (id: string) => JobPayload | undefined
  put: (job: JobPayload) => void
  startOrLookup: (url: string) => StartOrLookup
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/** Whisper `segments[].words` as follow-along tokens. Times stay in seconds. */
export const wordsFromWhisper = (whisper: unknown): ReadonlyArray<Word> => {
  if (!isRecord(whisper) || !Array.isArray(whisper["segments"])) {
    return []
  }
  const collected: Array<Word> = []
  for (const segment of whisper["segments"]) {
    if (!isRecord(segment) || !Array.isArray(segment["words"])) {
      continue
    }
    for (const raw of segment["words"]) {
      if (!isRecord(raw)) {
        continue
      }
      const text = typeof raw["word"] === "string" ? raw["word"].trim() : ""
      const start = typeof raw["start"] === "number" ? raw["start"] : undefined
      const end = typeof raw["end"] === "number" ? raw["end"] : undefined
      if (text.length === 0 || start === undefined || end === undefined) {
        continue
      }
      collected.push({
        id: `w${collected.length}`,
        text,
        start,
        end: end > start ? end : start + 0.05,
      })
    }
  }
  return collected.map((word, index) => {
    const next = collected[index + 1]
    if (next !== undefined && word.end > next.start && next.start > word.start) {
      return { ...word, end: next.start }
    }
    return word
  })
}

/** Builds a job payload from optional artifact contents. */
export const jobFromArtifacts = (input: Readonly<{
  frames: ReadonlyArray<string>
  id: string
  mediaUrl?: string
  title: string
  url: string
  vtt?: string
  whisper?: unknown
}>): JobPayload => {
  const whisperText =
    typeof input.whisper === "object" &&
    input.whisper !== null &&
    "text" in input.whisper &&
    typeof input.whisper.text === "string" &&
    input.whisper.text.length > 0
      ? input.whisper.text
      : undefined
  const cues = input.vtt === undefined ? [] : parseVtt(input.vtt)
  const captionText = transcriptTextFromCues(cues)
  const words = wordsFromWhisper(input.whisper)
  const transcript =
    whisperText !== undefined
      ? { cues, source: "whisper" as const, text: whisperText }
      : captionText.length > 0
        ? { cues, source: "captions" as const, text: captionText }
        : null
  const status =
    whisperText !== undefined ? "complete" as const : transcript !== null ? "running" as const : "queued" as const
  const analysis =
    whisperText !== undefined
      ? { summary: "Whisper transcript is available." }
      : transcript !== null
        ? {
            summary:
              "YouTube English captions ingested as a caption track. Whisper JSON is not available yet.",
          }
        : null
  return {
    analysis,
    fallbackUrl: input.url,
    frames: input.frames.map((filename, index) => ({
      filename,
      id: filename.replace(/\.[^.]+$/, ""),
      index: index + 1,
    })),
    id: input.id,
    mediaUrl: input.mediaUrl ?? localMediaUrl(input.id),
    status,
    title: input.title,
    transcript,
    url: input.url,
    words,
  }
}

/** Creates a job registry, optionally preloaded with seed jobs. */
export const createJobRegistry = (
  seed: ReadonlyArray<JobPayload> = [],
): JobRegistry => {
  const byId = new Map<string, JobPayload>()
  for (const job of seed) {
    byId.set(job.id, job)
  }
  return {
    getById: id => byId.get(id),
    put: job => {
      byId.set(job.id, job)
    },
    startOrLookup: url => {
      const maybeId = videoIdFromInput(url)
      if (Option.isNone(maybeId)) {
        return { _tag: "InvalidUrl" }
      }
      const id = maybeId.value
      const existing = byId.get(id)
      if (existing !== undefined) {
        return { _tag: "Ok", created: false, job: existing }
      }
      const job: JobPayload = {
        analysis: null,
        fallbackUrl: youtubeUrl(id),
        frames: [],
        id,
        mediaUrl: localMediaUrl(id),
        status: "queued",
        title: id,
        transcript: null,
        url: youtubeUrl(id),
        words: [],
      }
      byId.set(id, job)
      return { _tag: "Ok", created: true, job }
    },
  }
}

/** Incoming GET/HEAD request for the transcribe HTTP contract. */
export type TranscribeHttpRequest = Readonly<{
  accept: string
  method: string
  url: string
}>

/** Outgoing HTTP response for the transcribe contract. */
export type TranscribeHttpResponse = Readonly<{
  body: string
  headers: Readonly<Record<string, string>>
  status: number
}>

const json = (
  status: number,
  value: unknown,
  extra: Readonly<Record<string, string>> = {},
): TranscribeHttpResponse => ({
  body: `${JSON.stringify(value)}\n`,
  headers: { "content-type": "application/json; charset=utf-8", ...extra },
  status,
})

const wantsJson = (accept: string): boolean =>
  accept.toLowerCase().includes("application/json")

const wantsHtml = (accept: string): boolean =>
  accept.toLowerCase().includes("text/html")

const normalizePath = (pathname: string): string => {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

/** Handles GET /healthz, GET /?url=, and GET /jobs/:id. Undefined falls through. */
export const handleTranscribeRequest = (
  request: TranscribeHttpRequest,
  registry: JobRegistry,
): TranscribeHttpResponse | undefined => {
  const method = request.method.toUpperCase()
  if (method !== "GET" && method !== "HEAD") {
    return undefined
  }
  const parsed = new URL(request.url, "http://127.0.0.1")
  const pathname = normalizePath(parsed.pathname)

  if (pathname === "/healthz") {
    return json(200, { status: "ok" })
  }

  const jobsMatch = /^\/jobs\/([^/]+)$/.exec(pathname)
  if (jobsMatch !== null && jobsMatch[1] !== undefined) {
    if (wantsHtml(request.accept) && !wantsJson(request.accept)) {
      return undefined
    }
    const id = decodeURIComponent(jobsMatch[1])
    const job = registry.getById(id)
    if (job === undefined) {
      return json(404, { error: "not found", id })
    }
    return json(200, job)
  }

  if (pathname === "/") {
    const url = parsed.searchParams.get("url")
    if (url === null || url.length === 0) {
      return undefined
    }
    const result = registry.startOrLookup(url)
    if (result._tag === "InvalidUrl") {
      return json(400, { error: "invalid url", url })
    }
    const location = `/jobs/${result.job.id}`
    if (wantsJson(request.accept)) {
      return json(200, {
        created: result.created,
        id: result.job.id,
        job: result.job,
        location,
        url: result.job.url,
      })
    }
    return {
      body: "",
      headers: { location },
      status: 302,
    }
  }

  return undefined
}
