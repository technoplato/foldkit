/// <reference types="node" />
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { handoverOf, terminalBuildOf } from './host.js'
import { cliDaemonPidOf, cliDaemonSocketPath } from './paths.js'
import { isCliViewListening } from './view.js'

const fixturePath = join(process.cwd(), 'src/test/apps/terminalCounterEntry.ts')

const processTimeoutMs = 60_000

const waitTimeoutMs = 30_000

const testTimeoutMs = 180_000

type Host = Readonly<{
  socketKey: string
  socketPath: string
  env: NodeJS.ProcessEnv
}>

const hosts: Array<Host> = []

const hostOf = (extra: Readonly<Record<string, string>> = {}): Host => {
  const socketKey = `host-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const host = {
    socketKey,
    socketPath: cliDaemonSocketPath({
      programId: 'fixture-counter',
      isolationKey: socketKey,
    }),
    env: { ...process.env, FOLDKIT_FIXTURE_SOCKET_KEY: socketKey, ...extra },
  }
  hosts.push(host)
  return host
}

const run = (host: Host, ...words: ReadonlyArray<string>) => {
  const ran = spawnSync(
    process.execPath,
    ['--import', 'tsx', fixturePath, ...words],
    { env: host.env, encoding: 'utf8', timeout: processTimeoutMs },
  )
  return { stdout: ran.stdout, stderr: ran.stderr, exitCode: ran.status }
}

const eventually = async (
  isSo: () => boolean | Promise<boolean>,
): Promise<void> => {
  const startedAt = Date.now()
  while (!(await isSo())) {
    if (Date.now() - startedAt > waitTimeoutMs) {
      throw new Error('never happened')
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

const BUILT_AGAIN_STEP_MS = 5_000

const buildAgain = (): void => {
  const later = new Date(
    Math.max(statSync(fixturePath).mtimeMs, Date.now()) + BUILT_AGAIN_STEP_MS,
  )
  utimesSync(fixturePath, later, later)
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    run(host, 'stop')
  }
})

describe('what a command does about another build', () => {
  it('keeps a Processor of its own build', () => {
    expect(handoverOf('/app/dist/entry.js@2', '/app/dist/entry.js@2')).toBe(
      'Keep',
    )
  })

  it('replaces an older or newer build of the same host, and one that names no build', () => {
    expect(handoverOf('/app/dist/entry.js@2', '/app/dist/entry.js@1')).toBe(
      'Replace',
    )
    expect(handoverOf('/app/dist/entry.js@2', '/app/dist/entry.js@3')).toBe(
      'Replace',
    )
    expect(handoverOf('/app/dist/entry.js@2', undefined)).toBe('Replace')
  })

  it('never takes over a Processor started from another checkout', () => {
    expect(
      handoverOf('/worktree/dist/entry.js@9', '/app/dist/entry.js@1'),
    ).toBe('Keep')
  })

  it('names where the host is and when it was last written', () => {
    expect(terminalBuildOf(fixturePath)).toMatch(
      /terminalCounterEntry\.ts@\d+$/u,
    )
  })
})

describe('a Program as a command, through terminal()', () => {
  it(
    'keeps the Program running between commands, so a count made by one command is there for the next',
    () => {
      const host = hostOf()
      expect(run(host).stdout).toContain('0')
      expect(run(host, 'increment').exitCode).toBe(0)
      expect(run(host, 'increment').exitCode).toBe(0)
      const shown = run(host)
      expect(shown.exitCode).toBe(0)
      expect(shown.stdout).toContain('2')
    },
    testTimeoutMs,
  )

  it(
    'tells a shell what may come next, from the Program\u2019s own declarations and its own words',
    () => {
      const host = hostOf()
      const lines = run(host, 'completions', 'words').stdout.split('\n')
      expect(lines).toContain('increment\tIncrements the count by one')
      expect(lines).toContain('reset\tSets the count to 0')
      expect(lines).toContain(
        'stop\tEnds the Background Processor after it has saved',
      )
      expect(run(host, 'completions', 'zsh').stdout).toContain(
        'fixture-counter completions words',
      )
    },
    testTimeoutMs,
  )

  it(
    'repaints a watching view at once when another command changes the Model',
    async () => {
      const host = hostOf()
      run(host)
      const frames: Array<string> = []
      const watching: ChildProcess = spawn(
        process.execPath,
        ['--import', 'tsx', fixturePath, 'watch'],
        { env: host.env, stdio: ['ignore', 'pipe', 'ignore'] },
      )
      watching.stdout?.on('data', chunk => {
        frames.push(String(chunk))
      })
      try {
        await eventually(() => frames.join('').includes('0'))
        const before = frames.length
        run(host, 'increment')
        await eventually(() => frames.slice(before).join('').includes('1'))
      } finally {
        watching.kill('SIGTERM')
      }
    },
    testTimeoutMs,
  )

  it(
    'stops over the socket: it saves first, says what was saved, and leaves no socket behind',
    async () => {
      const savedPath = join(
        mkdtempSync(join(tmpdir(), 'foldkit-host-test-')),
        'saved',
      )
      const host = hostOf({ FOLDKIT_FIXTURE_SAVED_PATH: savedPath })
      run(host, 'increment')
      expect(await isCliViewListening(host.socketPath)).toBe(true)
      const stopped = run(host, 'stop')
      expect(stopped.stdout).toContain('Saved the count, then stopped.')
      expect(readFileSync(savedPath, 'utf8')).toBe('saved')
      await eventually(async () => !(await isCliViewListening(host.socketPath)))
      await eventually(() => !existsSync(host.socketPath))
      expect(run(host, 'stop').stdout).toContain('is not running')
    },
    testTimeoutMs,
  )

  it(
    'stops by itself once it has had nothing to do for the grace, and not while its Program has work going on',
    async () => {
      const idle = hostOf({ FOLDKIT_FIXTURE_IDLE_MS: '400' })
      run(idle)
      await eventually(async () => !(await isCliViewListening(idle.socketPath)))
      const busy = hostOf({
        FOLDKIT_FIXTURE_IDLE_MS: '400',
        FOLDKIT_FIXTURE_BUSY: '1',
      })
      run(busy)
      await new Promise(resolve => setTimeout(resolve, 2_500))
      expect(await isCliViewListening(busy.socketPath)).toBe(true)
    },
    testTimeoutMs,
  )

  it(
    'replaces the Processor when the host has been built again, and keeps it otherwise',
    async () => {
      const host = hostOf()
      run(host)
      const firstPid = cliDaemonPidOf(host.socketPath)
      run(host)
      expect(cliDaemonPidOf(host.socketPath)).toBe(firstPid)
      buildAgain()
      expect(run(host).exitCode).toBe(0)
      const secondPid = cliDaemonPidOf(host.socketPath)
      expect(secondPid).not.toBe(undefined)
      expect(secondPid).not.toBe(firstPid)
    },
    testTimeoutMs,
  )

  it(
    'does not replace a Processor of another build while its Program has work going on: it answers, the command says why, and the first command after the work ends replaces it',
    () => {
      const busyPath = join(
        mkdtempSync(join(tmpdir(), 'foldkit-host-test-')),
        'busy',
      )
      writeFileSync(busyPath, '')
      const host = hostOf({ FOLDKIT_FIXTURE_BUSY_PATH: busyPath })
      expect(run(host, 'increment').exitCode).toBe(0)
      const workingPid = cliDaemonPidOf(host.socketPath)
      expect(workingPid).not.toBe(undefined)

      buildAgain()
      const kept = run(host, 'increment')
      expect(kept.exitCode).toBe(0)
      expect(kept.stderr).toContain('was not replaced')
      expect(kept.stderr).toContain('a job is running')
      expect(kept.stderr).toContain('`fixture-counter stop` ends it now')
      expect(cliDaemonPidOf(host.socketPath)).toBe(workingPid)
      expect(run(host).stdout).toContain('2')
      expect(cliDaemonPidOf(host.socketPath)).toBe(workingPid)

      rmSync(busyPath)
      const replaced = run(host)
      expect(replaced.exitCode).toBe(0)
      expect(replaced.stderr).not.toContain('was not replaced')
      const nextPid = cliDaemonPidOf(host.socketPath)
      expect(nextPid).not.toBe(undefined)
      expect(nextPid).not.toBe(workingPid)
    },
    testTimeoutMs,
  )
})

const killed = (pid: number | undefined): void => {
  if (pid === undefined) {
    throw new Error('no Background Processor to kill')
  }
  process.kill(pid, 'SIGKILL')
}

const startAsLaunchdDoes = (host: Host): ChildProcess =>
  spawn(
    process.execPath,
    ['--import', 'tsx', fixturePath, '--foldkit-background-processor'],
    { env: host.env, stdio: 'ignore' },
  )

const exitCodeOf = (child: ChildProcess): Promise<number | null> =>
  new Promise(resolve => {
    child.once('exit', code => {
      resolve(code)
    })
  })

const alwaysOn = { FOLDKIT_FIXTURE_LIFETIME: 'AlwaysOn' }

const loginItemsFolder = (): string =>
  mkdtempSync(join(tmpdir(), 'foldkit-login-items-'))

const launchAgentsIn = (home: string): ReadonlyArray<string> => {
  const folder = join(home, 'Library', 'LaunchAgents')
  return existsSync(folder) ? readdirSync(folder) : []
}

const askedOfLaunchd = (home: string): string => {
  const log = join(home, 'launchctl.log')
  return existsSync(log) ? readFileSync(log, 'utf8') : ''
}

describe('an always-on host, through terminal()', () => {
  it(
    'does not stop for having nothing to do',
    async () => {
      const host = hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_IDLE_MS: '400' })
      run(host)
      await new Promise(resolve => setTimeout(resolve, 2_500))
      expect(await isCliViewListening(host.socketPath)).toBe(true)
    },
    testTimeoutMs,
  )

  it(
    'runs its Program as the Server, the one place server-only work runs, where another host runs it as a terminal',
    () => {
      const folder = mkdtempSync(join(tmpdir(), 'foldkit-host-test-'))
      const serverPath = join(folder, 'always-on')
      const terminalPath = join(folder, 'until-idle')
      run(hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_HOST_PATH: serverPath }))
      run(hostOf({ FOLDKIT_FIXTURE_HOST_PATH: terminalPath }))
      expect(readFileSync(serverPath, 'utf8')).toBe('Server')
      expect(readFileSync(terminalPath, 'utf8')).toBe('Cli')
    },
    testTimeoutMs,
  )

  it(
    'says with `background` whether its Processor is running, without starting it',
    async () => {
      const busyPath = join(
        mkdtempSync(join(tmpdir(), 'foldkit-host-test-')),
        'busy',
      )
      const host = hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_BUSY_PATH: busyPath })
      const before = run(host, 'background')
      expect(before.exitCode).toBe(0)
      expect(before.stdout).toContain(
        'The fixture-counter Background Processor is not running.',
      )
      expect(await isCliViewListening(host.socketPath)).toBe(false)

      run(host)
      writeFileSync(busyPath, '')
      const after = run(host, 'background')
      expect(after.exitCode).toBe(0)
      expect(after.stdout).toContain(
        `is running, pid ${String(cliDaemonPidOf(host.socketPath))}`,
      )
      expect(after.stdout).toContain('It stays up until it is stopped.')
      expect(after.stdout).toContain('It is working: a job is running.')
      expect(after.stdout).toContain('It does not start at login.')
      rmSync(busyPath)
    },
    testTimeoutMs,
  )

  it(
    'is started at login once installed: the file is written, launchd is asked to load it, and the Processor it starts answers',
    async () => {
      const home = loginItemsFolder()
      const host = hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_LOGIN_ITEMS: home })
      const installed = run(host, 'background', 'install')
      expect(installed.stderr).toBe('')
      expect(installed.exitCode).toBe(0)
      expect(installed.stdout).toContain('starts at login')
      const [agent = ''] = launchAgentsIn(home)
      expect(agent).toMatch(/^foldkit\.fixture-counter\.fkc-[0-9a-f]+\.plist$/u)
      const plist = readFileSync(
        join(home, 'Library', 'LaunchAgents', agent),
        'utf8',
      )
      expect(plist).toContain('--foldkit-background-processor')
      expect(plist).toContain('terminalCounterEntry.ts')
      expect(askedOfLaunchd(home)).toContain('bootstrap gui/501 ')
      await eventually(() => isCliViewListening(host.socketPath))
      expect(run(host, 'background').stdout).toContain('It starts at login')
    },
    testTimeoutMs,
  )

  it(
    'asks launchd to start an installed Processor that is not running, where a command would start one itself',
    async () => {
      const home = loginItemsFolder()
      const host = hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_LOGIN_ITEMS: home })
      run(host, 'background', 'install')
      await eventually(() => isCliViewListening(host.socketPath))
      run(host, 'stop')
      await eventually(async () => !(await isCliViewListening(host.socketPath)))
      expect(askedOfLaunchd(home)).not.toContain('kickstart')
      expect(run(host, 'increment').exitCode).toBe(0)
      expect(askedOfLaunchd(home)).toContain('kickstart gui/501/foldkit.')
      expect(await isCliViewListening(host.socketPath)).toBe(true)
    },
    testTimeoutMs,
  )

  it(
    'is no longer started at login once uninstalled',
    async () => {
      const home = loginItemsFolder()
      const host = hostOf({ ...alwaysOn, FOLDKIT_FIXTURE_LOGIN_ITEMS: home })
      run(host, 'background', 'install')
      await eventually(() => isCliViewListening(host.socketPath))
      const removed = run(host, 'background', 'uninstall')
      expect(removed.exitCode).toBe(0)
      expect(removed.stdout).toContain('no longer starts at login')
      expect(launchAgentsIn(home)).toEqual([])
      expect(askedOfLaunchd(home)).toContain('bootout gui/501/foldkit.')
      expect(run(host, 'background', 'uninstall').stdout).toContain(
        'does not start at login',
      )
    },
    testTimeoutMs,
  )

  it(
    'does not install over a Processor whose Program has work going on, and says which',
    async () => {
      const home = loginItemsFolder()
      const busyPath = join(home, 'busy')
      writeFileSync(busyPath, '')
      const host = hostOf({
        ...alwaysOn,
        FOLDKIT_FIXTURE_LOGIN_ITEMS: home,
        FOLDKIT_FIXTURE_BUSY_PATH: busyPath,
      })
      run(host)
      const workingPid = cliDaemonPidOf(host.socketPath)
      const refused = run(host, 'background', 'install')
      expect(refused.exitCode).toBe(1)
      expect(refused.stderr).toContain('is working: a job is running')
      expect(launchAgentsIn(home)).toEqual([])
      expect(cliDaemonPidOf(host.socketPath)).toBe(workingPid)
      rmSync(busyPath)
    },
    testTimeoutMs,
  )

  it(
    'says a host that stops when idle is not one to start at login',
    () => {
      const home = loginItemsFolder()
      const host = hostOf({ FOLDKIT_FIXTURE_LOGIN_ITEMS: home })
      const refused = run(host, 'background', 'install')
      expect(refused.exitCode).toBe(2)
      expect(refused.stderr).toContain("lifetime: 'AlwaysOn'")
      expect(launchAgentsIn(home)).toEqual([])
    },
    testTimeoutMs,
  )

  it(
    'takes its socket back when started again after it died without cleaning up, as launchd starts it',
    async () => {
      const host = hostOf(alwaysOn)
      run(host)
      const firstPid = cliDaemonPidOf(host.socketPath)
      expect(firstPid).not.toBe(undefined)
      killed(firstPid)
      await eventually(async () => !(await isCliViewListening(host.socketPath)))
      expect(existsSync(host.socketPath)).toBe(true)
      const restarted = startAsLaunchdDoes(host)
      try {
        await eventually(() => isCliViewListening(host.socketPath))
        expect(cliDaemonPidOf(host.socketPath)).toBe(restarted.pid)
      } finally {
        run(host, 'stop')
      }
    },
    testTimeoutMs,
  )

  it(
    'leaves without an error when started beside one that is already answering, so launchd does not start it again and again',
    async () => {
      const host = hostOf(alwaysOn)
      run(host)
      const livePid = cliDaemonPidOf(host.socketPath)
      expect(await exitCodeOf(startAsLaunchdDoes(host))).toBe(0)
      expect(cliDaemonPidOf(host.socketPath)).toBe(livePid)
      expect(await isCliViewListening(host.socketPath)).toBe(true)
    },
    testTimeoutMs,
  )
})

const isLaunchdTested =
  process.platform === 'darwin' && process.env['FOLDKIT_TEST_LAUNCHD'] === '1'

describe('an always-on host under the real launchd', () => {
  // NOTE: This adds a login item to the person running it and removes it
  // again, so it runs only when asked: FOLDKIT_TEST_LAUNCHD=1.
  it.runIf(isLaunchdTested)(
    'is started by launchd on install, started again after it is killed, and gone after uninstall',
    async () => {
      const folder = mkdtempSync(join(tmpdir(), 'foldkit-launchd-test-'))
      const launcher = join(folder, 'fixture-counter')
      const socketKey = `launchd-test-${Date.now().toString(36)}`
      writeFileSync(
        launcher,
        [
          '#!/bin/sh',
          `export FOLDKIT_FIXTURE_SOCKET_KEY='${socketKey}'`,
          "export FOLDKIT_FIXTURE_LIFETIME='AlwaysOn'",
          `export FOLDKIT_FIXTURE_LAUNCHER='${launcher}'`,
          `cd '${process.cwd()}'`,
          `exec '${process.execPath}' --import tsx '${fixturePath}' "$@"`,
          '',
        ].join('\n'),
      )
      chmodSync(launcher, 0o755)
      const socketPath = cliDaemonSocketPath({
        programId: 'fixture-counter',
        isolationKey: socketKey,
      })
      const say = (...words: ReadonlyArray<string>) =>
        spawnSync(launcher, words, {
          encoding: 'utf8',
          timeout: processTimeoutMs,
        })
      try {
        const installed = say('background', 'install')
        expect(installed.stderr).toBe('')
        expect(installed.status).toBe(0)
        await eventually(() => isCliViewListening(socketPath))
        const firstPid = cliDaemonPidOf(socketPath)
        expect(say('increment').status).toBe(0)

        killed(firstPid)
        await eventually(
          async () =>
            (await isCliViewListening(socketPath)) &&
            cliDaemonPidOf(socketPath) !== firstPid,
        )
        expect(say('background').stdout).toContain('It starts at login')
      } finally {
        const removed = say('background', 'uninstall')
        expect(removed.status).toBe(0)
        await eventually(async () => !(await isCliViewListening(socketPath)))
      }
    },
    testTimeoutMs,
  )
})
