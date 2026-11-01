import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { decisionsOf } from './decisionFacts.js'
import { DecisionEntity, FeatureEntity, ProductEntity } from './entityGraph.js'
import { featureChipsOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { tokenForKeyPress } from './keys.js'
import { menuRowsOf } from './menus.js'
import {
  ObservedDecisions,
  ObservedFeatureChips,
  ObservedProducts,
  OpenedCommandPalette,
  PressedGoKey,
  UpdatedMenuQuery,
} from './message.js'
import {
  Decisions,
  EntityPage,
  Features,
  Findings,
  IssueList,
  type Model,
  Products,
  Questions,
  Reminders,
} from './model.js'
import { messageForScreenToken } from './presentation.js'
import { update } from './update.js'

const scribe = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  updatedAtMs: 1,
})

const features = featureChipsOf({
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
})

const DECISION_ID = 'dbdbf773-f596-5657-a3d4-554a11755709'

const decisions = decisionsOf({
  decisions: [
    {
      decidedAtMs: 1,
      id: DECISION_ID,
      status: 'decided',
      text: 'One Opus agent takes every UI task at once.',
    },
  ],
})

const list = (): Model =>
  [
    ObservedProducts.make({ products: [scribe] }),
    OpenedCommandPalette.make({}),
    ObservedFeatureChips.make({ features }),
    ObservedDecisions.make({ decisions }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(IssueList.make({})),
  )

const rowsFor = (model: Model, query: string): ReadonlyArray<string> =>
  Array.map(
    menuRowsOf(
      update(model, UpdatedMenuQuery.make({ query }))[0],
      'Everything',
      query,
    ),
    row => row.action.label,
  )

const pressed = (key: string, model: Model) =>
  tokenForKeyPress(model, {
    isAlt: false,
    isControl: false,
    isMeta: false,
    isShift: false,
    key,
    target: 'Page',
  })

const wentTo = (key: string): Model => {
  const waiting = update(list(), PressedGoKey.make({}))[0]
  const closed = { ...waiting, layer: { _tag: 'NoLayer' as const } }
  const token = Option.getOrThrow(pressed(key, closed))
  return update(
    closed,
    Option.getOrThrow(messageForScreenToken(closed, token)),
  )[0]
}

describe('the places in the palette', () => {
  it('lists findings, features and products beside the others', () => {
    const labels = rowsFor(list(), '')
    expect(labels).toContain('Go to findings')
    expect(labels).toContain('Go to features')
    expect(labels).toContain('Go to products')
  })

  it('lists decisions, questions and reminders beside them', () => {
    const labels = rowsFor(list(), '')
    expect(labels).toContain('Go to decisions')
    expect(labels).toContain('Go to questions')
    expect(labels).toContain('Go to reminders')
  })

  it('finds a decision by its words or its short id, and goes there', () => {
    const label =
      'Go to decision dbdbf773 One Opus agent takes every UI task at once.'
    expect(rowsFor(list(), 'one opus')).toContain(label)
    expect(rowsFor(list(), 'dbdbf773')).toContain(label)
    const typed = update(
      list(),
      UpdatedMenuQuery.make({ query: 'dbdbf773' }),
    )[0]
    const row = Option.getOrThrow(
      Array.findFirst(
        menuRowsOf(typed, 'Everything', 'dbdbf773'),
        candidate => candidate.action.label === label,
      ),
    )
    expect(update(typed, row.action.message)[0].navigation).toEqual(
      EntityPage.make({
        entity: DecisionEntity.make({ decisionId: DECISION_ID }),
      }),
    )
  })

  it('finds a product and a feature by name, and goes there', () => {
    expect(rowsFor(list(), 'scribe')).toContain('Go to product Scribe')
    expect(rowsFor(list(), 'scroll back')).toContain(
      'Go to feature Scroll back, always.',
    )
    const opened = (name: string, label: string) => {
      const typed = update(list(), UpdatedMenuQuery.make({ query: name }))[0]
      const row = Option.getOrThrow(
        Array.findFirst(
          menuRowsOf(typed, 'Everything', name),
          candidate => candidate.action.label === label,
        ),
      )
      return update(typed, row.action.message)[0].navigation
    }
    expect(opened('scribe', 'Go to product Scribe')).toEqual(
      EntityPage.make({ entity: ProductEntity.make({ productId: 'scribe' }) }),
    )
    expect(opened('scroll back', 'Go to feature Scroll back, always.')).toEqual(
      EntityPage.make({
        entity: FeatureEntity.make({ slug: 'scroll-back-always' }),
      }),
    )
  })
})

describe('the go-to keys', () => {
  it('goes to findings, features and products', () => {
    expect(wentTo('f').navigation).toEqual(Findings.make({}))
    expect(wentTo('e').navigation).toEqual(Features.make({}))
    expect(wentTo('p').navigation).toEqual(Products.make({}))
  })

  it('goes to decisions, questions and reminders', () => {
    expect(wentTo('d').navigation).toEqual(Decisions.make({}))
    expect(wentTo('q').navigation).toEqual(Questions.make({}))
    expect(wentTo('r').navigation).toEqual(Reminders.make({}))
  })
})
