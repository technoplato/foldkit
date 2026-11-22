/// <reference types="node" />
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
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
