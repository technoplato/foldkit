import { describe, expect, it } from 'vitest'

import { followArgvOf, parseProgramArgv } from './argv.js'
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

describe('followArgvOf', () => {
  it('reads follow, its topic, and the flags that shape its text', () => {
    expect(
      followArgvOf(['follow', 'words', '--json', '--before', '2']),
    ).toEqual({ topic: 'words', flags: { json: '1', before: '2' } })
  })

  it('follows the screen when no topic is named', () => {
    expect(followArgvOf(['follow'])).toEqual({ topic: 'screen', flags: {} })
  })

  it('is undefined for any other command', () => {
    expect(followArgvOf(['increment'])).toBeUndefined()
    expect(followArgvOf([])).toBeUndefined()
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
