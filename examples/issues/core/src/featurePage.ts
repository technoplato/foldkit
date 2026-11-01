import { Array, Match as M, Option, Order, pipe } from 'effect'
import {
  Column,
  Plain,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  issueChipOf,
  partsOfText,
} from './chips.js'
import {
  type ChipClock,
  buildChip,
  commitChipOf,
  featureChip,
  productChip,
  spacedChips,
  whenWordsOn,
} from './graphChips.js'
import {
  type FeatureFacts,
  type FeatureIssue,
  type FeatureLine,
  type IssueBuilds,
} from './graphFacts.js'
import { headedSection } from './graphPageParts.js'
import { loadedIssuesIn } from './listing.js'
import { type Model } from './model.js'

const IMPLEMENTS = 'implements'
const TOUCHES = 'touches'

const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toString()} Issues`

const numberWords = (feature: FeatureLine): ReadonlyArray<string> =>
  Option.match(feature.maybeNumber, {
    onNone: () => [],
    onSome: number => [`FEATURES ${number.toString()}`],
  })

const featureRow = (feature: FeatureLine, context: ChipContext): UiNode =>
  Column(
    { gap: 0 },
    RichText([
      featureChip(feature),
      ...Array.map(numberWords(feature), words => Plain(`  ${words}`)),
    ]),
    RichText(partsOfText(feature.text, context)),
  )

const featureListNodes = (
  model: Model,
  features: ReadonlyArray<FeatureLine>,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    loadedIssuesIn(model),
    model.clock.nowMs,
    model.clock.offsetMinutes,
    chipFactsOf(model),
  )
  const removed = Array.filter(
    features,
    feature => feature.status === 'removed',
  )
  const active = Array.filter(features, feature => feature.status !== 'removed')
  return [
    Text(
      `${active.length.toString()} lines, ${removed.length.toString()} removed`,
      { dim: true },
    ),
    ...Array.map(active, feature => featureRow(feature, context)),
    ...headedSection(
      'Removed at his word',
      Array.map(removed, feature => featureRow(feature, context)),
    ),
  ]
}

/**
 * Every line of the feature contract, in his order, his words whole, each with
 * its name and state, and what he removed after them. Rows copy
 * `docs/FEATURES.md`; nothing here edits it.
 */
export const featuresPageNodes = (model: Model): ReadonlyArray<UiNode> => [
  Text('Features', { emphasis: 'Headline' }),
  ...M.value(model.featuresList).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingFeatures: () => [Text('Observing…')],
      FailedFeatures: ({ reason }) => [
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedFeatures: ({ features }) => featureListNodes(model, features),
    }),
  ),
]

const eachIssueOnce = (
  issues: ReadonlyArray<FeatureIssue>,
): ReadonlyArray<FeatureIssue> =>
  Array.dedupeWith(issues, (left, right) => left.issueId === right.issueId)

const byPredicate = (
  issues: ReadonlyArray<FeatureIssue>,
  predicate: string,
): ReadonlyArray<FeatureIssue> =>
  eachIssueOnce(Array.filter(issues, issue => issue.predicate === predicate))

const buildsOfIssue = (
  issueId: string,
  issueBuilds: ReadonlyArray<IssueBuilds>,
): ReadonlyArray<number> =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(issueBuilds, builds => builds.issueId === issueId),
      builds => builds.buildNumbers,
    ),
    () => [],
  )

const buildPart = (
  number: number,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<TextPart> =>
  Option.match(Option.fromUndefinedOr(context.buildsByNumber.get(number)), {
    onNone: () => partsOfText(`build ${number.toString()}`, context),
    onSome: build => [buildChip(build, clock)],
  })

const firstBuildParts = (
  issueId: string,
  facts: FeatureFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<TextPart> =>
  Option.match(Array.head(buildsOfIssue(issueId, facts.issueBuilds)), {
    onNone: () => [],
    onSome: number => [
      Plain('  landed in '),
      ...buildPart(number, clock, context),
    ],
  })

const issueRows = (
  issues: ReadonlyArray<FeatureIssue>,
  facts: FeatureFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.map(issues, ({ issueId }) =>
    RichText([
      issueChipOf(issueId, context),
      ...firstBuildParts(issueId, facts, clock, context),
    ]),
  )

const landedNumbers = (facts: FeatureFacts): ReadonlyArray<number> =>
  pipe(
    Array.flatMap(facts.issueBuilds, builds => builds.buildNumbers),
    Array.dedupe,
    Array.sort(Order.flip(Order.Number)),
  )

const landedNodes = (
  facts: FeatureFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Array.match(landedNumbers(facts), {
    onEmpty: () => [],
    onNonEmpty: numbers => [
      RichText([
        Plain('Landed in'),
        ...spacedChips(
          Array.flatMap(numbers, number => buildPart(number, clock, context)),
        ),
      ]),
    ],
  })

const sourceNodes = (
  facts: FeatureFacts,
  clock: ChipClock,
): ReadonlyArray<UiNode> => [
  RichText(
    [
      Plain(
        `The file last said this ${whenWordsOn(facts.feature.sourceCommittedAtMs, clock)}, at `,
      ),
      commitChipOf(facts.sourceCommitSha, Option.none()),
    ],
    { dim: true },
  ),
  ...Option.toArray(
    Option.map(facts.maybeRemovedInCommitSha, sha =>
      RichText(
        [Plain('It left the file at '), commitChipOf(sha, Option.none())],
        { dim: true },
      ),
    ),
  ),
]

/**
 * One feature: its name and state, his words, when the file last said them,
 * its product, the Issues that implement it and those that touch it, and which
 * builds those landed in. The file's older words stay in git, because rows
 * keep the newest only.
 */
export const featureFactNodes = (
  facts: FeatureFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { feature, issues, maybeProduct } = facts
  const implementing = byPredicate(issues, IMPLEMENTS)
  const implementingIds = Array.map(implementing, issue => issue.issueId)
  const touching = Array.filter(
    byPredicate(issues, TOUCHES),
    issue => !Array.contains(implementingIds, issue.issueId),
  )
  return [
    Text(feature.name, { emphasis: 'Headline' }),
    RichText([
      featureChip(feature),
      ...spacedChips(
        Option.toArray(
          Option.map(maybeProduct, product =>
            productChip(product.productId, product.name, product.maybeKind),
          ),
        ),
      ),
      ...Array.map(numberWords(feature), words => Plain(`  ${words}`)),
    ]),
    RichText(partsOfText(feature.text, context)),
    ...sourceNodes(facts, clock),
    ...landedNodes(facts, clock, context),
    ...headedSection(
      `Implements it: ${issueCountWords(implementing.length)}`,
      issueRows(implementing, facts, clock, context),
    ),
    ...headedSection(
      `Touches it: ${issueCountWords(touching.length)}`,
      issueRows(touching, facts, clock, context),
    ),
  ]
}
