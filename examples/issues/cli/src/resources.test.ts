import { Schedule } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantAPIError } from '@instantdb/admin'

import {
  type InstantAdminClient,
  adminAsInstantToolsDatabase,
  isRateLimited,
} from './resources.js'

const rateLimited = () =>
  new InstantAPIError({
    status: 429,
    body: {
      type: 'rate-limited',
      message: 'Your request exceeded the rate limit.',
      hint: { 'retry-after': 1 },
    },
  })

const refused = () =>
  new InstantAPIError({
    status: 400,
    body: {
      type: 'validation-failed',
      message: 'Bad query.',
      hint: { 'data-type': 'query', errors: [] },
    },
  })

const failingFirst = <A>(
  failures: ReadonlyArray<() => Error>,
  answer: A,
): Readonly<{ attempts: () => number; request: () => Promise<A> }> => {
  let attempts = 0
  return {
    attempts: () => attempts,
    request: () => {
      const failure = failures.at(attempts)
      attempts += 1
      return failure === undefined
        ? Promise.resolve(answer)
        : Promise.reject(failure())
    },
  }
}

const adminOf = (
  query: () => Promise<unknown>,
  transact: () => Promise<unknown>,
): InstantAdminClient => ({ query, transact, tx: {} })

const noWait = Schedule.recurs(3)

describe('the Instant admin adapter', () => {
  it('knows Instant rate limits by status, type, or wording', () => {
    expect(isRateLimited(rateLimited())).toBe(true)
    expect(
      isRateLimited(new Error('Your request exceeded the rate limit.')),
    ).toBe(true)
    expect(isRateLimited(refused())).toBe(false)
    expect(isRateLimited(new Error('fetch failed'))).toBe(false)
  })

  it('tries a rate-limited read again until it is answered', async () => {
    const read = failingFirst([rateLimited, rateLimited], {
      instantToolsIssues: [],
    })
    const database = adminAsInstantToolsDatabase(
      adminOf(read.request, () => Promise.resolve({})),
      noWait,
    )

    const response = await database.queryOnce({ instantToolsIssues: {} })

    expect(response.data).toEqual({ instantToolsIssues: [] })
    expect(read.attempts()).toBe(3)
  })

  it('tries a rate-limited write again until it lands', async () => {
    const write = failingFirst([rateLimited], { 'tx-id': 7 })
    const database = adminAsInstantToolsDatabase(
      adminOf(() => Promise.resolve({}), write.request),
      noWait,
    )

    await expect(database.transact([])).resolves.toEqual({ 'tx-id': 7 })
    expect(write.attempts()).toBe(2)
  })

  it('never tries again a request Instant refused for another reason', async () => {
    const read = failingFirst([refused], {})
    const database = adminAsInstantToolsDatabase(
      adminOf(read.request, () => Promise.resolve({})),
      noWait,
    )

    await expect(
      database.queryOnce({ instantToolsIssues: {} }),
    ).rejects.toMatchObject({ status: 400 })
    expect(read.attempts()).toBe(1)
  })

  it('gives up with the rate limit once its tries run out', async () => {
    const read = failingFirst(
      [rateLimited, rateLimited, rateLimited, rateLimited, rateLimited],
      {},
    )
    const database = adminAsInstantToolsDatabase(
      adminOf(read.request, () => Promise.resolve({})),
      noWait,
    )

    await expect(
      database.queryOnce({ instantToolsIssues: {} }),
    ).rejects.toMatchObject({ status: 429 })
    expect(read.attempts()).toBe(4)
  })
})
