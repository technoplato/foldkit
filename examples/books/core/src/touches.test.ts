import { Array, Option } from 'effect'
import { Catalog } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { catalog } from './message.js'
import { sampleMessages, sampleModels } from './touchSamples.js'
import { update } from './update.js'

describe('what the Books Actions touch', () => {
  it('is said by every Action', () => {
    expect(
      Array.filter(catalog.actions, action =>
        Option.isNone(action.maybeTouches),
      ).map(action => action.tag),
    ).toEqual([])
  })

  it('is all update does', () => {
    expect(
      Catalog.undeclaredTouches(catalog, update, sampleModels, sampleMessages),
    ).toEqual([])
  })

  it('is no more than update does', () => {
    expect(
      Catalog.unseenTouches(catalog, update, sampleModels, sampleMessages),
    ).toEqual([])
  })
})
