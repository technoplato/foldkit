import { Effect, Layer, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AccountBalance,
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
  ReceivingInstruction,
  SignatureProof,
  TestFundingReceipt,
  TransactionHistoryPage,
  TransactionQuote,
  TransferRequest,
  UnavailableTestFundingMethod,
  ValidatedRecipient,
  ValidatedTransfer,
  WalletAccount,
  type WalletCapability,
  WalletClient,
  WalletSigner,
  makeSignedTransaction,
  makeTransactionPayload,
} from 'wallet-core-example'

import { capabilityForNetwork } from './capability.js'
import {
  type ChainCustodyService,
  type ChainTransportService,
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'
import {
  WalletNetworkServicesLive,
  WalletSignerLive,
} from './walletServices.js'

const makeTransport = (
  chainId: string,
  networkId: string,
  assetId: string,
  accountId: string,
  capabilities: ReadonlyArray<WalletCapability>,
): ChainTransportService => {
  const chain = ChainDescriptor.make({ chainId, displayName: chainId })
  const network = NetworkDescriptor.make({
    networkId,
    chainId,
    displayName: networkId,
    environment: 'Testnet',
    capabilities,
    testFundingMethod: capabilities.includes('TestFunding')
      ? AdapterTestFundingMethod.make({})
      : UnavailableTestFundingMethod.make({}),
  })
  const asset = AssetDescriptor.make({
    assetId,
    networkId,
    displayName: assetId,
    symbol: assetId,
    decimalPlaces: 9,
    kind: NativeAsset.make({}),
  })
  const account = WalletAccount.make({
    accountId,
    chainId,
    networkId,
    address: `${accountId}-address`,
    displayName: accountId,
  })
  const amount = AssetAmount.make({
    assetId,
    atomicUnits: '1000',
    observedAt: 1,
  })
  return {
    chain,
    network,
    assets: [asset],
    account,
    loadPortfolio: Effect.succeed({
      chain,
      network,
      assets: [asset],
      account,
      observedAt: 1,
      balances: [AccountBalance.make({ accountId, amount })],
      receivingInstructions: [
        ReceivingInstruction.make({
          accountId,
          assetId,
          destinationAddress: account.address,
          maybeMemo: Option.none(),
          portableUri: `wallet:${account.address}`,
        }),
      ],
    }),
    validateTransfer: request =>
      Effect.succeed(
        ValidatedTransfer.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId,
            address: request.destinationAddress,
            normalizedAddress: request.destinationAddress,
            displayAddress: request.destinationAddress,
          }),
        }),
      ),
    previewTransfer: () =>
      Effect.succeed(
        TransactionQuote.make({
          quoteId: networkId,
          estimatedFee: { ...amount, atomicUnits: '1' },
          resultingBalance: { ...amount, atomicUnits: '999' },
          expiresAt: 10,
        }),
      ),
    buildTransferPayload: preview =>
      Effect.succeed(
        makeTransactionPayload(accountId, networkId, preview.previewId),
      ),
    submitTransaction: transaction =>
      Effect.succeed({
        previewId: transaction.payload.toString(),
        transactionId: networkId,
        submittedAt: 1,
        maybeExplorerConfirmation: Option.none(),
      }),
    requestTestFunding: request =>
      Effect.succeed(
        TestFundingReceipt.make({
          requestId: request.requestId,
          fundingId: `${networkId}-funding`,
          acceptedAt: 1,
          amount: { ...amount, atomicUnits: request.atomicUnits },
          maybeTransactionId: Option.some(`${networkId}-funding`),
        }),
      ),
    loadTransactionHistory: () =>
      Effect.succeed(
        TransactionHistoryPage.make({
          records: [],
          maybeNextCursor: Option.none(),
        }),
      ),
    observeTransactions: Stream.empty,
    verifySignatureProof: () => Effect.succeed(true),
  }
}

const ethereum = makeTransport(
  'ethereum',
  'ethereum:sepolia',
  'ethereum:sepolia:eth',
  'ethereum-account',
  ['Transfer', 'TransactionObservation'],
)
const solana = makeTransport(
  'solana',
  'solana:devnet',
  'solana:devnet:sol',
  'solana-account',
  ['Transfer', 'TransactionHistory', 'TransactionObservation'],
)
const NetworkTestLive = WalletNetworkServicesLive.pipe(
  Layer.provide(
    Layer.merge(
      Layer.succeed(EthereumSepoliaTransport, ethereum),
      Layer.succeed(SolanaDevnetTransport, solana),
    ),
  ),
)

const makeCustody = (
  accountId: string,
  networkId: string,
): ChainCustodyService => ({
  accountId,
  networkId,
  signTransaction: payload =>
    Effect.succeed(
      makeSignedTransaction(payload.accountId, payload.networkId, networkId),
    ),
  signChallenge: challenge =>
    Effect.succeed(
      SignatureProof.make({
        challengeId: challenge.challengeId,
        accountId: challenge.accountId,
        algorithm: 'test',
        publicIdentity: accountId,
        signature: networkId,
        encoding: 'text',
      }),
    ),
})
const SignerTestLive = WalletSignerLive.pipe(
  Layer.provide(
    Layer.merge(
      Layer.succeed(
        EthereumSepoliaCustody,
        makeCustody('ethereum-account', 'ethereum:sepolia'),
      ),
      Layer.succeed(
        SolanaDevnetCustody,
        makeCustody('solana-account', 'solana:devnet'),
      ),
    ),
  ),
)

describe('normalized Wallet service composition', () => {
  it('merges adapter catalogs into one normalized portfolio', async () => {
    const portfolio = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => client.loadPortfolio([])),
        Effect.provide(NetworkTestLive),
      ),
    )

    expect(portfolio.dataSource).toBe('Testnet')
    expect(portfolio.chains).toHaveLength(2)
    expect(portfolio.networks).toHaveLength(2)
    expect(portfolio.assets).toHaveLength(2)
  })

  it('routes a generic transfer by account and asset identifiers', async () => {
    const quote = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => {
          const request = TransferRequest.make({
            transferId: 'transfer-1',
            accountId: solana.account.accountId,
            assetId: 'solana:devnet:sol',
            destinationAddress: 'destination',
            atomicUnits: '1',
            maybeMessage: Option.none(),
          })
          return client.validateTransfer(request).pipe(
            Effect.flatMap(validation => {
              if (validation._tag === 'ValidatedTransfer') {
                return client.previewTransfer(validation)
              } else {
                return Effect.die('Expected a validated transfer')
              }
            }),
          )
        }),
        Effect.provide(NetworkTestLive),
      ),
    )

    expect(quote.quoteId).toBe('solana:devnet')
  })

  it('routes opaque payload signing by account and network identifiers', async () => {
    const signed = await Effect.runPromise(
      WalletSigner.pipe(
        Effect.flatMap(signer =>
          signer.signTransaction(
            makeTransactionPayload(
              'ethereum-account',
              'ethereum:sepolia',
              'payload',
            ),
          ),
        ),
        Effect.provide(SignerTestLive),
      ),
    )

    expect(signed.networkId).toBe('ethereum:sepolia')
  })

  it('checks advertised generic capabilities', () => {
    expect(capabilityForNetwork(solana.network, 'TransactionHistory')).toEqual({
      _tag: 'SupportedCapability',
    })
    expect(
      capabilityForNetwork(ethereum.network, 'TransactionHistory'),
    ).toEqual({
      _tag: 'UnsupportedCapability',
      capability: 'TransactionHistory',
    })
  })
})
