import { describe, expect, it } from 'vitest'

import { parseCounterArgv } from './parseArgv.js'

describe('parseCounterArgv', () => {
  it('parses show --surface svelte', () => {
    expect(parseCounterArgv(['show', '--surface', 'svelte'])).toEqual({
      _tag: 'Show',
      surface: 'svelte',
    })
  })

  it('parses show --surface react-screen with occupancy', () => {
    expect(
      parseCounterArgv([
        'show',
        '--surface',
        'react-screen',
        '--device',
        'phone',
      ]),
    ).toEqual({
      _tag: 'Show',
      device: 'phone',
      surface: 'react-screen',
    })
  })

  it('rejects an unknown surface', () => {
    expect(parseCounterArgv(['show', '--surface', '2e'])).toEqual({
      _tag: 'Failed',
      message:
        'Unknown surface "2e". Use foldkit, svelte, react, react-screen, expo, cli, tui, or opentui.',
      exitCode: 1,
    })
  })
})
