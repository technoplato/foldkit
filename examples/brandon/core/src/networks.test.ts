import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { brandonWalletConnectOrigins, brandonWalletNetworks } from './wallet.js'

const solanaMainnet = Array.findFirst(
  brandonWalletNetworks,
  configuration => configuration.network.networkId === 'solana:mainnet-beta',
)

describe("Brandon dot's networks", () => {
  it('read Solana Mainnet through an RPC that answers a browser', () => {
    expect(
      Option.map(solanaMainnet, configuration =>
        configuration._tag === 'SolanaLiveNetwork'
          ? [configuration.httpRpcUrl, configuration.webSocketRpcUrl]
          : [],
      ),
    ).toEqual(
      Option.some([
        'https://solana-rpc.publicnode.com',
        'wss://solana-rpc.publicnode.com',
      ]),
    )
  })

  it('never send the page to the Solana Foundation mainnet RPC, which refuses every browser', () => {
    expect(brandonWalletConnectOrigins).not.toContain(
      'https://api.mainnet-beta.solana.com',
    )
    expect(brandonWalletConnectOrigins).toContain(
      'wss://solana-rpc.publicnode.com',
    )
  })
})
