import { Array, Option } from 'effect'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  AnswerLog,
  AnswerStamp,
  ExploreStamp,
  NoteStamp,
  PropositionId,
  SlideId,
  emptyAnswerLog,
  exploresOf,
  prependAnswerNote,
  prependExploreNote,
  prependExploreStamp,
  prependStamp,
} from './src/domain'

const SLIDE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/

/** True when this id is a safe answers file stem. Example: `sim`, `04h`. */
export const isSlideId = (slideId: string): boolean => SLIDE_ID.test(slideId)

export type ParsedPaste = Readonly<{
  verbatim: string
  isExplore?: boolean
  isNote?: boolean
}>

const pad2 = (n: number): string => n.toString().padStart(2, '0')

const localStamp = (date: Date): string => {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hours = pad2(Math.floor(abs / 60))
  const minutes = pad2(abs % 60)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${sign}${hours}:${minutes}`
}

export const answerPath = (
  answersDir: string,
  slideId: string,
  ext: string,
): string | undefined => {
  if (!isSlideId(slideId)) {
    return undefined
  }
  const resolved = path.resolve(answersDir, `${slideId}${ext}`)
  if (!resolved.startsWith(path.resolve(answersDir))) {
    return undefined
  }
  return resolved
}

const parseNotes = (value: unknown): ReadonlyArray<NoteStamp> => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry): ReadonlyArray<NoteStamp> => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const stamp = entry as Readonly<{
      at?: unknown
      verbatim?: unknown
      cleaned?: unknown
    }>
    if (
      typeof stamp.at !== 'string' ||
      typeof stamp.verbatim !== 'string' ||
      typeof stamp.cleaned !== 'string'
    ) {
      return []
    }
    return [
      NoteStamp.make({
        at: stamp.at,
        verbatim: stamp.verbatim,
        cleaned: stamp.cleaned,
      }),
    ]
  })
}

/** Decode one on-disk answer log. Unknown JSON is `undefined`. */
export const parseLog = (slideId: string, raw: string): AnswerLog | undefined => {
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined
    }
    const record = value as Readonly<{
      slideId?: unknown
      answers?: unknown
      explores?: unknown
    }>
    if (record.slideId !== slideId || !Array.isArray(record.answers)) {
      return undefined
    }
    const explores = Array.isArray(record.explores)
      ? record.explores.flatMap((entry): ReadonlyArray<ExploreStamp> => {
          if (typeof entry !== 'object' || entry === null) {
            return []
          }
          const stamp = entry as Readonly<{
            at?: unknown
            verbatim?: unknown
            cleaned?: unknown
            scope?: unknown
            propositionId?: unknown
            notes?: unknown
          }>
          if (
            typeof stamp.at !== 'string' ||
            typeof stamp.verbatim !== 'string' ||
            typeof stamp.cleaned !== 'string'
          ) {
            return []
          }
          const isExplore =
            stamp.scope === 'explore' || typeof stamp.propositionId === 'string'
          if (!isExplore) {
            return []
          }
          const notes = parseNotes(stamp.notes)
          const withNotes = Option.isNone(Array.head(notes)) ? {} : { notes }
          if (typeof stamp.propositionId === 'string') {
            return [
              ExploreStamp.make({
                at: stamp.at,
                verbatim: stamp.verbatim,
                cleaned: stamp.cleaned,
                scope: 'explore',
                propositionId: PropositionId.make(stamp.propositionId),
                ...withNotes,
              }),
            ]
          }
          return [
            ExploreStamp.make({
              at: stamp.at,
              verbatim: stamp.verbatim,
              cleaned: stamp.cleaned,
              scope: 'explore',
              ...withNotes,
            }),
          ]
        })
      : []
    return AnswerLog.make({
      slideId: SlideId.make(slideId),
      answers: record.answers.flatMap((entry): ReadonlyArray<AnswerStamp> => {
        if (typeof entry !== 'object' || entry === null) {
          return []
        }
        const stamp = entry as Readonly<{
          at?: unknown
          verbatim?: unknown
          cleaned?: unknown
          notes?: unknown
        }>
        if (
          typeof stamp.at !== 'string' ||
          typeof stamp.verbatim !== 'string' ||
          typeof stamp.cleaned !== 'string'
        ) {
          return []
        }
        const notes = parseNotes(stamp.notes)
        if (Option.isNone(Array.head(notes))) {
          return [
            AnswerStamp.make({
              at: stamp.at,
              verbatim: stamp.verbatim,
              cleaned: stamp.cleaned,
            }),
          ]
        }
        return [
          AnswerStamp.make({
            at: stamp.at,
            verbatim: stamp.verbatim,
            cleaned: stamp.cleaned,
            notes,
          }),
        ]
      }),
      explores,
    })
  } catch {
    return undefined
  }
}

/** Reads a paste body. JSON `{ verbatim }` or raw text. */
export const parsePasteBody = (raw: string): ParsedPaste => {
  try {
    const value: unknown = JSON.parse(raw)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Readonly<{
        verbatim?: unknown
        text?: unknown
        scope?: unknown
        propositionId?: unknown
        asNote?: unknown
        kind?: unknown
      }>
      let verbatim: string | undefined
      if (typeof record.verbatim === 'string') {
        verbatim = record.verbatim
      } else if (typeof record.text === 'string') {
        verbatim = record.text
      }
      if (verbatim !== undefined) {
        const isExplore =
          record.scope === 'explore' || typeof record.propositionId === 'string'
        const isNote =
          record.asNote === true ||
          record.kind === 'note' ||
          record.scope === 'note'
        if (isExplore) {
          return { verbatim, isExplore: true, ...(isNote ? { isNote: true } : {}) }
        }
        if (isNote) {
          return { verbatim, isNote: true }
        }
        return { verbatim }
      }
    }
  } catch {
    // pasted text, not JSON
  }
  return { verbatim: raw }
}

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

export const loadLog = async (
  answersDir: string,
  slideId: string,
): Promise<AnswerLog> => {
  const jsonPath = answerPath(answersDir, slideId, '.json')
  const mdPath = answerPath(answersDir, slideId, '.md')
  if (jsonPath !== undefined) {
    try {
      const raw = await readFile(jsonPath, 'utf8')
      const parsed = parseLog(slideId, raw)
      if (parsed !== undefined) {
        return parsed
      }
    } catch {
      // fall through to markdown
    }
  }
  if (mdPath !== undefined) {
    try {
      const verbatim = await readFile(mdPath, 'utf8')
      return prependStamp(
        emptyAnswerLog(SlideId.make(slideId)),
        AnswerStamp.make({
          at: localStamp(new Date()),
          verbatim,
          cleaned: '',
        }),
      )
    } catch {
      // no prior answer
    }
  }
  return emptyAnswerLog(SlideId.make(slideId))
}

export const writeLog = async (
  answersDir: string,
  log: AnswerLog,
): Promise<string> => {
  const jsonPath = answerPath(answersDir, log.slideId, '.json')
  if (jsonPath === undefined) {
    throw new Error('Bad slide id')
  }
  await mkdir(answersDir, { recursive: true })
  const body = `${JSON.stringify(log, null, 2)}\n`
  await writeFile(jsonPath, body, 'utf8')
  return body
}

/**
 * First paste writes `answers[0]`. A later paste prepends `notes` on that
 * stamp. Example: `/sim` first `fee with bundle`, then `stake is second`.
 */
export const applyPostedPaste = (
  current: AnswerLog,
  raw: string,
  now: Date = new Date(),
): AnswerLog => {
  const parsed = parsePasteBody(raw)
  const note = NoteStamp.make({
    at: localStamp(now),
    verbatim: parsed.verbatim,
    cleaned: '',
  })
  if (parsed.isExplore === true) {
    const hasExplore = Option.isSome(Array.head(exploresOf(current)))
    const shouldNote = parsed.isNote === true || hasExplore
    if (shouldNote && hasExplore) {
      return prependExploreNote(current, note)
    }
    return prependExploreStamp(
      current,
      ExploreStamp.make({
        at: note.at,
        verbatim: parsed.verbatim,
        cleaned: '',
        scope: 'explore',
      }),
    )
  }
  const hasAnswerStamp = Option.isSome(Array.head(current.answers))
  const shouldNote = parsed.isNote === true || hasAnswerStamp
  if (shouldNote && hasAnswerStamp) {
    return prependAnswerNote(current, note)
  }
  return prependStamp(
    current,
    AnswerStamp.make({
      at: note.at,
      verbatim: parsed.verbatim,
      cleaned: '',
    }),
  )
}

/** Loads, applies the paste, writes. A second call must change the file. */
export const persistPostedPaste = async (
  answersDir: string,
  slideId: string,
  raw: string,
  now: Date = new Date(),
): Promise<AnswerLog> => {
  const current = await loadLog(answersDir, slideId)
  const next = applyPostedPaste(current, raw, now)
  await writeLog(answersDir, next)
  return next
}
