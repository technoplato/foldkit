import { Array, Match as M } from 'effect'
import { Column, Plain, RichText, Text, type UiNode } from 'foldkit/renderers'

import { type AskFlowStep, askFlowOf } from './askFlow.js'
import { type ChipContext, chipContextOf, issueChipOf } from './chips.js'
import { millisecondsLabel } from './clock.js'
import { type Model } from './model.js'
import { timelineStepWords } from './timeline.js'

const HEADING = 'How long asks take'

const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toLocaleString('en-US')} Issues`

const stepNodes = (step: AskFlowStep, context: ChipContext): UiNode =>
  Column(
    { gap: 0 },
    Text(
      `${timelineStepWords(step.name)}  median ${millisecondsLabel(step.medianMs)}  ${issueCountWords(step.count)}`,
      { emphasis: 'Headline' },
    ),
    ...Array.map(step.slowest, slow =>
      RichText([
        Plain(`${millisecondsLabel(slow.tookMs)}  `),
        issueChipOf(slow.issueId, context),
      ]),
    ),
  )

/**
 * The page of how long asks take: each step of an ask's timeline with its
 * median, how many Issues reached it, and the slowest asks, each a chip.
 */
export const askFlowNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [
        Text(HEADING, { emphasis: 'Headline' }),
        Text('Observing…'),
      ],
      FailedIssues: ({ reason }) => [
        Text(HEADING, { emphasis: 'Headline' }),
        Text(reason),
      ],
      LoadedIssues: ({ issues }) => {
        const context = chipContextOf(
          issues,
          model.clock.nowMs,
          model.clock.timeZone,
        )
        return [
          Text(HEADING, { emphasis: 'Headline' }),
          Text(
            'Each step’s time runs from the step before it, read from what each Issue’s mentions and work log say.',
            { dim: true },
          ),
          ...Array.map(askFlowOf(issues), step => stepNodes(step, context)),
        ]
      },
    }),
  )
