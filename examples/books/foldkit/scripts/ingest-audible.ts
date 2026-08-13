import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { init } from '@instantdb/admin'

import schema from '../instant.schema.ts'

const here = dirname(fileURLToPath(import.meta.url))
const CHUNK = 40
const ADDED_AT = Date.parse('2026-08-13T00:00:00.000Z')

const uuidFrom = (name: string): string => {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')
  const hash = createHash('sha1').update(namespace).update(name).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const idFor = (name: string): string => uuidFrom(`books.knophy.com/${name}`)

type AudibleChapterNode = {
  readonly title?: string
  readonly start_offset_ms?: number
  readonly length_ms?: number
  readonly chapters?: ReadonlyArray<AudibleChapterNode>
}

type FlatChapter = {
  readonly index: number
  readonly title: string
  readonly startMs: number
  readonly endMs: number
}

const flattenChapters = (
  nodes: ReadonlyArray<AudibleChapterNode>,
  acc: Array<FlatChapter> = [],
): ReadonlyArray<FlatChapter> => {
  for (const node of nodes) {
    const nested = node.chapters
    if (nested !== undefined && nested.length > 0) {
      flattenChapters(nested, acc)
      continue
    }
    const startMs = node.start_offset_ms ?? 0
    const lengthMs = node.length_ms ?? 0
    const title = node.title ?? `Chapter ${String(acc.length)}`
    acc.push({
      index: acc.length,
      title,
      startMs,
      endMs: startMs + lengthMs,
    })
  }
  return acc
}

const readAudibleChapters = (fileName: string): ReadonlyArray<FlatChapter> => {
  const path = resolve(here, '../public/media', fileName)
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    content_metadata?: { chapter_info?: { chapters?: ReadonlyArray<AudibleChapterNode> } }
  }
  return flattenChapters(parsed.content_metadata?.chapter_info?.chapters ?? [])
}

type SpokenWord = {
  readonly kind: 'spoken'
  readonly text: string
  readonly language: string
  readonly relativeStartMs: number
  readonly relativeEndMs: number
  readonly wallStartMs: number
  readonly wallEndMs: number
}

type WordsFile = {
  readonly body: string
  readonly words: ReadonlyArray<{
    readonly text: string
    readonly start: number
    readonly end: number
  }>
}

const readWords = (fileName: string): WordsFile => {
  const path = resolve(here, '../public', fileName)
  return JSON.parse(readFileSync(path, 'utf8')) as WordsFile
}

const offsetWords = (
  file: WordsFile,
  chapterStartSeconds: number,
  wallOriginMs: number,
): ReadonlyArray<SpokenWord> =>
  file.words.map(word => {
    const relativeStartMs = Math.round((word.start + chapterStartSeconds) * 1000)
    const relativeEndMs = Math.round((word.end + chapterStartSeconds) * 1000)
    return {
      kind: 'spoken',
      text: word.text,
      language: 'en',
      relativeStartMs,
      relativeEndMs,
      wallStartMs: wallOriginMs + relativeStartMs,
      wallEndMs: wallOriginMs + relativeEndMs,
    }
  })

