import { describe, expect, it } from 'vitest'

import { gitSourceUrl, normalizeRemoteUrl, surfaceLines } from './surfaceLabel.js'

describe('normalizeRemoteUrl', () => {
  it('normalizes scp-style GitHub remotes', () => {
    expect(normalizeRemoteUrl('git@github.com:foldkit/foldkit.git')).toBe(
      'https://github.com/foldkit/foldkit',
    )
  })

  it('passes https remotes through normalized', () => {
    expect(
      normalizeRemoteUrl('https://github.com/foldkit/foldkit.git'),
    ).toBe('https://github.com/foldkit/foldkit')
  })

  it('returns empty for unknown hosts so the banner omits attribution', () => {
    expect(normalizeRemoteUrl('git@gitlab.com:foldkit/foldkit.git')).toBe('')
    expect(normalizeRemoteUrl('')).toBe('')
  })
})

describe('surfaceLines', () => {
  it('always carries the surface name and canonical carrier', () => {
    const lines = surfaceLines('CLI (Effect Terminal)', '/counters/c1', '')
    expect(lines[0]).toBe('Surface: CLI (Effect Terminal)')
    expect(lines[1]).toBe('Carrier: /counters/c1')
  })

  it('attributes the source when a URL exists', () => {
    const lines = surfaceLines(
      'CLI',
      '/counters',
      'https://github.com/foldkit/foldkit',
    )
    expect(lines[0]).toContain('Source: https://github.com/foldkit/foldkit')
    expect(lines[1]).toBe('Carrier: /counters')
  })

  it('derives this checkout origin without throwing', () => {
    expect(typeof gitSourceUrl()).toBe('string')
  })
})
