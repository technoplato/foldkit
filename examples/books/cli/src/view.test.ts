import { describe, expect, it } from 'vitest'

import {
  type AskRuntime,
  askPlayer,
  paintsColor,
  showBriefOrUsage,
  takesColor,
  usageText,
} from './view.js'

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

describe('whether a command paints with color', () => {
  it('does in a terminal that takes color, and when FORCE_COLOR asks, unless color was refused', () => {
    expect(paintsColor(true, { TERM: 'xterm-256color' })).toBe(true)
    expect(paintsColor(false, {})).toBe(false)
    expect(paintsColor(false, { FORCE_COLOR: '1' })).toBe(true)
    expect(paintsColor(false, { FORCE_COLOR: '0' })).toBe(false)
    expect(paintsColor(true, { NO_COLOR: '1', FORCE_COLOR: '1' })).toBe(false)
  })
})

describe('a command the player could not read', () => {
  const runtimeOf = (wasRunning: boolean, exitCode: number) => {
    const happened: Array<string> = []
    const runtime: AskRuntime = {
      isListening: () => Promise.resolve(wasRunning),
      run: (_socketPath, request) => {
        happened.push(`ran ${request._tag === 'Do' ? request.token : 'show'}`)
        return Promise.resolve({
          stdout: '',
          stderr: exitCode === 0 ? '' : 'Unknown command "lisen".',
          exitCode,
        })
      },
      ask: (_socketPath, request) => {
        happened.push(`asked ${request._tag === 'Do' ? request.token : 'show'}`)
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      },
      write: result => {
        happened.push(`wrote exit ${result.exitCode.toString()}`)
      },
      say: sentence => {
        happened.push(`said ${sentence}`)
      },
    }
    return { happened, runtime }
  }
  const lisen = { _tag: 'Do' as const, token: 'lisen', flags: {} }

  it('stops the player it started, after its answer, and says so', async () => {
    const { happened, runtime } = runtimeOf(false, 2)
    await askPlayer(lisen, runtime)
    expect(happened).toEqual([
      'said Starting the Books player…',
      'ran lisen',
      'wrote exit 2',
      'asked stop',
      'said The player was started only to read that, and is stopped again.',
    ])
  })

  it('leaves a player that was already running alone', async () => {
    const { happened, runtime } = runtimeOf(true, 2)
    await askPlayer(lisen, runtime)
    expect(happened).toEqual(['ran lisen', 'wrote exit 2'])
  })

  it('keeps the player it started for a command that ran, or one the player refused for now', async () => {
    const ran = runtimeOf(false, 0)
    await askPlayer(lisen, ran.runtime)
    expect(ran.happened).not.toContain('asked stop')
    const disabled = runtimeOf(false, 1)
    await askPlayer(lisen, disabled.runtime)
    expect(disabled.happened).not.toContain('asked stop')
  })
})
