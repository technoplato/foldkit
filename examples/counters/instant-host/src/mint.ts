import { Data } from 'effect'

import { countersDemoEmail } from './identity.js'

/** Instant admin surface required to mint the Multiple Counters demo session. */
export type CountersDemoMintAdmin = Readonly<{
  auth: Readonly<{
    createToken: (input: Readonly<{ email: string }>) => Promise<unknown>
  }>
}>

/** Demo Instant refresh token minted for the shared Counters subject. */
export type CountersDemoSession = Readonly<{
  email: string
  token: string
}>

/** Instant could not mint the Multiple Counters demo session. */
export class CountersDemoMintError extends Data.TaggedError(
  'CountersDemoMintError',
)<Readonly<{ message: string }>> {}

/** Mints an Instant refresh token for the shared Counters demo email. */
export const mintCountersDemoSession = async (
  admin: CountersDemoMintAdmin,
): Promise<CountersDemoSession> => {
  try {
    const token = await admin.auth.createToken({ email: countersDemoEmail })
    if (typeof token !== 'string' || token === '') {
      throw new CountersDemoMintError({
        message: 'Instant returned an empty Counters demo token.',
      })
    }
    return { email: countersDemoEmail, token }
  } catch (cause) {
    if (cause instanceof CountersDemoMintError) {
      throw cause
    }
    throw new CountersDemoMintError({
      message: 'Instant could not mint the Counters demo session.',
    })
  }
}
