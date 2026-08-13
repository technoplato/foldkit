import fs from "node:fs"
import path from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"

import type { Plugin } from "vite"

import {
  createJobRegistry,
  handleTranscribeRequest,
  jobFromArtifacts,
  type JobPayload,
} from "../core/src/http.js"

const SEED_ID = "B0FaK0sazXg"
const SEED_URL = "https://youtu.be/B0FaK0sazXg"
const ARTIFACT_DIR = "/tmp/knophy-transcribe-B0FaK0sazXg"

const readOptional = (filePath: string): string | undefined => {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return undefined
  }
}

const readJson = (filePath: string): unknown => {
  const text = readOptional(filePath)
  if (text === undefined) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const listFrames = (dir: string): ReadonlyArray<string> => {
  try {
    return fs
      .readdirSync(dir)
      .filter(name => name.endsWith(".jpg") || name.endsWith(".png"))
      .sort()
  } catch {
    return []
  }
}

const whisperPayload = (dir: string): unknown => {
  for (const name of ["transcript.json", "whisper.json", "video.json", "video.en.json", "transcription.json"]) {
    const value = readJson(path.join(dir, name))
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

const infoTitle = (dir: string, fallback: string): string => {
  const info = readJson(path.join(dir, "video.info.json"))
  if (
    typeof info === "object" &&
    info !== null &&
    "title" in info &&
    typeof info.title === "string" &&
    info.title.length > 0
  ) {
    return info.title
  }
  return fallback
}

/** Loads the seed job from local yt-dlp / whisper artifacts. */
export const loadSeedJob = (dir = ARTIFACT_DIR): JobPayload => {
  const vtt =
    readOptional(path.join(dir, "video.en.vtt")) ??
    readOptional(path.join(dir, "fallback_transcript.vtt"))
  const mediaFile = path.join(__dirname, "public/media", `${SEED_ID}.mp4`)
  const whisper = whisperPayload(dir)
  return jobFromArtifacts({
    frames: listFrames(path.join(dir, "frames")),
    id: SEED_ID,
    title: infoTitle(dir, "Recorded session"),
    url: SEED_URL,
    ...(fs.existsSync(mediaFile) ? { mediaUrl: `/media/${SEED_ID}.mp4` } : {}),
    ...(vtt === undefined ? {} : { vtt }),
    ...(whisper === undefined ? {} : { whisper }),
  })
}

const write = (
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>>,
  body: string,
): void => {
  res.statusCode = status
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
  res.end(req.method === "HEAD" ? "" : body)
}

/** Vite middleware that implements the transcribe GET contract on preview and dev. */
export const transcribeApiPlugin = (): Plugin => {
  const registry = createJobRegistry([loadSeedJob()])
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    if (req.url === undefined) {
      next()
      return
    }
    const response = handleTranscribeRequest(
      {
        accept: String(req.headers.accept ?? ""),
        method: req.method ?? "GET",
        url: req.url,
      },
      {
        getById: id => {
          if (id === SEED_ID) {
            const fresh = loadSeedJob()
            registry.put(fresh)
            return fresh
          }
          return registry.getById(id)
        },
        put: job => {
          registry.put(job)
        },
        startOrLookup: url => registry.startOrLookup(url),
      },
    )
    if (response === undefined) {
      next()
      return
    }
    write(req, res, response.status, response.headers, response.body)
  }
  return {
    name: "transcribe-api",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
