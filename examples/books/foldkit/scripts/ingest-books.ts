import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { init } from '@instantdb/admin'

import { newEarthChapters } from '../../core/src/new-earth-chapters.ts'
import schema from '../instant.schema.ts'

const here = dirname(fileURLToPath(import.meta.url))
const EVOCATION_START_SECONDS = 18.669
const PUBLISHED_AT = Date.parse('2005-10-11T00:00:00.000Z')
const CHUNK = 40

const uuidFrom = (name: string): string => {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')
  const hash = createHash('sha1').update(namespace).update(name).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const idFor = (name: string): string => uuidFrom(`books.knophy.com/${name}`)

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

const readWords = (): WordsFile | undefined => {
  const path = resolve(here, '../public/a-new-earth-evocation.words.json')
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WordsFile
  } catch {
    return undefined
  }
}

const offsetWords = (file: WordsFile): ReadonlyArray<SpokenWord> =>
  file.words.map(word => {
    const relativeStartMs = Math.round((word.start + EVOCATION_START_SECONDS) * 1000)
    const relativeEndMs = Math.round((word.end + EVOCATION_START_SECONDS) * 1000)
    return {
      kind: 'spoken',
      text: word.text,
      language: 'en',
      relativeStartMs,
      relativeEndMs,
      wallStartMs: PUBLISHED_AT + relativeStartMs,
      wallEndMs: PUBLISHED_AT + relativeEndMs,
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

const ingest = async (): Promise<void> => {
  const appId = requireEnv('INSTANT_APP_ID')
  const adminToken = requireEnv('INSTANT_APP_ADMIN_TOKEN')
  const db = init({ adminToken, appId, schema })
  const wordsFile = readWords()
  const spoken = wordsFile === undefined ? [] : offsetWords(wordsFile)
  const evocationBody = wordsFile?.body ?? 'Chapter One. Evocation.'
  const audioPath = resolve(here, '../public/media/a-new-earth.mp3')
  const coverPath = resolve(here, '../public/media/a-new-earth.jpg')
  const audioSize = statSync(audioPath).size
  const coverSize = statSync(coverPath).size
  const lastChapter = newEarthChapters[newEarthChapters.length - 1]
  const durationMs = Math.round((lastChapter?.end ?? 33181.361) * 1000)

  const authorTolle = idFor('author/eckhart-tolle')
  const authorHerbert = idFor('author/frank-herbert')
  const authorButler = idFor('author/octavia-butler')
  const narratorTolle = idFor('narrator/eckhart-tolle')
  const shelfId = idFor('shelf/home')
  const bookNewEarth = idFor('book/a-new-earth')
  const bookDune = idFor('book/dune')
  const bookKindred = idFor('book/kindred')
  const audioNewEarth = idFor('rendition/a-new-earth/audio')
  const textNewEarth = idFor('rendition/a-new-earth/text')
  const textDune = idFor('rendition/dune/text')
  const textKindred = idFor('rendition/kindred/text')
  const fileAudio = idFor('file/a-new-earth/audio')
  const fileCover = idFor('file/a-new-earth/cover')
  const itemNewEarth = idFor('item/a-new-earth')
  const itemDune = idFor('item/dune')
  const itemKindred = idFor('item/kindred')
  const chapterIds = newEarthChapters.map(chapter =>
    idFor(`chapter/a-new-earth/${chapter.index}`),
  )
  const evocationChapterId = chapterIds[1]
  if (evocationChapterId === undefined) {
    throw new Error('Evocation chapter is missing')
  }
  const segmentEvocation = idFor('segment/a-new-earth/evocation')
  const duneChapter = idFor('chapter/dune/0')
  const kindredChapter = idFor('chapter/kindred/0')

  const ops: Array<unknown> = [
    db.tx.authors[authorTolle].update({
      name: 'Eckhart Tolle',
      sortName: 'Tolle, Eckhart',
    }),
    db.tx.authors[authorHerbert].update({
      name: 'Frank Herbert',
      sortName: 'Herbert, Frank',
    }),
    db.tx.authors[authorButler].update({
      name: 'Octavia E. Butler',
      sortName: 'Butler, Octavia E.',
    }),
    db.tx.narrators[narratorTolle].update({
      name: 'Eckhart Tolle',
      sortName: 'Tolle, Eckhart',
    }),
    db.tx.shelves[shelfId].update({
      name: 'Home',
      createdAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    }),
    db.tx.books[bookNewEarth]
      .update({
        title: 'A New Earth',
        subtitle: "Awakening to Your Life's Purpose",
        identifiers: [{ kind: 'asin', value: 'B002V0RAUU' }],
        bindingKind: 'audiobook',
        publishedKind: 'year',
        publishedYear: 2005,
        explicitKind: 'unknown',
        matchKind: 'manual',
        language: 'en',
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({
        authors: authorTolle,
        narrators: narratorTolle,
        cover: fileCover,
      }),
    db.tx.books[bookDune]
      .update({
        title: 'Dune',
        identifiers: [],
        bindingKind: 'ebook',
        publishedKind: 'year',
        publishedYear: 1965,
        explicitKind: 'unknown',
        matchKind: 'manual',
        language: 'en',
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ authors: authorHerbert }),
    db.tx.books[bookKindred]
      .update({
        title: 'Kindred',
        identifiers: [],
        bindingKind: 'ebook',
        publishedKind: 'year',
        publishedYear: 1979,
        explicitKind: 'unknown',
        matchKind: 'manual',
        language: 'en',
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ authors: authorButler }),
    db.tx.files[fileCover]
      .update({
        name: 'a-new-earth.jpg',
        path: '/media/a-new-earth.jpg',
        size: coverSize,
        presenceKind: 'local',
        bodyKind: 'image',
        addedAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      }),
    db.tx.renditions[audioNewEarth]
      .update({
        language: 'en',
        title: 'A New Earth audio',
        originKind: 'import',
        volumeKind: 'single',
        bodyKind: 'audio',
        durationMs,
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ book: bookNewEarth }),
    db.tx.renditions[textNewEarth]
      .update({
        language: 'en',
        title: 'A New Earth text',
        originKind: 'import',
        volumeKind: 'single',
        bodyKind: 'text',
        length: evocationBody.length,
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ book: bookNewEarth }),
    db.tx.renditions[textDune]
      .update({
        language: 'en',
        title: 'Dune text',
        originKind: 'import',
        volumeKind: 'single',
        bodyKind: 'text',
        length: 88,
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ book: bookDune }),
    db.tx.renditions[textKindred]
      .update({
        language: 'en',
        title: 'Kindred text',
        originKind: 'import',
        volumeKind: 'single',
        bodyKind: 'text',
        length: 32,
        createdAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ book: bookKindred }),
    db.tx.files[fileAudio]
      .update({
        name: 'a-new-earth.mp3',
        path: '/media/a-new-earth.mp3',
        size: audioSize,
        presenceKind: 'local',
        bodyKind: 'audio',
        durationMs,
        addedAt: PUBLISHED_AT,
        updatedAt: PUBLISHED_AT,
      })
      .link({ rendition: audioNewEarth }),
    db.tx.chapters[duneChapter]
      .update({
        index: 0,
        title: 'Dune',
        bindingKind: 'ebook',
        startMs: 0,
        endMs: 0,
      })
      .link({ book: bookDune }),
    db.tx.chapters[kindredChapter]
      .update({
        index: 0,
        title: 'Kindred',
        bindingKind: 'ebook',
        startMs: 0,
        endMs: 0,
      })
      .link({ book: bookKindred }),
    db.tx.items[itemNewEarth]
      .update({
        addedAt: PUBLISHED_AT,
        presenceKind: 'local',
        preferredKind: 'both',
      })
      .link({
        book: bookNewEarth,
        shelf: shelfId,
        preferredAudio: audioNewEarth,
        preferredText: textNewEarth,
      }),
    db.tx.items[itemDune]
      .update({
        addedAt: PUBLISHED_AT,
        presenceKind: 'local',
        preferredKind: 'both',
      })
      .link({
        book: bookDune,
        shelf: shelfId,
        preferredText: textDune,
      }),
    db.tx.items[itemKindred]
      .update({
        addedAt: PUBLISHED_AT,
        presenceKind: 'local',
        preferredKind: 'text',
      })
      .link({
        book: bookKindred,
        shelf: shelfId,
        preferredText: textKindred,
      }),
  ]

  for (const [index, chapter] of newEarthChapters.entries()) {
    const chapterId = chapterIds[index]
    if (chapterId === undefined) {
      continue
    }
    ops.push(
      db.tx.chapters[chapterId]
        .update({
          index: chapter.index,
          title: chapter.title,
          bindingKind: 'audiobook',
          startMs: Math.round(chapter.start * 1000),
          endMs: Math.round(chapter.end * 1000),
        })
        .link({ book: bookNewEarth }),
    )
  }

  const evocation = newEarthChapters[1]
  ops.push(
    db.tx.segments[segmentEvocation]
      .update({
        index: 0,
        isFinal: true,
        wallStart: PUBLISHED_AT + Math.round(EVOCATION_START_SECONDS * 1000),
        wallEnd: PUBLISHED_AT + Math.round((evocation?.end ?? 483.955) * 1000),
        relativeStartMs: Math.round(EVOCATION_START_SECONDS * 1000),
        relativeEndMs: Math.round((evocation?.end ?? 483.955) * 1000),
        words: spoken,
      })
      .link({ rendition: audioNewEarth, chapter: evocationChapterId }),
  )

  await transactAll(ops => db.transact(ops as never), ops)
  const check = await db.query({
    items: { book: { authors: {}, chapters: {} } },
    chapters: {},
    segments: {},
  })
  console.log(
    JSON.stringify({
      appId,
      items: check.items.length,
      chapters: check.chapters.length,
      segments: check.segments.length,
      spokenWords: spoken.length,
    }),
  )
}

await ingest()
