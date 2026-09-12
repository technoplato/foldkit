#!/usr/bin/env node
/**
 * Counter one-shot CLI view.
 *
 * Instant and file tapes talk to the Foldkit CLI daemon. This file
 * must not import Effect, foldkit, Instant, or the Program. Memory
 * tape and replay load the in-process host on demand.
 *
 *   counter show
 *   counter show --device phone
 *   counter do increment
 *   counter palette [token]
 *   counter say <utterance>
 *   counter share --name kitchen --with bob
 *   counter replay --tape tape.json
 */
import {
  cliDaemonSocketPath,
  runCliView,
  spawnCliViewDaemon,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import {
  applyCounterIdentity,
  counterCliIsolationKey,
  counterCliProgramId,
  isCounterCliMemory,
} from './isolation.js'
import {
  type ParsedCounterArgv,
  counterUsage,
  parseCounterArgv,
} from './parseArgv.js'
import { grantNamedShareWith } from './shareLedger.js'

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

const socketPath = (): string =>
  cliDaemonSocketPath({
    programId: counterCliProgramId,
    isolationKey: counterCliIsolationKey(),
  })

const spawnDaemon = () => spawnCliViewDaemon({ scriptPath: daemonScriptPath })

const writeFailed = (message: string, exitCode: number): void => {
  writeCliViewResult({ stdout: '', stderr: message, exitCode })
}

const identityOf = (
  parsed: ParsedCounterArgv,
): Readonly<{ subject?: string; audience?: string; name?: string }> => {
  if (parsed._tag === 'Help' || parsed._tag === 'Failed') {
    return {}
  }
  return {
    ...(parsed.subject === undefined ? {} : { subject: parsed.subject }),
    ...(parsed.audience === undefined ? {} : { audience: parsed.audience }),
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
  }
}

const daemonRequest = (parsed: ParsedCounterArgv) => {
  const identity = identityOf(parsed)
  const identityFlags = {
    ...(identity.subject === undefined ? {} : { as: identity.subject }),
    ...(identity.audience === undefined ? {} : { audience: identity.audience }),
    ...(identity.name === undefined ? {} : { name: identity.name }),
  }
  if (parsed._tag === 'Show') {
    return {
      _tag: 'Show' as const,
      flags: {
        ...identityFlags,
        ...(parsed.device === undefined ? {} : { device: parsed.device }),
        ...(parsed.path === undefined ? {} : { path: parsed.path }),
      },
    }
  }
  if (parsed._tag === 'Palette' && parsed.token === undefined) {
    return {
      _tag: 'Show' as const,
      flags: { ...identityFlags, palette: '1' },
    }
  }
  if (parsed._tag === 'Palette') {
    return {
      _tag: 'Do' as const,
      token: parsed.token ?? '',
      flags: { ...identityFlags, via: 'palette' },
    }
  }
  if (parsed._tag === 'Say') {
    return {
      _tag: 'Do' as const,
      token: parsed.utterance,
      flags: { ...identityFlags, via: 'spoken' },
    }
  }
  if (parsed._tag === 'Share') {
    return {
      _tag: 'Show' as const,
      flags: {
        ...identityFlags,
        name: parsed.name,
        with: parsed.with,
        share: '1',
      },
    }
  }
  return {
    _tag: 'Do' as const,
    token: parsed._tag === 'Do' ? parsed.token : '',
    flags: identityFlags,
  }
}

const runDaemonView = async (parsed: ParsedCounterArgv): Promise<void> => {
  if (parsed._tag === 'Help') {
    writeCliViewResult({ stdout: counterUsage, stderr: '', exitCode: 0 })
    return
  }
  if (parsed._tag === 'Failed') {
    writeFailed(parsed.message, parsed.exitCode)
    return
  }
  if (parsed._tag === 'Replay') {
    const { runInProcessCounter } = await import('./inProcess.js')
    runInProcessCounter(process.argv.slice(2))
    return
  }
  try {
    const painted = await runCliView({
      socketPath: socketPath(),
      spawn: spawnDaemon,
      request: daemonRequest(parsed),
    })
    writeCliViewResult(painted)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'CLI view failed.'
    writeFailed(message, 1)
  }
}

const argv = process.argv.slice(2)
const parsed = parseCounterArgv(argv)
const identity = identityOf(parsed)
applyCounterIdentity(identity.subject, identity.audience, identity.name)
const shareDenied =
  parsed._tag === 'Share' && identity.subject !== undefined
    ? grantNamedShareWith(parsed.name, identity.subject, parsed.with)
    : undefined
if (shareDenied?._tag === 'Denied') {
  writeFailed(shareDenied.message, 1)
} else if (isCounterCliMemory() || parsed._tag === 'Replay') {
  const { runInProcessCounter } = await import('./inProcess.js')
  runInProcessCounter(argv)
} else {
  await runDaemonView(parsed)
}
