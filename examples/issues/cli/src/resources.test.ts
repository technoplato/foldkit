import { Array, Effect, Result, Schedule } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantAPIError } from '@instantdb/admin'

import { UnavailableBuildJobs } from './builds.js'
import {
  type InstantAdminClient,
  adminAsInstantToolsDatabase,
  isRateLimited,
  scribeBuildJobsReader,
  scribeCredentialsOf,
  scribeMainEnvPath,
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

describe("Scribe's credentials for an Issue's build jobs", () => {
  const appId = 'scribe-app-0123456789'
  const adminToken = 'scribe-token-0123456789abcdef'

  it('takes them from the environment first', () => {
    expect(
      scribeCredentialsOf(
        {
          SCRIBE_MAIN_INSTANT_ADMIN_TOKEN: adminToken,
          SCRIBE_MAIN_INSTANT_APP_ID: appId,
        },
        Result.fail('no such file'),
      ),
    ).toEqual(Result.succeed({ adminToken, appId }))
  })

  it("reads scribe-main.env otherwise, and never the tracker's own variables", () => {
    const envFile = Array.join(
      [
        '# Scribe production',
        `SCRIBE_MAIN_INSTANT_APP_ID='${appId}'`,
        `export SCRIBE_MAIN_INSTANT_ADMIN_TOKEN="${adminToken}"`,
        'INSTANT_APP_ID=tracker-app',
      ],
      '\n',
    )

    expect(
      scribeCredentialsOf(
        { INSTANT_APP_ADMIN_TOKEN: 'tracker-token', INSTANT_APP_ID: 'tracker' },
        Result.succeed(envFile),
      ),
    ).toEqual(Result.succeed({ adminToken, appId }))
  })

  it('names what is missing and where it looked, never a value', () => {
    expect(
      scribeCredentialsOf(
        {},
        Result.succeed(`SCRIBE_MAIN_INSTANT_APP_ID=${appId}`),
      ),
    ).toEqual(
      Result.fail(
        `neither the environment nor ${scribeMainEnvPath} sets SCRIBE_MAIN_INSTANT_ADMIN_TOKEN`,
      ),
    )
    expect(scribeCredentialsOf({}, Result.fail('no such file'))).toEqual(
      Result.fail(
        `the environment does not set SCRIBE_MAIN_INSTANT_APP_ID and SCRIBE_MAIN_INSTANT_ADMIN_TOKEN, and ${scribeMainEnvPath} could not be read (no such file)`,
      ),
    )
  })

  it('answers that the builds are not shown, and why, without asking Scribe', async () => {
    const sent: Array<unknown> = []
    const read = scribeBuildJobsReader(
      Result.fail(
        `neither the environment nor ${scribeMainEnvPath} sets SCRIBE_MAIN_INSTANT_ADMIN_TOKEN`,
      ),
      () => query => {
        sent.push(query)
        return Promise.resolve({ buildJobs: [] })
      },
    )

    expect(await Effect.runPromise(read(1412))).toEqual(
      UnavailableBuildJobs.make({
        reason: `no Scribe Instant credentials: neither the environment nor ${scribeMainEnvPath} sets SCRIBE_MAIN_INSTANT_ADMIN_TOKEN.`,
      }),
    )
    expect(sent).toEqual([])
  })

  it('asks Scribe with the credentials it found', async () => {
    const askedWith: Array<unknown> = []
    const read = scribeBuildJobsReader(
      Result.succeed({ adminToken, appId }),
      credentials => () => {
        askedWith.push(credentials)
        return Promise.resolve({ buildJobs: [] })
      },
    )

    expect((await Effect.runPromise(read(1412)))._tag).toBe('FoundBuildJobs')
    expect(askedWith).toEqual([{ adminToken, appId }])
  })
})
