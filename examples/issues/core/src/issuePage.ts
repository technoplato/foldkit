import { Array, Match as M, Option, Order, String, pipe } from 'effect'
import {
  Column,
  Plain,
  Progress,
  Reference,
  RichText,
  Row,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import {
  type Issue,
  type IssueAttachment,
  type IssueMention,
  type IssueWorkLogEntry,
  issueViewerUrl,
} from '@foldkit/instant-tools/issues'

import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  decisionsIn,
  issueChipOf,
  partsOfText,
  questionsIn,
  remindersIn,
} from './chips.js'
import {
  durationLabel,
  howLongAgo,
  localTimeLabel,
  whenLabel,
} from './clock.js'
import { IssueEntity, backlinksOf } from './entityGraph.js'
import {
  type ChipClock,
  agentChip,
  buildChip,
  commitChip,
  featureChip,
  productChip,
  spacedChips,
  testflightChips,
} from './graphChips.js'
import { type AgentRunChip, noIssueGraph } from './graphFacts.js'
import { findingNodes } from './graphPageParts.js'
import { type IssueAgent } from './issueAgents.js'
import {
  type IssueLanding,
  type IssueMoment,
  firstLandedBuild,
  firstTestflightBuild,
  noLanding,
} from './issueLandings.js'
import {
  decisionsOfIssue,
  questionsOfIssue,
  remindersOfIssue,
} from './issueRows.js'
import {
  landingHeadline,
  subtaskProgress,
  workInProgressLines,
} from './landing.js'
import {
  catalogIssueIds,
  issuesLinkingTo,
  workLogNewestFirst,
} from './leftover.js'
import { pageFieldsOf } from './listRows.js'
import {
  type MentionedLine,
  type RecordingMentionGroup,
  lineRangeLabel,
  mentionedIn,
  mentionedLineOf,
  recordingNumberOfMention,
} from './mentionedIn.js'
import { type IssueFilesState, type Model } from './model.js'
import { needsUserInputLines } from './needsUserInput.js'
import { nowWorkingLines } from './nowWorking.js'
import { runsOfIssue } from './pageAgents.js'
import { describeIssueReference, issueAttachmentWebLink } from './reference.js'
import { decisionChip, questionChip, reminderChip } from './rowChips.js'
import {
  type TimelineStep,
  askedAtOf,
  timelineLine,
  timelineOf,
  timelineStepWords,
} from './timeline.js'

const SHORT_ID_LENGTH = 8
const SHORT_SHA_LENGTH = 9
const ISO_DATE_LENGTH = 10
const QUOTE_LIMIT = 240
const BACKLINK_EXCERPTS_SHOWN = 2

/** How large a stored picture draws: a phone screen's shape, as wide as the page allows. */
const PICTURE_WIDTH = 240
const PICTURE_HEIGHT = 520

// CONTEXT

type PageContext = Readonly<{
  catalog: ReadonlyArray<Issue>
  chips: ChipContext
  maybeMoments: Option.Option<ReadonlyArray<IssueMoment>>
  nowMs: number
  timeZone: string
}>

const pageContextOf = (model: Model, issue: Issue): PageContext => {
  const catalog =
    model.issues._tag === 'LoadedIssues' ? model.issues.issues : [issue]
  return {
    catalog,
    chips: chipContextOf(
      catalog,
      model.clock.nowMs,
      model.clock.timeZone,
      chipFactsOf(model),
    ),
    maybeMoments:
      model.issueLanding._tag === 'LoadedIssueLanding'
        ? Option.some(model.issueLanding.landing.moments)
        : Option.none(),
    nowMs: model.clock.nowMs,
    timeZone: model.clock.timeZone,
  }
}

/** Whose words an asked line is, as the rows say, when they have been read. */
type AskedVoice = 'His' | 'Heard' | 'Unknown'

/**
 * Whether the lines a Recording mention quotes are his: any moment the rows
 * hold over them that is another app's sound makes them heard, not said, as
 * #625's Recording 222 #0-1, the video he had on. Before the rows are read, or
 * when no moment covers the lines, the page says neither.
 */
