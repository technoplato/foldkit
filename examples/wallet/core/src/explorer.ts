import { Match as M, Schema as S } from 'effect'

import { Network } from './currency.js'

/** A block explorer capable of displaying a submitted Wallet transaction. */
export const BlockExplorer = S.Literals(['Etherscan', 'Solana Explorer'])
/** A block explorer capable of displaying a submitted Wallet transaction. */
export type BlockExplorer = typeof BlockExplorer.Type

/** Printable confirmation and URI for one submitted transaction. */
export const BlockExplorerConfirmation = S.Struct({
  network: Network,
  networkName: S.String,
  explorer: BlockExplorer,
  transactionId: S.String,
  transactionUri: S.String,
})
/** Printable confirmation and URI for one submitted transaction. */
export type BlockExplorerConfirmation = typeof BlockExplorerConfirmation.Type

/** Builds the canonical explorer confirmation for a submitted transaction. */
export const blockExplorerConfirmation = (
  network: Network,
  transactionId: string,
): BlockExplorerConfirmation =>
  M.value(network).pipe(
    M.withReturnType<BlockExplorerConfirmation>(),
    M.tagsExhaustive({
      EthereumSepolia: ethereumNetwork =>
        BlockExplorerConfirmation.make({
          network: ethereumNetwork,
          networkName: 'Ethereum Sepolia',
          explorer: 'Etherscan',
          transactionId,
          transactionUri: `https://sepolia.etherscan.io/tx/${transactionId}`,
        }),
      SolanaDevnet: solanaNetwork =>
        BlockExplorerConfirmation.make({
          network: solanaNetwork,
          networkName: 'Solana Devnet',
          explorer: 'Solana Explorer',
          transactionId,
          transactionUri: `https://explorer.solana.com/tx/${transactionId}?cluster=devnet`,
        }),
      SolanaTestnet: solanaNetwork =>
        BlockExplorerConfirmation.make({
          network: solanaNetwork,
          networkName: 'Solana Testnet',
          explorer: 'Solana Explorer',
          transactionId,
          transactionUri: `https://explorer.solana.com/tx/${transactionId}?cluster=testnet`,
        }),
    }),
  )
