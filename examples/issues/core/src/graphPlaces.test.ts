import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { FeatureEntity, ProductEntity } from './entityGraph.js'
import { featureChipsOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { tokenForKeyPress } from './keys.js'
import { menuRowsOf } from './menus.js'
import {
  ObservedFeatureChips,
  ObservedProducts,
  OpenedCommandPalette,
  PressedGoKey,
  UpdatedMenuQuery,
} from './message.js'
import {
  EntityPage,
  Features,
  Findings,
  IssueList,
  type Model,
  Products,
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

const list = (): Model =>
  [
    ObservedProducts.make({ products: [scribe] }),
    OpenedCommandPalette.make({}),
    ObservedFeatureChips.make({ features }),
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
})
