import { describe, expect, it } from 'vitest'

import { showBriefOrUsage, takesColor, usageText } from './view.js'

describe('books with no command', () => {
  it('prints how to use it and starts no player when none is running', async () => {
    const written: Array<string> = []
    const started: Array<string> = []
    await showBriefOrUsage(
      {},
      {
        isListening: () => Promise.resolve(false),
        ask: () => {
          started.push('asked')
          return Promise.resolve({ stdout: 'a brief', stderr: '', exitCode: 0 })
        },
        write: result => {
          written.push(result.stdout)
        },
      },
    )
    expect(started).toEqual([])
    expect(written).toEqual([usageText])
    expect(usageText).toContain('books listen <title>')
    expect(usageText).toContain('does not start it')
  })

  it('says what is playing when a player already runs', async () => {
    const written: Array<string> = []
    await showBriefOrUsage(
      {},
      {
        isListening: () => Promise.resolve(true),
        ask: () =>
          Promise.resolve({
            stdout: 'Playing Small Hours',
            stderr: '',
            exitCode: 0,
          }),
        write: result => {
          written.push(result.stdout)
        },
      },
    )
    expect(written).toEqual(['Playing Small Hours'])
  })
})

describe('whether a terminal takes color', () => {
  it('does unless color was refused or the terminal is a dumb one', () => {
    expect(takesColor({ TERM: 'xterm-256color' })).toBe(true)
    expect(takesColor({})).toBe(true)
    expect(takesColor({ NO_COLOR: '1' })).toBe(false)
    expect(takesColor({ NO_COLOR: '' })).toBe(true)
    expect(takesColor({ TERM: 'dumb' })).toBe(false)
  })
})
