import { describe, expect, it } from 'vitest'

import { parseCounterArgv } from './parseArgv.js'

describe('parseCounterArgv named share', () => {
  it('parses share --name kitchen --with bob', () => {
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
      grantedTo: 'bob',
      subject: 'alice',
    })
  })

  it('threads --name kitchen onto show and do', () => {
    expect(
      parseCounterArgv(['--as', 'bob', '--name', 'kitchen', 'show']),
    ).toEqual({
      _tag: 'Show',
      subject: 'bob',
      name: 'kitchen',
    })
    expect(
      parseCounterArgv([
        '--as',
        'bob',
        '--name',
        'kitchen',
        'do',
        'increment',
      ]),
    ).toEqual({
      _tag: 'Do',
      token: 'increment',
      subject: 'bob',
      name: 'kitchen',
    })
  })

  it('treats --path /counter/kitchen as named share occupancy', () => {
    expect(parseCounterArgv(['show', '--path', '/counter/kitchen'])).toEqual({
      _tag: 'Show',
      path: '/counter/kitchen',
      name: 'kitchen',
    })
  })

  it('rejects share without --as, --name, or --with', () => {
    expect(parseCounterArgv(['share', '--name', 'kitchen', '--with', 'bob'])).toEqual({
      _tag: 'Failed',
      message: 'share needs --as <subject>.',
      exitCode: 1,
    })
    expect(
      parseCounterArgv(['--as', 'alice', 'share', '--with', 'bob']),
    ).toEqual({
      _tag: 'Failed',
      message: 'share needs --name <name>.',
      exitCode: 1,
    })
    expect(
      parseCounterArgv(['--as', 'alice', 'share', '--name', 'kitchen']),
    ).toEqual({
      _tag: 'Failed',
      message: 'share needs --with <subject>.',
      exitCode: 1,
    })
  })

  it('rejects Action tokens as share names', () => {
    expect(
      parseCounterArgv([
        '--as',
        'alice',
        'share',
        '--name',
        'increment',
        '--with',
        'bob',
      ]),
    ).toEqual({
      _tag: 'Failed',
      message: 'share --name must not be an Action token.',
      exitCode: 1,
    })
  })
})
