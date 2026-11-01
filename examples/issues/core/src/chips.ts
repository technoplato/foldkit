import { Array, Match as M, Option, pipe } from 'effect'
import { Plain, Reference, type TextPart } from 'foldkit/renderers'

import { type Issue } from '@foldkit/instant-tools/issues'

import { localTimeLabel, recordingClockLabel, whenLabel } from './clock.js'
import { type RecordingNumbers, recordingNumbersOf } from './entityGraph.js'
import {
  type LandedBuild,
  type LandedCommit,
  isOnTestflight,
} from './issueLandings.js'
import { type Model } from './model.js'
import {
  type TextPiece,
  type TextReference,
  Words,
  readTextReferences,
} from './textReferences.js'

const WORDS_ORIGIN = 'https://words.pisspoursoftware.xyz'
const MENTION_PREFIX =
  /^Recording 0*(\d+)(?: \(([0-9a-f-]{36})\))? #(\d+)(?:-(\d+))?:?\s*/i
const SECTION_IN_LINK =
  /\/recording\/([0-9a-f-]{36})\/section\/([0-9a-f-]{36})/i
const SHORT_ID_LENGTH = 8
const SHORT_SHA_LENGTH = 9
const TITLE_LIMIT = 80
const QUOTE_LIMIT = 240
const LINK_LABEL_LIMIT = 48
const AGENT_HARNESS = /^(?:claude-code|codex|cursor|grok|agy|gemini|opencode)\//

/** One line he said, as a mention kept it: his words, when, and its Recording. */
type SaidLine = Readonly<{
  quote: string
  maybeAtMs: Option.Option<number>
  recordingId: string
  maybeLine: Option.Option<number>
}>

/** What the catalog's mentions say about Recording lines, derived once per catalog. */
type LineIndex = Readonly<{
  linkOfLine: ReadonlyMap<string, string>
  saidOfSegment: ReadonlyMap<string, SaidLine>
}>

/**
 * What a chip needs to know beyond the text: every Issue by number, which
 * Recording number is which id, the words of each line a mention kept, and
 * the reader's clock.
 */
export type ChipContext = Readonly<{
  buildsByNumber: ReadonlyMap<number, LandedBuild>
  commits: ReadonlyArray<LandedCommit>
  issuesById: ReadonlyMap<string, Issue>
  numbers: RecordingNumbers
  lines: LineIndex
  nowMs: number
  offsetMinutes: number
}>

/**
 * What Scribe's rows add to a chip: every build the page knows, and the commits
 * of the open Issue.
 */
export type ChipFacts = Readonly<{
  builds: ReadonlyArray<LandedBuild>
  commits: ReadonlyArray<LandedCommit>
}>

/** A host with no graph: chips show what the text says. */
export const noChipFacts: ChipFacts = { builds: [], commits: [] }

/** What Scribe's rows add to the chips of the page open. */
export const chipFactsOf = (model: Model): ChipFacts => ({
  builds: model.knownBuilds,
  commits:
    model.issueLanding._tag === 'LoadedIssueLanding'
      ? model.issueLanding.landing.commits
      : [],
})

const lineKey = (recordingId: string, line: number): string =>
  `${recordingId}#${line.toString()}`

/** The lines one Issue's mentions name: each line's words link and words. */
type IssueLines = Readonly<{
  links: ReadonlyArray<Readonly<{ key: string; url: string }>>
  said: ReadonlyArray<Readonly<{ segmentId: string; line: SaidLine }>>
}>

const issueLinesMemo = new WeakMap<Issue, IssueLines>()

const issueLinesOf = (issue: Issue): IssueLines =>
  Option.getOrElse(Option.fromUndefinedOr(issueLinesMemo.get(issue)), () => {
    const links: Array<Readonly<{ key: string; url: string }>> = []
    const said: Array<Readonly<{ segmentId: string; line: SaidLine }>> = []
    for (const mention of issue.mentions) {
      const words = Option.getOrElse(mention.directQuote, () => '')
      const prefix = MENTION_PREFIX.exec(words)
      const wordsLinks = Array.flatMap(mention.related, reference =>
        reference._tag === 'Uri' ? [reference.value] : [],
      )
      for (const link of wordsLinks) {
        const section = SECTION_IN_LINK.exec(link)
        if (section === null) {
          continue
        }
        const recordingId = (section[1] ?? '').toLowerCase()
        const segmentId = (section[2] ?? '').toLowerCase()
        const maybeLine = Option.map(Option.fromNullishOr(prefix?.[3]), Number)
        const url = link.replace(
          /^https?:\/\/words\.knophy\.com/i,
          WORDS_ORIGIN,
        )
        Option.match(maybeLine, {
          onNone: () => undefined,
          onSome: line => links.push({ key: lineKey(recordingId, line), url }),
        })
        said.push({
          segmentId,
          line: {
            quote: prefix === null ? words : words.slice(prefix[0].length),
            maybeAtMs: mention.capturedAtMs,
            recordingId,
            maybeLine,
          },
        })
      }
    }
    const lines = { links, said }
    issueLinesMemo.set(issue, lines)
    return lines
  })

