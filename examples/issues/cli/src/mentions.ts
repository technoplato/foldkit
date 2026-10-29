import { Array, Effect, Option, Order, Schema as S, pipe } from 'effect'
import { DraftMention } from 'issues-core-example'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import {
  ConversationReference,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { IssuesCommandFailure } from './host.js'

const WORDS_BASE_URL = 'https://words.pisspoursoftware.xyz'
const MILLISECONDS_PER_SECOND = 1_000
const LINK_SECOND_DECIMALS = 2
const USAGE_EXIT_CODE = 2

/**
 * One final transcript line as the Scribe mirror stores it. A line Scribe retired (its ADR 0064 section 8:
 * `retiredAtMs`, or `retired`) is no line, and a sealed one (ADR 0097: `sealed`, voice or held) carries no words:
 * neither is ever quoted (Scribe #1323).
 */
const TranscriptLine = S.Struct({
  atMs: S.optionalKey(S.Number),
  end: S.Number,
  id: S.String,
  index: S.Int,
  recording: S.String,
  retired: S.optionalKey(S.Boolean),
  retiredAtMs: S.optionalKey(S.NullOr(S.Number)),
  sealed: S.optionalKey(S.NullOr(S.String)),
  start: S.Number,
  text: S.String,
})
type TranscriptLine = typeof TranscriptLine.Type

const decodeTranscriptLine = S.decodeUnknownOption(
  S.fromJsonString(TranscriptLine),
)

/** One picture Scribe keeps with a recording, as the mirror's `images.jsonl` lists it. */
const ImageRow = S.Struct({
  atMs: S.Number,
  attachment: S.String,
  contentType: S.optionalKey(S.String),
  path: S.String,
  source: S.optionalKey(S.NullOr(S.String)),
})
type ImageRow = typeof ImageRow.Type

const decodeImageRow = S.decodeUnknownOption(S.fromJsonString(ImageRow))

/**
 * A stretch the audio skipped (Siri or an alarm held the microphone): `offset` is where it sits in the audio,
 * `startedAtMs` and `endedAtMs` on the wall clock. Only a closed gap has both ends.
 */
const CaptureGapRow = S.Struct({
  endedAtMs: S.Number,
  kind: S.Literal('capture.gap'),
  offset: S.Number,
  startedAtMs: S.Number,
  state: S.Literal('closed'),
})
type CaptureGapRow = typeof CaptureGapRow.Type

const decodeCaptureGapRow = S.decodeUnknownOption(
  S.fromJsonString(CaptureGapRow),
)

const decodeRecordingStart = S.decodeUnknownOption(
  S.fromJsonString(S.Struct({ startedAtMs: S.Number })),
)

const usage = (message: string) =>
  new IssuesCommandFailure({ exitCode: USAGE_EXIT_CODE, message })

const saidSpecPattern = /^\s*([0-9a-f-]+)\s*:\s*#?(\d+)(?:\s*-\s*#?(\d+))?\s*$/i
const recordingFolderPattern = /^(\d+) — .+ — ([0-9a-f]{8})$/

const recordingFolderMatches = (folder: string, recording: string): boolean => {
  const match = recordingFolderPattern.exec(folder)
  if (match === null) {
    return false
  }
  const [, number = '', idPrefix = ''] = match
  if (/^\d+$/.test(recording) && recording.length < idPrefix.length) {
    return Number(number) === Number(recording)
  }
  return recording.toLowerCase().startsWith(idPrefix)
}

/**
 * Finds the Scribe mirror folder of a recording by its number (`208`) or its
 * id (`faa684c2`, or the whole UUID), such as `recordings/208 — 2026-10-10 —
 * faa684c2`.
 */
export const findRecordingFolder = (
  mirrorRoot: string,
  recording: string,
): Option.Option<string> => {
  const recordingsDirectory = join(mirrorRoot, 'recordings')
  if (!existsSync(recordingsDirectory)) {
    return Option.none()
  }
  return pipe(
    readdirSync(recordingsDirectory),
    Array.sort(Order.String),
    Array.findFirst(folder => recordingFolderMatches(folder, recording)),
    Option.map(folder => join(recordingsDirectory, folder)),
  )
}

const isRetiredLine = (line: TranscriptLine): boolean =>
  line.retired === true ||
  (line.retiredAtMs !== undefined && line.retiredAtMs !== null)

const isSealedLine = (line: TranscriptLine): boolean =>
  line.sealed !== undefined && line.sealed !== null && line.sealed !== ''

/**
 * The mirror's lines by #, each the newest record of a line that is still one: a retired line's records are
 * passed over, so a # it shares with its kept line is the kept line, whatever the order the records came in
 * (Scribe #1323, its ADR 0064 section 8).
 */
const readTranscript = (
  folder: string,
): ReadonlyMap<number, TranscriptLine> => {
  const linesByIndex = new Map<number, TranscriptLine>()
  const transcriptPath = join(folder, 'transcript.jsonl')
  if (!existsSync(transcriptPath)) {
    return linesByIndex
  }
  const retiredIds = new Set<string>()
  const lines: Array<TranscriptLine> = []
  for (const text of readFileSync(transcriptPath, 'utf8').split('\n')) {
    const maybeLine = decodeTranscriptLine(text)
    if (Option.isSome(maybeLine)) {
      if (isRetiredLine(maybeLine.value)) {
        retiredIds.add(maybeLine.value.id)
      } else {
        lines.push(maybeLine.value)
      }
    }
  }
  for (const line of lines) {
    if (!retiredIds.has(line.id)) {
      linesByIndex.set(line.index, line)
    }
  }
  return linesByIndex
}

const readJsonLines = <A>(
  path: string,
  decode: (text: string) => Option.Option<A>,
): ReadonlyArray<A> =>
  existsSync(path)
    ? Array.getSomes(Array.map(readFileSync(path, 'utf8').split('\n'), decode))
    : []

/**
 * Seconds of a recording's audio to milliseconds on the wall clock. The audio skips a capture gap, so after one
 * the wall is later than `startedAt` plus the audio time by the gaps so far; each closed gap anchors the time after
 * it (Scribe #1173, `audio_clock` in its scripts/process-eval/missed_words.py). Pictures carry wall times.
 */
const wallClockMs = (
  startedAtMs: number,
  gaps: ReadonlyArray<CaptureGapRow>,
  audioSeconds: number,
): number => {
  const sorted = Array.sort(
    gaps,
    Order.mapInput(Order.Number, (gap: CaptureGapRow) => gap.offset),
  )
  const beforeAnyGap = Option.match(Array.head(sorted), {
    onNone: () => startedAtMs + audioSeconds * MILLISECONDS_PER_SECOND,
    onSome: first =>
      first.startedAtMs +
      (audioSeconds - first.offset) * MILLISECONDS_PER_SECOND,
  })
  return Array.reduce(sorted, beforeAnyGap, (wall, gap) =>
    audioSeconds >= gap.offset
      ? gap.endedAtMs + (audioSeconds - gap.offset) * MILLISECONDS_PER_SECOND
      : wall,
  )
}

/** What a picture shows: a screenshot he took, or a frame Scribe recorded of a screen. */
export type SaidImageKind = 'Screenshot' | 'ScreenFrame'

/**
 * Only screenshots and screen frames are pictures of the moment. A camera photo (`photoLibrary`), a paste, a drop,
 * or a picture with no source can be a family photo, so `--said` never takes one; `--image` names a file on purpose.
 */
const imageKindOf = (
  source: string | null | undefined,
): Option.Option<SaidImageKind> => {
  if (source === 'photoLibraryScreenshot') {
    return Option.some('Screenshot')
  }
  if (
    source !== null &&
    source !== undefined &&
    source.startsWith('replaykit-frame')
  ) {
    return Option.some('ScreenFrame')
  }
  return Option.none()
}

/** A screenshot he took up to a minute before he spoke is what he is talking about; frames come every 5 s. */
const SCREENSHOT_LEAD_MS = 60_000
const SCREENSHOT_TRAIL_MS = 10_000
const FRAME_LEAD_MS = 10_000
const FRAME_TRAIL_MS = 5_000
/** A long quote spans dozens of near-identical frames: keep this many, evenly spread. */
const MAXIMUM_FRAMES = 6

const evenlySpread = <A>(
  items: ReadonlyArray<A>,
  count: number,
): ReadonlyArray<A> =>
  items.length <= count
    ? items
    : count === 1
      ? Array.take(items, 1)
      : Array.getSomes(
          Array.makeBy(count, position =>
            Option.fromUndefinedOr(
              items[Math.round((position * (items.length - 1)) / (count - 1))],
            ),
          ),
        )

/** One picture of the moment a quote is from, read from the Scribe mirror. */
export type SaidImage = Readonly<{
  attachmentId: string
  capturedAtMs: number
  contentType: string
  fileName: string
  filePath: string
  kind: SaidImageKind
  source: string
}>

const imageOf = (
  folder: string,
  row: ImageRow,
  kind: SaidImageKind,
): SaidImage => ({
  attachmentId: row.attachment,
  capturedAtMs: row.atMs,
  contentType: row.contentType ?? 'image/jpeg',
  fileName: basename(row.path),
  filePath: join(folder, row.path),
  kind,
  source: row.source ?? '',
})

/**
 * The screenshots and screen frames of lines spoken between `firstStart` and `lastEnd` seconds of audio:
 * screenshots from a minute before to 10 s after, and up to six frames from 10 s before to 5 s after, in time order.
 * A picture the mirror lists but has not downloaded yet is left out.
 */
const imagesAround = (
  folder: string,
  maybeFallbackStartedAtMs: Option.Option<number>,
  firstStart: number,
  lastEnd: number,
): ReadonlyArray<SaidImage> => {
  const maybeStartedAtMs = Option.orElse(
    Option.flatMap(
      Option.liftThrowable(() =>
        readFileSync(join(folder, 'meta.json'), 'utf8'),
      )(),
      text => Option.map(decodeRecordingStart(text), meta => meta.startedAtMs),
    ),
    () => maybeFallbackStartedAtMs,
  )
  if (Option.isNone(maybeStartedAtMs)) {
    return []
  }
  const gaps = readJsonLines(join(folder, 'events.jsonl'), decodeCaptureGapRow)
  const fromMs = wallClockMs(maybeStartedAtMs.value, gaps, firstStart)
  const toMs = wallClockMs(maybeStartedAtMs.value, gaps, lastEnd)
  const rows = Array.sort(
    Array.filter(
      readJsonLines(join(folder, 'images.jsonl'), decodeImageRow),
      row => existsSync(join(folder, row.path)),
    ),
    Order.mapInput(Order.Number, (row: ImageRow) => row.atMs),
  )
  const within = (row: ImageRow, leadMs: number, trailMs: number) =>
    row.atMs >= fromMs - leadMs && row.atMs <= toMs + trailMs
  const screenshots = Array.filter(
    rows,
    row =>
      Option.contains(imageKindOf(row.source), 'Screenshot') &&
      within(row, SCREENSHOT_LEAD_MS, SCREENSHOT_TRAIL_MS),
  )
  const frames = evenlySpread(
    Array.filter(
      rows,
      row =>
        Option.contains(imageKindOf(row.source), 'ScreenFrame') &&
        within(row, FRAME_LEAD_MS, FRAME_TRAIL_MS),
    ),
    MAXIMUM_FRAMES,
  )
  return Array.sort(
    [
      ...Array.map(screenshots, row => imageOf(folder, row, 'Screenshot')),
      ...Array.map(frames, row => imageOf(folder, row, 'ScreenFrame')),
    ],
    Order.mapInput(Order.Number, (image: SaidImage) => image.capturedAtMs),
  )
}

const secondsForLink = (seconds: number): string =>
  Number(seconds.toFixed(LINK_SECOND_DECIMALS)).toString()

/** The words deep link to one line: `…/recording/<id>/section/<line id>?t=<s>`. */
export const lineDeepLink = (line: TranscriptLine): string =>
  `${WORDS_BASE_URL}/recording/${line.recording}/section/${line.id}?t=${secondsForLink(line.start)}`

const rangeLabel = (first: number, last: number): string =>
  first === last
    ? `#${first.toString()}`
    : `#${first.toString()}-${last.toString()}`

/** What `--said 322:66-70` reads: his words as a Mention, and the pictures of that moment. */
export type ResolvedSaid = Readonly<{
  images: ReadonlyArray<SaidImage>
  mention: DraftMention
  recordingNumber: string
}>

/**
 * Reads Michael's lines `208:1884-1888` from the Scribe mirror word for word
 * and writes them as one Mention: the recording, the time span, a deep link
 * per line, and the quote with the recording's number and full id. Beside it,
 * the screenshots and screen frames of that moment, whose Scribe ids the
 * Mention lists (Scribe #1345).
 */
export const resolveSaid = (
  mirrorRoot: string,
  spec: string,
): Effect.Effect<ResolvedSaid, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const match = saidSpecPattern.exec(spec)
    if (match === null) {
      return yield* Effect.fail(
        usage(
          `--said "${spec}" is not <recording>:<line>[-<line>], such as 208:1884-1888.`,
        ),
      )
    }
    const [, recording = '', firstText = '', lastText] = match
    const first = Number(firstText)
    const last = lastText === undefined ? first : Number(lastText)
    if (last < first) {
      return yield* Effect.fail(
        usage(`--said "${spec}" ends before it starts.`),
      )
    }
    const maybeFolder = findRecordingFolder(mirrorRoot, recording)
    if (Option.isNone(maybeFolder)) {
      return yield* Effect.fail(
        usage(
          `--said "${spec}": no recording ${recording} in ${join(mirrorRoot, 'recordings')}.`,
        ),
      )
    }
    const linesByIndex = readTranscript(maybeFolder.value)
    const wanted = Array.makeBy(last - first + 1, offset => first + offset)
    const missing = Array.filter(wanted, index => !linesByIndex.has(index))
    if (Array.isReadonlyArrayNonEmpty(missing)) {
      return yield* Effect.fail(
        usage(
          `--said "${spec}": ${join(maybeFolder.value, 'transcript.jsonl')} has no line ${Array.join(
            Array.map(missing, index => `#${index.toString()}`),
            ', ',
          )}.`,
        ),
      )
    }
    const lines = Array.getSomes(
      Array.map(wanted, index =>
        Option.fromUndefinedOr(linesByIndex.get(index)),
      ),
    )
    const sealed = Array.filter(lines, isSealedLine)
    if (Array.isReadonlyArrayNonEmpty(sealed)) {
      return yield* Effect.fail(
        usage(
          `--said "${spec}": ${Array.join(
            Array.map(sealed, line => `#${line.index.toString()}`),
            ', ',
          )} ${sealed.length === 1 ? 'is' : 'are'} sealed (Scribe ADR 0097): a sealed line's words are never quoted.`,
        ),
      )
    }
    const maybeFirstLine = Array.head(lines)
    const maybeLastLine = Array.last(lines)
    if (Option.isNone(maybeFirstLine) || Option.isNone(maybeLastLine)) {
      return yield* Effect.fail(usage(`--said "${spec}" names no line.`))
    }
    const firstLine = maybeFirstLine.value
    const folderNumber = pipe(
      recordingFolderPattern.exec(basename(maybeFolder.value)),
      Option.fromNullOr,
      Option.flatMap(folderMatch => Option.fromUndefinedOr(folderMatch[1])),
      Option.map(number => String(Number(number))),
      Option.getOrElse(() => recording),
    )
    const quotes = Array.join(
      Array.map(lines, line => `"${line.text}"`),
      ' ',
    )
    const lastLine = maybeLastLine.value
    const images = imagesAround(
      maybeFolder.value,
      Option.map(
        Option.fromUndefinedOr(firstLine.atMs),
        atMs => atMs - firstLine.start * MILLISECONDS_PER_SECOND,
      ),
      firstLine.start,
      lastLine.end,
    )
    const mention = DraftMention.make({
      capturedAtMs: Option.fromUndefinedOr(firstLine.atMs),
      directQuote: Option.some(
        `Recording ${folderNumber} (${firstLine.recording}) ${rangeLabel(first, last)}: ${quotes}`,
      ),
      note: Option.some(
        `Lines: ${Array.join(
          Array.map(lines, line => `#${line.index.toString()} ${line.id}`),
          ', ',
        )}`,
      ),
      related: Array.map(lines, line =>
        UriReference.make({ value: lineDeepLink(line) }),
      ),
      reporter: Option.none(),
      source: RecordingReference.make({
        recording: RecordingMention.make({
          endMilliseconds: Option.some(
            Math.round(lastLine.end * MILLISECONDS_PER_SECOND),
          ),
          recordingId: firstLine.recording,
          screenshotIds: Array.map(images, image => image.attachmentId),
          startMilliseconds: Math.round(
            firstLine.start * MILLISECONDS_PER_SECOND,
          ),
        }),
      }),
    })
    return { images, mention, recordingNumber: folderNumber }
  })

/** Reads Michael's lines `208:1884-1888` as one Mention; `resolveSaid` also returns the pictures of the moment. */
export const resolveSaidMention = (
  mirrorRoot: string,
  spec: string,
): Effect.Effect<DraftMention, IssuesCommandFailure> =>
  Effect.map(resolveSaid(mirrorRoot, spec), said => said.mention)

/** What a person typed to an agent, and where. */
export type TypedMentionInput = Readonly<{
  text: string
  typedAt: Option.Option<string>
  typedMessage: Option.Option<string>
  typedSession: Option.Option<string>
}>

/**
 * Writes a Mention of words typed in the Claude chat: the words, the session
 * and message ids, the time, and a `claude-code://session/<id>/message/<id>`
 * link when both ids are known.
 */
export const typedMention = (input: TypedMentionInput): DraftMention => {
  const maybeTypedAtMs = Option.filter(
    Option.map(input.typedAt, Date.parse),
    timeMs => !Number.isNaN(timeMs),
  )
  const note = Array.join(
    [
      'Typed in the Claude chat',
      ...Option.match(input.typedSession, {
        onNone: () => [],
        onSome: session => [`Claude Code session ${session}`],
      }),
      ...Option.match(input.typedMessage, {
        onNone: () => [],
        onSome: message => [`message ${message}`],
      }),
      ...Option.match(input.typedAt, {
        onNone: () => [],
        onSome: typedAt => [typedAt],
      }),
    ],
    ', ',
  )
  const related =
    Option.isSome(input.typedSession) && Option.isSome(input.typedMessage)
      ? [
          UriReference.make({
            value: `claude-code://session/${input.typedSession.value}/message/${input.typedMessage.value}`,
          }),
        ]
      : []
  return DraftMention.make({
    capturedAtMs: maybeTypedAtMs,
    directQuote: Option.some(input.text),
    note: Option.none(),
    related,
    reporter: Option.none(),
    source: ConversationReference.make({
      conversation: {
        harness: 'claude-code',
        note: `${note}.`,
        ...Option.match(input.typedMessage, {
          onNone: () => ({}),
          onSome: messageId => ({ messageId }),
        }),
        ...Option.match(input.typedSession, {
          onNone: () => ({}),
          onSome: sessionId => ({ sessionId }),
        }),
        ...Option.match(maybeTypedAtMs, {
          onNone: () => ({}),
          onSome: typedAtMs => ({ typedAtMs }),
        }),
      },
    }),
  })
}
