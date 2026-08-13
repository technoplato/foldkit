import {
  type Bookmark,
  type Item,
  type Note,
  type Preferred,
  type Progress,
  type Word,
} from 'books-core-example'
import { Option } from 'effect'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  return fallback
}

const asArray = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : []

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined

const field = (row: Record<string, unknown>, key: string): unknown => row[key]

const preferredFromKind = (kind: string): Preferred => {
  if (kind === 'audio') {
    return 'Audio'
  }
  if (kind === 'text') {
    return 'Text'
  }
  if (kind === 'both') {
    return 'Both'
  }
  return 'None'
}

const wordsFromSegments = (
  segments: ReadonlyArray<unknown>,
): ReadonlyArray<Word> =>
  asArray(segments)
    .slice()
    .sort(
      (left, right) =>
        asNumber(field(asRecord(left) ?? {}, 'index')) -
        asNumber(field(asRecord(right) ?? {}, 'index')),
    )
    .flatMap(segment => {
      const row = asRecord(segment)
      if (row === undefined) {
        return []
      }
      const segmentId = asString(field(row, 'id'), 'segment')
      return asArray(field(row, 'words')).flatMap((word, index) => {
        const token = asRecord(word)
        if (token === undefined) {
          return []
        }
        const text = asString(field(token, 'text'))
        if (text === '') {
          return []
        }
        return [
          {
            id: `${segmentId}-w${index}`,
            text,
            start: asNumber(field(token, 'relativeStartMs')) / 1000,
            end: asNumber(field(token, 'relativeEndMs')) / 1000,
          },
        ]
      })
    })

const bodyFromWords = (words: ReadonlyArray<Word>, fallback: string): string =>
  words.length === 0 ? fallback : words.map(word => word.text).join(' ')

/** Maps Instant catalog item rows onto the Foldkit shelf Item. */
export const itemsFromCatalog = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<Item> =>
  rows.flatMap(row => {
    const item = asRecord(row)
    if (item === undefined) {
      return []
    }
    const id = asString(field(item, 'id'))
    const book = asRecord(field(item, 'book'))
    if (id === '' || book === undefined) {
      return []
    }
    const authors = asArray(field(book, 'authors'))
      .map(author => asString(field(asRecord(author) ?? {}, 'name')))
      .filter(name => name !== '')
    const chapters = asArray(field(book, 'chapters'))
      .map(chapter => asRecord(chapter))
      .flatMap(chapter => {
        if (chapter === undefined) {
          return []
        }
        const chapterId = asString(field(chapter, 'id'))
        if (chapterId === '') {
          return []
        }
        return [
          {
            id: chapterId,
            index: asNumber(field(chapter, 'index')),
            title: asString(field(chapter, 'title'), 'Untitled'),
            start: asNumber(field(chapter, 'startMs')) / 1000,
            end: asNumber(field(chapter, 'endMs')) / 1000,
          },
        ]
      })
      .sort((left, right) => left.index - right.index)
    const audio = asRecord(field(item, 'preferredAudio'))
    const text = asRecord(field(item, 'preferredText'))
    const audioFiles = asArray(audio === undefined ? [] : field(audio, 'files'))
    const audioFile = audioFiles
      .map(file => asRecord(file))
      .find(file => file !== undefined && asString(field(file, 'path')) !== '')
    const audioPath =
      audioFile === undefined ? '' : asString(field(audioFile, 'path'))
    const cover = asRecord(field(book, 'cover'))
    const coverPath = cover === undefined ? '' : asString(field(cover, 'path'))
    const segments = asArray(
      audio === undefined ? [] : field(audio, 'segments'),
    )
    const words = wordsFromSegments(segments)
    const title = asString(field(book, 'title'), 'Untitled')
    return [
      {
        id,
        title,
        authorLabel: authors.join(', '),
        preferred: preferredFromKind(
          asString(field(item, 'preferredKind'), 'none'),
        ),
        textId:
          text === undefined
            ? Option.none()
            : Option.some(asString(field(text, 'id'))),
        audioId:
          audio === undefined
            ? Option.none()
            : Option.some(asString(field(audio, 'id'))),
        audioUrl: audioPath === '' ? Option.none() : Option.some(audioPath),
        coverUrl: coverPath === '' ? Option.none() : Option.some(coverPath),
        body: bodyFromWords(words, title),
        words,
        chapters,
      },
    ]
  })

