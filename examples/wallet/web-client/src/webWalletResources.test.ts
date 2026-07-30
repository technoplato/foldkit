import { describe, expect, it } from 'vitest'

import { walletDataSourceFromEnvironment } from './webWalletResources.js'

describe('browser Wallet resource selection', () => {
  it('defaults to live networking and keeps fixtures explicit', () => {
    expect(walletDataSourceFromEnvironment(undefined)).toBe('Live')
    expect(walletDataSourceFromEnvironment('Live')).toBe('Live')
    expect(walletDataSourceFromEnvironment('Testnet')).toBe('Testnet')
    expect(walletDataSourceFromEnvironment('Fixture')).toBe('Fixture')
    expect(walletDataSourceFromEnvironment('unexpected')).toBe('Live')
  })
})
