import {
  Array,
  Cause,
  Effect,
  Option,
  Queue,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AssetAmount,
  AtomicUnits,
  BlockExplorerConfirmation,
  ReceivingInstruction,
  RejectedTransfer,
  TransactionHistoryPage,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  type TransferRequest,
  ValidatedRecipient,
  type ValidatedTransfer,
  ValidatedTransfer as ValidatedTransferSchema,
  WalletClientError,
  makeTransactionPayload,
  maximumTransactionHistoryPageSize,
} from 'wallet-core-example'

import { hex } from '@scure/base'
import { Address, OutScript, Transaction, selectUTXO } from '@scure/btc-signer'

import type { LiveNetworkAccount, LiveNetworkAdapter } from './adapter.js'
import type { BitcoinLiveNetwork } from './catalog.js'

/** Protected unsigned Bitcoin PSBT passed from networking to custody. */
export const BitcoinPreparedPayload = S.Struct({
  previewId: S.String,
  psbtHex: S.String,
})
/** Protected unsigned Bitcoin PSBT passed from networking to custody. */
export type BitcoinPreparedPayload = typeof BitcoinPreparedPayload.Type
/** JSON encoding for a protected unsigned Bitcoin PSBT. */
export const BitcoinPreparedPayloadJson = S.fromJsonString(
  BitcoinPreparedPayload,
)

/** Protected signed Bitcoin transaction returned by custody. */
export const BitcoinSignedPayload = S.Struct({
  previewId: S.String,
  rawTransactionHex: S.String,
})
/** Protected signed Bitcoin transaction returned by custody. */
export type BitcoinSignedPayload = typeof BitcoinSignedPayload.Type
/** JSON encoding for a protected signed Bitcoin transaction. */
export const BitcoinSignedPayloadJson = S.fromJsonString(BitcoinSignedPayload)

const EsploraStatus = S.Struct({
  confirmed: S.Boolean,
  block_time: S.optional(S.Number),
})

const EsploraUtxo = S.Struct({
  txid: S.String,
  vout: S.Number,
  value: S.Number,
  status: EsploraStatus,
})

const EsploraPreviousOutput = S.Struct({
  scriptpubkey_address: S.optional(S.String),
  value: S.Number,
})

const EsploraInput = S.Struct({
  prevout: S.NullOr(EsploraPreviousOutput),
})

const EsploraOutput = S.Struct({
  scriptpubkey_address: S.optional(S.String),
  value: S.Number,
})

const EsploraTransaction = S.Struct({
  txid: S.String,
  vin: S.Array(EsploraInput),
  vout: S.Array(EsploraOutput),
  status: EsploraStatus,
})

const EsploraFees = S.Struct({
  fastestFee: S.Number,
  halfHourFee: S.Number,
  hourFee: S.Number,
  economyFee: S.Number,
  minimumFee: S.Number,
})

const EsploraWebSocketEnvelope = S.Struct({
  'address-transactions': S.optional(S.Array(EsploraTransaction)),
  'block-transactions': S.optional(S.Array(EsploraTransaction)),
})

type BitcoinNetwork = ReturnType<typeof networkForConfiguration>
type BitcoinInput = Parameters<typeof selectUTXO>[0][number]

const quoteLifetimeMilliseconds = 60_000

const unavailable = () => new WalletClientError({ code: 'Unavailable' })
const invalidResponse = () => new WalletClientError({ code: 'InvalidResponse' })
const rejected = () => new WalletClientError({ code: 'Rejected' })
const unsupported = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })

const networkForConfiguration = (configuration: BitcoinLiveNetwork) => ({
  bech32: configuration.bech32,
  pubKeyHash: configuration.pubKeyHash,
  scriptHash: configuration.scriptHash,
  wif: configuration.wif,
})

const assetAmount = (
  configuration: BitcoinLiveNetwork,
  atomicUnits: bigint,
  observedAt: number,
): AssetAmount =>
  AssetAmount.make({
    assetId: configuration.asset.assetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const requestJson = async <A>(
  schema: S.ConstraintDecoder<A>,
  url: string,
): Promise<A> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Bitcoin API request failed')
  }
  return S.decodeUnknownSync(schema)(await response.json())
}

const normalizedAddress = (
  network: BitcoinNetwork,
  address: string,
): string => {
  const decodedAddress = Address(network).decode(address)
  if (decodedAddress === undefined) {
    throw new Error('Unsupported Bitcoin address')
  }
  return Address(network).encode(decodedAddress)
}

