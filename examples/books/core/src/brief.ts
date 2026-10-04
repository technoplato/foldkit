import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import { Column, Text, type UiNode } from 'foldkit/renderers'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { Milliseconds, clockOf } from './ids.js'
import {
  AddBookmark,
  Listen,
  NextSection,
  Pause,
  Play,
  SeekTo,
  SkipBack,
  SkipForward,
} from './message.js'
import {
  type Loaded,
  type Model,
  type Title,
  chapterAt,
  continueOf,
  loadedTitleOf,
  placeOf,
  resumePlaceOf,
  titleOf,
  titlesOf,
} from './model.js'

// BRIEF

const minuteMs = 60_000

const hourMs = 60 * minuteMs

const titlesToSuggest = 3

const placeLineOf = (title: Title, place: Milliseconds): string =>
  `${chapterAt(title, place).name} · ${clockOf(place)} of ${clockOf(title.durationMs)} · ${TranscriptPlayer.leftWordsOf(title.durationMs - place)}`

const transportLineOf = (title: Title, loaded: Loaded): string =>
  M.value(loaded.player.transport).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Playing: () => `▶ Playing ${title.name}`,
      Paused: () => `❚❚ Paused ${title.name}`,
      Unplayable: () => `■ Stopped ${title.name}`,
    }),
  )

const wordsLinesOf = (player: TranscriptPlayer.Model): ReadonlyArray<UiNode> =>
  M.value(player.transcript).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      TranscriptLoading: () => [Text('Loading the words…', { dim: true })],
      TranscriptUnavailable: ({ reason }) => [
        Text(`The words could not be read: ${reason}`, { dim: true }),
      ],
      TranscriptLoaded: () =>
        Array.fromOption(
          Option.map(TranscriptPlayer.spokenLineOf(player), line =>
            Text(`“${line}”`),
          ),
        ),
    }),
  )

const loadedLinesOf = (title: Title, loaded: Loaded): ReadonlyArray<UiNode> => [
  Text(transportLineOf(title, loaded), { emphasis: 'Headline' }),
  Text(placeLineOf(title, placeOf(loaded)), { dim: true }),
  ...TranscriptPlayer.problemOf(loaded.player),
  ...wordsLinesOf(loaded.player),
]

const idleLinesOf = (model: Model): ReadonlyArray<UiNode> => [
  Text('Nothing is playing.', { emphasis: 'Headline' }),
  ...Array.fromOption(
    Option.flatMap(continueOf(model), progress =>
      Option.map(titleOf(model, progress.slug), title =>
        Text(
          `Continue ${title.name}: ${placeLineOf(title, resumePlaceOf(model, title.slug))}`,
          { dim: true },
        ),
      ),
    ),
  ),
]

const libraryLinesOf = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.library).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      ShelfLoading: () => [Text('Opening your library…', { dim: true })],
      ShelfUnavailable: ({ reason }) => [
        Text(`Your library could not be opened: ${reason}`),
      ],
      ShelfReady: () =>
        Option.match(loadedTitleOf(model), {
          onNone: () => idleLinesOf(model),
          onSome: ({ title, loaded }) => loadedLinesOf(title, loaded),
        }),
    }),
  )

/**
 * Books in a few lines, for a surface with little room, such as a
 * terminal after `books pause`: what is playing and whether it plays, the
 * chapter, how far in, and how long is left, and the words being spoken;
 * what to continue when nothing plays; and the last change the library
 * refused or the last notice, such as `Bookmark added at 1:02:03`.
 *
 * @example
 * ```typescript
 * renderScreen(briefScreen(model))
 * // '▶ Playing A New Earth'
 * // 'Chapter 3: The Core of Ego · 1:02:03 of 9:13:01 · 8h 11m left'
 * // '“the present moment is [all] you ever have”'
 * ```
 */
export const briefScreen = (model: Model): UiNode =>
  Column(
    {},
    ...libraryLinesOf(model),
    ...Array.fromOption(
      Option.map(model.maybeProblem, problem =>
        Text(`Your last change was not saved: ${problem}`),
      ),
    ),
    ...Array.fromOption(
      Option.map(model.maybeNotice, notice => Text(notice, { dim: true })),
    ),
  )

const placeTokenOf = (placeMs: number): string =>
  S.encodeSync(TranscriptPlayer.PlaceSegment)(Milliseconds.make(placeMs))

const seekExampleOf = (title: Title): string =>
  placeTokenOf(title.durationMs > hourMs ? hourMs : 10 * minuteMs)

const listenTagsOf = (
  model: Model,
  exceptSlug: Option.Option<string>,
): ReadonlyArray<string> => {
  const continued = Array.fromOption(
    Option.map(continueOf(model), progress => progress.slug),
  )
  return pipe(
    [
      ...continued,
      ...Array.map(
        Array.filter(titlesOf(model), title =>
          Option.isSome(title.maybeAudioUrl),
        ),
        title => title.slug,
      ),
    ],
    Array.dedupe,
    Array.filter(slug => !Option.contains(exceptSlug, slug)),
    Array.take(titlesToSuggest),
    Array.map(slug => `${Listen.tag}:${slug}`),
  )
}

/**
 * The presses that matter now, most useful first, for a surface that
 * suggests a few: with a title in the player, Pause or Play, the skips,
 * the next chapter, a place to seek to, a bookmark, then other titles to
 * listen to; with nothing in the player, the title to continue, then
 * others. A host shows only the ones enabled now, such as
 * `books pause` and `books listen 12-rules-for-life`.
 *
 * @example
 * ```typescript
 * suggestedPressesOf(model)
 * // ['Pause', 'SkipBack', 'SkipForward', 'NextSection', 'SeekTo:1h00m00s', 'AddBookmark', 'Listen:12-rules-for-life']
 * ```
 */
export const suggestedPressesOf = (model: Model): ReadonlyArray<string> =>
  Option.match(loadedTitleOf(model), {
    onNone: () => listenTagsOf(model, Option.none()),
    onSome: ({ title, loaded }) => [
      TranscriptPlayer.isSounding(loaded.player) ? Pause.tag : Play.tag,
      SkipBack.tag,
      SkipForward.tag,
      NextSection.tag,
      `${SeekTo.tag}:${seekExampleOf(title)}`,
      AddBookmark.tag,
      ...listenTagsOf(model, Option.some(title.slug)),
    ],
  })
