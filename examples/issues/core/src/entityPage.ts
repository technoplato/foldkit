import { Array, Match as M, Option } from 'effect'
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

import { agentFactNodes, sessionFactNodes } from './agentPage.js'
import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  decisionsIn,
  issueChipOf,
  partsOfText,
} from './chips.js'
import { millisecondsLabel, whenLabel } from './clock.js'
import { decisionFactNodes } from './decisionPage.js'
import { questionFactNodes } from './questionPage.js'
import { reminderFactNodes } from './reminderPage.js'
import {
  AgentEntity,
  type Backlink,
  type IssueLink,
  type PageEntity,
  backlinksOf,
  productStatusGroups,
  recordingNumbersOf,
} from './entityGraph.js'
import { featureFactNodes } from './featurePage.js'
import { findingFactNodes } from './findingsPage.js'
import {
  type ChipClock,
  buildChip,
  commitChip,
  commitChipOf,
  lineWordsLink,
  momentChip,
  recordingWordsLink,
  spacedChips,
  testflightChips,
  whenWordsOn,
} from './graphChips.js'
import {
  type BuildFacts,
  type CommitFacts,
  type IssuesOfMoments,
  type MomentsOfIssue,
  type RecordingFacts,
  type SegmentFacts,
  buildLabel,
  isOnTestflight,
} from './issueLandings.js'
import { type Model } from './model.js'
import { agentHandlesOfFacts, mergedBacklinks } from './pageAgents.js'
import { productFactNodes } from './productPage.js'

const SHORT_ID_LENGTH = 8
const SHORT_SHA_LENGTH = 9
const LINKS_SHOWN_PER_ISSUE = 3

/**
 * What an entity's page is called: `Recording 208`, `Build 218`,
 * `Commit 6ff20758d`, the agent `claude-code/issues-linear-1538@ld`, or a
 * product by its name, `Scribe`, when an Issue under it says so.
 */
export const entityTitle = (
  entity: PageEntity,
  issues: ReadonlyArray<Issue>,
): string =>
  M.value(entity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RecordingEntity: ({ recordingId }) =>
        Option.match(
          Option.fromUndefinedOr(
            recordingNumbersOf(issues).numberOfId.get(recordingId),
          ),
          {
            onNone: () => `Recording ${recordingId.slice(0, SHORT_ID_LENGTH)}`,
            onSome: recordingNumber =>
              `Recording ${recordingNumber.toString()}`,
          },
        ),
      RecordingNumberEntity: ({ recordingNumber }) =>
        `Recording ${recordingNumber.toString()}`,
      SegmentEntity: ({ segmentId }) =>
        `Line ${segmentId.slice(0, SHORT_ID_LENGTH)}`,
      AgentEntity: ({ agentId }) => `Agent ${agentId}`,
      SessionEntity: ({ sessionId }) =>
        `Session ${sessionId.slice(0, SHORT_ID_LENGTH)}`,
      FindingEntity: ({ findingId }) =>
        `Finding ${findingId.slice(0, SHORT_ID_LENGTH)}`,
      FeatureEntity: ({ slug }) => `Feature ${slug}`,
      DecisionEntity: ({ decisionId }) =>
        `Decision ${decisionId.slice(0, SHORT_ID_LENGTH)}`,
      QuestionEntity: ({ questionId }) =>
        `Question ${questionId.slice(0, SHORT_ID_LENGTH)}`,
      ReminderEntity: ({ reminderId }) =>
        `Reminder ${reminderId.slice(0, SHORT_ID_LENGTH)}`,
      CommitEntity: ({ sha }) => `Commit ${sha.slice(0, SHORT_SHA_LENGTH)}`,
      BuildEntity: ({ number }) => `Build ${number}`,
      ProductEntity: ({ productId }) =>
        Option.match(
          Array.findFirst(issues, issue => issue.product.id === productId),
          {
            onNone: () => productId,
            onSome: issue => issue.product.name,
          },
        ),
    }),
  )

const placeLabel = (link: IssueLink): string =>
  M.value(link.place).pipe(
    M.withReturnType<string>(),
    M.when('Details', () => 'in its details'),
    M.when('WorkLog', () => 'in its work log'),
    M.when('Mention', () => 'where he said it'),
    M.when('Related', () => 'as a related Issue'),
    M.when('Claim', () => 'as its claimant'),
    M.when('Work', () => 'in its work in progress'),
    M.when('Product', () => 'as its product'),
    M.exhaustive,
  )

