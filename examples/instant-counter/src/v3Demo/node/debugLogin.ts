import { Data, Effect, Result } from 'effect'

import {
  type MultipleCountersV3DebugEmail,
  type MultipleCountersV3DebugLoginIssued,
  decodeMultipleCountersV3DebugLoginIssued,
} from '../shared/debugLogin.js'
import { multipleCountersV3DebugLoginPort } from '../headless/debugLoginServer.js'

/** The loopback debug login server did not mint a usable Alice or Bob code. */
export class MultipleCountersV3NodeDebugLoginError extends Data.TaggedError(
  'MultipleCountersV3NodeDebugLoginError',
)<Readonly<{ cause: unknown }>> {}

/** POSTs one allowlisted debug email to the headless loopback minting server. */
export const mintMultipleCountersV3NodeDebugLogin = (
  email: MultipleCountersV3DebugEmail,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.Effect<
  MultipleCountersV3DebugLoginIssued,
  MultipleCountersV3NodeDebugLoginError
> =>
  Effect.tryPromise({
    try: async () => {
      const port = multipleCountersV3DebugLoginPort(environment)
      const response = await fetch(`http://127.0.0.1:${port.toString()}/magic-code`, {
        body: JSON.stringify({ email }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const body: unknown = await response.json()
      const decoded = decodeMultipleCountersV3DebugLoginIssued(body)
      if (!response.ok || Result.isFailure(decoded)) {
        throw new Error('DebugLoginUnavailable')
      }
      return decoded.success
    },
    catch: cause => new MultipleCountersV3NodeDebugLoginError({ cause }),
  })
