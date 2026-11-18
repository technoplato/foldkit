import { Array, Match as M, Option } from 'effect'
import {
  Text,
  type TextImage,
  type TranscriptItem,
  type TranscriptNode,
  type TranscriptPassage,
} from 'foldkit/renderers'

import type {
  ImageEntry,
  RecordingDetail,
  Section,
  TimelineEntry,
} from './recording.js'
import {
  formatClock,
  speakerLabelOf,
  speakerRunStartIDsOf,
  timelineOf,
} from './transcript.js'

const MILLISECONDS_PER_SECOND = 1000

/**
 * Where a recording's playback stands, as its player last reported it:
 * the place in seconds, whether it is playing, the wall-clock time of the
 * report in milliseconds, and the speed, `1` at normal speed.
 */
export type ReadAlongPlayback = Readonly<{
  positionSeconds: number
  isPlaying: boolean
  reportedAtMs: number
  rate: number
}>

const millisecondsOf = (seconds: number): number =>
  Math.round(seconds * MILLISECONDS_PER_SECOND)

const passageOf = (section: Section): TranscriptPassage => ({
  key: section.id,
  label: formatClock(section.startSeconds),
  words: Array.map(section.words, word => ({
    token: word.id,
    text: word.text,
    startMs: millisecondsOf(word.startSeconds),
  })),
})

/**
 * A recording as the Transcript every Client of the library reads along
 * with: a passage for each section, labelled with its time, each word
 * with its id as the token and its start, and a clock from the playback,
 * so `transcriptAt` marks the word being spoken between reports of the
 * place, and the shared readings search it, step through it, link to a
 * word and print it for a terminal. A sealed section keeps its place and
 * has no words, as it has none here.
 *
 * @example
 * ```typescript
 * transcriptAt(readAlongOf(detail.sections, playback), Date.now())
 * ```
 */
export const readAlongOf = (
  sections: ReadonlyArray<Section>,
  playback: ReadAlongPlayback,
): TranscriptNode => ({
  _tag: 'Transcript',
  label: 'Transcript',
  action: 'ClickedWord',
  emptyText: 'This recording has no transcript.',
  passages: Array.map(sections, passageOf),
  clock: {
    placeMs: millisecondsOf(playback.positionSeconds),
    atMs: playback.reportedAtMs,
    rate: playback.isPlaying ? playback.rate : 0,
  },
})

/** What a recording's timeline is made from: its sections, who spoke, what was copied and the pictures taken. */
export type RecordingTimeline = Pick<
  RecordingDetail,
  'sections' | 'speakers' | 'clipboard' | 'images'
>

/**
 * How a timeline's pictures are shown: `pictureOf` gives a picture's
 * address and size once the Client knows them; until then, and with no
 * `pictureOf`, a picture is the word `Picture` at its time.
 */
export type TimelineOptions = Readonly<{
  pictureOf?: (image: ImageEntry) => Option.Option<TextImage>
}>

const pictureWord = 'Picture'

type Between = Readonly<{
  key: string
  label: string
  node: TranscriptItem['node']
}>

const betweenOf = (
  entry: TimelineEntry,
  options: TimelineOptions,
): Option.Option<Between> =>
  M.value(entry).pipe(
    M.withReturnType<Option.Option<Between>>(),
    M.tagsExhaustive({
      SectionEntry: () => Option.none(),
      ClipboardTimelineEntry: ({ clipboard }) =>
        Option.some({
          key: clipboard.id,
          label: formatClock(clipboard.timestampSeconds),
          node: Text(clipboard.text, { copyable: true, label: 'Copied text' }),
        }),
      ImageTimelineEntry: ({ image }) =>
        Option.some({
          key: image.id,
          label: formatClock(image.timestampSeconds),
          node: Option.match(
            Option.flatMap(Option.fromNullishOr(options.pictureOf), pictureOf =>
              pictureOf(image),
            ),
            {
              onNone: () => Text(pictureWord),
              onSome: picture => Text(pictureWord, { image: picture }),
            },
          ),
        }),
    }),
  )

const sectionKeyAfter = (
  entries: ReadonlyArray<TimelineEntry>,
  index: number,
): Option.Option<string> =>
  Array.findFirst(Array.drop(entries, index + 1), entry =>
    entry._tag === 'SectionEntry'
      ? Option.some(entry.section.id)
      : Option.none(),
  )

/**
 * A recording's whole timeline as the shared Transcript: the passages of
 * `readAlongOf`, the first of each run by one voice naming who speaks, by
 * the label the iPhone shows or `Speaker 2`, and what was copied and the
 * pictures taken while it ran as items between the passages, each at its
 * time before the section that follows it. Every painter of the library
 * draws it, and the shared readings search it, step through it and link
 * to a word as they do the words alone.
 *
 * @example
 * ```typescript
 * renderScreen(timelineReadAlongOf(detail, playback), 80)
 * // '        Keeper'
 * // ' 0:05   The keeper lit the lamp at dusk.'
 * // ' 0:08   a bell answered'
 * ```
 */
export const timelineReadAlongOf = (
  detail: RecordingTimeline,
  playback: ReadAlongPlayback,
  options: TimelineOptions = {},
): TranscriptNode => {
  const words = readAlongOf(detail.sections, playback)
  const runStartIDs = speakerRunStartIDsOf(detail.sections)
  const speakerOf = (section: Section): Option.Option<string> =>
    Array.contains(runStartIDs, section.id)
      ? speakerLabelOf(detail, section)
      : Option.none()
  const entries = timelineOf(detail)
  return {
    ...words,
    passages: Array.map(detail.sections, (section, index) => {
      const passage = Option.getOrElse(Array.get(words.passages, index), () =>
        passageOf(section),
      )
      return Option.match(speakerOf(section), {
        onNone: () => passage,
        onSome: speaker => ({ ...passage, speaker }),
      })
    }),
    items: Array.getSomes(
      Array.map(entries, (entry, index) =>
        Option.map(betweenOf(entry, options), between =>
          Option.match(sectionKeyAfter(entries, index), {
            onNone: (): TranscriptItem => between,
            onSome: (beforePassage): TranscriptItem => ({
              ...between,
              beforePassage,
            }),
          }),
        ),
      ),
    ),
  }
}
