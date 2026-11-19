import { describe, expect, it } from 'vitest'

import { usageText } from './help.js'
import {
  type AskRuntime,
  askPlayer,
  paintsColor,
  restartedSentence,
  restartedWhenOlder,
  showBriefOrUsage,
  takesColor,
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
    expect(written).toEqual([usageText()])
    expect(usageText()).toContain('books play <title>')
    expect(usageText()).toContain('does not start it')
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
      restartWhenOlder: () => Promise.resolve(false),
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

describe('a command that meets a player started before books was updated', () => {
  // A made-up older player: it answers what it was built from, its words
  // as JSON, and goes away when it is asked to stop.
  const meeting = (
    isRunning: boolean,
    build: Readonly<{ stdout: string; exitCode: number }>,
    words = '{"_tag":"NothingInPlayer"}',
  ) => {
    const happened: Array<string> = []
    const player = { isRunning }
    return {
      happened,
      runtime: {
        isListening: () => Promise.resolve(player.isRunning),
        ask: (
          _socketPath: string,
          request: { _tag: string; token?: string },
        ) => {
          happened.push(`asked ${request.token ?? request._tag}`)
          if (request.token === 'stop') {
            player.isRunning = false
          }
          return Promise.resolve(
            request.token === 'words'
              ? { stdout: words, stderr: '', exitCode: 0 }
              : { ...build, stderr: '' },
          )
        },
        run: (
          _socketPath: string,
          request: { _tag: string; token?: string },
        ) => {
          happened.push(`started a player for ${request.token ?? request._tag}`)
          player.isRunning = true
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
        },
        builtNow: () => 'build-2',
        wait: () => Promise.resolve(),
        say: (sentence: string) => {
          happened.push(`said ${sentence}`)
        },
      },
    }
  }

  it('stops it, which saves the place, says so in one sentence, and starts nothing when nothing was sounding', async () => {
    const { happened, runtime } = meeting(true, {
      stdout: 'build-1',
      exitCode: 0,
    })
    expect(await restartedWhenOlder('/socket', runtime)).toBe(true)
    expect(happened).toEqual([
      'asked player-build',
      'asked words',
      'asked stop',
      `said ${restartedSentence}`,
    ])
    expect(restartedSentence).toBe(
      'The Books player here was started before `books` was updated, so it was restarted. Your place is kept.',
    )
  })

  it('plays the title on in a player of this build when it was sounding', async () => {
    const { happened, runtime } = meeting(
      true,
      { stdout: 'build-1', exitCode: 0 },
      '{"_tag":"WordsNow","header":{"slug":"the-lantern-keeper","isPlaying":true}}',
    )
    expect(await restartedWhenOlder('/socket', runtime)).toBe(true)
    expect(happened).toEqual([
      'asked player-build',
      'asked words',
      'asked stop',
      `said ${restartedSentence}`,
      'started a player for listen the-lantern-keeper',
    ])
  })

  it('leaves a paused title paused: its place is saved and nothing is played', async () => {
    const { happened, runtime } = meeting(
      true,
      { stdout: 'build-1', exitCode: 0 },
      '{"_tag":"WordsNow","header":{"slug":"the-lantern-keeper","isPlaying":false}}',
    )
    expect(await restartedWhenOlder('/socket', runtime)).toBe(true)
    expect(happened).not.toContain(
      'started a player for listen the-lantern-keeper',
    )
  })

  it('restarts a player too old to know what it was built from', async () => {
    const { happened, runtime } = meeting(true, { stdout: '', exitCode: 2 })
    expect(await restartedWhenOlder('/socket', runtime)).toBe(true)
    expect(happened).toContain('asked stop')
  })

  it('says nothing to a player of this build, and asks nothing when none is running', async () => {
    const same = meeting(true, { stdout: 'build-2', exitCode: 0 })
    expect(await restartedWhenOlder('/socket', same.runtime)).toBe(false)
    expect(same.happened).toEqual(['asked player-build'])
    const none = meeting(false, { stdout: '', exitCode: 0 })
    expect(await restartedWhenOlder('/socket', none.runtime)).toBe(false)
    expect(none.happened).toEqual([])
  })
})