const backlinkNodes = (
  backlink: Backlink,
  model: Model,
  issues: ReadonlyArray<Issue>,
): UiNode => {
  const context = chipContextOf(
    issues,
    model.clock.nowMs,
    model.clock.offsetMinutes,
    chipFactsOf(model),
  )
  return Column(
    { gap: 0 },
    RichText(partsOfText(`#${backlink.issue.id}`, context)),
    ...Array.map(Array.take(backlink.links, LINKS_SHOWN_PER_ISSUE), link =>
      RichText(
        [
          ...partsOfText(link.excerpt, context),
          Plain(
            `  ${placeLabel(link)}${Option.match(link.maybeAtMs, {
              onNone: () => '',
              onSome: atMs =>
                `, ${whenLabel(atMs, model.clock.nowMs, model.clock.offsetMinutes)}`,
            })}`,
          ),
        ],
        { dim: true },
      ),
    ),
  )
}

const productRowMemo = new WeakMap<
  Issue,
  Readonly<{ nowMs: number; offsetMinutes: number; row: UiNode }>
>()

const productRowOf = (
  issue: Issue,
  model: Model,
  context: ChipContext,
): UiNode =>
  Option.getOrElse(
    Option.map(
      Option.filter(
        Option.fromUndefinedOr(productRowMemo.get(issue)),
        remembered =>
          remembered.nowMs === model.clock.nowMs &&
          remembered.offsetMinutes === model.clock.offsetMinutes,
      ),
      remembered => remembered.row,
    ),
    () => {
      const row = RichText([
        issueChipOf(issue.id, context),
        Plain(
          `  ${whenLabel(issue.updatedAtMs, model.clock.nowMs, model.clock.offsetMinutes)}`,
        ),
      ])
      productRowMemo.set(issue, {
        nowMs: model.clock.nowMs,
        offsetMinutes: model.clock.offsetMinutes,
        row,
      })
      return row
    },
  )

const productPageNodes = (
  model: Model,
  productId: string,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    issues,
    model.clock.nowMs,
    model.clock.offsetMinutes,
  )
  return Array.map(
    productStatusGroups(issues, productId),
    ({ status, issues: inStatus }) =>
      Column(
        { gap: 0 },
        Text(`${status}  ${inStatus.length.toString()}`, {
          emphasis: 'Headline',
        }),
        ...Array.map(inStatus, issue => productRowOf(issue, model, context)),
      ),
  )
}