const askedVoiceOf = (
  recordingId: string,
  line: MentionedLine,
  context: PageContext,
): AskedVoice =>
  Option.match(
    Option.flatMap(context.maybeMoments, moments =>
      Option.map(line.lineRange, range =>
        Array.filter(
          moments,
          moment =>
            moment.recordingId === recordingId.toLowerCase() &&
            moment.firstLineIndex <= range.last &&
            range.first <= moment.lastLineIndex,
        ),
      ),
    ),
    {
      onNone: () => 'Unknown',
      onSome: covering =>
        Array.match(covering, {
          onEmpty: () => 'Unknown',
          onNonEmpty: found =>
            Array.some(found, moment => moment.kind === 'Seen')
              ? 'Heard'
              : 'His',
        }),
    },
  )

const askedLeadWords: Readonly<Record<AskedVoice, string>> = {
  His: 'Michael said it in ',
  Heard: 'Heard in ',
  Unknown: 'In ',
}

const clockOf = (context: PageContext): ChipClock => ({
  nowMs: context.nowMs,
  timeZone: context.timeZone,
})

const chipped = (
  text: string,
  context: PageContext,
  props: Readonly<{ dim?: boolean }> = {},
): UiNode => RichText(partsOfText(text, context.chips), props)

const whenWords = (atMs: number, context: PageContext): string =>
  context.nowMs === 0
    ? localTimeLabel(atMs, context.timeZone)
    : `${localTimeLabel(atMs, context.timeZone)} (${howLongAgo(atMs, context.nowMs)})`

const section = (
  heading: string,
  children: ReadonlyArray<UiNode>,
): ReadonlyArray<UiNode> =>
  Array.match(children, {
    onEmpty: () => [],
    onNonEmpty: nodes => [
      Column({ gap: 1 }, Text(heading, { emphasis: 'Headline' }), ...nodes),
    ],
  })

// HEADER

const propertyParts = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<TextPart> =>
  Array.intersperse(
    [
      ...Option.toArray(
        Option.map(issue.issueType, issueType =>
          Reference({ label: issueType, kind: 'Type' }),
        ),
      ),
      Reference({
        label: issue.product.name,
        kind: 'Product',
        href: `/products/${encodeURIComponent(issue.product.id)}`,
        detail: [`${issue.product._tag} ${issue.product.name}`],
      }),
      ...Option.toArray(
        Option.map(issue.area, area =>
          Reference({ label: area, kind: 'Area' }),
        ),
      ),
      ...Option.match(issue.claimantId, {
        onNone: () => [],
        onSome: claimantId =>
          Array.filter(
            partsOfText(claimantId, context.chips),
            part => part._tag === 'Reference',
          ),
      }),
    ],
    Plain('  '),
  )

const headerNodes = (
  issue: Issue,
  context: PageContext,
  actions: ReadonlyArray<UiNode>,
): ReadonlyArray<UiNode> => [
  Text(`#${issue.id}`, { mono: true, dim: true }),
  Text(issue.title, { emphasis: 'Headline' }),
  Row({ gap: 1 }, ...pageFieldsOf(issue)),
  ...actions,
  RichText(propertyParts(issue, context)),
  Text(
    Array.join(
      [
        `Filed ${whenLabel(issue.createdAtMs, context.nowMs, context.timeZone)}`,
        `updated ${whenLabel(issue.updatedAtMs, context.nowMs, context.timeZone)}`,
        ...Option.toArray(
          Option.map(issue.reportedDate, reported => `reported ${reported}`),
        ),
      ],
      '  ·  ',
    ),
    { dim: true },
  ),
]

// AT A GLANCE

const isHisAsk = (mention: IssueMention): boolean =>
  mention.source._tag === 'Recording' || mention.source._tag === 'Conversation'

const askedAtOrLast = (mention: IssueMention): number =>
  Option.getOrElse(askedAtOf(mention), () => Number.POSITIVE_INFINITY)

const firstAskOf = (issue: Issue): Option.Option<IssueMention> =>
  Array.head(
    Array.sortWith(
      Array.filter(issue.mentions, isHisAsk),
      askedAtOrLast,
      Order.Number,
    ),
  )

