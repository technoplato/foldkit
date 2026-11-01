import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import { normalizeIssueId } from '@foldkit/instant-tools/issues'

import { LineRange } from './mentionedIn.js'

/** An Issue named by its number, `#1358`, or by its page link. */
export const IssueNumber = S.TaggedStruct('IssueNumber', { issueId: S.String })

/**
 * A Recording named by its number, with its id and lines when the text gives
 * them: `Recording 208 #2724-2737`, or
 * `Recording 322 (44b6f249-8e0a-4cb6-b54e-4d1a1100d6b3) #493`.
 */
export const RecordingLines = S.TaggedStruct('RecordingLines', {
  recordingNumber: S.Int,
  maybeRecordingId: S.Option(S.String),
  maybeLineRange: S.Option(LineRange),
})

/**
 * A words deep link: one line of a Recording at its time, such as
 * `https://words.pisspoursoftware.xyz/recording/faa684c2-…/section/574c0938-…?t=16171.68`.
 * A link on the retired `words.knophy.com`, or on `og.pisspoursoftware.xyz`,
 * Scribe's public preview host at the same path, reads as the same link on
 * `words.pisspoursoftware.xyz`.
 */
export const WordsLink = S.TaggedStruct('WordsLink', {
  url: S.String,
  recordingId: S.String,
  maybeSectionId: S.Option(S.String),
  maybeAtSeconds: S.Option(S.Number),
})

/** A Recording named only by its id: `Recording 0ae6b994-bd97-4508-b1d9-739853817d2b`. */
export const RecordingId = S.TaggedStruct('RecordingId', {
  recordingId: S.String,
})

/**
 * One line of a Recording by its id, with its number and Recording when the
 * text gives them: `segment 1bbe1ef8-…` after `Recording 199 #475`, or
 * `#261 41953b55-…` in a list of lines.
 */
export const SegmentId = S.TaggedStruct('SegmentId', {
  segmentId: S.String,
  maybeLine: S.Option(S.Int),
  maybeRecordingNumber: S.Option(S.Int),
  maybeRecordingId: S.Option(S.String),
})

/** A file on this Mac or in a repository: `~/Sync/audit/issues-linear-1538/report.md`. */
export const FilePath = S.TaggedStruct('FilePath', { path: S.String })

/** A commit, where the words around it say so: `red 9be70b4a8`, or a full 40-character SHA. */
export const CommitSha = S.TaggedStruct('CommitSha', { sha: S.String })

/** An agent by its harness and name: `claude-code/issues-linear-1538@ld`, `tools/agent-run`. */
export const AgentName = S.TaggedStruct('AgentName', { agentId: S.String })

/** A build by its number, `build 102`, or an app build, `Vakyume 0.1 (217)`. */
export const BuildNumber = S.TaggedStruct('BuildNumber', {
  maybeApp: S.Option(S.String),
  maybeVersion: S.Option(S.String),
  number: S.String,
})

/** A product by its page on the site: `/products/foldkit`. */
export const ProductName = S.TaggedStruct('ProductName', {
  productId: S.String,
})

/** A feature by its page on the site: `/features/scroll-back-always`. */
export const FeatureName = S.TaggedStruct('FeatureName', { slug: S.String })

/**
 * A line of the feature contract by its number, which is what agents write:
 * the `3` of `FEATURES 3`. A number changes as the file does, so what it names
 * is read when it is shown.
 */
export const FeatureLineNumber = S.TaggedStruct('FeatureLineNumber', {
  number: S.Int,
})

/** A finding by its row's id: `finding 1adc23b2-…`, or its page on the site. */
export const FindingId = S.TaggedStruct('FindingId', { findingId: S.String })

/**
 * What he decided, by its id or the first 8 characters agents cite:
 * `decision dbdbf773`, `scribe decision show dbdbf773`.
 */
export const DecisionId = S.TaggedStruct('DecisionId', { decisionId: S.String })

/** A question he asked, by its id or first 8 characters: `question 4e740f44`. */
export const QuestionId = S.TaggedStruct('QuestionId', { questionId: S.String })

