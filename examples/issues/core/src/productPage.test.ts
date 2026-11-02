import { Array, Effect, Option, Stream } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { ProductEntity } from './entityGraph.js'
import {
  ProductMapUnavailable,
  productFactsOf,
  productFactsQuery,
  productMapOf,
} from './graphFacts.js'
import { instantGraphRows } from './graphRows.js'
import { modelForNavigation } from './init.js'
import { type LandedBuild } from './issueLandings.js'
import {
  ObservedBuilds,
  ObservedIssues,
  ObservedPageFacts,
  ObservedProducts,
  TickedClock,
} from './message.js'
import { EntityPage, type Model, Products } from './model.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const DAY_MS = 86_400_000
const HANDLE = 'claude-code/issues-linear-1538@al'

const storedMap = {
  products: {
    scribe: {
      id: 'scribe',
      kind: 'Application',
      modules: [
        {
          group: 'swift-reminders',
          id: 'scribe:Packages/swift-reminders/RemindersCore',
          name: 'RemindersCore',
          path: 'Packages/swift-reminders/Sources/RemindersCore',
        },
      ],
      name: 'Scribe',
      packages: [],
      platforms: ['iOS', 'macOS'],
      repos: ['scribe'],
      surfaces: [
        {
          bundleIDs: ['com.scribe.watch'],
          displayName: 'Scribe',
          group: 'Xcode/ScribeSharediOS',
          id: 'scribe:Xcode/ScribeSharediOS#ScribeSharedWatch',
          name: 'ScribeSharedWatch',
          platform: 'watchOS',
          type: 'application',
        },
        {
          group: 'Scribe',
          id: 'scribe:Package.swift#scribe',
          name: 'scribe',
          platform: 'CLI',
          type: 'cli',
        },
      ],
    },
  },
}

const storedProject = {
  builds: [
    { id: 'b', number: 216 },
    { id: 'c', number: 217 },
  ],
  projects: [
    {
      features: [
        {
          id: 'f',
          isDraft: false,
          name: 'Scroll back, always.',
          number: 3,
          productSlug: 'scribe',
          slug: 'scroll-back-always',
          status: 'active',
        },
      ],
      id: 'ff0d2cfe-2172-5b11-bf1d-ff95c620315d',
      productKind: 'Application',
      slug: 'scribe',
      status: 'active',
      title: 'Scribe',
      trackerProductID: 'scribe',
    },
  ],
}

const buildOf = (number: number): LandedBuild => ({
  builtAtMs: NOW_MS - DAY_MS,
  marketingVersion: '0.1',
  maybeTag: Option.none(),
  maybeTaggedAtMs: Option.none(),
  maybeTestflightInvite: Option.none(),
  maybeTestflightPage: Option.none(),
  maybeTestflightVersion: Option.none(),
  number,
  status: 'installed',
})

