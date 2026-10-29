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

const secondsForLink = (seconds: number): string =>
  Number(seconds.toFixed(LINK_SECOND_DECIMALS)).toString()

/** The words deep link to one line: `…/recording/<id>/section/<line id>?t=<s>`. */
export const lineDeepLink = (line: TranscriptLine): string =>
  `${WORDS_BASE_URL}/recording/${line.recording}/section/${line.id}?t=${secondsForLink(line.start)}`

const rangeLabel = (first: number, last: number): string =>
  first === last
    ? `#${first.toString()}`
    : `#${first.toString()}-${last.toString()}`

/**
 * Reads Michael's lines `208:1884-1888` from the Scribe mirror word for word
 * and writes them as one Mention: the recording, the time span, a deep link
 * per line, and the quote with the recording's number and full id.
 */
export const resolveSaidMention = (
  mirrorRoot: string,
  spec: string,
): Effect.Effect<DraftMention, IssuesCommandFailure> =>
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
    return DraftMention.make({
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
            Math.round(maybeLastLine.value.end * MILLISECONDS_PER_SECOND),
          ),
          recordingId: firstLine.recording,
          screenshotIds: [],
          startMilliseconds: Math.round(
            firstLine.start * MILLISECONDS_PER_SECOND,
          ),
        }),
      }),
    })
  })

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