/** One of his reminders, by its id or first 8 characters: `reminder 05047ef1`. */
export const ReminderId = S.TaggedStruct('ReminderId', { reminderId: S.String })

/** A moment written as an ISO time: `2026-10-11T10:41:09.240Z`. */
export const Timestamp = S.TaggedStruct('Timestamp', { atMs: S.Number })

/** A chat session with an agent: `session c863fc6a-…` or its claude.ai link. */
export const ChatSession = S.TaggedStruct('ChatSession', {
  sessionId: S.String,
  maybeUrl: S.Option(S.String),
})

/** An id the text does not name the kind of, such as a chat message's UUID. */
export const RawId = S.TaggedStruct('RawId', { id: S.String })

/** Any other web link, by its address and host. */
export const WebLink = S.TaggedStruct('WebLink', {
  url: S.String,
  host: S.String,
})

/** What one stretch of Issue text points at. */
export const TextReference = S.Union([
  IssueNumber,
  RecordingLines,
  RecordingId,
  SegmentId,
  FilePath,
  WordsLink,
  CommitSha,
  AgentName,
  BuildNumber,
  ProductName,
  FeatureName,
  FeatureLineNumber,
  FindingId,
  DecisionId,
  QuestionId,
  ReminderId,
  Timestamp,
  ChatSession,
  RawId,
  WebLink,
])
/** What one stretch of Issue text points at. */
export type TextReference = typeof TextReference.Type

/** Plain words of Issue text. */
export const Words = S.TaggedStruct('Words', { text: S.String })

/**
 * A stretch of Issue text that points at something: the text as written, the
 * label a Markdown link gave it, such as `#2735` in
 * `[#2735](https://words.pisspoursoftware.xyz/…)`, and what it points at.
 */
export const Referenced = S.TaggedStruct('Referenced', {
  text: S.String,
  maybeLabel: S.Option(S.String),
  reference: TextReference,
})

/** One piece of Issue text: plain words or a reference. */
export const TextPiece = S.Union([Words, Referenced])
/** One piece of Issue text: plain words or a reference. */
export type TextPiece = typeof TextPiece.Type

const WORDS_ORIGIN = 'https://words.pisspoursoftware.xyz'
const WORDS_LINK =
  /^https?:\/\/(?:words\.(?:pisspoursoftware\.xyz|knophy\.com)|og\.pisspoursoftware\.xyz)(\/recording\/([0-9a-f-]{36})(?:\/section\/([0-9a-f-]{36}))?[^\s]*)$/i