const linkedId = (value: unknown): string =>
  asString(field(asRecord(value) ?? {}, 'id'))

/** Maps one Instant account graph onto Foldkit bookmarks, notes, and progress. */
export const userDataFromAccount = (
  account: unknown,
): {
  readonly bookmarks: ReadonlyArray<Bookmark>
  readonly notes: ReadonlyArray<Note>
  readonly progress: ReadonlyArray<Progress>
} => {
  const row = asRecord(account)
  if (row === undefined) {
    return { bookmarks: [], notes: [], progress: [] }
  }
  const bookmarks = asArray(field(row, 'bookmarks')).flatMap(bookmark => {
    const mark = asRecord(bookmark)
    if (mark === undefined) {
      return []
    }
    const id = asString(field(mark, 'id'))
    const itemId = linkedId(field(mark, 'item'))
    const chapterId = linkedId(field(mark, 'chapter'))
    const renditionId = linkedId(field(mark, 'rendition'))
    if (id === '' || itemId === '' || chapterId === '' || renditionId === '') {
      return []
    }
    return [
      {
        id,
        itemId,
        chapterId,
        renditionId,
        relative: asNumber(field(mark, 'relativeMs')) / 1000,
        createdAt: asNumber(field(mark, 'createdAt')),
      },
    ]
  })
  const notes = asArray(field(row, 'notes')).flatMap(note => {
    const entry = asRecord(note)
    if (entry === undefined) {
      return []
    }
    const id = asString(field(entry, 'id'))
    const itemId = linkedId(field(entry, 'item'))
    const body = asString(field(entry, 'body'))
    if (id === '' || itemId === '' || body === '') {
      return []
    }
    const chapterId = linkedId(field(entry, 'chapter'))
    const renditionId = linkedId(field(entry, 'rendition'))
    const relativeMs = field(entry, 'relativeMs')
    return [
      {
        id,
        itemId,
        body,
        chapterId: chapterId === '' ? Option.none() : Option.some(chapterId),
        renditionId:
          renditionId === '' ? Option.none() : Option.some(renditionId),
        relative:
          typeof relativeMs === 'number'
            ? Option.some(relativeMs / 1000)
            : Option.none(),
        createdAt: asNumber(field(entry, 'createdAt')),
        updatedAt: asNumber(field(entry, 'updatedAt')),
      },
    ]
  })
  const progress = asArray(field(row, 'progress')).flatMap(entry => {
    const progressRow = asRecord(entry)
    if (progressRow === undefined) {
      return []
    }
    const id = asString(field(progressRow, 'id'))
    const itemId = linkedId(field(progressRow, 'item'))
    const chapterId = linkedId(field(progressRow, 'chapter'))
    const renditionId = linkedId(field(progressRow, 'rendition'))
    if (id === '' || itemId === '' || chapterId === '' || renditionId === '') {
      return []
    }
    return [
      {
        id,
        itemId,
        chapterId,
        renditionId,
        relative: asNumber(field(progressRow, 'relativeMs')) / 1000,
        finished: asString(field(progressRow, 'finishedKind')) === 'finished',
        hidden: asString(field(progressRow, 'hiddenKind')) === 'hidden',
        startedAt: asNumber(field(progressRow, 'startedAt')),
        updatedAt: asNumber(field(progressRow, 'updatedAt')),
      },
    ]
  })
  return { bookmarks, notes, progress }
}
