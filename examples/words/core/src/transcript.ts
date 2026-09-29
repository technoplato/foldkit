import {
  Array,
  Equivalence,
  Match as M,
  Option,
  Order,
  Schema as S,
  String,
  pipe,
} from 'effect'

import {
  ClipboardTimelineEntry,
  ImageTimelineEntry,
  type RecordingDetail,
  type Section,
  SectionEntry,
  type TimelineEntry,
  type Word,
} from './recording.js'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3_600
const MILLISECONDS_PER_SECOND = 1_000
const SRT_DECORATION_SECONDS = 1

/** The transcript formats the iPhone copies, in the same text. */
export const TranscriptFormat = S.Literals(['PlainText', 'Markdown', 'Srt'])
/** The transcript formats the iPhone copies, in the same text. */
export type TranscriptFormat = typeof TranscriptFormat.Type

const lastIndexAtOrBefore = <A>(
  items: ReadonlyArray<A>,
  seconds: number,
  startOf: (item: A) => number,
): Option.Option<number> => {
  const search = (
    low: number,
    high: number,
    found: Option.Option<number>,
  ): Option.Option<number> => {
    if (low > high) {
      return found
    } else {
      const middle = Math.floor((low + high) / 2)
      const isAtOrBefore = Option.exists(
        Array.get(items, middle),
        item => startOf(item) <= seconds,
      )
      return isAtOrBefore
        ? search(middle + 1, high, Option.some(middle))
        : search(low, middle - 1, found)
    }
  }
  return search(0, Array.length(items) - 1, Option.none())
}

/**
 * The section playing at `seconds`: the last section that starts at or before
 * it, so a pause between sections keeps the previous one current.
 */
export const sectionAt = (
  sections: ReadonlyArray<Section>,
  seconds: number,
): Option.Option<Section> =>
  pipe(
    lastIndexAtOrBefore(sections, seconds, section => section.startSeconds),
    Option.flatMap(index => Array.get(sections, index)),
  )

/** The word playing at `seconds` within a section. */
export const wordAt = (
  section: Section,
  seconds: number,
): Option.Option<Word> =>
  pipe(
    lastIndexAtOrBefore(section.words, seconds, word => word.startSeconds),
    Option.flatMap(index => Array.get(section.words, index)),
  )

/** Where a section starts playing when a listener picks it: its first word. */
export const sectionPlaybackStart = (section: Section): number =>
  pipe(
    Array.head(section.words),
    Option.match({
      onNone: () => section.startSeconds,
      onSome: word => word.startSeconds,
    }),
  )

const entrySeconds = (entry: TimelineEntry): number =>
  M.value(entry).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      SectionEntry: ({ section }) => section.startSeconds,
      ClipboardTimelineEntry: ({ clipboard }) => clipboard.timestampSeconds,
      ImageTimelineEntry: ({ image }) => image.timestampSeconds,
    }),
  )

const byEntrySeconds = Order.mapInput(Order.Number, entrySeconds)

/** A recording's sections, clipboard copies, and images in time order. */
export const timelineOf = (
  detail: RecordingDetail,
): ReadonlyArray<TimelineEntry> =>
  Array.sort(
    [
      ...Array.map(detail.sections, section => SectionEntry({ section })),
      ...Array.map(detail.clipboard, clipboard =>
        ClipboardTimelineEntry({ clipboard }),
      ),
      ...Array.map(detail.images, image => ImageTimelineEntry({ image })),
    ],
    byEntrySeconds,
  )

const isSameSpeaker = Option.makeEquivalence(Equivalence.Number)

/**
 * The sections that start a run of one speaker. Like the iPhone
 * (`RecordingSpeakerRuns`), a speaker's name shows once per run, at the first
 * section whose speaker differs from the previous section's.
 *
 * @example
 * ```ts
 * // a and b are speaker 0, c is speaker 1
 * speakerRunStartIDsOf([a, b, c])
 * // [a.id, c.id]
 * ```
 */
export const speakerRunStartIDsOf = (
  sections: ReadonlyArray<Section>,
): ReadonlyArray<string> =>
  Array.map(
    Array.filter(sections, (section, index) =>
      Option.match(Array.get(sections, index - 1), {
        onNone: () => true,
        onSome: previous =>
          !isSameSpeaker(previous.maybeSpeakerID, section.maybeSpeakerID),
      }),
    ),
    section => section.id,
  )

/** The label the iPhone shows for a section's speaker, when it has one. */
export const speakerLabelOf = (
  detail: RecordingDetail,
  section: Section,
): Option.Option<string> =>
  Option.map(section.maybeSpeakerID, speakerID =>
    pipe(
      detail.speakers,
      Array.findFirst(speaker => speaker.id === speakerID),
      Option.match({
        onNone: () => `Speaker ${speakerID}`,
        onSome: speaker => speaker.label,
      }),
    ),
  )

const twoDigits = (value: number): string =>
  String.padStart(2, '0')(globalThis.String(value))

/** A timestamp as the iPhone exports it: minutes and seconds, `83:07`. */
export const formatExportTimestamp = (seconds: number): string => {
  const wholeSeconds = Math.trunc(seconds)
  return `${Math.trunc(wholeSeconds / SECONDS_PER_MINUTE)}:${twoDigits(wholeSeconds % SECONDS_PER_MINUTE)}`
}

