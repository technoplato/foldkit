import { describe, expect, it } from 'vitest'

import { walletDataSourceFromEnvironment } from './webWalletResources.js'

describe('browser Wallet resource selection', () => {
  it('defaults to fixtures and requires an explicit Testnet selection', () => {
    expect(walletDataSourceFromEnvironment(undefined)).toBe('Fixture')
    expect(walletDataSourceFromEnvironment('Testnet')).toBe('Testnet')
    expect(walletDataSourceFromEnvironment('Fixture')).toBe('Fixture')
    expect(walletDataSourceFromEnvironment('unexpected')).toBe('Fixture')
  })
})