const outputScript = (network: BitcoinNetwork, address: string): Uint8Array => {
  const decodedAddress = Address(network).decode(address)
  if (decodedAddress === undefined) {
    throw new Error('Unsupported Bitcoin address')
  }
  return OutScript.encode(decodedAddress)
}

const bitcoinInputs = (
  network: BitcoinNetwork,
  address: string,
  utxos: ReadonlyArray<typeof EsploraUtxo.Type>,
): Array<BitcoinInput> => {
  const script = outputScript(network, address)
  return Array.map(utxos, utxo => ({
    txid: hex.decode(utxo.txid),
    index: utxo.vout,
    witnessUtxo: {
      amount: BigInt(utxo.value),
      script,
    },
  }))
}

const selectedTransaction = async (
  configuration: BitcoinLiveNetwork,
  account: LiveNetworkAccount,
  destinationAddress: string,
  atomicUnits: bigint,
) => {
  const network = networkForConfiguration(configuration)
  const sourceAddress = normalizedAddress(network, account.account.address)
  const destination = normalizedAddress(network, destinationAddress)
  const [utxos, fees] = await Promise.all([
    requestJson(
      S.Array(EsploraUtxo),
      `${configuration.apiUrl}/address/${sourceAddress}/utxo`,
    ),
    requestJson(EsploraFees, `${configuration.apiUrl}/v1/fees/recommended`),
  ])
  const balance = Array.reduce(
    utxos,
    0n,
    (total, utxo) => total + BigInt(utxo.value),
  )
  const selection = selectUTXO(
    bitcoinInputs(network, sourceAddress, utxos),
    [{ address: destination, amount: atomicUnits }],
    'default',
    {
      feePerByte: BigInt(Math.ceil(fees.halfHourFee)),
      changeAddress: sourceAddress,
      bip69: true,
      createTx: true,
      network,
    },
  )
  if (
    selection === undefined ||
    selection.fee === undefined ||
    selection.tx === undefined
  ) {
    throw rejected()
  }
  return { balance, fee: selection.fee, transaction: selection.tx }
}

const transactionRecord = (
  configuration: BitcoinLiveNetwork,
  account: LiveNetworkAccount,
  transaction: typeof EsploraTransaction.Type,
): Option.Option<TransactionRecord> => {
  const network = networkForConfiguration(configuration)
  const accountAddress = normalizedAddress(network, account.account.address)
  const isAccountAddress = (address: string): boolean => {
    try {
      return normalizedAddress(network, address) === accountAddress
    } catch {
      return false
    }
  }
  const isOutgoing = Array.some(
    transaction.vin,
    input =>
      input.prevout !== null &&
      input.prevout.scriptpubkey_address !== undefined &&
      isAccountAddress(input.prevout.scriptpubkey_address),
  )
  const accountOutputs = Array.filter(
    transaction.vout,
    output =>
      output.scriptpubkey_address !== undefined &&
      isAccountAddress(output.scriptpubkey_address),
  )
  const externalOutputs = Array.filter(
    transaction.vout,
    output =>
      output.scriptpubkey_address !== undefined &&
      !isAccountAddress(output.scriptpubkey_address),
  )
  const atomicUnits = Array.reduce(
    isOutgoing ? externalOutputs : accountOutputs,
    0n,
    (total, output) => total + BigInt(output.value),
  )
  if (atomicUnits <= 0n) {
    return Option.none()
  }
  const maybeCounterpartyAddress: Option.Option<string> = isOutgoing
    ? Option.flatMap(
        Array.findFirst(
          externalOutputs,
          output => output.scriptpubkey_address !== undefined,
        ),
        output => Option.fromNullishOr(output.scriptpubkey_address),
      )
    : Option.flatMap(
        Array.findFirst(
          transaction.vin,
          input => input.prevout?.scriptpubkey_address !== undefined,
        ),
        input => Option.fromNullishOr(input.prevout?.scriptpubkey_address),
      )
  const counterpartyAddress = Option.match(maybeCounterpartyAddress, {
    onNone: () => accountAddress,
    onSome: counterparty => counterparty,
  })
  const observedAt =
    transaction.status.block_time === undefined
      ? Date.now()
      : transaction.status.block_time * 1_000
  return Option.some(
    TransactionRecord.make({
      recordId: `${transaction.txid}:${account.account.accountId}:btc`,
      transactionId: transaction.txid,
      accountId: account.account.accountId,
      networkId: configuration.network.networkId,
      direction: isOutgoing ? 'Outgoing' : 'Incoming',
      status: transaction.status.confirmed ? 'Confirmed' : 'Pending',
      amount: assetAmount(configuration, atomicUnits, observedAt),
      counterpartyAddress,
      normalizedCounterpartyAddress: counterpartyAddress.toLowerCase(),
      observedAt,
    }),
  )
}

