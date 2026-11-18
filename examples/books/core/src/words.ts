import { Array, Equivalence, Match as M, Option, Schema as S } from 'effect'
import {
  TranscriptExcerpt,
  type TranscriptExcerptOptions,
  TranscriptExcerptWire,
  type TranscriptNode,
  transcriptAt,
  transcriptExcerptLines,
  transcriptExcerptOf,
  transcriptsOf,
  wordAddressOf,
} from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { Milliseconds, TitleSlug, clockOf } from './ids.js'
import { placePathOf, wordPathOf } from './links.js'
import {
  type Loaded,
  type Model,
  type Title,
  chapterNameAt,
  loadedTitleOf,
  placeOf,
} from './model.js'

// WORDS

/**
 * The title in the player as the words' heading: which book, the chapter
 * being heard, the place in milliseconds and as a clock, how long the
 * title runs, whether it is sounding, the place's link, the same address
 * the player keeps, `/books/the-lantern-keeper/listen/12m03s`, and the
 * link to the word being spoken, the time that word starts,
 * `/books/the-lantern-keeper/listen/12m03.45s`, once a word is known.
 */
export const WordsHeader = S.Struct({
  slug: TitleSlug,
  title: S.String,
  maybeChapter: S.OptionFromOptionalKey(S.String),
  placeMs: Milliseconds,
  place: S.String,
  durationMs: Milliseconds,
  isPlaying: S.Boolean,
  link: S.String,
  maybeWordLink: S.OptionFromOptionalKey(S.String),
  maybeWordStartMs: S.OptionFromOptionalKey(Milliseconds),
})
/** The title in the player as the words' heading. */
export type WordsHeader = typeof WordsHeader.Type

/** No title is in this device's player. */
export const NothingInPlayer = ts('NothingInPlayer')
/**
 * A title is in the player and there are no words to show for its place,
 * and why in a sentence: they are on their way, they could not be read,
 * or this part has no transcript yet.
 */
export const WordsWaiting = ts('WordsWaiting', {
  header: WordsHeader,
  sentence: S.String,
})
/** The paragraph being read in the player, with those around it. */
export const WordsNow = ts('WordsNow', {
  header: WordsHeader,
  excerpt: TranscriptExcerpt,
})

/**
 * The words being read in this device's player, whatever page is
 * showing: nothing in the player, a title with no words for its place
 * yet, or the paragraph being read with the paragraphs around it.
 */
export const SpokenWords = S.Union([NothingInPlayer, WordsWaiting, WordsNow])
/** The words being read in this device's player. */
export type SpokenWords = typeof SpokenWords.Type

const HeaderWire = WordsHeader.pipe(
  S.encodeKeys({
    maybeChapter: 'chapter',
    maybeWordLink: 'wordLink',
    maybeWordStartMs: 'wordStartMs',
  }),
)

/**
 * The words being read as one line of JSON, with no `maybe` in its keys:
 * `{"_tag":"WordsNow","header":{"slug":"the-lantern-keeper","chapter":"The Tide","place":"0:36",…},"excerpt":{"paragraphs":[…],"currentWord":"trimmed","currentWordIndex":1}}`.
 */
export const SpokenWordsJson = S.fromJsonString(
  S.toCodecJson(
    S.Union([
      NothingInPlayer,
      ts('WordsWaiting', { header: HeaderWire, sentence: S.String }),
      ts('WordsNow', { header: HeaderWire, excerpt: TranscriptExcerptWire }),
    ]),
  ),
)

const wordStartOf = (
  maybeTranscript: Option.Option<TranscriptNode>,
): Option.Option<Milliseconds> =>
  Option.map(
    Option.flatMap(maybeTranscript, transcript =>
      Option.flatMap(
        Array.findFirst(
          Array.flatMap(transcript.passages, passage => passage.words),
          word => word.isCurrent === true,
        ),
        wordAddressOf,
      ),
    ),
    startMs => Milliseconds.make(startMs),
  )