const lineIndexMemo = new WeakMap<ReadonlyArray<Issue>, LineIndex>()

const lineIndexOf = (issues: ReadonlyArray<Issue>): LineIndex =>
  Option.getOrElse(Option.fromUndefinedOr(lineIndexMemo.get(issues)), () => {
    const linkOfLine = new Map<string, string>()
    const saidOfSegment = new Map<string, SaidLine>()
    for (const issue of issues) {
      const { links, said } = issueLinesOf(issue)
      for (const { key, url } of links) {
        linkOfLine.set(key, url)
      }
      for (const { segmentId, line } of said) {
        saidOfSegment.set(segmentId, line)
      }
    }
    const index = { linkOfLine, saidOfSegment }
    lineIndexMemo.set(issues, index)
    return index
  })

const issuesByIdMemo = new WeakMap<
  ReadonlyArray<Issue>,
  ReadonlyMap<string, Issue>
>()

const issuesByIdOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyMap<string, Issue> =>
  Option.getOrElse(Option.fromUndefinedOr(issuesByIdMemo.get(issues)), () => {
    const byId = new Map(Array.map(issues, issue => [issue.id, issue]))
    issuesByIdMemo.set(issues, byId)
    return byId
  })

const buildsByNumberMemo = new WeakMap<
  ReadonlyArray<LandedBuild>,
  ReadonlyMap<number, LandedBuild>
>()

const buildsByNumberOf = (
  builds: ReadonlyArray<LandedBuild>,
): ReadonlyMap<number, LandedBuild> =>
  Option.getOrElse(
    Option.fromUndefinedOr(buildsByNumberMemo.get(builds)),
    () => {
      const byNumber = new Map(
        Array.map(builds, build => [build.number, build]),
      )
      buildsByNumberMemo.set(builds, byNumber)
      return byNumber
    },
  )

/**
 * The context chips read from: the loaded catalog's indexes, built once per
 * snapshot, the reader's clock, and what Scribe's rows add.
 */
export const chipContextOf = (
  issues: ReadonlyArray<Issue>,
  nowMs: number,
  offsetMinutes: number,
  facts: ChipFacts = noChipFacts,
): ChipContext => ({
  buildsByNumber: buildsByNumberOf(facts.builds),
  commits: facts.commits,
  issuesById: issuesByIdOf(issues),
  numbers: recordingNumbersOf(issues),
  lines: lineIndexOf(issues),
  nowMs,
  offsetMinutes,
})

const shortened = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

const recordingLabel = (
  maybeNumber: Option.Option<number>,
  recordingId: string,
): string =>
  Option.match(maybeNumber, {
    onNone: () => `Recording ${recordingId.slice(0, SHORT_ID_LENGTH)}`,
    onSome: recordingNumber => `Recording ${recordingNumber.toString()}`,
  })

const lineRangeLabel = (first: number, last: number): string =>
  first === last
    ? `#${first.toString()}`
    : `#${first.toString()}-${last.toString()}`

const saidDetail = (
  maybeSaid: Option.Option<SaidLine>,
  context: ChipContext,
): ReadonlyArray<string> =>
  Option.match(maybeSaid, {
    onNone: () => [],
    onSome: said => [
      shortened(said.quote, QUOTE_LIMIT),
      ...Option.toArray(
        Option.map(said.maybeAtMs, atMs =>
          localTimeLabel(atMs, context.offsetMinutes),
        ),
      ),
    ],
  })

const issueChip = (
  piece: TextPiece,
  issueId: string,
  context: ChipContext,
): TextPart =>
  Option.match(Option.fromUndefinedOr(context.issuesById.get(issueId)), {
    onNone: () => Plain(piece.text),
    onSome: issue =>
      Reference({
        label: `#${issue.id}`,
        title: shortened(issue.title, TITLE_LIMIT),
        state: issue.status,
        kind: 'Issue',
        href: `/issues/${issue.id}`,
        detail: [
          `${issue.priority}${Option.match(issue.issueType, {
            onNone: () => '',
            onSome: issueType => ` ${issueType}`,
          })} in ${issue.product.name}, updated ${whenLabel(
            issue.updatedAtMs,
            context.nowMs,
            context.offsetMinutes,
          )}`,
          shortened(issue.title, QUOTE_LIMIT),
        ],
      }),
  })

