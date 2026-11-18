import { Array, Match as M, Option, Order } from 'effect'
import {
  Column,
  List,
  type ListItem,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type ChipContext, chipContextOf, chipFactsOf } from './chips.js'
import { productStatusGroups } from './entityGraph.js'
import {
  type ChipClock,
  buildChip,
  featureChip,
  productChip,
  spacedChips,
  whenWordsOn,
} from './graphChips.js'
import {
  type ProductFacts,
  type ProductMapped,
  type ProductModule,
  type ProductSurface,
} from './graphFacts.js'
import { handleChip, headedSection } from './graphPageParts.js'
import { defaultIssueView } from './issueView.js'
import { OneProduct } from './leftover.js'
import { loadedIssuesIn } from './listing.js'
import { IssueList, type Model } from './model.js'
import { recentAgentsOf } from './pageAgents.js'
import { navigationToPath } from './route.js'

const WORD_SEPARATOR = '  ·  '

const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toLocaleString('en-US')} Issues`

type ProductTally = Readonly<{
  count: number
  firstAtMs: number
}>

const tallyMemo = new WeakMap<
  ReadonlyArray<Issue>,
  ReadonlyMap<string, ProductTally>
>()

const tallyOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyMap<string, ProductTally> =>
  Option.getOrElse(Option.fromUndefinedOr(tallyMemo.get(issues)), () => {
    const tallies = new Map<string, ProductTally>()
    for (const issue of issues) {
      const held = tallies.get(issue.product.id)
      tallies.set(issue.product.id, {
        count: (held?.count ?? 0) + 1,
        firstAtMs: Math.min(
          held?.firstAtMs ?? issue.createdAtMs,
          issue.createdAtMs,
        ),
      })
    }
    tallyMemo.set(issues, tallies)
    return tallies
  })

const summaryNodes = (
  maybeFacts: Option.Option<ProductFacts>,
  tally: ProductTally,
  clock: ChipClock,
): ReadonlyArray<UiNode> => [
  Text(
    Array.join(
      [
        ...Option.toArray(Option.flatMap(maybeFacts, facts => facts.maybeKind)),
        ...Array.flatMap(Option.toArray(maybeFacts), facts =>
          facts.map._tag === 'ProductMapped' ? facts.map.platforms : [],
        ),
        issueCountWords(tally.count),
      ],
      WORD_SEPARATOR,
    ),
  ),
  ...(tally.count === 0
    ? []
    : [
        Text(`First Issue filed ${whenWordsOn(tally.firstAtMs, clock)}`, {
          dim: true,
        }),
      ]),
]

const SURFACE_KIND_WORDS: Readonly<Record<string, string>> = {
  application: 'app',
  'application.on-demand-install-capable': 'app clip',
  'app-extension': 'ext',
  package: 'pkg',
}

const surfaceKindOf = (surface: ProductSurface): ReadonlyArray<string> =>
  Option.toArray(
    Option.map(surface.maybeType, type => SURFACE_KIND_WORDS[type] ?? type),
  )

const surfaceItem = (surface: ProductSurface): ListItem => ({
  key: surface.surfaceId,
  lines: [
    ...surfaceKindOf(surface),
    ...Option.toArray(surface.maybeDisplayName),
    ...Option.toArray(surface.maybePlatform),
    ...surface.bundleIds,
    ...Option.toArray(surface.maybeGroup),
  ],
  title: surface.name,
})

const moduleItem = (module: ProductModule): ListItem => ({
  key: module.moduleId,
  lines: [
    ...Option.toArray(module.maybeGroup),
    ...Option.toArray(module.maybePath),
  ],
  title: module.name,
})

const listedSection = (
  heading: string,
  items: ReadonlyArray<ListItem>,
): ReadonlyArray<UiNode> =>
  Array.match(items, {
    onEmpty: () => [],
    onNonEmpty: found => [
      Column(
        { gap: 1 },
        Text(heading, { emphasis: 'Headline' }),
        List({ label: heading, items: found }),
      ),
    ],
  })

const mappedNodes = (map: ProductMapped): ReadonlyArray<UiNode> => [
  ...listedSection(
    `Surfaces: ${map.surfaces.length.toLocaleString('en-US')}`,
    Array.map(map.surfaces, surfaceItem),
  ),
  ...listedSection(
    `Modules: ${map.modules.length.toLocaleString('en-US')}`,
    Array.map(map.modules, moduleItem),
  ),
]

const mapNodes = (facts: ProductFacts): ReadonlyArray<UiNode> =>
  M.value(facts.map).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      ProductMapped: mappedNodes,
      ProductMapUnavailable: ({ reason }) => [Text(reason, { dim: true })],
    }),
  )

const buildParts = (
  facts: ProductFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<TextPart> =>
  Array.flatMap(facts.buildNumbers, number =>
    Option.toArray(
      Option.map(
        Option.fromUndefinedOr(context.buildsByNumber.get(number)),
        build => buildChip(build, clock),
      ),
    ),
  )

const chipLine = (chips: ReadonlyArray<TextPart>): ReadonlyArray<UiNode> =>
  Array.match(chips, {
    onEmpty: () => [],
    onNonEmpty: found => [RichText(Array.drop(spacedChips(found), 1))],
  })

const statusChips = (
  issues: ReadonlyArray<Issue>,
  productId: string,
): ReadonlyArray<TextPart> =>
  Array.map(
    productStatusGroups(issues, productId),
    ({ issues: inStatus, status }) =>
      Reference({
        label: status,
        title: inStatus.length.toLocaleString('en-US'),
        kind: 'Status',
        href: navigationToPath(
          IssueList.make({
            view: {
              ...defaultIssueView,
              product: OneProduct.make({ productId }),
              statuses: [status],
            },
          }),
        ),
        detail: [`Every ${status} Issue of this product`],
      }),
  )

const featureNodes = (facts: ProductFacts): ReadonlyArray<UiNode> =>
  headedSection(
    `Features: ${facts.features.length.toString()}`,
    chipLine(Array.map(facts.features, featureChip)),
  )

const buildNodes = (
  facts: ProductFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  headedSection(
    `Builds: ${facts.buildNumbers.length.toString()}`,
    chipLine(buildParts(facts, clock, context)),
  )

const recentAgentNodes = (
  issues: ReadonlyArray<Issue>,
  productId: string,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const agents = recentAgentsOf(issues, productId, clock.nowMs)
  return headedSection(
    `Agents this week: ${agents.length.toString()}`,
    chipLine(
      Array.map(agents, ({ agentId }) => handleChip(agentId, context, clock)),
    ),
  )
}

/**
 * What a product's page shows above its Issues: its kind, platforms, how many
 * Issues and since when, a link to each status, its features, who worked on it
 * this week, its builds and what its code runs as.
 */
export const productFactNodes = (
  model: Model,
  productId: string,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    issues,
    model.clock.nowMs,
    model.clock.timeZone,
    chipFactsOf(model),
  )
  const maybeFacts: Option.Option<ProductFacts> =
    model.pageFacts._tag === 'LoadedPageFacts' &&
    model.pageFacts.facts._tag === 'ProductFacts'
      ? Option.some(model.pageFacts.facts)
      : Option.none()
  const tally = Option.getOrElse(
    Option.fromUndefinedOr(tallyOf(issues).get(productId)),
    () => ({ count: 0, firstAtMs: 0 }),
  )
  const facts = Option.toArray(maybeFacts)
  return [
    ...summaryNodes(maybeFacts, tally, model.clock),
    ...(model.pageFacts._tag === 'FailedPageFacts'
      ? [
          Text(`Scribe’s rows could not be read: ${model.pageFacts.reason}`, {
            dim: true,
          }),
        ]
      : []),
    ...chipLine(statusChips(issues, productId)),
    ...Array.flatMap(facts, featureNodes),
    ...recentAgentNodes(issues, productId, model.clock, context),
    ...Array.flatMap(facts, found => buildNodes(found, model.clock, context)),
    ...Array.flatMap(facts, mapNodes),
  ]
}

const productRow = (
  entry: Readonly<{ id: string; kind: string; name: string }>,
  issues: ReadonlyArray<Issue>,
  model: Model,
): UiNode => {
  const tally = Option.getOrElse(
    Option.fromUndefinedOr(tallyOf(issues).get(entry.id)),
    () => ({ count: 0, firstAtMs: 0 }),
  )
  return RichText([
    productChip(entry.id, entry.name, Option.some(entry.kind)),
    Plain(`  ${issueCountWords(tally.count)}`),
    ...(tally.count === 0
      ? []
      : [Plain(`  since ${whenWordsOn(tally.firstAtMs, model.clock)}`)]),
  ])
}

/**
 * Every product in the catalog with its kind, how many Issues it has and since
 * when, each linking its page, the most Issues first.
 */
export const productsPageNodes = (model: Model): ReadonlyArray<UiNode> => {
  const issues = loadedIssuesIn(model)
  const entries =
    model.products._tag === 'LoadedProducts'
      ? Array.map(model.products.products, ({ product }) => ({
          id: product.id,
          kind: product._tag,
          name: product.name,
        }))
      : []
  const countOf = (id: string): number => tallyOf(issues).get(id)?.count ?? 0
  return [
    Text('Products', { emphasis: 'Headline' }),
    ...(Array.isReadonlyArrayEmpty(entries)
      ? [Text('Observing…')]
      : Array.map(
          Array.sortWith(
            entries,
            entry => countOf(entry.id),
            Order.flip(Order.Number),
          ),
          entry => productRow(entry, issues, model),
        )),
  ]
}
