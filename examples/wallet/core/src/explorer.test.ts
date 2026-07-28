import { describe, expect, it } from 'vitest'

import { EthereumSepolia, SolanaDevnet, SolanaTestnet } from './currency.js'
import { blockExplorerConfirmation } from './explorer.js'

describe('Wallet block explorer confirmation', () => {
  it('builds the Sepolia Etherscan transaction URI', () => {
    expect(
      blockExplorerConfirmation(EthereumSepolia.make({}), '0xtransaction'),
    ).toMatchObject({
      explorer: 'Etherscan',
      networkName: 'Ethereum Sepolia',
      transactionUri: 'https://sepolia.etherscan.io/tx/0xtransaction',
    })
  })

  it('builds cluster-specific Solana Explorer transaction URIs', () => {
    expect(
      blockExplorerConfirmation(SolanaDevnet.make({}), 'signature')
        .transactionUri,
    ).toBe('https://explorer.solana.com/tx/signature?cluster=devnet')
    expect(
      blockExplorerConfirmation(SolanaTestnet.make({}), 'signature')
        .transactionUri,
    ).toBe('https://explorer.solana.com/tx/signature?cluster=testnet')
  })
})