const recordingNameOf = (
  mention: IssueMention,
  recordingId: string,
  context: PageContext,
): string =>
  pipe(
    recordingNumberOfMention(mention),
    Option.orElse(() =>
      Option.fromUndefinedOr(
        context.chips.numbers.numberOfId.get(recordingId.toLowerCase()),
      ),
    ),
    Option.match({
      onNone: () => `Recording ${recordingId.slice(0, SHORT_ID_LENGTH)}`,
      onSome: recordingNumber => `Recording ${recordingNumber.toString()}`,
    }),
  )

const segmentChip = (
  mention: IssueMention,
  line: MentionedLine,
  recordingId: string,
  context: PageContext,
): TextPart => {
  const recording = recordingNameOf(mention, recordingId, context)
  return Reference({
    label: Option.match(line.lineRange, {
      onNone: () => recording,
      onSome: () => `${recording} ${lineRangeLabel(line)}`,
    }),
    kind: 'Segment',
    href: Option.getOrElse(line.deepLink, () => `/recordings/${recordingId}`),
    detail: [line.quote.slice(0, QUOTE_LIMIT), 'Opens his words at this line'],
  })
}

const whoAskedNodes = (
  mention: IssueMention,
  context: PageContext,
): ReadonlyArray<UiNode> => {
  const line = mentionedLineOf(mention)
  const atWords = Option.match(askedAtOf(mention), {
    onNone: () => '',
    onSome: atMs => `, ${whenWords(atMs, context)}`,
  })
  const said = M.value(mention.source).pipe(
    M.withReturnType<ReadonlyArray<TextPart>>(),
    M.tag('Recording', ({ recording }) => [
      Plain(askedLeadWords[askedVoiceOf(recording.recordingId, line, context)]),
      segmentChip(mention, line, recording.recordingId, context),
      Plain(atWords),
    ]),
    M.tag('Conversation', ({ conversation }) => [
      Plain('Michael typed it'),
      ...Option.match(Option.fromUndefinedOr(conversation.sessionId), {
        onNone: () => [],
        onSome: sessionId => [
          Plain(' in '),
          ...Array.filter(
            partsOfText(`session ${sessionId}`, context.chips),
            part => part._tag === 'Reference',
          ),
        ],
      }),
      Plain(atWords),
    ]),
    M.orElse(() => [Plain(`Reported${atWords}`)]),
  )
  return [
    RichText(said),
    ...(String.isNonEmpty(line.quote) ? [chipped(line.quote, context)] : []),
  ]
}

const moreAsksWords = (count: number): string =>
  count === 1 ? 'and 1 more time' : `and ${count.toString()} more times`

const askedNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Option.match(firstAskOf(issue), {
    onNone: () => [],
    onSome: first => {
      const more = Array.filter(issue.mentions, isHisAsk).length - 1
      return [
        ...whoAskedNodes(first, context),
        ...(more > 0 ? [Text(moreAsksWords(more), { dim: true })] : []),
      ]
    },
  })

const landedBuildNodes = (
  landing: IssueLanding,
  context: PageContext,
): ReadonlyArray<UiNode> => [
  ...Option.match(firstLandedBuild(landing), {
    onNone: () =>
      Array.isReadonlyArrayEmpty(landing.commits)
        ? []
        : [Text('Not in a build yet', { dim: true })],
    onSome: build => [
      RichText([
        Plain('Landed in '),
        buildChip(build, clockOf(context)),
        Plain(`  ${whenWords(build.builtAtMs, context)}`),
      ]),
    ],
  }),
  ...Option.match(firstTestflightBuild(landing), {
    onNone: () => [],
    onSome: build => [
      RichText([
        Plain('Get it: '),
        buildChip(build, clockOf(context)),
        ...spacedChips(testflightChips(build, clockOf(context))),
      ]),
    ],
  }),
  ...Array.map(landing.foundIn, build =>
    RichText([Plain('Found in '), buildChip(build, clockOf(context))]),
  ),
  ...Array.map(landing.commits, commit =>
    RichText(
      [
        commitChip(commit),
        ...spacedChips(
          Array.map(commit.builds, build => buildChip(build, clockOf(context))),
        ),
        Plain(`  ${whenWords(commit.authoredAtMs, context)}`),
      ],
      { dim: true },
    ),
  ),
]

