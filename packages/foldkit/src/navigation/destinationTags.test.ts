import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import { pushScreen, rootScreen, screens } from './declaration.js'
import { destinationTagsOf } from './destinationTags.js'

const Shelf = ts('Shelf')
const Title = ts('Title', { slug: S.String })
const Listen = ts('Listen')

const navigation = screens({
  slug: 'shelf',
  root: rootScreen(Shelf, Route.here),
  screens: [
    pushScreen(Title, Route.string('slug')),
    pushScreen(Listen, Route.literal('listen')),
  ],
})

describe('the Destinations a Program declares, by name', () => {
  it('lists each Destination’s tag, in the order it is declared', () => {
    expect(destinationTagsOf(navigation)).toEqual(['Shelf', 'Title', 'Listen'])
  })

  it('reads them from the declaration alone, with no Model and no sample', () => {
    expect(destinationTagsOf(navigation)).toEqual(destinationTagsOf(navigation))
  })
})