const headerOf = (
  model: Model,
  title: Title,
  loaded: Loaded,
  maybeTranscript: Option.Option<TranscriptNode>,
): WordsHeader => {
  const placeMs = placeOf(loaded)
  const maybeWordStartMs = wordStartOf(maybeTranscript)
  return {
    slug: title.slug,
    title: title.name,
    maybeChapter: chapterNameAt(model, title.slug, placeMs),
    placeMs,
    place: clockOf(placeMs),
    durationMs: title.durationMs,
    isPlaying: TranscriptPlayer.isSounding(loaded.player),
    link: placePathOf(title.slug, placeMs),
    maybeWordLink: Option.map(maybeWordStartMs, startMs =>
      wordPathOf(title.slug, startMs),
    ),
    maybeWordStartMs,
  }
}

const waitingSentenceOf = (player: TranscriptPlayer.Model): string =>
  M.value(player.transcript).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      TranscriptLoading: () => 'Loading the words…',
      TranscriptUnavailable: ({ reason }) =>
        `The words could not be read: ${reason}`,
      TranscriptLoaded: () => 'There is no transcript for this part yet.',
    }),
  )

/**
 * The words being read in this device's player, from the Model alone, so
 * every Client says the same thing: the title, chapter, place and link,
 * then the paragraph being read with `leading` paragraphs before it and
 * `trailing` after, one of each unless told otherwise. The paragraphs are
 * the ones the player's own transcript shows. The word marked is the one
 * at the place the player last reported, once a second; with `nowMs`, a
 * wall-clock time, it is the word being spoken at that moment, read from
 * the transcript's clock, so a Client that asks many times a second moves
 * on the word, and the header's link to the word is that word's. Nothing
 * is sent or synced for it.
 *
 * @example
 * ```typescript
 * spokenWordsOf(model, { leading: 1, trailing: 2 })
 * // WordsNow({ header: { title: 'The Lantern Keeper', place: '0:36', … }, excerpt: { paragraphs: [Leading, Current, Trailing, Trailing], … } })
 * ```
 */
export const spokenWordsOf = (
  model: Model,
  options: TranscriptExcerptOptions = {},
  nowMs?: number,
): SpokenWords =>
  Option.match(loadedTitleOf(model), {
    onNone: () => NothingInPlayer(),
    onSome: ({ title, loaded }) => {
      const maybeTranscript = Option.map(
        Array.head(transcriptsOf(TranscriptPlayer.transcriptOf(loaded.player))),
        transcript =>
          nowMs === undefined ? transcript : transcriptAt(transcript, nowMs),
      )
      const header = headerOf(model, title, loaded, maybeTranscript)
      return Option.match(
        Option.flatMap(maybeTranscript, transcript =>
          transcriptExcerptOf(transcript, options),
        ),
        {
          onNone: () =>
            WordsWaiting({
              header,
              sentence: waitingSentenceOf(loaded.player),
            }),
          onSome: excerpt => WordsNow({ header, excerpt }),
        },
      )
    },
  })

const headerLineOf = (header: WordsHeader): string =>
  Array.join(
    [
      `# ${header.title}`,
      ...Array.fromOption(header.maybeChapter),
      `${header.place} of ${clockOf(header.durationMs)}`,
      header.isPlaying ? 'playing' : 'paused',
      header.link,
    ],
    ' · ',
  )

/**
 * The words being read as lines for a pipe. The first line starts with
 * `#` and names the title, chapter, place, whether it plays, and the
 * place's link; then one line per paragraph, `-` before a leading one,
 * `>` before the one being read, `+` before a trailing one, as
 * `transcriptExcerptLines` prints them. With no words to show, a second
 * `#` line says why.
 *
 * @example
 * ```typescript
 * spokenWordsLines(spokenWordsOf(model))
 * // ['# The Lantern Keeper · The Tide · 0:36 of 1:20:00 · playing · /books/the-lantern-keeper/listen/36s',
 * //  '- 0:30 The keeper climbed the stairs at dusk.',
 * //  '> 0:35 He [trimmed] the wick and waited.',
 * //  '+ 0:40 Far out a bell answered the lamp.']
 * ```
 */
