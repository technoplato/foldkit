import { Array, Option, String } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type ChipContext, issueChipOf } from './chips.js'
import { type SaidMoment } from './decisionFacts.js'
import { type ChipClock, whenWordsOn } from './graphChips.js'
import { readTextReferences } from './textReferences.js'

const WORDS_ORIGIN = 'https://words.pisspoursoftware.xyz'
const SHORT_ID_LENGTH = 8

const lineWords = (moment: SaidMoment): string =>
  Option.match(moment.maybeFirstLine, {
    onNone: () => '',
    onSome: first =>
      Option.match(
        Option.filter(moment.maybeLastLine, last => last !== first),
        {
          onNone: () => ` #${first.toString()}`,
          onSome: last => ` #${first.toString()}-${last.toString()}`,
        },
      ),
  })

const recordingWords = (recordingId: string, context: ChipContext): string =>
  Option.match(
    Option.fromUndefinedOr(context.numbers.numberOfId.get(recordingId)),
    {
      onNone: () => `Recording ${recordingId.slice(0, SHORT_ID_LENGTH)}`,
      onSome: recordingNumber => `Recording ${recordingNumber.toString()}`,
    },
  )

/**
 * A said moment's words link at its exact time, the link a line's own page
 * builds: `/recording/<id>/section/<line>?t=824.06`.
 */
const wordsHrefOf = (moment: SaidMoment): Option.Option<string> =>
  Option.map(
    Option.all([
      moment.maybeRecordingId,
      moment.maybeSegmentId,
      moment.maybeStartSeconds,
    ]),
    ([recordingId, segmentId, startSeconds]) =>
      `${WORDS_ORIGIN}/recording/${recordingId}/section/${segmentId}?t=${startSeconds.toFixed(2)}`,
  )

/**
 * A moment's chip: `Recording 326 #87-100`, opening his words at that moment. A
 * moment he typed has no Recording to open.
 */
export const momentChip = (
  moment: SaidMoment,
  context: ChipContext,
  clock: ChipClock,
): TextPart =>
  Option.match(moment.maybeRecordingId, {
    onNone: () =>
      Reference({
        label: 'Typed',
        kind: 'Time',
        detail: [`He typed this ${whenWordsOn(moment.startedAtMs, clock)}`],
      }),
    onSome: recordingId =>
      Reference({
        label: `${recordingWords(recordingId, context)}${lineWords(moment)}`,
        kind: 'Segment',
        ...Option.match(wordsHrefOf(moment), {
          onNone: () => ({ href: `/recordings/${recordingId}` }),
          onSome: href => ({ href }),
        }),
        detail: [
          'Opens his words at this moment',
          whenWordsOn(moment.startedAtMs, clock),
        ],
      }),
  })

/** His exact words, then where they are and when he said them. */
export const momentNodes = (
  moment: SaidMoment,
  context: ChipContext,
  clock: ChipClock,
): UiNode =>
  Column(
    { gap: 0 },
    ...(String.isNonEmpty(moment.quote) ? [Text(moment.quote)] : []),
    RichText(
      [
        momentChip(moment, context, clock),
        Plain(`  ${whenWordsOn(moment.startedAtMs, clock)}  ${moment.role}`),
      ],
      { dim: true },
    ),
  )

/** The Issues a sentence's words name: `filed as #1516`. */
export const issueIdsInText = (text: string): ReadonlyArray<string> =>
  Array.flatMap(readTextReferences(text), piece =>
    piece._tag === 'Referenced' && piece.reference._tag === 'IssueNumber'
      ? [piece.reference.issueId]
      : [],
  )

/** The chips of the Issues a row names. */
export const issueChipsOf = (
  issueIds: ReadonlyArray<string>,
  context: ChipContext,
): ReadonlyArray<TextPart> =>
  Array.map(issueIds, issueId => issueChipOf(issueId, context))

type RememberedRow = Readonly<{
  issues: ReadonlyArray<Issue | undefined>
  nowMs: number
  timeZone: string
  row: UiNode
}>

const sameIssues = (
  left: ReadonlyArray<Issue | undefined>,
  right: ReadonlyArray<Issue | undefined>,
): boolean =>
  left.length === right.length &&
  left.every((issue, index) => issue === right[index])

/**
 * A memo of a list's rows: a row is built again only when its clock or an Issue
 * it names changed, so a live change to one of 1,500 Issues builds the rows that
 * name it, not all 964.
 */
export const rememberedRowsOf = <Row extends object>() => {
  const remembered = new WeakMap<Row, RememberedRow>()
  return (
    row: Row,
    issueIds: ReadonlyArray<string>,
    context: ChipContext,
    clock: ChipClock,
    build: () => UiNode,
  ): UiNode => {
    const issues = Array.map(issueIds, issueId =>
      context.issuesById.get(issueId),
    )
    const held = remembered.get(row)
    if (
      held !== undefined &&
      held.nowMs === clock.nowMs &&
      held.timeZone === clock.timeZone &&
      sameIssues(held.issues, issues)
    ) {
      return held.row
    }
    const built = build()
    remembered.set(row, {
      issues,
      nowMs: clock.nowMs,
      timeZone: clock.timeZone,
      row: built,
    })
    return built
  }
}