const validateRequest = (
  configuration: BitcoinLiveNetwork,
  account: LiveNetworkAccount,
  request: TransferRequest,
): Effect.Effect<
  ValidatedTransfer | typeof RejectedTransfer.Type,
  WalletClientError
> => {
  if (
    request.accountId !== account.account.accountId ||
    request.assetId !== configuration.asset.assetId
  ) {
    return Effect.fail(invalidResponse())
  }
  try {
    const network = networkForConfiguration(configuration)
    const destination = normalizedAddress(network, request.destinationAddress)
    return Effect.succeed(
      ValidatedTransferSchema.make({
        request,
        recipient: ValidatedRecipient.make({
          networkId: configuration.network.networkId,
          address: destination,
          normalizedAddress: destination.toLowerCase(),
          displayAddress: destination,
        }),
      }),
    )
  } catch {
    return Effect.succeed(
      RejectedTransfer.make({
        request,
        guidance: TransferGuidance.make({
          summary: 'Enter a valid Bitcoin address for this network.',
          details: [
            `The address must belong to ${configuration.network.displayName}.`,
          ],
        }),
      }),
    )
  }
}

/** Builds one real Bitcoin network adapter. */
export const makeBitcoinLiveAdapter = (
  configuration: BitcoinLiveNetwork,
): LiveNetworkAdapter => ({
  configuration,
  loadBalance: account =>
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const address = normalizedAddress(
          networkForConfiguration(configuration),
          account.account.address,
        )
        const utxos = await requestJson(
          S.Array(EsploraUtxo),
          `${configuration.apiUrl}/address/${address}/utxo`,
        )
        const balance = Array.reduce(
          utxos,
          0n,
          (total, utxo) => total + BigInt(utxo.value),
        )
        return AccountBalance.make({
          accountId: account.account.accountId,
          amount: assetAmount(configuration, balance, observedAt),
        })
      },
      catch: unavailable,
    }),
  receivingInstruction: account =>
    ReceivingInstruction.make({
      accountId: account.account.accountId,
      assetId: configuration.asset.assetId,
      destinationAddress: account.account.address,
      maybeMemo: Option.none(),
      portableUri: `bitcoin:${account.account.address}`,
    }),
  validateTransfer: (account, request) =>
    validateRequest(configuration, account, request),
  previewTransfer: (account, transfer) =>
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const { balance, fee } = await selectedTransaction(
          configuration,
          account,
          transfer.recipient.address,
          BigInt(transfer.request.atomicUnits),
        )
        const resultingBalance =
          balance - BigInt(transfer.request.atomicUnits) - fee
        if (resultingBalance < 0n) {
          throw rejected()
        }
        return TransactionQuote.make({
          quoteId: `${transfer.request.transferId}:${observedAt.toString()}`,
          estimatedFee: assetAmount(configuration, fee, observedAt),
          resultingBalance: assetAmount(
            configuration,
            resultingBalance,
            observedAt,
          ),
          expiresAt: observedAt + quoteLifetimeMilliseconds,
        })
      },
      catch: error =>
        error instanceof WalletClientError ? error : unavailable(),
    }),
  buildTransferPayload: (account, preview) => {
    if (preview.expiresAt < Date.now()) {
      return Effect.fail(rejected())
    }
    return Effect.tryPromise({
      try: async () => {
        const { transaction } = await selectedTransaction(
          configuration,
          account,
          preview.transfer.recipient.address,
          BigInt(preview.transfer.request.atomicUnits),
        )
        const payload = BitcoinPreparedPayload.make({
          previewId: preview.previewId,
          psbtHex: hex.encode(transaction.toPSBT()),
        })
        return makeTransactionPayload(
          account.account.accountId,
          configuration.network.networkId,
          S.encodeSync(BitcoinPreparedPayloadJson)(payload),
        )
      },
      catch: error =>
        error instanceof WalletClientError ? error : unavailable(),
    })
  },
  submitTransaction: (account, transaction) => {
    if (
      transaction.accountId !== account.account.accountId ||
      transaction.networkId !== configuration.network.networkId
    ) {
      return Effect.fail(invalidResponse())
    }
    return S.decodeUnknownEffect(BitcoinSignedPayloadJson)(
      Redacted.value(transaction.payload),
    ).pipe(
      Effect.mapError(invalidResponse),
      Effect.flatMap(payload =>
        Effect.tryPromise({
          try: async () => {
            const parsedTransaction = Transaction.fromRaw(
              hex.decode(payload.rawTransactionHex),
            )
            const response = await fetch(`${configuration.apiUrl}/tx`, {
              method: 'POST',
              headers: { 'content-type': 'text/plain' },
              body: payload.rawTransactionHex,
            })
            if (!response.ok) {
              throw new Error('Bitcoin transaction submission failed')
            }
            const transactionId = (await response.text()).trim()
            if (transactionId !== parsedTransaction.id) {
              throw new Error('Bitcoin transaction identifier mismatch')
            }
            return TransactionSubmission.make({
              previewId: payload.previewId,
              transactionId,
              submittedAt: Date.now(),
              maybeExplorerConfirmation: Option.some(
                BlockExplorerConfirmation.make({
                  label: configuration.network.displayName,
                  transactionId,
                  url: `${configuration.explorerTransactionBaseUrl}${transactionId}`,
                }),
              ),
            })
          },
          catch: unavailable,
        }),
      ),
    )
  },
  loadTransactionHistory: (account, query) => {
    if (
      query.accountId !== account.account.accountId ||
      query.networkId !== configuration.network.networkId ||
      query.limit <= 0 ||
      query.limit > maximumTransactionHistoryPageSize
    ) {
      return Effect.fail(invalidResponse())
    }
    const cursorPath = Option.match(query.maybeCursor, {
      onNone: () => '',
      onSome: cursor => `/chain/${encodeURIComponent(cursor)}`,
    })
    return Effect.tryPromise({
      try: async () => {
        const address = normalizedAddress(
          networkForConfiguration(configuration),
          account.account.address,
        )
        const transactions = await requestJson(
          S.Array(EsploraTransaction),
          `${configuration.apiUrl}/address/${address}/txs${cursorPath}`,
        )
        const returnedTransactions = Array.take(transactions, query.limit)
        const records = Array.getSomes(
          Array.map(returnedTransactions, transaction =>
            transactionRecord(configuration, account, transaction),
          ),
        )
        const maybeLastTransaction = Array.last(returnedTransactions)
        const maybeNextCursor =
          Option.isNone(maybeLastTransaction) ||
          !maybeLastTransaction.value.status.confirmed
            ? Option.none()
            : Option.some(maybeLastTransaction.value.txid)
        return TransactionHistoryPage.make({ records, maybeNextCursor })
      },
      catch: unavailable,
    })
  },
  observeTransactions: account =>
    Stream.callback<typeof TransactionRecord.Type, WalletClientError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const socket = new WebSocket(configuration.webSocketUrl)
          socket.addEventListener('open', () => {
            socket.send(
              JSON.stringify({ 'track-address': account.account.address }),
            )
          })
          socket.addEventListener('message', event => {
            try {
              const envelope = S.decodeUnknownSync(EsploraWebSocketEnvelope)(
                JSON.parse(String(event.data)),
              )
              const transactions = [
                ...(envelope['address-transactions'] ?? []),
                ...(envelope['block-transactions'] ?? []),
              ]
              Array.forEach(transactions, transaction => {
                const maybeRecord = transactionRecord(
                  configuration,
                  account,
                  transaction,
                )
                if (Option.isSome(maybeRecord)) {
                  Queue.offerUnsafe(queue, maybeRecord.value)
                }
              })
            } catch {
              Queue.failCauseUnsafe(queue, Cause.fail(invalidResponse()))
            }
          })
          socket.addEventListener('error', () => {
            Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
          })
          socket.addEventListener('close', () => {
            Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
          })
          return socket
        }),
        socket => Effect.sync(() => socket.close()),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  requestTestFunding: () => Effect.fail(unsupported()),
})