const AT_SECONDS = /[?&]t=(\d+(?:\.\d+)?)/
const ISSUE_PAGE =
  /^https?:\/\/(?:issues\.(?:pisspoursoftware\.xyz|knophy\.com)|og\.pisspoursoftware\.xyz)\/issues\/(\d{1,4})(?:[/?#]|$)/i
const SITE_PAGE =
  /^https?:\/\/issues\.(?:pisspoursoftware\.xyz|knophy\.com)\/(agents|decisions|features|findings|products|questions|reminders|sessions)\/([^/?#]+)/i
const CLAUDE_SESSION = /^https:\/\/claude\.ai\/code\/(session_\w+)/
const GITHUB_COMMIT =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/([0-9a-f]{7,40})\b/
const HOST = /^https?:\/\/([^/?#]+)/
const TRAILING_PUNCTUATION = /[.,;:!?]+$/
const FULL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HAS_DIGIT = /\d/
const HAS_HEX_LETTER = /[a-f]/
const ZONE_WITHOUT_COLON = /([+-]\d{2})(\d{2})$/

const decodedSegment = (segment: string): string =>
  Option.getOrElse(
    Option.liftThrowable(decodeURIComponent)(segment),
    () => segment,
  )

const referenceOfSitePage = (kind: string, name: string): TextReference =>
  M.value(kind.toLowerCase()).pipe(
    M.withReturnType<TextReference>(),
    M.when('agents', () => AgentName.make({ agentId: decodedSegment(name) })),
    M.when('decisions', () => DecisionId.make({ decisionId: name })),
    M.when('features', () => FeatureName.make({ slug: name })),
    M.when('findings', () => FindingId.make({ findingId: name })),
    M.when('products', () => ProductName.make({ productId: name })),
    M.when('questions', () => QuestionId.make({ questionId: name })),
    M.when('reminders', () => ReminderId.make({ reminderId: name })),
    M.orElse(() =>
      ChatSession.make({ sessionId: name, maybeUrl: Option.none() }),
    ),
  )

/** What a web address points at: a words line, an Issue page, a chat session, a commit, or a page. */
const referenceOfUrl = (url: string): TextReference => {
  const words = WORDS_LINK.exec(url)
  if (words !== null) {
    const [, path = '', recordingId = '', sectionId] = words
    const atSeconds = AT_SECONDS.exec(path)?.[1]
    return WordsLink.make({
      url: `${WORDS_ORIGIN}${path}`,
      recordingId: recordingId.toLowerCase(),
      maybeSectionId: Option.map(Option.fromUndefinedOr(sectionId), id =>
        id.toLowerCase(),
      ),
      maybeAtSeconds: Option.map(Option.fromUndefinedOr(atSeconds), Number),
    })
  }
  const issuePage = ISSUE_PAGE.exec(url)
  if (issuePage !== null) {
    return IssueNumber.make({
      issueId: Option.getOrElse(
        normalizeIssueId(issuePage[1] ?? ''),
        () => issuePage[1] ?? '',
      ),
    })
  }
  const sitePage = SITE_PAGE.exec(url)
  if (sitePage !== null) {
    return referenceOfSitePage(sitePage[1] ?? '', sitePage[2] ?? '')
  }
  const session = CLAUDE_SESSION.exec(url)
  if (session !== null) {
    return ChatSession.make({
      sessionId: session[1] ?? '',
      maybeUrl: Option.some(url),
    })
  }
  const commit = GITHUB_COMMIT.exec(url)
  if (commit !== null) {
    return CommitSha.make({ sha: commit[1] ?? '' })
  }
  return WebLink.make({ url, host: HOST.exec(url)?.[1] ?? url })
}

type Found = Readonly<{
  reference: TextReference
  maybeLabel: Option.Option<string>
}>

type Reading = Readonly<{ lastRecording: Option.Option<RecordingContext> }>

type RecordingContext = Readonly<{
  maybeRecordingNumber: Option.Option<number>
  maybeRecordingId: Option.Option<string>
}>

type Rule = Readonly<{
  pattern: RegExp
  read: (
    match: RegExpExecArray,
    matchedText: string,
    reading: Reading,
  ) => Option.Option<Found>
}>

const found = (reference: TextReference): Option.Option<Found> =>
  Option.some({ reference, maybeLabel: Option.none() })

const lineRangeOf = (
  first: string | undefined,
  last: string | undefined,
): Option.Option<LineRange> =>
  first === undefined
    ? Option.none()
    : Option.some({
        first: Number(first),
        last: last === undefined ? Number(first) : Number(last),
      })

const UUID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const ROW_ID_SOURCE = `(?:${UUID_SOURCE}|[0-9a-f]{8})(?![\\w-])`

const segmentOf = (
  segmentId: string,
  maybeLine: Option.Option<number>,
  { lastRecording }: Reading,
): Option.Option<Found> =>
  found(
    SegmentId.make({
      segmentId: segmentId.toLowerCase(),
      maybeLine,
      maybeRecordingNumber: Option.flatMap(
        lastRecording,
        recording => recording.maybeRecordingNumber,
      ),
      maybeRecordingId: Option.flatMap(
        lastRecording,
        recording => recording.maybeRecordingId,
      ),
    }),
  )

const isCommitLike = (hex: string): boolean =>
  HAS_DIGIT.test(hex) && HAS_HEX_LETTER.test(hex)

const EIGHT_CHARACTER_ID = 8
const LONGEST_SHORT_COMMIT = 12
const FULL_COMMIT = 40

/**
 * Whether an id on its own has a commit's length: 7, 9 to 12 or 40 characters.
 * Eight is a session, thread or app's short id here, such as `bd40c50a`.
 */
const isCommitLength = (hex: string): boolean =>
  hex.length === FULL_COMMIT ||
  (hex.length !== EIGHT_CHARACTER_ID && hex.length <= LONGEST_SHORT_COMMIT)

const rules: ReadonlyArray<Rule> = [
  {
    pattern: /\[([^\]\n]{1,160})\]\((https?:\/\/[^)\s]+)\)/g,
    read: match =>
      Option.some({
        reference: referenceOfUrl(match[2] ?? ''),
        maybeLabel: Option.fromUndefinedOr(match[1]),
      }),
  },
  {
    pattern: /https?:\/\/[^\s<>"'`)\]]+/g,
    read: (_match, matchedText) => found(referenceOfUrl(matchedText)),
  },
  {
    pattern: /(?<![\w/])(?:~|\/Users\/[\w.-]+)\/[^\s'"`)\]]*[^\s'"`)\].,;:!?]/g,
    read: (_match, matchedText) => found(FilePath.make({ path: matchedText })),
  },
  {
    pattern: new RegExp(
      `\\bRecording\\s+0*(\\d{1,4})\\s*=\\s*(${UUID_SOURCE})`,
      'gi',
    ),
    read: match =>
      found(
        RecordingLines.make({
          recordingNumber: Number(match[1]),
          maybeRecordingId: Option.some((match[2] ?? '').toLowerCase()),
          maybeLineRange: Option.none(),
        }),
      ),
  },
  {
    pattern: new RegExp(`\\b[Rr]ecording\\s+(${UUID_SOURCE})`, 'gi'),
    read: match =>
      found(RecordingId.make({ recordingId: (match[1] ?? '').toLowerCase() })),
  },
  {
    pattern: new RegExp(`(?<=\\bsegment\\s+)${UUID_SOURCE}`, 'gi'),
    read: (match, _matchedText, reading) =>
      segmentOf(match[0], Option.none(), reading),
  },
  {
    pattern: new RegExp(`(?<=\\bfinding\\s+)${UUID_SOURCE}`, 'gi'),
    read: match => found(FindingId.make({ findingId: match[0].toLowerCase() })),
  },
  {
    pattern: new RegExp(
      `\\b[Dd]ecisions?(?:\\s+log\\s+entry|\\s+show)?:?\\s+(${ROW_ID_SOURCE})`,
      'g',
    ),
    read: match => found(DecisionId.make({ decisionId: match[1] ?? '' })),
  },
  {
    pattern: new RegExp(`\\b[Qq]uestion\\s+(${ROW_ID_SOURCE})`, 'g'),
    read: match => found(QuestionId.make({ questionId: match[1] ?? '' })),
  },
  {
    pattern: new RegExp(`\\b[Rr]eminder\\s+(${ROW_ID_SOURCE})`, 'g'),
    read: match => found(ReminderId.make({ reminderId: match[1] ?? '' })),
  },
  {
    pattern: new RegExp(`(?<![\\w#&/])#(\\d+)\\s+(${UUID_SOURCE})`, 'gi'),
    read: (match, _matchedText, reading) =>
      segmentOf(match[2] ?? '', Option.some(Number(match[1])), reading),
  },
  {
    pattern:
      /\bRecording\s+0*(\d{1,4})(?:\s*\(\s*([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)[^)\n]{0,80}\))?(?:,?\s+(?:lines?\s+)?#(\d+)(?:\s*[-–]\s*#?(\d+))?)?/g,
    read: match => {
      const recordingId = match[2] ?? ''
      return found(
        RecordingLines.make({
          recordingNumber: Number(match[1]),
          maybeRecordingId: FULL_UUID.test(recordingId)
            ? Option.some(recordingId.toLowerCase())
            : Option.none(),
          maybeLineRange: lineRangeOf(match[3], match[4]),
        }),
      )
    },
  },
  {
    pattern: /(?<![\w#&/])#(\d+)\s*[-–]\s*#?(\d+)\b/g,
    read: (match, _matchedText, { lastRecording }) =>
      Option.flatMap(lastRecording, recording =>
        Option.map(recording.maybeRecordingNumber, recordingNumber => ({
          reference: RecordingLines.make({
            recordingNumber,
            maybeRecordingId: recording.maybeRecordingId,
            maybeLineRange: lineRangeOf(match[1], match[2]),
          }),
          maybeLabel: Option.none(),
        })),
      ),
  },
  {
    pattern:
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g,
    read: match => {
      const atMs = Date.parse(match[0].replace(ZONE_WITHOUT_COLON, '$1:$2'))
      return Number.isNaN(atMs)
        ? Option.none()
        : found(Timestamp.make({ atMs }))
    },
  },
  {
    pattern:
      /(?<=\bsession\s+)[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\b/gi,
    read: match =>
      found(
        ChatSession.make({
          sessionId: match[0].toLowerCase(),
          maybeUrl: Option.none(),
        }),
      ),
  },
  {
    pattern:
      /(?<![\w/.~-])(?:(?:claude-code|codex|cursor-grok|cursor|grok|agy|gemini|opencode)\/[\w.@/-]*[\w@]|pi\/[a-z][\w.@/-]*[\w@]|tools\/[a-z][\w-]*[a-z0-9]|issues\/[a-z][a-z-]*[a-z])/g,
    read: match => found(AgentName.make({ agentId: match[0] })),
  },
  {
    pattern:
      /(?<=\bFEATURES(?:\.md)?(?:'s)?(?:\s+(?:items?|lines?|line items?))?\s*[:#]?\s*(?:\d{1,2}\s*(?:,|and|&|\/)\s*)*)\d{1,2}(?!\d)(?![.:]\d)/g,
    read: match => found(FeatureLineNumber.make({ number: Number(match[0]) })),
  },
  {
    pattern: /\b(Scribe|Vakyume)\s+(\d+\.\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)\)/g,
    read: match =>
      found(
        BuildNumber.make({
          maybeApp: Option.fromUndefinedOr(match[1]),
          maybeVersion: Option.fromUndefinedOr(match[2]),
          number: match[3] ?? '',
        }),
      ),
  },
  {
    pattern: /\b[Bb]uilds?\s+(\d{2,3}(?:\.\d+)?)\b(?![.:]\d)/g,
    read: match =>
      found(
        BuildNumber.make({
          maybeApp: Option.none(),
          maybeVersion: Option.none(),
          number: match[1] ?? '',
        }),
      ),
  },
  {
    pattern:
      /(?<=\b(?:[Cc]ommits?|[Rr]ed|[Gg]reen|[Ss]quash(?:ed)?|[Mm]erge[ds]?|[Ll]anded|main|HEAD|[Pp]ushed|sha|SHA)[:\s]+)[0-9a-f]{7,40}\b/g,
    read: match =>
      isCommitLike(match[0])
        ? found(CommitSha.make({ sha: match[0] }))
        : Option.none(),
  },
  {
    pattern: /\b[0-9a-f]{40}\b/g,
    read: match =>
      isCommitLike(match[0])
        ? found(CommitSha.make({ sha: match[0] }))
        : Option.none(),
  },
  {
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    read: match => found(RawId.make({ id: match[0].toLowerCase() })),
  },
  {
    pattern: /(?<![\w/.#:-])[0-9a-f]{7,40}(?![\w-])/g,
    read: match => {
      if (!isCommitLike(match[0])) {
        return Option.none()
      } else if (isCommitLength(match[0])) {
        return found(CommitSha.make({ sha: match[0] }))
      } else {
        return found(RawId.make({ id: match[0] }))
      }
    },
  },
  {
    pattern: /(?<![\w#&/])#(\d{3,4})\b(?!\s*[-–]\s*#?\d)/g,
    read: match =>
      Option.map(normalizeIssueId(match[1] ?? ''), issueId => ({
        reference: IssueNumber.make({ issueId }),
        maybeLabel: Option.none(),
      })),
  },
]

type Candidate = Readonly<{
  start: number
  end: number
  rank: number
  match: RegExpExecArray
  rule: Rule
}>

const candidateOrder: Order.Order<Candidate> = Order.combine(
  Order.mapInput(Order.Number, (candidate: Candidate) => candidate.start),
  Order.mapInput(Order.Number, (candidate: Candidate) => candidate.rank),
)

const endOf = (match: RegExpExecArray): number =>
  match.index +
  (match[0].startsWith('http')
    ? match[0].replace(TRAILING_PUNCTUATION, '').length
    : match[0].length)

const candidatesIn = (text: string): ReadonlyArray<Candidate> =>
  pipe(
    rules,
    Array.flatMap((rule, rank) =>
      Array.map(Array.fromIterable(text.matchAll(rule.pattern)), match => ({
        start: match.index,
        end: endOf(match),
        rank,
        match,
        rule,
      })),
    ),
    Array.sort(candidateOrder),
  )

const MEMO_LIMIT = 4_000
const memo = new Map<string, ReadonlyArray<TextPiece>>()

const remember = (
  text: string,
  pieces: ReadonlyArray<TextPiece>,
): ReadonlyArray<TextPiece> => {
  if (memo.size >= MEMO_LIMIT) {
    memo.clear()
  }
  memo.set(text, pieces)
  return pieces
}

type Scan = Readonly<{
  pieces: ReadonlyArray<TextPiece>
  cursor: number
  reading: Reading
}>

const readingAfter = (reading: Reading, reference: TextReference): Reading => {
  if (reference._tag === 'RecordingLines') {
    return {
      lastRecording: Option.some({
        maybeRecordingNumber: Option.some(reference.recordingNumber),
        maybeRecordingId: reference.maybeRecordingId,
      }),
    }
  } else if (reference._tag === 'RecordingId') {
    return {
      lastRecording: Option.some({
        maybeRecordingNumber: Option.none(),
        maybeRecordingId: Option.some(reference.recordingId),
      }),
    }
  }
  return reading
}

const scanCandidate =
  (text: string) =>
  (scan: Scan, candidate: Candidate): Scan => {
    if (candidate.start < scan.cursor) {
      return scan
    }
    const matchedText = text.slice(candidate.start, candidate.end)
    return Option.match(
      candidate.rule.read(candidate.match, matchedText, scan.reading),
      {
        onNone: () => scan,
        onSome: ({ reference, maybeLabel }) => ({
          pieces: [
            ...scan.pieces,
            ...(candidate.start > scan.cursor
              ? [Words.make({ text: text.slice(scan.cursor, candidate.start) })]
              : []),
            Referenced.make({ text: matchedText, maybeLabel, reference }),
          ],
          cursor: candidate.end,
          reading: readingAfter(scan.reading, reference),
        }),
      },
    )
  }

const readUncached = (text: string): ReadonlyArray<TextPiece> => {
  const scanned = Array.reduce(
    candidatesIn(text),
    { pieces: [], cursor: 0, reading: { lastRecording: Option.none() } },
    scanCandidate(text),
  )
  return scanned.cursor < text.length
    ? [...scanned.pieces, Words.make({ text: text.slice(scanned.cursor) })]
    : scanned.pieces
}

/**
 * Reads the references inside one stretch of Issue text: Issue numbers,
 * Recordings and their lines, words deep links, commits, agents, builds,
 * products, features, findings, times, chat sessions, raw ids and links. Every
 * character stays, in order:
 * `Fixed by #1358 in build 218` reads as the words `Fixed by `, the Issue
 * `1358`, the words ` in `, and build `218`. Stored text is never changed;
 * readers derive the links from it each time they show it.
 */
export const readTextReferences = (text: string): ReadonlyArray<TextPiece> =>
  Option.getOrElse(Option.fromUndefinedOr(memo.get(text)), () =>
    remember(text, readUncached(text)),
  )