const landingOfPage = (model: Model, issueId: string): IssueLanding =>
  model.issueLanding._tag === 'LoadedIssueLanding' &&
  model.issueLanding.issueId === issueId
    ? model.issueLanding.landing
    : noLanding

const landingFailureNodes = (model: Model): ReadonlyArray<UiNode> =>
  model.issueLanding._tag === 'FailedIssueLanding'
    ? [
        Text(
          `Where this Issue landed could not be read: ${model.issueLanding.reason}`,
          { dim: true },
        ),
      ]
    : []

const landingNodes = (
  issue: Issue,
  steps: ReadonlyArray<TimelineStep>,
  context: PageContext,
): ReadonlyArray<UiNode> => [
  ...Option.match(issue.workInProgress, {
    onNone: () => [],
    onSome: work => [
      RichText([
        Reference({ label: landingHeadline(work), kind: 'Landing' }),
        ...Option.match(work.commitSha, {
          onNone: () => [],
          onSome: sha => [
            Plain('  at '),
            Reference({
              label: sha.slice(0, SHORT_SHA_LENGTH),
              kind: 'Commit',
              href: `/commits/${sha}`,
              detail: [`Commit ${sha}`],
            }),
          ],
        }),
        ...Option.match(work.branch, {
          onNone: () => [],
          onSome: branch => [Plain(`  on ${branch}`)],
        }),
      ]),
      ...Option.toArray(
        Option.map(work.lastStep, lastStep =>
          chipped(lastStep, context, { dim: true }),
        ),
      ),
    ],
  }),
  ...pipe(
    Array.findFirst(steps, step => step.name === 'Built'),
    Option.flatMap(step => step.maybeEvidence),
    Option.map(evidence => chipped(evidence, context, { dim: true })),
    Option.toArray,
  ),
]