const issueAt = (id: string, agentId: string, atMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: atMs,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: atMs,
    viewerURL: Option.none(),
    workLog: [
      IssueWorkLogEntry.make({
        agentId: Option.some(agentId),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${id}`,
        occurredAtMs: atMs,
        state: Option.some('progress'),
        summary: 'Worked.',
      }),
    ],
  })

const catalog = [
  issueAt('1538', HANDLE, NOW_MS - 3_600_000),
  issueAt('0900', 'claude-code/old-one@ld', NOW_MS - 90 * DAY_MS),
  issueAt('0901', 'issues/working-sync', NOW_MS - 3_600_000),
]

const entity = ProductEntity.make({ productId: 'scribe' })

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

const page = (map: unknown): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedBuilds.make({ builds: [buildOf(216), buildOf(217)] }),
    ObservedPageFacts.make({
      entity,
      facts: productFactsOf(storedProject, map, 'scribe'),
    }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(EntityPage.make({ entity })),
  )

describe('what a product’s page reads', () => {
  it('asks for one project by its slug and its builds by their app', () => {
    const query = productFactsQuery('scribe')
    expect(query.projects.$.where).toEqual({ slug: 'scribe' })
    expect(query.builds.$.where).toEqual({ app: 'scribe' })
    expect(query.builds.$.fields).toEqual(['number'])
    expect(query.projects.features.$.fields).not.toContain('text')
  })

  it('reads surfaces and modules from the map, derived from code', () => {
    expect(
      Option.map(productMapOf(storedMap, 'scribe'), map => [
        map.platforms,
        Array.map(map.surfaces, surface => surface.name),
        Array.map(map.modules, module => module.name),
      ]),
    ).toEqual(
      Option.some([
        ['iOS', 'macOS'],
        ['ScribeSharedWatch', 'scribe'],
        ['RemindersCore'],
      ]),
    )
    expect(productMapOf(storedMap, 'nothing')).toEqual(Option.none())
  })

  it('reads the map once and the rows live, and a failed map fails nothing', async () => {
    const graph = instantGraphRows(
      Effect.succeed({
        subscribeQuery: (_query, onResponse) => {
          onResponse({ data: storedProject })
          return () => undefined
        },
        updateFinding: () => Promise.resolve(),
      }),
      Effect.fail(new Error('The server has no map.')),
    )
    const facts = await Effect.runPromise(
      graph.observeProductFacts('scribe').pipe(Stream.runHead),
    )
    expect(
      Option.map(facts, found =>
        found._tag === 'ProductFacts' ? found.map : undefined,
      ),
    ).toEqual(
      Option.some(
        ProductMapUnavailable.make({ reason: 'The server has no map.' }),
      ),
    )
  })
})

describe('/products', () => {
  it('routes the list and one product', () => {
    expect(navigationToPath(Products.make({}))).toBe('/products')
    expect(pathToNavigation('/products')).toEqual(Products.make({}))
    expect(pathToNavigation('/products/scribe')).toEqual(
      EntityPage.make({ entity }),
    )
  })

  it('lists every catalog product with its kind and how many Issues it has', () => {
    const scribe = ProductCatalogEntry.make({
      product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
      updatedAtMs: NOW_MS,
    })
    const model = [
      ObservedIssues.make({ issues: catalog }),
      ObservedProducts.make({ products: [scribe] }),
      TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(Products.make({})),
    )
    expect(
      chipsOf(model).some(
        chip => chip.kind === 'Product' && chip.href === '/products/scribe',
      ),
    ).toBe(true)
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Application'),
    )
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('3 Issues'),
    )
  })
})

describe('a product’s page', () => {
  const model = page(storedMap)

  it('says its kind, platforms and date', () => {
    const contents = contentsOf(model)
    expect(contents).toContainEqual(expect.stringContaining('Application'))
    expect(contents).toContainEqual(expect.stringContaining('iOS'))
    expect(contents).toContainEqual(expect.stringContaining('(3 months ago)'))
  })

  it('lists its features as chips with name and state', () => {
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Feature' &&
          chip.label === 'Scroll back, always.' &&
          chip.state === 'active',
      ),
    ).toBe(true)
  })

  it('lists its surfaces and modules, from code', () => {
    const contents = contentsOf(model)
    expect(contents).toContain('Surfaces: 2')
    expect(contents).toContain('Modules: 1')
    const screen = JSON.stringify(issuesScreen(model))
    expect(screen).toContain('ScribeSharedWatch')
    expect(screen).toContain('watchOS')
    expect(screen).toContain('RemindersCore')
    expect(screen).toContain('Packages/swift-reminders/Sources/RemindersCore')
  })

  it('says why when the map could not be read', () => {
    const contents = contentsOf(
      update(
        model,
        ObservedPageFacts.make({
          entity,
          facts: {
            ...productFactsOf(storedProject, storedMap, 'scribe'),
            map: ProductMapUnavailable.make({
              reason: 'No map on this server.',
            }),
          },
        }),
      )[0],
    )
    expect(contents).toContainEqual(
      expect.stringContaining('No map on this server.'),
    )
  })

  it('lists its builds, the newest first, as chips', () => {
    const builds = Array.filter(chipsOf(model), chip => chip.kind === 'Build')
    expect(Array.map(builds, chip => chip.href)).toEqual([
      '/builds/217',
      '/builds/216',
    ])
  })

  it('lists its recent agents, not old ones or the sync’s', () => {
    const chips = chipsOf(model)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Agent' &&
          chip.href === `/agents/${encodeURIComponent(HANDLE)}`,
      ),
    ).toBe(true)
    expect(chips.some(chip => chip.href?.includes('old-one'))).toBe(false)
    expect(chips.some(chip => chip.href?.includes('working-sync'))).toBe(false)
  })

  it('still lists its Issues by status', () => {
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('InProgress  3'),
    )
  })

  it('links each status to the list, filtered, near the top', () => {
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Status' &&
          chip.title === '3' &&
          chip.href === '/issues?product=scribe&status=InProgress',
      ),
    ).toBe(true)
  })
})