const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toString()} Issues`

const issueChipLines = (
  issueIds: ReadonlyArray<string>,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.map(issueIds, issueId => RichText([issueChipOf(issueId, context)]))

const issuesSection = (
  heading: string,
  issueIds: ReadonlyArray<string>,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.match(issueIds, {
    onEmpty: () => [],
    onNonEmpty: found => [
      Column(
        { gap: 0 },
        Text(`${heading}: ${issueCountWords(found.length)}`, {
          emphasis: 'Headline',
        }),
        ...issueChipLines(found, context),
      ),
    ],
  })

const buildFactNodes = (
  facts: BuildFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { build } = facts
  const getIt: ReadonlyArray<TextPart> = isOnTestflight(build)
    ? [Plain('Get it:'), ...spacedChips(testflightChips(build, clock))]
    : []
  return [
    Text(buildLabel(build), { emphasis: 'Headline' }),
    Text(
      Array.join(
        [
          `Built ${whenWordsOn(build.builtAtMs, clock)}`,
          build.status,
          ...Option.toArray(build.maybeTag),
        ],
        '  ·  ',
      ),
      { dim: true },
    ),
    ...(Array.isReadonlyArrayEmpty(getIt) ? [] : [RichText(getIt)]),
    RichText([
      Plain('Cut from '),
      commitChipOf(facts.cutSha, facts.maybeCutSubject),
    ]),
    ...Option.toArray(
      Option.map(facts.maybeNotes, notes => Text(notes, { dim: true })),
    ),
    ...Array.map(facts.installs, install =>
      Text(
        `On ${install.deviceName} (${install.platform}) ${whenWordsOn(install.installedAtMs, clock)}`,
        { dim: true },
      ),
    ),
    ...Array.match(facts.whatsNew, {
      onEmpty: () => [],
      onNonEmpty: stories => [
        Column(
          { gap: 0 },
          Text('What’s New', { emphasis: 'Headline' }),
          ...Array.map(stories, story =>
            RichText([
              ...partsOfText(story.text, context),
              ...spacedChips(
                Array.map(story.issueIds, issueId =>
                  issueChipOf(issueId, context),
                ),
              ),
            ]),
          ),
        ),
      ],
    }),
    ...issuesSection('Shipped in this build', facts.shippedIssueIds, context),
    ...issuesSection('Found in this build', facts.foundIssueIds, context),
  ]
}

const commitFactNodes = (
  facts: CommitFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { commit } = facts
  return [
    Text(commit.subject, { emphasis: 'Headline' }),
    RichText([
      commitChip(commit),
      Plain(`  ${commit.repo}  ${whenWordsOn(commit.authoredAtMs, clock)}`),
    ]),
    ...Array.map(commit.builds, build =>
      RichText([
        Plain('Shipped in '),
        buildChip(build, clock),
        ...spacedChips(testflightChips(build, clock)),
      ]),
    ),
    ...issuesSection('Implements', facts.issueIds, context),
  ]
}

const MILLISECONDS_PER_SECOND = 1_000

type RememberedMomentRow = Readonly<{
  issue: Issue | undefined
  nowMs: number
  offsetMinutes: number
  row: UiNode
}>

const rememberedMomentRows = new WeakMap<MomentsOfIssue, RememberedMomentRow>()

/**
 * One Issue's line on a Recording's or a line's page: its chip, then a chip
 * for each of its moments. The moments never change between answers from the
 * rows, so a row is kept until its Issue or the minute does.
 */
const momentRowOf = (ofIssue: MomentsOfIssue, context: ChipContext): UiNode => {
  const issue = context.issuesById.get(ofIssue.issueId)
  return Option.getOrElse(
    Option.map(
      Option.filter(
        Option.fromUndefinedOr(rememberedMomentRows.get(ofIssue)),
        remembered =>
          remembered.issue === issue &&
          remembered.nowMs === context.nowMs &&
          remembered.offsetMinutes === context.offsetMinutes,
      ),
      remembered => remembered.row,
    ),
    () => {
      const row = RichText([
        issueChipOf(ofIssue.issueId, context),
        ...spacedChips(Array.map(ofIssue.moments, momentChip)),
      ])
      rememberedMomentRows.set(ofIssue, {
        issue,
        nowMs: context.nowMs,
        offsetMinutes: context.offsetMinutes,
        row,
      })
      return row
    },
  )
}

const momentSection = (
  heading: string,
  issues: ReadonlyArray<MomentsOfIssue>,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.match(issues, {
    onEmpty: () => [],
    onNonEmpty: found => [
      Column(
        { gap: 0 },
        Text(`${heading}: ${issueCountWords(found.length)}`, {
          emphasis: 'Headline',
        }),
        ...Array.map(found, ofIssue => momentRowOf(ofIssue, context)),
      ),
    ],
  })

type MomentHeadings = Readonly<{
  alsoCameUp: string
  cameFrom: string
  noIssue: string
}>

const RECORDING_HEADINGS: MomentHeadings = {
  alsoCameUp: 'Also came up in this Recording',
  cameFrom: 'Came from this Recording',
  noIssue: 'No Issue came from this Recording yet.',
}

const LINE_HEADINGS: MomentHeadings = {
  alsoCameUp: 'Also came up on this line',
  cameFrom: 'Came from this line',
  noIssue: 'No Issue came from this line yet.',
}

const issuesOfMomentsNodes = (
  { alsoCameUp, cameFrom }: IssuesOfMoments,
  headings: MomentHeadings,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.isReadonlyArrayEmpty(cameFrom) && Array.isReadonlyArrayEmpty(alsoCameUp)
    ? [Text(headings.noIssue, { dim: true })]
    : [
        ...momentSection(headings.cameFrom, cameFrom, context),
        ...momentSection(headings.alsoCameUp, alsoCameUp, context),
      ]

const recordingFactNodes = (
  facts: RecordingFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => [
  Text(facts.title, { emphasis: 'Headline' }),
  RichText([
    Plain(
      `Started ${whenWordsOn(facts.startedAtMs, clock)}, ran ${millisecondsLabel(facts.durationSeconds * MILLISECONDS_PER_SECOND)}  `,
    ),
    Reference({
      label: 'His words',
      kind: 'Recording',
      href: recordingWordsLink(facts.recordingId),
      detail: ['Opens this Recording’s words'],
    }),
  ]),
  ...issuesOfMomentsNodes(facts.issues, RECORDING_HEADINGS, context),
]

const isOnlySeen = ({ alsoCameUp, cameFrom }: IssuesOfMoments): boolean => {
  const moments = Array.flatMap(
    [...cameFrom, ...alsoCameUp],
    ofIssue => ofIssue.moments,
  )
  return (
    Array.isReadonlyArrayNonEmpty(moments) &&
    Array.every(moments, moment => moment.kind === 'Seen')
  )
}

const segmentFactNodes = (
  facts: SegmentFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const isNotHisWords = isOnlySeen(facts.issues)
  return [
    Text(`Line ${facts.lineIndex.toString()}`, { emphasis: 'Headline' }),
    facts.isSealed
      ? Text('These words are sealed.', { dim: true })
      : Text(facts.text),
    ...(isNotHisWords ? [Text('These words are not his.', { dim: true })] : []),
    RichText([
      Plain(
        `${isNotHisWords ? 'Heard' : 'Said'} ${whenWordsOn(facts.saidAtMs, clock)}  `,
      ),
      Reference({
        label: `Line ${facts.lineIndex.toString()}`,
        kind: 'Segment',
        href: lineWordsLink(
          facts.recordingId,
          facts.segmentId,
          facts.startTimeSeconds,
        ),
        detail: [
          isNotHisWords
            ? 'Opens this line at its time'
            : 'Opens his words at this line',
        ],
      }),
      Plain('  '),
      Reference({
        label: 'The Recording',
        kind: 'Recording',
        href: `/recordings/${facts.recordingId}`,
        detail: ['Every Issue from this Recording'],
      }),
    ]),
    ...issuesOfMomentsNodes(facts.issues, LINE_HEADINGS, context),
  ]
}

const NO_FACTS_WORDS: Readonly<Record<PageEntity['_tag'], string>> = {
  AgentEntity: 'Scribe’s rows hold no such agent.',
  BuildEntity: 'Scribe’s rows hold no such build.',
  CommitEntity: 'Scribe’s rows hold no such commit.',
  DecisionEntity: 'Scribe’s rows hold no such decision.',
  FeatureEntity: 'Scribe’s rows hold no such feature.',
  FindingEntity: 'Scribe’s rows hold no such finding.',
  ProductEntity: 'Scribe’s rows hold no such product.',
  QuestionEntity: 'Scribe’s rows hold no such question.',
  RecordingEntity: 'Scribe’s rows hold no such Recording.',
  ReminderEntity: 'Scribe’s rows hold no such reminder.',
  RecordingNumberEntity: 'Scribe’s rows hold no such Recording.',
  SegmentEntity: 'Scribe’s rows hold no such line.',
  SessionEntity: 'Scribe’s rows hold no such session.',
}

/**
 * What Scribe's rows say about the entity on the page, and whether it has
 * replaced the page's plain name: a build's or commit's facts name it, while
 * rows that cannot be read or hold nothing say so under the plain name.
 */
const pageFactNodes = (
  model: Model,
  entity: PageEntity,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> => {
  const clock = model.clock
  const context = chipContextOf(
    issues,
    clock.nowMs,
    clock.offsetMinutes,
    chipFactsOf(model),
  )
  const plainName = Text(entityTitle(entity, issues), { emphasis: 'Headline' })
  return M.value(model.pageFacts).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingPageFacts: () => [plainName],
      FailedPageFacts: ({ reason }) => [
        plainName,
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedPageFacts: ({ facts }) =>
        M.value(facts).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            BuildFacts: found => buildFactNodes(found, clock, context),
            CommitFacts: found => commitFactNodes(found, clock, context),
            RecordingFacts: found => recordingFactNodes(found, clock, context),
            SegmentFacts: found => segmentFactNodes(found, clock, context),
            AgentFacts: found => [
              plainName,
              ...agentFactNodes(found, clock, context),
            ],
            SessionFacts: found => [
              plainName,
              ...sessionFactNodes(found, clock, context),
            ],
            FindingFacts: found => [
              plainName,
              ...findingFactNodes(found, clock, context),
            ],
            FeatureFacts: found => featureFactNodes(found, clock, context),
            DecisionFacts: found =>
              decisionFactNodes(found, clock, context, decisionsIn(model)),
            QuestionFacts: found => questionFactNodes(found, clock, context),
            ReminderFacts: found => reminderFactNodes(found, clock, context),
            ProductFacts: () => [plainName],
            NoPageFacts: () => [
              plainName,
              Text(NO_FACTS_WORDS[entity._tag], { dim: true }),
            ],
          }),
        ),
    }),
  )
}

const productTitleOf = (
  model: Model,
  entity: PageEntity,
  issues: ReadonlyArray<Issue>,
): string =>
  model.pageFacts._tag === 'LoadedPageFacts' &&
  model.pageFacts.facts._tag === 'ProductFacts'
    ? Option.getOrElse(model.pageFacts.facts.maybeName, () =>
        entityTitle(entity, issues),
      )
    : entityTitle(entity, issues)

const NAMES_IN_WORDS: Partial<Readonly<Record<PageEntity['_tag'], string>>> = {
  RecordingEntity: 'this Recording',
  RecordingNumberEntity: 'this Recording',
  SegmentEntity: 'this line',
}

const pointingCountNodes = (
  entity: PageEntity,
  backlinks: ReadonlyArray<Backlink>,
): ReadonlyArray<UiNode> =>
  Array.match(backlinks, {
    onEmpty: () =>
      entity._tag === 'FeatureEntity'
        ? []
        : [Text('No Issue points here yet.', { dim: true })],
    onNonEmpty: found => [
      Text(
        found.length === 1
          ? '1 Issue points here'
          : `${found.length.toString()} Issues point here`,
        { dim: true },
      ),
    ],
  })

const mentionCountNodes = (
  name: string,
  backlinks: ReadonlyArray<Backlink>,
): ReadonlyArray<UiNode> =>
  Array.match(backlinks, {
    onEmpty: () => [Text(`No Issue mentions ${name} yet.`, { dim: true })],
    onNonEmpty: found => [
      Text(`Mentions ${name}: ${issueCountWords(found.length)}`, {
        emphasis: 'Headline',
      }),
    ],
  })

const backlinkCountNodes = (
  entity: PageEntity,
  backlinks: ReadonlyArray<Backlink>,
): ReadonlyArray<UiNode> =>
  Option.match(Option.fromUndefinedOr(NAMES_IN_WORDS[entity._tag]), {
    onNone: () => pointingCountNodes(entity, backlinks),
    onSome: name => mentionCountNodes(name, backlinks),
  })

/**
 * The Issues that point at a page: at an agent's page, at any handle its runs
 * logged from, because a run moves accounts, so
 * `claude-code/issues-linear-1538@max` also lists what `@al` wrote.
 */
const backlinksOfPage = (
  model: Model,
  issues: ReadonlyArray<Issue>,
  entity: PageEntity,
): ReadonlyArray<Backlink> =>
  entity._tag === 'AgentEntity'
    ? mergedBacklinks(
        Array.map(
          Array.dedupe([entity.agentId, ...agentHandlesOfFacts(model)]),
          agentId => backlinksOf(issues, AgentEntity.make({ agentId })),
        ),
      )
    : backlinksOf(issues, entity)

/**
 * One entity's page: its name, what Scribe's rows say about it, then every
 * Issue whose text points at it, the newest first, each with the words around
 * the link and where it was written. Recording 208's page leads with the
 * Issues its rows say came from it, in the order he said them, and keeps those
 * that merely mention it under `Mentions this Recording`. A product's page,
 * such as Scribe's, lists its Issues by status instead, the most recently
 * changed first.
 */
export const entityPageNodes = (
  model: Model,
  entity: PageEntity,
): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [
        Text(entityTitle(entity, []), { emphasis: 'Headline' }),
        Text('Observing…'),
      ],
      FailedIssues: ({ reason }) => [
        Text(entityTitle(entity, []), { emphasis: 'Headline' }),
        Text(reason),
      ],
      LoadedIssues: ({ issues }) => {
        if (entity._tag === 'ProductEntity') {
          return [
            Text(productTitleOf(model, entity, issues), {
              emphasis: 'Headline',
            }),
            ...productFactNodes(model, entity.productId, issues),
            ...productPageNodes(model, entity.productId, issues),
          ]
        }
        const backlinks = backlinksOfPage(model, issues, entity)
        return [
          ...pageFactNodes(model, entity, issues),
          ...backlinkCountNodes(entity, backlinks),
          ...Array.map(backlinks, backlink =>
            backlinkNodes(backlink, model, issues),
          ),
        ]
      },
    }),
  )
