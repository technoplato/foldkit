import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Currency,
  CurrencyValue,
  Eth,
  EthereumSepolia,
  EthereumSepoliaEthValue,
  Fiat,
  Sol,
  SolanaDevnet,
  SolanaTestnet,
  Usdc,
  maybeNetworkForCurrency,
} from './currency.js'
import {
  AddressBookEntry,
  EthereumSepoliaEthTransferDraft,
  EthereumSignatureProof,
  FirstTransactionWithRecipient,
  InvalidTransferRecipient,
  PreviouslyTransactedWithRecipient,
  SignatureProof,
  SolanaEd25519SignatureProof,
  TransactionRecord,
  ValidTransferRecipient,
  familiarityForAddress,
  recipientHistoryForDraft,
  transferDraftFromInput,
  transferRecipientFromInput,
} from './model.js'

const observedAt = 1_722_000_000_000
const ethereum = EthereumSepolia.make({})
const solanaDevnet = SolanaDevnet.make({})
const solanaTestnet = SolanaTestnet.make({})
const eth = Eth.make({ network: ethereum })
const sol = Sol.make({ network: solanaDevnet })
const usdc = Usdc.make({
  network: solanaTestnet,
  tokenAddress: 'USDC-token',
})
const usd = Fiat.make({ code: 'USD', decimalPlaces: 2 })

const ethValue = EthereumSepoliaEthValue.make({
  currency: eth,
  atomicUnits: '1000000000000000000',
  decimalPlaces: 18,
  observedAt,
})

const draft = EthereumSepoliaEthTransferDraft.make({
  transferId: 'transfer-1',
  accountId: 'ethereum-account',
  network: ethereum,
  destinationAddress: '0xRecipient',
  value: ethValue,
  maybeMessage: Option.some('Dinner'),
})

const outgoingTransaction = TransactionRecord.make({
  transactionId: 'transaction-1',
  accountId: 'ethereum-account',
  network: ethereum,
  direction: 'Outgoing',
  status: 'Confirmed',
  value: ethValue,
  counterpartyAddress: '0xrecipient',
  observedAt: observedAt - 100,
})