/**
 * The chip of an Issue known to be one, such as a linked Issue: its title and
 * state when the catalog holds it, else just `#240` linking to its page.
 */
export const issueChipOf = (issueId: string, context: ChipContext): TextPart =>
  Option.match(Option.fromUndefinedOr(context.issuesById.get(issueId)), {
    onNone: () =>
      Reference({
        label: `#${issueId}`,
        kind: 'Issue',
        href: `/issues/${issueId}`,
      }),
    onSome: () =>
      issueChip(Words.make({ text: `#${issueId}` }), issueId, context),
  })

const agentLabel = (agentId: string): string =>
  agentId.replace(AGENT_HARNESS, '')

const linkLabel = (url: string): string =>
  shortened(
    url
      .replace(/^https?:\/\/(?:www\.)?/, '')
      .replace(/[?#].*$/, '')
      .replace(/\/$/, ''),
    LINK_LABEL_LIMIT,
  )

const fileLabel = (path: string): string =>
  Array.join(Array.takeRight(path.split('/'), 2), '/')

const buildDetail = (
  build: LandedBuild,
  context: ChipContext,
): ReadonlyArray<string> => [
  `Built ${localTimeLabel(build.builtAtMs, context.offsetMinutes)}`,
  ...Option.toArray(Option.map(build.maybeTag, tag => `Tag ${tag}`)),
  ...(isOnTestflight(build)
    ? [
        `On TestFlight ${Option.getOrElse(build.maybeTestflightVersion, () => build.number.toString())}`,
      ]
    : []),
]

const referenceChip = (
  piece: TextPiece & { readonly _tag: 'Referenced' },
  context: ChipContext,
): TextPart =>
  M.value<TextReference>(piece.reference).pipe(
    M.withReturnType<TextPart>(),
    M.tagsExhaustive({
      IssueNumber: ({ issueId }) => issueChip(piece, issueId, context),
      RecordingLines: ({
        recordingNumber,
        maybeRecordingId,
        maybeLineRange,
      }) => {
        const maybeId = Option.orElse(maybeRecordingId, () =>
          Option.fromUndefinedOr(
            context.numbers.idOfNumber.get(recordingNumber),
          ),
        )
        const label = `Recording ${recordingNumber.toString()}${Option.match(
          maybeLineRange,
          {
            onNone: () => '',
            onSome: ({ first, last }) => ` ${lineRangeLabel(first, last)}`,
          },
        )}`
        const maybeLineLink = Option.flatMap(maybeId, recordingId =>
          Option.flatMap(maybeLineRange, ({ first }) =>
            Option.fromUndefinedOr(
              context.lines.linkOfLine.get(lineKey(recordingId, first)),
            ),
          ),
        )
        const recordingPage = Option.match(maybeId, {
          onNone: () => `/recordings/${recordingNumber.toString()}`,
          onSome: recordingId => `/recordings/${recordingId}`,
        })
        return Reference({
          label,
          kind: Option.isSome(maybeLineRange) ? 'Segment' : 'Recording',
          href: Option.getOrElse(maybeLineLink, () => recordingPage),
          detail: Option.isSome(maybeLineLink)
            ? ['Opens his words at this line']
            : [`Every Issue from Recording ${recordingNumber.toString()}`],
        })
      },
      RecordingId: ({ recordingId }) =>
        Reference({
          label: recordingLabel(
            Option.fromUndefinedOr(context.numbers.numberOfId.get(recordingId)),
            recordingId,
          ),
          kind: 'Recording',
          href: `/recordings/${recordingId}`,
          detail: [`Recording ${recordingId}`],
        }),
      SegmentId: ({
        segmentId,
        maybeLine,
        maybeRecordingId,
        maybeRecordingNumber,
      }) => {
        const maybeSaid = Option.fromUndefinedOr(
          context.lines.saidOfSegment.get(segmentId),
        )
        const maybeId = pipe(
          maybeRecordingId,
          Option.orElse(() =>
            Option.flatMap(maybeRecordingNumber, recordingNumber =>
              Option.fromUndefinedOr(
                context.numbers.idOfNumber.get(recordingNumber),
              ),
            ),
          ),
          Option.orElse(() => Option.map(maybeSaid, said => said.recordingId)),
        )
        const recording = Option.match(maybeRecordingNumber, {
          onNone: () =>
            Option.match(maybeId, {
              onNone: () => 'Line',
              onSome: recordingId =>
                recordingLabel(
                  Option.fromUndefinedOr(
                    context.numbers.numberOfId.get(recordingId),
                  ),
                  recordingId,
                ),
            }),
          onSome: recordingNumber => `Recording ${recordingNumber.toString()}`,
        })
        return Reference({
          label: Option.match(maybeLine, {
            onNone: () => `${recording} line`,
            onSome: line => `${recording} #${line.toString()}`,
          }),
          kind: 'Segment',
          ...Option.match(maybeId, {
            onNone: () => ({}),
            onSome: recordingId => ({
              href: `${WORDS_ORIGIN}/recording/${recordingId}/section/${segmentId}`,
            }),
          }),
          detail: [...saidDetail(maybeSaid, context), `Line ${segmentId}`],
        })
      },
      WordsLink: ({ url, recordingId, maybeSectionId, maybeAtSeconds }) => {
        const recording = recordingLabel(
          Option.fromUndefinedOr(context.numbers.numberOfId.get(recordingId)),
          recordingId,
        )
        const label = Option.getOrElse(piece.maybeLabel, () =>
          Option.match(maybeAtSeconds, {
            onNone: () => recording,
            onSome: atSeconds =>
              `${recording} at ${recordingClockLabel(atSeconds)}`,
          }),
        )
        return Reference({
          label,
          kind: 'Segment',
          href: url,
          detail: [
            ...saidDetail(
              Option.flatMap(maybeSectionId, segmentId =>
                Option.fromUndefinedOr(
                  context.lines.saidOfSegment.get(segmentId),
                ),
              ),
              context,
            ),
            'Opens his words at this moment',
          ],
        })
      },
      CommitSha: ({ sha }) => {
        const label = sha.slice(0, SHORT_SHA_LENGTH)
        const href = `/commits/${sha}`
        return Option.match(
          Array.findFirst(context.commits, commit =>
            commit.sha.startsWith(sha.toLowerCase()),
          ),
          {
            onNone: () =>
              Reference({
                label,
                kind: 'Commit',
                href,
                detail: [`Commit ${sha}`],
              }),
            onSome: commit =>
              Reference({
                label,
                title: shortened(commit.subject, TITLE_LIMIT),
                kind: 'Commit',
                href,
                detail: [`${commit.repo} ${commit.sha}`],
              }),
          },
        )
      },
      AgentName: ({ agentId }) =>
        Reference({
          label: agentLabel(agentId),
          kind: 'Agent',
          href: `/agents/${encodeURIComponent(agentId)}`,
          detail: [agentId],
        }),
      BuildNumber: ({ maybeApp, maybeVersion, number }) => {
        const label = Option.match(Option.all([maybeApp, maybeVersion]), {
          onNone: () => `Build ${number}`,
          onSome: ([app, version]) => `${app} ${version} (${number})`,
        })
        const href = `/builds/${number}`
        return Option.match(
          Option.fromUndefinedOr(
            context.buildsByNumber.get(Number.parseInt(number, 10)),
          ),
          {
            onNone: () =>
              Reference({
                label,
                kind: 'Build',
                href,
                detail: [`Build ${number}`],
              }),
            onSome: build =>
              Reference({
                label,
                title: `Scribe ${build.marketingVersion}`,
                state: build.status,
                kind: 'Build',
                href,
                detail: buildDetail(build, context),
              }),
          },
        )
      },
      Timestamp: ({ atMs }) =>
        Reference({
          label: whenLabel(atMs, context.nowMs, context.offsetMinutes),
          kind: 'Time',
          detail: [localTimeLabel(atMs, context.offsetMinutes)],
        }),
      ChatSession: ({ sessionId, maybeUrl }) =>
        Reference({
          label: sessionId.startsWith('session_')
            ? 'Claude session'
            : sessionId.slice(0, SHORT_ID_LENGTH),
          kind: 'Session',
          ...Option.match(maybeUrl, {
            onNone: () => ({}),
            onSome: href => ({ href }),
          }),
          detail: [`Session ${sessionId}`],
        }),
      RawId: ({ id }) =>
        Reference({
          label: id.slice(0, SHORT_ID_LENGTH),
          kind: 'Id',
          detail: [id],
        }),
      FilePath: ({ path }) =>
        Reference({ label: fileLabel(path), kind: 'File', detail: [path] }),
      WebLink: ({ url }) =>
        Reference({
          label: linkLabel(url),
          kind: 'Link',
          href: url,
          detail: [url],
        }),
    }),
  )

/**
 * Issue text as chip parts: plain words stay words, and each reference
 * becomes a chip with its label, title, state and link, derived from the
 * text and the catalog each time it is shown. `Fixed by #1358` shows the
 * words `Fixed by ` and the chip `#1358 issues CLI burns CPU [PartiallyDone]`.
 */
export const partsOfText = (
  text: string,
  context: ChipContext,
): ReadonlyArray<TextPart> =>
  Array.map(readTextReferences(text), piece =>
    piece._tag === 'Words' ? Plain(piece.text) : referenceChip(piece, context),
  )
