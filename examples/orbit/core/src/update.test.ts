import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  AskDanger,
  BroadcastDanger,
  ChainSendDanger,
  KeyExfilDanger,
  LiveWalletDanger,
  WALLET_TAGS,
  emptyModel,
  init,
  liveWalletIsRepresentable,
  playOf,
  restore,
  runIndex,
  update,
} from './index.js'

describe('runIndex', () => {
  test('passes the 16 steps with tortoise 1000 and achilles 428', () => {
    const { model, receipt } = runIndex(emptyModel())

    expect(receipt.ok).toBe(true)
    expect(receipt.results).toHaveLength(16)
    expect(receipt.results.every(step => step.ok)).toBe(true)
    expect(playOf(model.sims.tortoise)).toBe(1000)
    expect(playOf(model.sims.achilles)).toBe(428)
    expect(receipt.liveWallets).toBe(0)
    expect(model.seq).toBeGreaterThanOrEqual(7)
    expect(receipt.seq).toBeGreaterThanOrEqual(7)
  })

  test('init restores through runIndex and restore preserves the Model', () => {
    const [model, commands] = init()
    expect(playOf(model.sims.tortoise)).toBe(1000)
    expect(playOf(model.sims.achilles)).toBe(428)
    expect(commands.length).toBe(1)
    expect(restore(model)).toStrictEqual([model, []])
  })
})

describe('AskDanger', () => {
  test('always refuses', () => {
    const model = emptyModel()
    const dangers = [
      LiveWalletDanger.make({}),
      BroadcastDanger.make({}),
      ChainSendDanger.make({}),
      KeyExfilDanger.make({}),
    ]
    for (const danger of dangers) {
      const [next] = update(model, AskDanger.make({ danger }))
      expect(Option.isSome(next.lastOutcome)).toBe(true)
      if (Option.isSome(next.lastOutcome)) {
        expect(next.lastOutcome.value._tag).toBe('refuse')
      }
    }
  })
})

describe('Wallet ADT', () => {
  test('cannot construct a live wallet', () => {
    expect(liveWalletIsRepresentable).toBe(false)
    expect(WALLET_TAGS).toEqual(['absent', 'sim'])
    expect((WALLET_TAGS as ReadonlyArray<string>).includes('live')).toBe(false)
  })
})