export const spokenWordsLines = (words: SpokenWords): ReadonlyArray<string> =>
  M.value(words).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      NothingInPlayer: () => ['# Nothing is in the player.'],
      WordsWaiting: ({ header, sentence }) => [
        headerLineOf(header),
        `# ${sentence}`,
      ],
      WordsNow: ({ header, excerpt }) => [
        headerLineOf(header),
        ...transcriptExcerptLines(excerpt),
      ],
    }),
  )

const paragraphKeyOf = (words: SpokenWords): string =>
  M.value(words).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NothingInPlayer: () => 'nothing',
      WordsWaiting: ({ header, sentence }) =>
        Array.join([header.slug, header.isPlaying.toString(), sentence], '\n'),
      WordsNow: ({ header, excerpt }) =>
        Array.join(
          [
            header.slug,
            header.isPlaying.toString(),
            ...Array.map(
              excerpt.paragraphs,
              paragraph => `${paragraph.position}:${paragraph.key}`,
            ),
          ],
          '\n',
        ),
    }),
  )

/**
 * True while two readings of the words show the same paragraphs of the
 * same title in the same state, so only the word sounding and the second
 * have moved. A Client that follows by paragraph prints again only when
 * this is false.
 *
 * @example
 * ```typescript
 * Interaction.follow(bound, () => spokenWordsOf(bound.readModel()), isSameParagraph)
 * ```
 */
export const isSameParagraph = (
  self: SpokenWords,
  that: SpokenWords,
): boolean => paragraphKeyOf(self) === paragraphKeyOf(that)

// FOLLOWING

/**
 * A word as its time arrives: its text, the millisecond it starts, that
 * place as a clock, and the link that opens the book on it,
 * `/books/the-lantern-keeper/listen/12m03.45s`.
 */
export const WordSpoken = ts('WordSpoken', {
  text: S.String,
  startMs: Milliseconds,
  place: S.String,
  link: S.String,
})
/** Playback paused, at this place. */
export const Paused = ts('Paused', { placeMs: Milliseconds, place: S.String })
/** Playback plays, from this place. */
export const Playing = ts('Playing', { placeMs: Milliseconds, place: S.String })

/**
 * What a follower of the words hears, one thing at a time: the paragraph
 * being read with those around it when it changes (the same reading
 * `spokenWordsOf` gives), each word as its time arrives, and a turn when
 * playback pauses or plays.
 */
export const WordsHeard = S.Union([
  NothingInPlayer,
  WordsWaiting,
  WordsNow,
  WordSpoken,
  Paused,
  Playing,
])
/** What a follower of the words hears, one thing at a time. */
export type WordsHeard = typeof WordsHeard.Type

/**
 * What a follower hears as one line of JSON: a paragraph as
 * `SpokenWordsJson` prints it, a word as
 * `{"_tag":"WordSpoken","text":"trimmed","startMs":36600,"place":"0:36","link":"/books/the-lantern-keeper/listen/36.6s"}`,
 * a turn as `{"_tag":"Paused","placeMs":36100,"place":"0:36"}`.
 */
export const WordsHeardJson = S.fromJsonString(
  S.toCodecJson(
    S.Union([
      NothingInPlayer,
      ts('WordsWaiting', { header: HeaderWire, sentence: S.String }),
      ts('WordsNow', { header: HeaderWire, excerpt: TranscriptExcerptWire }),
      WordSpoken,
      Paused,
      Playing,
    ]),
  ),
)

/** How a follower wants the words: `paragraphsOnly` leaves the words out. */
export type WordsHeardOptions = Readonly<{ paragraphsOnly?: boolean }>

const placeKeyOf = (words: SpokenWords): string =>
  M.value(words).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NothingInPlayer: () => 'nothing',
      WordsWaiting: ({ header, sentence }) =>
        Array.join([header.slug, sentence], '\n'),
      WordsNow: ({ header, excerpt }) =>
        Array.join(
          [
            header.slug,
            ...Array.map(
              excerpt.paragraphs,
              paragraph => `${paragraph.position}:${paragraph.key}`,
            ),
          ],
          '\n',
        ),
    }),
  )