/** A clock time as playback shows it: `4:07`, or `1:23:07` past an hour. */
export const formatClock = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.trunc(seconds))
  const hours = Math.trunc(wholeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.trunc(
    (wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  )
  const remainder = wholeSeconds % SECONDS_PER_MINUTE
  if (hours > 0) {
    return `${hours}:${twoDigits(minutes)}:${twoDigits(remainder)}`
  } else {
    return `${minutes}:${twoDigits(remainder)}`
  }
}

const srtTimestamp = (time: number): string => {
  const wholeSeconds = Math.trunc(time)
  const hours = Math.trunc(wholeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.trunc(
    (wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  )
  const seconds = wholeSeconds % SECONDS_PER_MINUTE
  const milliseconds = Math.trunc((time % 1) * MILLISECONDS_PER_SECOND)
  return `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)},${String.padStart(3, '0')(globalThis.String(milliseconds))}`
}

/** Resolves an image's file id to the URL an export prints for it. */
export type ImageLink = (fileID: string) => string

const lines = (text: string): ReadonlyArray<string> => String.split(text, '\n')

const firstLine = (text: string): string =>
  Option.getOrElse(Array.head(lines(text)), () => '')

const restLines = (text: string): ReadonlyArray<string> =>
  Array.drop(lines(text), 1)

const markdownOf = (
  detail: RecordingDetail,
  entry: TimelineEntry,
  imageLink: ImageLink,
): ReadonlyArray<string> =>
  M.value(entry).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      SectionEntry: ({ section }) => {
        const timestamp = formatExportTimestamp(section.startSeconds)
        const heading = Option.match(speakerLabelOf(detail, section), {
          onNone: () => `**${timestamp}**`,
          onSome: label => `**${timestamp}** — *${label}*`,
        })
        return [heading, section.text, '']
      },
      ClipboardTimelineEntry: ({ clipboard }) => [
        `> ${formatExportTimestamp(clipboard.timestampSeconds)} — Clipboard: ${firstLine(clipboard.text)}`,
        ...Array.map(restLines(clipboard.text), line => `> ${line}`),
        '',
      ],
      ImageTimelineEntry: ({ image }) => [
        `![${formatExportTimestamp(image.timestampSeconds)} — Image](${imageLink(image.fileID)})`,
        '',
      ],
    }),
  )

const plainTextOf = (
  detail: RecordingDetail,
  entry: TimelineEntry,
  imageLink: ImageLink,
): ReadonlyArray<string> =>
  M.value(entry).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      SectionEntry: ({ section }) => {
        const timestamp = formatExportTimestamp(section.startSeconds)
        const heading = Option.match(speakerLabelOf(detail, section), {
          onNone: () => timestamp,
          onSome: label => `${timestamp}  ${label}`,
        })
        return [heading, `  ${section.text}`, '']
      },
      ClipboardTimelineEntry: ({ clipboard }) => [
        `${formatExportTimestamp(clipboard.timestampSeconds)}  [Clipboard] ${firstLine(clipboard.text)}`,
        ...restLines(clipboard.text),
        '',
      ],
      ImageTimelineEntry: ({ image }) => [
        `${formatExportTimestamp(image.timestampSeconds)}  [Image] ${imageLink(image.fileID)}`,
        '',
      ],
    }),
  )

const srtOf = (
  detail: RecordingDetail,
  entry: TimelineEntry,
  imageLink: ImageLink,
): ReadonlyArray<string> =>
  M.value(entry).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      SectionEntry: ({ section }) => [
        `${srtTimestamp(section.startSeconds)} --> ${srtTimestamp(section.endSeconds)}`,
        Option.match(speakerLabelOf(detail, section), {
          onNone: () => section.text,
          onSome: label => `${label}: ${section.text}`,
        }),
      ],
      ClipboardTimelineEntry: ({ clipboard }) => [
        `${srtTimestamp(clipboard.timestampSeconds)} --> ${srtTimestamp(clipboard.timestampSeconds + SRT_DECORATION_SECONDS)}`,
        `[Clipboard] ${firstLine(clipboard.text)}`,
        ...restLines(clipboard.text),
      ],
      ImageTimelineEntry: ({ image }) => [
        `${srtTimestamp(image.timestampSeconds)} --> ${srtTimestamp(image.timestampSeconds + SRT_DECORATION_SECONDS)}`,
        `[Image] ${imageLink(image.fileID)}`,
      ],
    }),
  )

/**
 * The transcript as the iPhone copies it, in plain text, Markdown, or SRT.
 *
 * @example
 * ```ts
 * exportTranscript(detail, 'PlainText', fileID => imageUrls[fileID])
 * // "0:05  Speaker 1\n  Hello world\n\n"
 * ```
 */
export const exportTranscript = (
  detail: RecordingDetail,
  format: TranscriptFormat,
  imageLink: ImageLink,
): string => {
  const timeline = timelineOf(detail)
  return M.value(format).pipe(
    M.withReturnType<string>(),
    M.when('Markdown', () =>
      Array.join(
        Array.flatMap(timeline, entry => markdownOf(detail, entry, imageLink)),
        '\n',
      ),
    ),
    M.when('PlainText', () =>
      Array.join(
        Array.flatMap(timeline, entry => plainTextOf(detail, entry, imageLink)),
        '\n',
      ),
    ),
    M.when('Srt', () =>
      Array.join(
        Array.flatMap(timeline, (entry, offset) => [
          `${offset + 1}`,
          ...srtOf(detail, entry, imageLink),
          '',
        ]),
        '\n',
      ),
    ),
    M.exhaustive,
  )
}
