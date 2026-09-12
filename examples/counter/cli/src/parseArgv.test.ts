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

describe('parseCounterArgv named share', () => {
  it('parses share --name kitchen --with bob as alice', () => {
    expect(
      parseCounterArgv([
        '--as',
        'alice',
        'share',
        '--name',
        'kitchen',
        '--with',
        'bob',
      ]),
    ).toEqual({
      _tag: 'Share',
      name: 'kitchen',
      with: 'bob',
      subject: 'alice',
    })
  })

  it('parses show --as alice --name kitchen', () => {
    expect(
      parseCounterArgv(['--as', 'alice', '--name', 'kitchen', 'show']),
    ).toEqual({
      _tag: 'Show',
      subject: 'alice',
      name: 'kitchen',
    })
  })

  it('parses do increment --as bob --name kitchen', () => {
    expect(
      parseCounterArgv(['--as', 'bob', '--name', 'kitchen', 'do', 'increment']),
    ).toEqual({
      _tag: 'Do',
      token: 'increment',
      subject: 'bob',
      name: 'kitchen',
    })
  })

  it('keeps --as / --audience as L6, not share', () => {
    expect(
      parseCounterArgv(['--as', 'alice', '--audience', 'mine', 'show']),
    ).toEqual({
      _tag: 'Show',
      subject: 'alice',
      audience: 'mine',
    })
  })

  it('rejects share without --name, --with, or --as', () => {
    expect(parseCounterArgv(['share', '--with', 'bob'])._tag).toBe('Failed')
    expect(
      parseCounterArgv(['--as', 'alice', 'share', '--name', 'kitchen'])._tag,
    ).toBe('Failed')
    expect(
      parseCounterArgv(['share', '--name', 'kitchen', '--with', 'bob'])._tag,
    ).toBe('Failed')
  })

  it('rejects --name without --as', () => {
    const parsed = parseCounterArgv(['--name', 'kitchen', 'show'])
    expect(parsed).toEqual({
      _tag: 'Failed',
      message: 'named share needs --as SUBJECT.',
      exitCode: 1,
    })
  })

  it('rejects a path as a share name', () => {
    const parsed = parseCounterArgv([
      '--as',
      'alice',
      '--name',
      '/kitchen',
      'show',
    ])
    expect(parsed._tag).toBe('Failed')
  })
})
