import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { init } from '@instantdb/admin'

import schema from '../instant.schema.ts'

const SEED_ID = 'b0fa0000-0000-4000-a000-0000b0fa0001'
const SEED_VIDEO_ID = 'B0FaK0sazXg'
const SEED_URL = 'https://youtu.be/B0FaK0sazXg'

const requireEnv = (
  name: 'INSTANT_APP_ID' | 'INSTANT_APP_ADMIN_TOKEN',
): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is missing. Source the foldkit Instant demo env file.`,
    )
  }
  return value
}

const requireTx = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`missing Instant tx for ${label}`)
  }
  return value
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const HOME_PATH = /(?:\/Users\/[^\s]+|\/home\/[^\s]+|~\/[^\s]+)/g

/** Fail-closed public-text filter. Strips emails and home paths. */
export const filterPublicText = (text: string): string =>
  text.replace(EMAIL, '[redacted]').replace(HOME_PATH, '[path]')

const parseVtt = (raw: string): string => {
  const lines: Array<string> = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (
      trimmed === '' ||
      trimmed.startsWith('WEBVTT') ||
      trimmed.startsWith('Kind:') ||
      trimmed.startsWith('Language:')
    ) {
      continue
    }
    if (/^\d+$/.test(trimmed) || trimmed.includes('-->')) {
      continue
    }
    if (trimmed.includes('<c>') || trimmed.includes('</c>')) {
      continue
    }
    if (lines[lines.length - 1] === trimmed) {
      continue
    }
    lines.push(trimmed)
  }
  return filterPublicText(lines.join('\n'))
}

const readOptional = (path: string): string | undefined => {
  if (!existsSync(path)) {
    return undefined
  }
  return readFileSync(path, 'utf8')
}

const titleFromInfo = (infoPath: string | undefined): string => {
  if (infoPath === undefined || !existsSync(infoPath)) {
    return 'Recorded session'
  }
  try {
    const parsed = JSON.parse(readFileSync(infoPath, 'utf8')) as {
      title?: unknown
    }
    if (typeof parsed.title === 'string' && parsed.title.trim() !== '') {
      return filterPublicText(parsed.title.trim())
    }
  } catch {
    return 'Recorded session'
  }
  return 'Recorded session'
}

const whisperTextFromDir = (dir: string): string | undefined => {
  const names = existsSync(dir) ? readdirSync(dir) : []
  const jsonName =
    names.find(name => name.endsWith('.json') && name.includes('whisper')) ??
    names.find(name => name === 'transcript.json' || name === 'whisper.json')
  if (jsonName === undefined) {
    return undefined
  }
  try {
    const parsed = JSON.parse(readFileSync(join(dir, jsonName), 'utf8')) as {
      text?: unknown
    }
    if (typeof parsed.text === 'string' && parsed.text.trim() !== '') {
      return filterPublicText(parsed.text)
    }
  } catch {
    return undefined
  }
  return undefined
}

type FrameSpec = Readonly<{
  caption: string
  id: string
  imageUrl: string
  index: number
  tSec: number
}>

const framesFromPublic = (
  videoId: string,
  transcriptId: string,
): ReadonlyArray<FrameSpec> => {
  const dir = join(
    import.meta.dirname,
    '..',
    '..',
    'foldkit',
    'public',
    'frames',
    videoId,
  )
  if (!existsSync(dir)) {
    return []
  }
  const files = readdirSync(dir)
    .filter(
      name =>
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png'),
    )
    .sort()
  return files.map((name, index) => {
    const stamp = basename(name, name.slice(name.lastIndexOf('.')))
    const tSec = Number.parseInt(stamp.replace(/[^0-9]/g, ''), 10)
    return {
      caption: Number.isFinite(tSec)
        ? `${String(tSec)}s`
        : `Frame ${String(index + 1)}`,
      id: `b0fa0000-0000-4000-a001-${String(index + 1).padStart(12, '0')}`,
      imageUrl: `/frames/${videoId}/${name}`,
      index: index + 1,
      tSec: Number.isFinite(tSec) ? tSec : index,
    }
  })
}

const ingest = async (): Promise<void> => {
  const appId = requireEnv('INSTANT_APP_ID')
  const adminToken = requireEnv('INSTANT_APP_ADMIN_TOKEN')
  const database = init({ adminToken, appId, schema })
  const artifactDir =
    process.env['TRANSCRIBE_ARTIFACT_DIR'] ??
    `/tmp/knophy-transcribe-${SEED_VIDEO_ID}`
  const vtt =
    readOptional(join(artifactDir, 'video.en.vtt')) ??
    readOptional(join(artifactDir, 'video720.en.vtt'))
  const whisperText = whisperTextFromDir(artifactDir)
  const transcriptText = whisperText ?? (vtt === undefined ? '' : parseVtt(vtt))
  const hasMedia = existsSync(join(artifactDir, 'video.mp4'))
  const status =
    transcriptText.length > 0 ? 'ready' : hasMedia ? 'running' : 'queued'
  const analysis = filterPublicText(
    status === 'ready'
      ? 'Knophy extracted captions and stills from this recording. A higher-quality whisper large-v3-turbo pass can replace the captions when that job finishes.'
      : status === 'running'
        ? 'Media is on hand. Captions and stills will appear when ingest reads them.'
        : 'Queued. Paste this URL again after ingest to load transcript, frames, and analysis.',
  )
  const frames = framesFromPublic(SEED_VIDEO_ID, SEED_ID)
  const title = titleFromInfo(join(artifactDir, 'video.info.json'))
  const ops = [
    requireTx(
      database.tx.knophyTranscripts[SEED_ID],
      'knophyTranscripts',
    ).update({
      analysis,
      createdAt: Date.now(),
      slug: SEED_VIDEO_ID,
      status,
      title,
      transcriptText,
      url: SEED_URL,
      videoId: SEED_VIDEO_ID,
    }),
    ...frames.map(frame =>
      requireTx(
        database.tx.knophyTranscriptFrames[frame.id],
        'knophyTranscriptFrames',
      ).update({
        caption: frame.caption,
        imageUrl: frame.imageUrl,
        index: frame.index,
        tSec: frame.tSec,
        transcriptId: SEED_ID,
      }),
    ),
  ]
  await database.transact(ops)
  console.log(
    `seeded Knophy transcribe job ${SEED_VIDEO_ID} status=${status} frames=${String(frames.length)} chars=${String(transcriptText.length)}`,
  )
}

ingest().catch(error => {
  console.error(error)
  process.exitCode = 1
})
