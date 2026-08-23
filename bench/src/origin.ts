import { Console, Effect } from 'effect'
import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'
import { promisify } from 'node:util'

import { BenchError } from './error.js'
import {
  LOOPBACK_HOST,
  type OriginProbe,
  PROOF_HOST,
  probeOrigin,
} from './proof.js'

const execFilePromise = promisify(execFile)
const counterDemoService = 'com.knophy.foldkit.counter-demo'

const guiDomain = (): string => `gui/${userInfo().uid}`

/** Bounce preview 5210 only. Never bounce 5209 5211 5212 5215. */
const bounce5210 = Effect.tryPromise({
  try: async () => {
    await execFilePromise('launchctl', [
      'kickstart',
      '-k',
      `${guiDomain()}/${counterDemoService}`,
    ])
  },
  catch: cause =>
    new BenchError({
      detail: `launchctl kickstart counter-demo failed: ${String(cause)}`,
    }),
})

/**
 * Public proof first. Bounce 5210 only if the public origin is down.
 * Kickstart counter-demo only when both public and loopback are down.
 */
export const ensureProofOrigin = (): Effect.Effect<OriginProbe, BenchError> =>
  Effect.gen(function* () {
    const publicProbe = yield* probeOrigin(PROOF_HOST)
    if (publicProbe.ok) {
      return publicProbe
    }
    const loopback = yield* probeOrigin(LOOPBACK_HOST).pipe(
      Effect.catchTag('BenchError', () =>
        Effect.succeed({
          ok: false,
          status: 0,
          detail: `${LOOPBACK_HOST} down`,
        }),
      ),
    )
    yield* Console.log(
      `proof origin down (${publicProbe.detail}); loopback ${loopback.detail}`,
    )
    yield* bounce5210
    yield* Effect.sleep('3 seconds')
    return yield* probeOrigin(PROOF_HOST)
  })