const timelineNodes = (
  steps: ReadonlyArray<TimelineStep>,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.match(steps, {
    onEmpty: () => [],
    onNonEmpty: found => [
      Text(timelineLine(found)),
      ...Array.map(found, step =>
        RichText(
          [
            Plain(
              `${timelineStepWords(step.name)}  ${whenWords(step.atMs, context)}`,
            ),
            ...Option.match(step.maybeEvidence, {
              onNone: () => [],
              onSome: evidence => [
                Plain('  '),
                ...partsOfText(evidence, context.chips),
              ],
            }),
          ],
          { dim: true },
        ),
      ),
    ],
  })

const graphOfPage = (model: Model, issueId: string) =>
  model.issueGraph._tag === 'LoadedIssueGraph' &&
  model.issueGraph.issueId === issueId
    ? model.issueGraph.graph
    : noIssueGraph

const appAndFeatureNodes = (
  model: Model,
  issue: Issue,
): ReadonlyArray<UiNode> => [
  RichText([
    productChip(
      issue.product.id,
      issue.product.name,
      Option.some(issue.product._tag),
    ),
    ...spacedChips(
      Array.map(graphOfPage(model, issue.id).features, ({ feature }) =>
        featureChip(feature),
      ),
    ),
  ]),
  ...(model.issueGraph._tag === 'FailedIssueGraph'
    ? [
        Text(
          `Its features and findings could not be read: ${model.issueGraph.reason}`,
          { dim: true },
        ),
      ]
    : []),
]

const runWords = (run: AgentRunChip): string =>
  Array.join(
    [
      ...Option.toArray(run.maybeAccount),
      ...Option.toArray(run.maybeModel),
      ...Option.toArray(run.maybeEffort),
    ],
    '  ·  ',
  )

const runTimeWords = (run: AgentRunChip, context: PageContext): string =>
  Option.match(run.maybeStartedAtMs, {
    onNone: () => '',
    onSome: startedAtMs =>
      `  ${whenWords(startedAtMs, context)}${Option.match(run.maybeEndedAtMs, {
        onNone: () => '',
        onSome: endedAtMs => `, ran ${durationLabel(startedAtMs, endedAtMs)}`,
      })}`,
  })

const runRow = (run: AgentRunChip, context: PageContext): UiNode =>
  RichText([
    agentChip(run, clockOf(context)),
    Plain(`  ${runWords(run)}${runTimeWords(run, context)}`),
  ])

const chipOfAgent = (
  agent: Readonly<{
    handle: string
    id: string
    maybeEndedAtMs: Option.Option<number>
    maybeStartedAtMs: Option.Option<number>
    name: string
    state: string
  }>,
  harness: string,
  maybeAccount: Option.Option<string>,
  maybeKind: Option.Option<string>,
): AgentRunChip => ({
  agentId: agent.handle,
  harness,
  maybeAccount,
  maybeEffort: Option.none(),
  maybeEndedAtMs: agent.maybeEndedAtMs,
  maybeIssueId: Option.none(),
  maybeKind,
  maybeModel: Option.none(),
  maybeStartedAtMs: agent.maybeStartedAtMs,
  name: agent.name,
  runId: agent.id,
  status: agent.state,
})

const SUBAGENT_KIND = 'subagent'

const claudeLinkParts = (agent: IssueAgent): ReadonlyArray<TextPart> =>
  M.value(agent.link).pipe(
    M.withReturnType<ReadonlyArray<TextPart>>(),
    M.tagsExhaustive({
      ClaudeLink: ({ url }) => [
        Reference({
          label: 'claude.ai',
          kind: 'Session',
          href: url,
          detail: [
            'Opens only on the account that made it',
            ...Option.toArray(agent.maybeAccount),
          ],
        }),
      ],
      NoClaudeLink: ({ why }) => [Plain(`No Claude link: ${why}`)],
    }),
  )

const chatParts = (
  maybeChatLink: Option.Option<string>,
): ReadonlyArray<TextPart> =>
  Option.toArray(
    Option.map(maybeChatLink, href =>
      Reference({
        label: 'Chat',
        kind: 'App',
        href,
        detail: ['Opens its chat in Scribe'],
      }),
    ),
  )

const agentNodes = (
  agent: IssueAgent,
  context: PageContext,
): ReadonlyArray<UiNode> => {
  const chip = chipOfAgent(
    agent,
    agent.harness,
    agent.maybeAccount,
    agent.maybeKind,
  )
  return [
    runRow(chip, context),
    RichText([
      Plain('    '),
      ...claudeLinkParts(agent),
      ...spacedChips(chatParts(agent.maybeChatLink)),
    ]),
    ...Array.map(agent.subagents, subagent => {
      const subagentChip = chipOfAgent(
        subagent,
        agent.harness,
        agent.maybeAccount,
        Option.some(SUBAGENT_KIND),
      )
      return RichText([
        Plain('    '),
        agentChip(subagentChip, clockOf(context)),
        Plain(
          `${runTimeWords(subagentChip, context)}${Option.match(
            subagent.maybeTask,
            { onNone: () => '', onSome: task => `  ·  ${task}` },
          )}`,
        ),
      ])
    }),
  ]
}

/**
 * The page's runs: every agent started for the Issue, from the one query
 * `issues show` reads (Scribe #2303), each with its claude.ai link or why it
 * has none, its chat and its subagents; then each run that only wrote on the
 * Issue while it ran, as before. Until the agents are read, the runs as before.
 */
const runSection = (
  issue: Issue,
  model: Model,
  context: PageContext,
): Readonly<{ count: number; nodes: ReadonlyArray<UiNode> }> => {
  const agents =
    model.issueAgents._tag === 'LoadedIssueAgents' &&
    model.issueAgents.issueId === issue.id
      ? model.issueAgents.agents
      : []
  const others = Array.filter(
    runsOfIssue(issue, model.knownAgents),
    run => !Array.some(agents, agent => agent.id === run.runId),
  )
  const failure =
    model.issueAgents._tag === 'FailedIssueAgents' &&
    model.issueAgents.issueId === issue.id
      ? [
          Text(`Its agents could not be read: ${model.issueAgents.reason}`, {
            dim: true,
          }),
        ]
      : []
  return {
    count: agents.length + others.length,
    nodes: [
      ...Array.flatMap(agents, agent => agentNodes(agent, context)),
      ...Array.map(others, run => runRow(run, context)),
      ...failure,
    ],
  }
}

const findingNodesOf = (
  model: Model,
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(graphOfPage(model, issue.id).findings, finding =>
    Column(
      { gap: 0 },
      ...findingNodes(finding, context.chips, clockOf(context)),
    ),
  )

const decisionNodesOf = (
  model: Model,
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(decisionsOfIssue(decisionsIn(model), issue), decision =>
    RichText([
      decisionChip(decision, clockOf(context)),
      Plain(`  ${whenWords(decision.decidedAtMs, context)}`),
    ]),
  )

const questionNodesOf = (
  model: Model,
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(questionsOfIssue(questionsIn(model), issue), question =>
    RichText([
      questionChip(question, clockOf(context)),
      Plain(`  ${whenWords(question.askedAtMs, context)}`),
    ]),
  )

const reminderNodesOf = (
  model: Model,
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(remindersOfIssue(remindersIn(model), issue), reminder =>
    RichText([
      reminderChip(reminder, clockOf(context)),
      Plain(`  ${whenWords(reminder.createdAtMs, context)}`),
    ]),
  )

const atAGlanceNodes = (
  model: Model,
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> => {
  const landing = landingOfPage(model, issue.id)
  const steps = timelineOf(issue, landing)
  const runs = runSection(issue, model, context)
  const findings = findingNodesOf(model, issue, context)
  const decisions = decisionNodesOf(model, issue, context)
  const questions = questionNodesOf(model, issue, context)
  const reminders = reminderNodesOf(model, issue, context)
  return [
    ...section('App and feature', appAndFeatureNodes(model, issue)),
    ...section('Asked', askedNodes(issue, context)),
    ...section('Landing', [
      ...landedBuildNodes(landing, context),
      ...landingFailureNodes(model),
      ...landingNodes(issue, steps, context),
    ]),
    ...section('Timeline', timelineNodes(steps, context)),
    ...section(`Runs: ${runs.count.toString()}`, runs.nodes),
    ...section(`Findings: ${findings.length.toString()}`, findings),
    ...section(`Decisions: ${decisions.length.toString()}`, decisions),
    ...section(`Questions: ${questions.length.toString()}`, questions),
    ...section(`Reminders: ${reminders.length.toString()}`, reminders),
  ]
}

// BODY

const paragraphsOf = (text: string): ReadonlyArray<string> =>
  Array.filter(text.split('\n'), String.isNonEmpty)

const detailsNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(paragraphsOf(issue.details), paragraph =>
    chipped(paragraph, context),
  )

const workLogEntryNode = (
  entry: IssueWorkLogEntry,
  context: PageContext,
): UiNode =>
  RichText([
    Plain(
      `${whenLabel(entry.occurredAtMs, context.nowMs, context.timeZone)}  `,
    ),
    ...Option.match(entry.state, {
      onNone: () => [],
      onSome: state => [
        Reference({ label: state, kind: 'State' }),
        Plain('  '),
      ],
    }),
    ...partsOfText(entry.summary, context.chips),
    ...Option.match(entry.agentId, {
      onNone: () => [],
      onSome: agentId => [
        Plain('  '),
        ...Array.filter(
          partsOfText(agentId, context.chips),
          part => part._tag === 'Reference',
        ),
      ],
    }),
    ...Option.match(entry.commitSha, {
      onNone: () => [],
      onSome: sha => [
        Plain('  '),
        Reference({
          label: sha.slice(0, SHORT_SHA_LENGTH),
          kind: 'Commit',
          href: `/commits/${sha}`,
          detail: [`Commit ${sha}`],
        }),
      ],
    }),
  ])

const workLogNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.match(workLogNewestFirst(issue.workLog), {
    onEmpty: () => [Text('No work log yet.', { dim: true })],
    onNonEmpty: entries =>
      Array.map(entries, entry => workLogEntryNode(entry, context)),
  })

const recordingGroupNodes = (
  group: RecordingMentionGroup,
  context: PageContext,
): ReadonlyArray<UiNode> => [
  RichText([
    Reference({
      label: group.recordingLabel,
      kind: 'Recording',
      href: `/recordings/${group.recordingId}`,
      detail: [`Every Issue from ${group.recordingLabel}`],
    }),
    ...Option.match(group.newestAtMs, {
      onNone: () => [],
      onSome: atMs => [
        Plain(
          `  ${localTimeLabel(atMs, context.timeZone).slice(0, ISO_DATE_LENGTH)}`,
        ),
      ],
    }),
  ]),
  ...Array.map(group.lines, line =>
    RichText([
      Reference({
        label: Option.match(line.lineRange, {
          onNone: () => 'Line',
          onSome: () => lineRangeLabel(line),
        }),
        kind: 'Segment',
        href: Option.getOrElse(
          line.deepLink,
          () => `/recordings/${group.recordingId}`,
        ),
        detail: ['Opens his words at this line'],
      }),
      Plain('  '),
      ...partsOfText(line.quote, context.chips),
    ]),
  ),
]

const relatedParts = (
  mention: IssueMention,
  context: PageContext,
): ReadonlyArray<TextPart> =>
  Array.flatMap(mention.related, reference =>
    reference._tag === 'Uri'
      ? Array.filter(
          partsOfText(reference.value, context.chips),
          part => part._tag === 'Reference',
        )
      : [],
  )

const otherMentionNode = (
  mention: IssueMention,
  context: PageContext,
): UiNode =>
  RichText([
    ...partsOfText(
      Option.getOrElse(
        Option.orElse(mention.directQuote, () => mention.note),
        () => '',
      ),
      context.chips,
    ),
    Plain('  '),
    ...partsOfText(describeIssueReference(mention.source), context.chips),
    ...Array.flatMap(relatedParts(mention, context), part => [
      Plain('  '),
      part,
    ]),
    ...Option.match(mention.capturedAtMs, {
      onNone: () => [],
      onSome: atMs => [
        Plain(`  ${whenLabel(atMs, context.nowMs, context.timeZone)}`),
      ],
    }),
  ])

const mentionedInNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.flatMap(mentionedIn(issue), group =>
    recordingGroupNodes(group, context),
  )

const otherMentionNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(
    Array.filter(
      issue.mentions,
      mention => mention.source._tag !== 'Recording',
    ),
    mention => otherMentionNode(mention, context),
  )

const linkedIssueNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> => {
  const stored = catalogIssueIds(issue)
  return [
    ...Array.map(stored, issueId =>
      RichText([issueChipOf(issueId, context.chips)]),
    ),
    ...Array.flatMap(issuesLinkingTo(context.catalog, issue.id), linkerId =>
      Array.contains(stored, linkerId)
        ? []
        : [
            RichText([
              issueChipOf(linkerId, context.chips),
              Plain('  links here'),
            ]),
          ],
    ),
  ]
}

const pointedAtByNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.map(
    backlinksOf(context.catalog, IssueEntity.make({ issueId: issue.id })),
    backlink =>
      Column(
        { gap: 0 },
        RichText([issueChipOf(backlink.issue.id, context.chips)]),
        ...Array.map(
          Array.take(backlink.links, BACKLINK_EXCERPTS_SHOWN),
          link => chipped(link.excerpt, context, { dim: true }),
        ),
      ),
  )

const linesNodes = (
  lines: ReadonlyArray<string>,
  context: PageContext,
): ReadonlyArray<UiNode> => Array.map(lines, line => chipped(line, context))

const subtaskNodes = (
  issue: Issue,
  context: PageContext,
): ReadonlyArray<UiNode> =>
  Array.match(issue.subtasks, {
    onEmpty: () => [],
    onNonEmpty: subtasks => [
      Progress({
        label: subtaskProgress(issue),
        max: subtasks.length,
        value: Array.filter(
          subtasks,
          subtask => subtask.state._tag === 'Checked',
        ).length,
      }),
      ...Array.map(subtasks, subtask =>
        RichText([
          Reference({
            kind: 'Subtask',
            label: subtask.state._tag === 'Checked' ? 'done' : 'todo',
          }),
          Plain('  '),
          ...partsOfText(subtask.title, context.chips),
        ]),
      ),
    ],
  })

const criteriaNodes = (issue: Issue): ReadonlyArray<UiNode> =>
  Array.map(issue.successCriteria, criterion =>
    Text(`${criterion.isSatisfied ? 'done' : 'look'}  ${criterion.outcome}`),
  )

/**
 * Where a stored file opens: its web link, or for a file in Instant storage the
 * signed address the open Issue's files carry (Scribe #1345).
 */
const attachmentAddress = (
  attachment: IssueAttachment,
  issueFiles: IssueFilesState,
): Option.Option<string> =>
  Option.orElse(issueAttachmentWebLink(attachment.source), () =>
    attachment.source._tag === 'InstantStorage' &&
    issueFiles._tag === 'LoadedIssueFiles'
      ? Option.map(
          Array.findFirst(
            issueFiles.files,
            file =>
              attachment.source._tag === 'InstantStorage' &&
              file.fileId === attachment.source.fileId,
          ),
          file => file.url,
        )
      : Option.none(),
  )

const isPicture = (attachment: IssueAttachment): boolean =>
  attachment.contentType.startsWith('image/')

const attachmentNodes = (
  issue: Issue,
  issueFiles: IssueFilesState,
): ReadonlyArray<UiNode> =>
  Array.match(issue.attachments, {
    onEmpty: () => [],
    onNonEmpty: attachments => [
      ...(issueFiles._tag === 'FailedIssueFiles'
        ? [
            Text(
              `This Issue's pictures could not be read: ${issueFiles.reason}`,
            ),
          ]
        : []),
      ...Array.map(attachments, attachment => {
        const content = `${attachment.fileName} (${attachment.kind})`
        return Option.match(attachmentAddress(attachment, issueFiles), {
          onNone: () => Text(content),
          onSome: href =>
            isPicture(attachment)
              ? Text(content, {
                  href,
                  image: {
                    height: PICTURE_HEIGHT,
                    src: href,
                    width: PICTURE_WIDTH,
                  },
                })
              : Text(content, { href }),
        })
      }),
    ],
  })

/**
 * One Issue's page: its fields and `actions` first, then at a glance who
 * asked and in which words, linked at the moment he said it; the app; where
 * the work landed and the build; and the ask's timeline with how long each
 * step took. Then its details, work, criteria, work log and mentions, every
 * Issue, Recording, commit, agent and build in them a chip, and the Issues
 * that point at it.
 */
export const issuePageNodes = (
  model: Model,
  issue: Issue,
  actions: ReadonlyArray<UiNode> = [],
): ReadonlyArray<UiNode> => {
  const context = pageContextOf(model, issue)
  const pageUrl = issueViewerUrl(issue.id)
  return [
    ...headerNodes(issue, context, actions),
    ...section(
      'Needs user input',
      linesNodes(needsUserInputLines(issue), context),
    ),
    ...atAGlanceNodes(model, issue, context),
    ...section('Details', detailsNodes(issue, context)),
    ...section('Now working', linesNodes(nowWorkingLines(issue), context)),
    ...section(
      'Work in progress',
      Option.match(issue.workInProgress, {
        onNone: () => [],
        onSome: work => linesNodes(workInProgressLines(work), context),
      }),
    ),
    ...section(
      `Subtasks: ${subtaskProgress(issue)}`,
      subtaskNodes(issue, context),
    ),
    ...section('Success criteria', criteriaNodes(issue)),
    ...section('Linked issues', linkedIssueNodes(issue, context)),
    ...section('Pointed at by', pointedAtByNodes(issue, context)),
    ...section('Work log', workLogNodes(issue, context)),
    ...section('Mentioned in', mentionedInNodes(issue, context)),
    ...section('Mentions', otherMentionNodes(issue, context)),
    ...section('Attachments', attachmentNodes(issue, model.issueFiles)),
    Text('Link to this Issue', { href: pageUrl, copyable: true, dim: true }),
  ]
}
