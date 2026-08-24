import { Array, Option, Schema as S, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Chord } from './chord.js'
import { LineId, WordId, wordIdAt } from './ids.js'

/** One lyric word. */
export const Word = S.Struct({
  id: WordId,
  text: NonEmptyString,
})
/** One lyric word. */
export type Word = typeof Word.Type

/** A chord sitting on a word in this line. */
export const Placed = S.Struct({
  word: Word,
  chord: Chord,
})
/** A chord sitting on a word in this line. */
export type Placed = typeof Placed.Type

/** No chords on a line. */
export const ChordsNone = ts('None')
/** Chords placed on words of this line. */
export const ChordsSome = ts('Some', { items: S.NonEmptyArray(Placed) })
/** Chords on a lyric line. */
export const Chords = S.Union([ChordsNone, ChordsSome])
/** Chords on a lyric line. */
export type Chords = typeof Chords.Type

/** A blank lyric line. */
export const Blank = ts('Blank')
/** A line with words. Chords are members of those words. */
export const Words = ts('Words', {
  items: S.NonEmptyArray(Word),
  chords: Chords,
})

const withMembers = <Schema extends object, Members extends object>(
  schema: Schema,
  members: Members,
): Schema & Members => {
  const handler: ProxyHandler<Schema> = {
    get(target, property, receiver) {
      if (Object.hasOwn(members, property)) {
        return Reflect.get(members, property)
      }
      return Reflect.get(target, property, receiver)
    },
    has(target, property) {
      return Object.hasOwn(members, property) || Reflect.has(target, property)
    },
  }
  if (typeof schema === 'function') {
    handler.apply = (target, thisArg, argumentsList) =>
      Reflect.apply(
        target as unknown as (...args: Array<never>) => unknown,
        thisArg,
        argumentsList,
      )
  }
  return new Proxy(schema, handler) as Schema & Members
}

/** One lyric line. Body is Blank or Words. */
export const Line = withMembers(
  S.Struct({
    id: LineId,
    body: S.Union([Blank, Words]),
  }),
  { Blank, Words },
)
/** One lyric line. */
export type Line = typeof Line.Type

const WORD = /\S+/g

/** Splits a lyric into words with stable ids. */
export const wordsOf = (lineId: LineId, lyric: string): ReadonlyArray<Word> =>
  pipe(
    Array.fromIterable(lyric.matchAll(WORD)),
    Array.flatMap(match => {
      const text = match[0]
      const start = match.index
      if (text === undefined || start === undefined || text === '') {
        return []
      }
      return [
        Word.make({
          id: wordIdAt(lineId, start),
          text: NonEmptyString.make(text),
        }),
      ]
    }),
  )

/** Builds a line from pasted lyric text. */
export const lineFromLyric = (lineId: LineId, lyric: string): Line => {
  const items = wordsOf(lineId, lyric)
  return Array.match(items, {
    onEmpty: () => Line.make({ id: lineId, body: Blank() }),
    onNonEmpty: words =>
      Line.make({
        id: lineId,
        body: Words.make({
          items: words,
          chords: ChordsNone(),
        }),
      }),
  })
}

/** Prints the lyric text of a line. */
export const lyricOf = (line: Line): string => {
  if (line.body._tag === 'Blank') {
    return ''
  }
  return pipe(
    line.body.items,
    Array.map(word => word.text),
    Array.join(' '),
  )
}

/** Finds a word member on a line. */
export const findWord = (line: Line, wordId: WordId): Option.Option<Word> => {
  if (line.body._tag === 'Blank') {
    return Option.none()
  }
  return Array.findFirst(line.body.items, word => word.id === wordId)
}
