import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { FeatureEntity } from './entityGraph.js'
import {
  featureBuildsQuery,
  featureChipsOf,
  featureChipsQuery,
  featureFactsOf,
  featureFactsQuery,
  featuresOf,
  featuresQuery,
  issueBuildsOf,
} from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { type LandedBuild } from './issueLandings.js'
import {
  FailedObserveFeatures,
  ObservedBuilds,
  ObservedFeatures,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
} from './message.js'
import { EntityPage, Features, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const COMMITTED_AT_MS = Date.parse('2026-10-31T17:00:00Z')
const SOURCE_SHA = '5a705a89d1886f9c24e867402c7800f9be16b69e'
const REMOVED_SHA = '521edbfdb0c3e0b4a1f2d3c4b5a6978877665544'

const storedLine = {
  id: 'a74991c8-0acd-5b03-abbb-318c9a708261',
  isDraft: false,
  issueNumbersJSON: '[410,694]',
  key: 'scribe|scroll-back-always',
  name: 'Scroll back, always.',
  number: 3,
  productSlug: 'scribe',
  slug: 'scroll-back-always',
  sourceCommitSha: SOURCE_SHA,
  sourceCommittedAtMs: COMMITTED_AT_MS,
  status: 'active',
  text: 'From the live tail you can scroll to the very beginning of any recording (#410, #694).',
}

const storedRemoved = {
  ...storedLine,
  id: 'b1',
  key: 'scribe|old-line',
  name: 'Old line.',
  number: null,
  slug: 'old-line',
  status: 'removed',
  text: 'A line he removed.',
}

const storedDraft = {
  ...storedLine,
  id: 'b2',
  isDraft: true,
  key: 'scribe|a-draft',
  name: 'A draft.',
  number: 9,
  slug: 'a-draft',
  text: 'A line he has not confirmed (draft).',
}

const storedPage = {
  ...storedLine,
  edges: [
    {
      basis: 'git',
      issueNumber: 694,
      note: 'docs/FEATURES.md cites #694 on Scroll back, always. at 5a705a89d',
      predicate: 'implements',
    },
    {
      basis: 'tracker',
      issueNumber: 702,
      note: "#702's details names FEATURES 3, Scroll back, always., as of 521edbfdb",
      predicate: 'touches',
    },
    {
      basis: 'git',
      issueNumber: 694,
      note: 'commit 61464d03d names FEATURES 3, Scroll back, always., in that commit’s file',
      predicate: 'touches',
    },
  ],
  project: [
    { id: 'p', productKind: 'Application', slug: 'scribe', title: 'Scribe' },
  ],
}

const builds = [
  {
    builtAtMs: COMMITTED_AT_MS,
    marketingVersion: '0.1',
    maybeTag: Option.none(),
    maybeTaggedAtMs: Option.none(),
    maybeTestflightInvite: Option.none(),
    maybeTestflightPage: Option.none(),
    maybeTestflightVersion: Option.none(),
    number: 217,
    status: 'installed',
  } satisfies LandedBuild,
]

const blank = (id: string, title: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: COMMITTED_AT_MS,
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
    status: 'Fixed',
    successCriteria: [],
    title,
    updatedAtMs: COMMITTED_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [
  blank('694', 'Scroll back loads forever'),
  blank('702', 'Tail'),
]

const entity = FeatureEntity.make({ slug: 'scroll-back-always' })

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

const shell = (): ReadonlyArray<
  | typeof ObservedIssues.Type
  | typeof TickedClock.Type
  | typeof ObservedBuilds.Type
> => [
  ObservedIssues.make({ issues: catalog }),
  TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
  ObservedBuilds.make({ builds }),
]

const featurePage = (): Model => {
  const facts = Option.getOrThrow(featureFactsOf({ features: [storedPage] }))
  return [
    ...shell(),
    ObservedPageFacts.make({
      entity,
      facts: {
        ...facts,
        issueBuilds: issueBuildsOf({
          edges: [
            {
              commit: [
                {
                  edges: [{ build: [{ number: 217 }], predicate: 'shippedIn' }],
                },
              ],
              issueNumber: 694,
            },
            { commit: [{ edges: [] }], issueNumber: 702 },
          ],
        }),
      },
    }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(EntityPage.make({ entity })),
  )
}

const listPage = (): Model =>
  [
    ...shell(),
    ObservedFeatures.make({
      features: featuresOf({
        features: [storedRemoved, storedDraft, storedLine],
      }),
    }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(Features.make({})),
  )

describe('what the feature pages read', () => {
  it('asks /features for every line’s scalars, with no link per row', () => {
    const { $, ...links } = featuresQuery.features
    expect('limit' in $).toBe(false)
    expect($.fields).toContain('text')
    expect(Object.keys(links)).toEqual([])
  })

  it('asks a chip for no words, so a page with chips reads little', () => {
    expect(featureChipsQuery.features.$.fields).not.toContain('text')
  })

  it('asks for one line by its slug, its Issues and its product', () => {
    const { $, ...links } = featureFactsQuery('scroll-back-always').features
    expect($.where).toEqual({ slug: 'scroll-back-always' })
    expect(Object.keys(links).sort()).toEqual(['edges', 'project'])
  })

  it('asks which builds its Issues landed in, by indexed issueNumber, for numbers only', () => {
    const { edges } = featureBuildsQuery([694, 702])
    expect(edges.$.where).toEqual({
      issueNumber: { $in: [694, 702] },
      objectKind: 'issue',
      predicate: 'implements',
    })
    expect(edges.commit.edges.build.$.fields).toEqual(['number'])
  })

  it('reads a line’s chip with its number and state', () => {
    expect(
      Array.map(featureChipsOf({ features: [storedLine] }), chip => [
        chip.slug,
        chip.maybeNumber,
        chip.status,
      ]),
    ).toEqual([['scroll-back-always', Option.some(3), 'active']])
  })
})

describe('/features', () => {
  it('routes the list and one line by its slug', () => {
    expect(navigationToPath(Features.make({}))).toBe('/features')
    expect(pathToNavigation('/features')).toEqual(Features.make({}))
    expect(pathToNavigation('/features/scroll-back-always')).toEqual(
      EntityPage.make({ entity }),
    )
    expect(navigationToPath(EntityPage.make({ entity }))).toBe(
      '/features/scroll-back-always',
    )
  })

  it('lists every line in his order, with its words and state', () => {
    const contents = contentsOf(listPage())
    const at = (words: string): number =>
      contents.findIndex(content => content.includes(words))
    expect(at('Scroll back, always.')).toBeGreaterThan(-1)
    expect(at('Scroll back, always.')).toBeLessThan(at('A draft.'))
    expect(at('A draft.')).toBeLessThan(at('Old line.'))
    expect(contents).toContainEqual(
      expect.stringContaining('From the live tail you can scroll'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('A line he removed.'),
    )
  })

  it('shows each line as a chip with its name and state, and marks a draft', () => {
    const chips = chipsOf(listPage())
    expect(
      chips.some(
        chip =>
          chip.kind === 'Feature' &&
          chip.label === 'Scroll back, always.' &&
          chip.state === 'active' &&
          chip.href === '/features/scroll-back-always',
      ),
    ).toBe(true)
    expect(
      chips.some(chip => chip.label === 'A draft.' && chip.state === 'draft'),
    ).toBe(true)
    expect(
      chips.some(
        chip => chip.label === 'Old line.' && chip.state === 'removed',
      ),
    ).toBe(true)
  })

  it('turns the Issues a line cites into chips', () => {
    expect(
      chipsOf(listPage()).some(
        chip => chip.kind === 'Issue' && chip.href === '/issues/694',
      ),
    ).toBe(true)
  })

  it('says why when the rows could not be read', () => {
    const [failed] = update(
      modelForNavigation(Features.make({})),
      FailedObserveFeatures.make({ reason: 'Permission denied' }),
    )
    expect(contentsOf(failed)).toContain(
      'Scribe’s rows could not be read: Permission denied',
    )
  })
})

describe('one feature’s page', () => {
  it('shows his words, its state and when the file last said them', () => {
    const contents = contentsOf(featurePage())
    expect(contents).toContainEqual(
      expect.stringContaining('From the live tail you can scroll'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('2026-10-31 12:00 (1 day ago)'),
    )
    expect(contents).toContainEqual(expect.stringContaining('FEATURES 3'))
    expect(
      chipsOf(featurePage()).some(
        chip =>
          chip.kind === 'Commit' && chip.href === `/commits/${SOURCE_SHA}`,
      ),
    ).toBe(true)
  })

  it('says when a removed line left the file', () => {
    const facts = Option.getOrThrow(
      featureFactsOf({
        features: [
          {
            ...storedPage,
            removedInCommitSha: REMOVED_SHA,
            status: 'removed',
          },
        ],
      }),
    )
    const model = [
      ...shell(),
      ObservedPageFacts.make({ entity, facts }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(EntityPage.make({ entity })),
    )
    expect(
      chipsOf(model).some(chip => chip.href === `/commits/${REMOVED_SHA}`),
    ).toBe(true)
  })

  it('lists the Issues that implement it apart from those that touch it, each once', () => {
    const contents = contentsOf(featurePage())
    expect(contents).toContain('Implements it: 1 Issue')
    expect(contents).toContain('Touches it: 1 Issue')
  })

  it('names which builds those Issues landed in', () => {
    const model = featurePage()
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Landed in'),
    )
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Build' &&
          chip.href === '/builds/217' &&
          chip.state === 'installed',
      ),
    ).toBe(true)
  })

  it('links its product', () => {
    expect(
      chipsOf(featurePage()).some(
        chip => chip.kind === 'Product' && chip.href === '/products/scribe',
      ),
    ).toBe(true)
  })

  it('reads no row as none', () => {
    expect(featureFactsOf({ features: [] })).toEqual(Option.none())
  })
})
