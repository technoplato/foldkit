import { describe, expect, it } from 'vitest'

import { WalletProgram } from './program.js'

describe('WalletProgram', () => {
  it('exposes one renderer- and chain-neutral Program', () => {
    expect(WalletProgram.id).toBe('wallet')
    expect(WalletProgram.version).toBe(5)
  })
})