const headerOfWords = (words: SpokenWords): Option.Option<WordsHeader> =>
  words._tag === 'NothingInPlayer' ? Option.none() : Option.some(words.header)

const wordSpokenOf = (words: SpokenWords): Option.Option<WordsHeard> =>
  words._tag === 'WordsNow'
    ? Option.flatMap(words.header.maybeWordStartMs, startMs =>
        Option.flatMap(words.header.maybeWordLink, link =>
          Option.map(words.excerpt.maybeCurrentWord, text =>
            WordSpoken({ text, startMs, place: clockOf(startMs), link }),
          ),
        ),
      )
    : Option.none()

const turnOf = (
  previous: SpokenWords,
  next: SpokenWords,
): Option.Option<WordsHeard> =>
  Option.flatMap(headerOfWords(next), header =>
    Option.exists(
      headerOfWords(previous),
      before => before.isPlaying !== header.isPlaying,
    )
      ? Option.some(
          header.isPlaying
            ? Playing({ placeMs: header.placeMs, place: header.place })
            : Paused({ placeMs: header.placeMs, place: header.place }),
        )
      : Option.none(),
  )

const isWordMoved = (previous: SpokenWords, next: SpokenWords): boolean =>
  !Option.makeEquivalence(Equivalence.Number)(
    Option.flatMap(headerOfWords(previous), header => header.maybeWordStartMs),
    Option.flatMap(headerOfWords(next), header => header.maybeWordStartMs),
  )

/**
 * What a follower hears between two readings of the words, from the one
 * before (none when it starts to follow) to the one now: the paragraph and
 * its word when the title or the paragraph changed; otherwise one turn
 * when playback paused or plays, never the paragraph again for that, and
 * the word when the word moved. With `paragraphsOnly`, no words. Every
 * Client that follows the words derives what it prints from this.
 *
 * @example
 * ```typescript
 * wordsHeardBetween(Option.some(before), spokenWordsOf(model, {}, Date.now()))
 * // [WordSpoken({ text: 'trimmed', startMs: 36600, place: '0:36', link: '/books/…/listen/36.6s' })]
 * ```
 */
export const wordsHeardBetween = (
  maybePrevious: Option.Option<SpokenWords>,
  next: SpokenWords,
  options: WordsHeardOptions = {},
): ReadonlyArray<WordsHeard> => {
  const word =
    options.paragraphsOnly === true ? [] : Array.fromOption(wordSpokenOf(next))
  return Option.match(maybePrevious, {
    onNone: () => [next, ...word],
    onSome: previous =>
      placeKeyOf(previous) === placeKeyOf(next)
        ? [
            ...Array.fromOption(turnOf(previous, next)),
            ...(isWordMoved(previous, next) ? word : []),
          ]
        : [next, ...word],
  })
}

/**
 * What a follower hears as lines for a pipe: a paragraph as
 * `spokenWordsLines` prints it; a word on a line that starts with `.`,
 * then its time, its text and its link; a turn on a `#` line.
 *
 * @example
 * ```typescript
 * wordsHeardLines(WordSpoken({ text: 'trimmed', startMs, place: '0:36', link }))
 * // ['. 0:36 trimmed /books/the-lantern-keeper/listen/36.6s']
 * wordsHeardLines(Paused({ placeMs, place: '0:36' })) // ['# paused at 0:36']
 * ```
 */
export const wordsHeardLines = (heard: WordsHeard): ReadonlyArray<string> =>
  M.value(heard).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      NothingInPlayer: spokenWordsLines,
      WordsWaiting: spokenWordsLines,
      WordsNow: spokenWordsLines,
      WordSpoken: ({ place, text, link }) => [`. ${place} ${text} ${link}`],
      Paused: ({ place }) => [`# paused at ${place}`],
      Playing: ({ place }) => [`# playing from ${place}`],
    }),
  )
