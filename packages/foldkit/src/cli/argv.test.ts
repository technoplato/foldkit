import { describe, expect, it } from 'vitest'

import { parseProgramArgv } from './argv.js'
import { cliViewFailed } from './view.js'

describe('parseProgramArgv', () => {
  it('reads show, an Action, and tail', () => {
    expect(parseProgramArgv([])).toEqual({ _tag: 'Show', flags: {} })
    expect(parseProgramArgv(['increment'])).toEqual({
      _tag: 'Do',
      token: 'increment',
      flags: {},
    })
    expect(parseProgramArgv(['tail'])).toEqual({ _tag: 'Tail', flags: {} })
    expect(parseProgramArgv(['watch'])).toEqual({ _tag: 'Watch', flags: {} })
  })

  it('reads modifier flags beside the words', () => {
    expect(parseProgramArgv(['key', 'k', '--meta'])).toEqual({
      _tag: 'Do',
      token: 'key k',
      flags: { meta: '1' },
    })
  })
})

describe('cliViewFailed', () => {
  it('writes the cause, or a plain sentence when it has none', () => {
    expect(cliViewFailed(new Error('connect ENOENT'))).toEqual({
      stdout: '',
      stderr: 'connect ENOENT',
      exitCode: 1,
    })
    expect(cliViewFailed('boom').stderr).toBe(
      'The CLI could not reach its daemon.',
    )
  })
})
