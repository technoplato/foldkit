import { Array } from 'effect'
import { observablesOf, undeclaredSources } from 'foldkit/declaration'
import { describe, expect, it } from 'vitest'

import { Model } from './model.js'
import { sampleModels } from './touchSamples.js'
import { computedFields, spokenWordsOf, wordsBeingRead } from './words.js'

const observables = observablesOf(Model, computedFields)

describe('what Books lets a Client observe', () => {
  it('is the state its Model describes, then what is computed from it', () => {
    expect(Array.map(observables, ({ path }) => Array.join(path, '.'))).toEqual(
      ['listening', 'speed', 'appearance', 'library', 'wordsBeingRead'],
    )
  })

  it('says what each is and why the user cares, never to the user', () => {
    expect(
      Array.filter(
        observables,
        ({ what, why }) =>
          what === '' || why === '' || /\byou(r)?\b/iu.test(`${what} ${why}`),
      ),
    ).toEqual([])
  })
})

describe('the words being read', () => {
  it('are what every Client reads from the Model', () => {
    expect(Array.map(sampleModels, wordsBeingRead.read)).toEqual(
      Array.map(sampleModels, model => spokenWordsOf(model)),
    )
  })

  it('are computed from the shelf, the chapters, and the player, and nothing else', () => {
    expect(undeclaredSources(computedFields, sampleModels)).toEqual([])
  })
})
