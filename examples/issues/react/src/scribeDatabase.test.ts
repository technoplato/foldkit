import { Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const signIns = vi.hoisted(() => ({
  answers: [] as Array<{ id: string } | null>,
  clients: 0,
}))

vi.mock('@instantdb/core', async importOriginal => ({
  ...(await importOriginal<object>()),
  init: () => {
    signIns.clients += 1
    return {
      subscribeQuery: () => () => undefined,
      transact: () => Promise.resolve(),
      tx: {},
    }
  },
}))

vi.mock('@foldkit/instant', async importOriginal => ({
  ...(await importOriginal<object>()),
  ensureHostedInstantSession: () =>
    Promise.resolve(signIns.answers.shift() ?? null),
}))

const { openedScribeDatabase } = await import('./scribeDatabase.js')

describe("Scribe's client on the issues site", () => {
  it('signs in again after a sign-in failed, with the one client it opened', async () => {
    signIns.answers = [null, { id: 'owner-user' }]
    const opening = openedScribeDatabase('scribe-app')

    const failed = await Effect.runPromiseExit(opening)
    const signedIn = await Effect.runPromiseExit(opening)

    expect(Exit.isFailure(failed)).toBe(true)
    expect(Exit.isSuccess(signedIn)).toBe(true)
    expect(signIns.clients).toBe(1)
  })
})