describe('Wallet currency schemas', () => {
  it('decodes the supported network and currency union cases', () => {
    expect(S.decodeUnknownSync(Currency)(eth)).toStrictEqual(eth)
    expect(S.decodeUnknownSync(Currency)(sol)).toStrictEqual(sol)
    expect(S.decodeUnknownSync(Currency)(usdc)).toStrictEqual(usdc)
    expect(S.decodeUnknownSync(Currency)(usd)).toStrictEqual(usd)
  })

  it('rejects invalid fiat codes and decimal precision', () => {
    expect(() =>
      S.decodeUnknownSync(Fiat)({
        _tag: 'Fiat',
        code: 'usd',
        decimalPlaces: 2,
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(CurrencyValue)({
        currency: usd,
        atomicUnits: '100',
        decimalPlaces: 31,
        observedAt,
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(CurrencyValue)({
        currency: usd,
        atomicUnits: '1.5',
        decimalPlaces: 2,
        observedAt,
      }),
    ).toThrow()
  })

  it('keeps exact atomic units, precision, and observation time together', () => {
    const value = CurrencyValue.make({
      currency: usd,
      atomicUnits: '12345',
      decimalPlaces: 2,
      observedAt,
    })

    expect(S.decodeUnknownSync(CurrencyValue)(value)).toStrictEqual(value)
  })

  it('exposes a network only for chain currencies', () => {
    expect(maybeNetworkForCurrency(eth)).toStrictEqual(Option.some(ethereum))
    expect(maybeNetworkForCurrency(sol)).toStrictEqual(
      Option.some(solanaDevnet),
    )
    expect(maybeNetworkForCurrency(usdc)).toStrictEqual(
      Option.some(solanaTestnet),
    )
    expect(maybeNetworkForCurrency(usd)).toStrictEqual(Option.none())
  })

  it('constructs only transfer drafts whose asset and Layer agree', () => {
    const validDraft = transferDraftFromInput({
      transferId: 'valid-transfer',
      accountId: 'ethereum-account',
      network: ethereum,
      destinationAddress: '0xRecipient',
      value: ethValue,
      maybeMessage: Option.none(),
    })
    const mismatchedDraft = transferDraftFromInput({
      transferId: 'mismatched-transfer',
      accountId: 'solana-account',
      network: solanaDevnet,
      destinationAddress: 'SolanaRecipient',
      value: ethValue,
      maybeMessage: Option.none(),
    })

    expect(Option.map(validDraft, value => value._tag)).toStrictEqual(
      Option.some('EthereumSepoliaEthTransferDraft'),
    )
    expect(Option.isNone(mismatchedDraft)).toBe(true)
  })
})

describe('Wallet public identity and signing schemas', () => {
  it('distinguishes valid Ethereum recipients from 32-byte values', () => {
    const address = '0x2222222222222222222222222222222222222222'
    const nonAddress =
      '0x1111111111111111111111111111111111111111111111111111111111111111'

    expect(transferRecipientFromInput(address)).toStrictEqual(
      ValidTransferRecipient.make({ address }),
    )
    expect(transferRecipientFromInput(nonAddress)).toStrictEqual(
      InvalidTransferRecipient.make({
        input: nonAddress,
        reason: 'ExpectedEthereumAddress',
      }),
    )
  })

  it('matches Ethereum addresses case-insensitively', () => {
    const entry = AddressBookEntry.make({
      entryId: 'entry-1',
      network: ethereum,
      address: '0xRECIPIENT',
      displayName: 'Restaurant',
    })

    expect(
      familiarityForAddress([entry], ethereum, '0xrecipient'),
    ).toMatchObject({ _tag: 'FamiliarAddress', entry })
  })

  it('matches Solana addresses exactly', () => {
    const entry = AddressBookEntry.make({
      entryId: 'entry-1',
      network: solanaDevnet,
      address: 'ExactPublicKey',
      displayName: 'Friend',
    })

    expect(
      familiarityForAddress([entry], solanaDevnet, 'exactpublickey'),
    ).toStrictEqual({ _tag: 'UnfamiliarAddress' })
  })

  it('derives prior-recipient history from outgoing public observations', () => {
    expect(recipientHistoryForDraft([], draft)).toStrictEqual(
      FirstTransactionWithRecipient.make({}),
    )
    expect(
      recipientHistoryForDraft(
        [
          outgoingTransaction,
          TransactionRecord.make({
            ...outgoingTransaction,
            transactionId: 'transaction-2',
            observedAt,
          }),
          TransactionRecord.make({
            ...outgoingTransaction,
            transactionId: 'transaction-3',
            direction: 'Incoming',
          }),
        ],
        draft,
      ),
    ).toStrictEqual(
      PreviouslyTransactedWithRecipient.make({
        transactionCount: 2,
        mostRecentObservedAt: observedAt,
      }),
    )
  })

  it('decodes Ethereum and Solana public signature proofs', () => {
    const ethereumProof = EthereumSignatureProof.make({
      challengeId: 'challenge-1',
      accountId: 'ethereum-account',
      address: '0xAccount',
      signatureHex: '0xSignature',
    })
    const solanaProof = SolanaEd25519SignatureProof.make({
      challengeId: 'challenge-2',
      accountId: 'solana-account',
      publicKey: 'PublicKey',
      signatureBase58: 'Base58Signature',
    })

    expect(S.decodeUnknownSync(SignatureProof)(ethereumProof)).toStrictEqual(
      ethereumProof,
    )
    expect(S.decodeUnknownSync(SignatureProof)(solanaProof)).toStrictEqual(
      solanaProof,
    )
  })
})
