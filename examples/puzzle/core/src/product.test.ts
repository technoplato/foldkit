import { Array } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  grokLiveUrl,
  liveHosts,
  puzzleLiveUrl,
  puzzleSourceUrl,
  replicateLiveUrl,
} from './hostSurface.js'
import { demoModel, emptyModel } from './model.js'
import { productView } from './product.js'
import { puzzleReplicateScript } from './replicate.js'
import { buttonsOf, textsOf } from './tree.js'

describe('productView', () => {
  test('puts live hosts and sourceUrl in every tree', () => {
    const tree = productView(emptyModel())
    const contents = Array.map(textsOf(tree), text => text.content)
    const hrefs = Array.map(textsOf(tree), text => text.href)

    expect(puzzleSourceUrl()).toBe(puzzleLiveUrl)
    expect(contents).toContain(liveHosts.puzzle)
    expect(contents).toContain(liveHosts.replicate)
    expect(contents).toContain(liveHosts.grok)
    expect(hrefs).toContain(puzzleLiveUrl)
    expect(hrefs).toContain(replicateLiveUrl)
    expect(hrefs).toContain(grokLiveUrl)
    expect(contents).not.toContain(puzzleReplicateScript)
    expect(JSON.stringify(tree)).not.toContain('github.com')
  })

  test('puts replicate page and script on ReplicateStep', () => {
    const tree = productView(demoModel())
    const contents = Array.map(textsOf(tree), text => text.content)

    expect(contents).toContain(puzzleLiveUrl)
    expect(contents).toContain(puzzleReplicateScript)
    expect(contents).toContain(replicateLiveUrl)
    expect(contents).toContain(grokLiveUrl)
    expect(Array.map(buttonsOf(tree), button => button.token)).toEqual([
      'reset',
    ])
  })

  test('offers yes, no, hint, operator, and replicate on an empty tape', () => {
    const tree = productView(emptyModel())

    expect(Array.map(buttonsOf(tree), button => button.token)).toEqual([
      'yes',
      'no',
      'hint',
      'operator',
      'replicate',
    ])
  })
})
