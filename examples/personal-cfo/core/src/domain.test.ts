import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Account,
  answerHash,
  demoAccounts,
  formatUsd,
  groundedReply,
  maybeFinding,
  netWorthCents,
  parseCents,
  parseEmail,
} from './domain.js'

describe('Personal CFO domain', () => {
  it('treats liabilities as negative net worth and keeps access read-only', () => {
    const accounts = demoAccounts('owner')
    expect(accounts.every(account => account.access === 'read_only')).toBe(true)
    expect(netWorthCents(accounts)).toBe(1_250_000 + 8_400_000 - 21_000_000)
    expect(formatUsd(netWorthCents(accounts))).toBe('-$113,500.00')
  })

  it('rejects a transfer-shaped access value at the schema boundary', () => {
    expect(() =>
      Account.make({
        id: 'x',
        name: 'Checking',
        institution: 'Bank',
        kind: 'cash',
        currency: 'USD',
        balanceCents: 1,
        access: 'read_write' as 'read_only',
      }),
    ).toThrow()
  })

  it('speaks on the first Radar tick and stays quiet when the hash is unchanged', () => {
    const accounts = demoAccounts('owner')
    const job = {
      id: 'radar-1',
      question: 'Did net worth move?',
      cadence: 'daily' as const,
      everyMinutes: 0,
      status: 'armed' as const,
      lastAnswer: '',
      lastAnswerHash: '',
    }
    const first = maybeFinding(job, accounts)
    expect(Option.isSome(first)).toBe(true)
    if (Option.isSome(first)) {
      expect(first.value.citations.length).toBeGreaterThan(0)
      expect(first.value.hash).toBe(answerHash(first.value.answer))
      const second = maybeFinding(
        { ...job, lastAnswerHash: first.value.hash },
        accounts,
      )
      expect(Option.isNone(second)).toBe(true)
    }
  })

  it('grounds chat in the ledger and refuses to call it advice', () => {
    const accounts = demoAccounts('owner')
    const reply = groundedReply('What is my net worth?', accounts)
    expect(reply.body).toContain('-$113,500.00')
    expect(reply.body).toContain('Not professional advice.')
    expect(reply.citationAccountIds).toEqual(
      accounts.map(account => account.id),
    )
  })

  it('parses email and integer cents', () => {
    expect(Option.getOrUndefined(parseEmail('  A@B.COM '))).toBe('a@b.com')
    expect(Option.isNone(parseEmail('not-an-email'))).toBe(true)
    expect(Option.getOrUndefined(parseCents('120000'))).toBe(120000)
    expect(Option.isNone(parseCents('12.00'))).toBe(true)
  })
})