const requireEnv = (name: 'INSTANT_APP_ID' | 'INSTANT_APP_ADMIN_TOKEN'): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is missing. Source ~/.config/books-knophy/instant.env`)
  }
  return value
}

const transactAll = async (
  transact: (ops: ReadonlyArray<unknown>) => Promise<unknown>,
  ops: ReadonlyArray<unknown>,
): Promise<void> => {
  for (let index = 0; index < ops.length; index += CHUNK) {
    await transact(ops.slice(index, index + CHUNK))
  }
}

type BookSpec = {
  readonly slug: string
  readonly title: string
  readonly subtitle: string
  readonly asin: string
  readonly publishedYear: number
  readonly authorName: string
  readonly authorSort: string
  readonly narratorName: string
  readonly narratorSort: string
  readonly audioFile: string
  readonly coverFile: string
  readonly chaptersFile: string
  readonly wordsFile: string
  readonly chapterStartSeconds: number
}

const books: ReadonlyArray<BookSpec> = [
  {
    slug: '12-rules',
    title: '12 Rules for Life',
    subtitle: 'An Antidote to Chaos',
    asin: 'B0797YBP7N',
    publishedYear: 2018,
    authorName: 'Jordan B. Peterson',
    authorSort: 'Peterson, Jordan B.',
    narratorName: 'Jordan B. Peterson',
    narratorSort: 'Peterson, Jordan B.',
    audioFile: '12-rules.m4b',
    coverFile: '12-rules.jpg',
    chaptersFile: '12-rules-chapters.json',
    wordsFile: '12-rules-ch1-2min.words.json',
    chapterStartSeconds: 1437.129,
  },
  {
    slug: '21-lessons',
    title: '21 Lessons for the 21st Century',
    subtitle: '',
    asin: 'B07DHS7PP5',
    publishedYear: 2018,
    authorName: 'Yuval Noah Harari',
    authorSort: 'Harari, Yuval Noah',
    narratorName: 'Derek Perkins',
    narratorSort: 'Perkins, Derek',
    audioFile: '21-lessons.m4b',
    coverFile: '21-lessons.jpg',
    chaptersFile: '21-lessons-chapters.json',
    wordsFile: '21-lessons-ch1-2min.words.json',
    chapterStartSeconds: 977.210,
  },
]

const ingest = async (): Promise<void> => {
  const appId = requireEnv('INSTANT_APP_ID')
  const adminToken = requireEnv('INSTANT_APP_ADMIN_TOKEN')
  const db = init({ adminToken, appId, schema })
  const shelfId = idFor('shelf/home')
  const wordsOnly = process.argv.includes('--words-only')
  const ops: Array<unknown> = []
  const wordCounts: Record<string, number> = {}

  for (const book of books) {
    const chapters = readAudibleChapters(book.chaptersFile)
    const audioId = idFor(`rendition/${book.slug}/audio`)
    const bookId = idFor(`book/${book.slug}`)

    if (!wordsOnly) {
      const mediaRoot = resolve(here, '../public/media')
      const audioPath = resolve(mediaRoot, book.audioFile)
      const coverPath = resolve(mediaRoot, book.coverFile)
      const audioSize = statSync(audioPath).size
      const coverSize = statSync(coverPath).size
      const lastChapter = chapters[chapters.length - 1]
      const durationMs = lastChapter?.endMs ?? 0
      const authorId = idFor(`author/${book.slug}`)
      const narratorId = idFor(`narrator/${book.slug}`)
      const fileAudio = idFor(`file/${book.slug}/audio`)
      const fileCover = idFor(`file/${book.slug}/cover`)
      const itemId = idFor(`item/${book.slug}`)

      ops.push(
        db.tx.authors[authorId].update({
          name: book.authorName,
          sortName: book.authorSort,
        }),
        db.tx.narrators[narratorId].update({
          name: book.narratorName,
          sortName: book.narratorSort,
        }),
        db.tx.books[bookId]
          .update({
            title: book.title,
            subtitle: book.subtitle,
            identifiers: [{ kind: 'asin', value: book.asin }],
            bindingKind: 'audiobook',
            publishedKind: 'year',
            publishedYear: book.publishedYear,
            explicitKind: 'unknown',
            matchKind: 'manual',
            language: 'en',
            createdAt: ADDED_AT,
            updatedAt: ADDED_AT,
          })
          .link({
            authors: authorId,
            narrators: narratorId,
            cover: fileCover,
          }),
        db.tx.files[fileCover].update({
          name: book.coverFile,
          path: `/media/${book.coverFile}`,
          size: coverSize,
          presenceKind: 'local',
          bodyKind: 'image',
          addedAt: ADDED_AT,
          updatedAt: ADDED_AT,
        }),
        db.tx.renditions[audioId]
          .update({
            language: 'en',
            title: `${book.title} audio`,
            originKind: 'import',
            volumeKind: 'single',
            bodyKind: 'audio',
            durationMs,
            createdAt: ADDED_AT,
            updatedAt: ADDED_AT,
          })
          .link({ book: bookId }),
        db.tx.files[fileAudio]
          .update({
            name: book.audioFile,
            path: `/media/${book.audioFile}`,
            size: audioSize,
            presenceKind: 'local',
            bodyKind: 'audio',
            durationMs,
            addedAt: ADDED_AT,
            updatedAt: ADDED_AT,
          })
          .link({ rendition: audioId }),
        db.tx.items[itemId]
          .update({
            addedAt: ADDED_AT,
            presenceKind: 'local',
            preferredKind: 'audio',
          })
          .link({
            book: bookId,
            shelf: shelfId,
            preferredAudio: audioId,
          }),
      )

      for (const chapter of chapters) {
        const chapterId = idFor(`chapter/${book.slug}/${String(chapter.index)}`)
        ops.push(
          db.tx.chapters[chapterId]
            .update({
              index: chapter.index,
              title: chapter.title,
              bindingKind: 'audiobook',
              startMs: chapter.startMs,
              endMs: chapter.endMs,
            })
            .link({ book: bookId }),
        )
      }
    }

    const chapterStartMs = Math.round(book.chapterStartSeconds * 1000)
    const chapter = chapters.find(entry => entry.startMs === chapterStartMs)
    if (chapter === undefined) {
      throw new Error(
        `Chapter starting at ${String(book.chapterStartSeconds)}s is missing for ${book.slug}`,
      )
    }
    const wordsFile = readWords(book.wordsFile)
    const spoken = offsetWords(wordsFile, book.chapterStartSeconds, ADDED_AT)
    const lastSpoken = spoken[spoken.length - 1]
    const relativeStartMs = chapterStartMs
    const relativeEndMs = lastSpoken?.relativeEndMs ?? chapterStartMs
    const chapterId = idFor(`chapter/${book.slug}/${String(chapter.index)}`)
    const segmentId = idFor(`segment/${book.slug}/ch1-2min`)
    wordCounts[book.slug] = spoken.length
    ops.push(
      db.tx.segments[segmentId]
        .update({
          index: 0,
          isFinal: false,
          wallStart: ADDED_AT + relativeStartMs,
          wallEnd: ADDED_AT + relativeEndMs,
          relativeStartMs,
          relativeEndMs,
          words: spoken,
        })
        .link({ rendition: audioId, chapter: chapterId }),
    )
  }

  await transactAll(ops => db.transact(ops as never), ops)
  const check = await db.query({
    items: { book: { authors: {}, chapters: {} } },
    chapters: {},
    segments: {},
  })
  const written = books.map(book => {
    const segmentId = idFor(`segment/${book.slug}/ch1-2min`)
    const segment = check.segments.find(entry => entry.id === segmentId)
    const words = Array.isArray(segment?.words) ? segment.words.length : 0
    return {
      slug: book.slug,
      chapterTitle: readAudibleChapters(book.chaptersFile).find(
        entry => entry.startMs === Math.round(book.chapterStartSeconds * 1000),
      )?.title,
      proof: '2min',
      words: wordCounts[book.slug] ?? 0,
      instantWords: words,
    }
  })
  console.log(
    JSON.stringify({
      items: check.items.length,
      chapters: check.chapters.length,
      segments: check.segments.length,
      books: written,
    }),
  )
}

await ingest()
