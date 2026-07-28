import { Match as M, Option, Schema as S } from 'effect'

/** A supported ISO 4217-style fiat currency code. */
export const FiatCurrencyCode = S.Literals([
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VES',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XCD',
  'XOF',
  'XPF',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL',
])
/** A three-letter, uppercase ISO-style fiat currency code. */
export type FiatCurrencyCode = typeof FiatCurrencyCode.Type

/** The number of decimal places used to render an exact currency value. */
export const CurrencyDecimalPlaces = S.Literals([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30,
])
/** The number of decimal places used to render an exact currency value. */
export type CurrencyDecimalPlaces = typeof CurrencyDecimalPlaces.Type

/** Ethereum's Sepolia test network. */
export const EthereumSepolia = S.TaggedStruct('EthereumSepolia', {})
/** Solana's development network. */
export const SolanaDevnet = S.TaggedStruct('SolanaDevnet', {})
/** Solana's public test network. */
export const SolanaTestnet = S.TaggedStruct('SolanaTestnet', {})

/** A Solana network supported by the Wallet Program. */
export const SolanaNetwork = S.Union([SolanaDevnet, SolanaTestnet])
/** A Solana network supported by the Wallet Program. */
export type SolanaNetwork = typeof SolanaNetwork.Type

/** A chain and test network supported by the Wallet Program. */
export const Network = S.Union([EthereumSepolia, SolanaDevnet, SolanaTestnet])
/** A chain and test network supported by the Wallet Program. */
export type Network = typeof Network.Type

/** Native Ether on Ethereum Sepolia. */
export const Eth = S.TaggedStruct('Eth', { network: EthereumSepolia })
/** Native SOL on a selected Solana test network. */
export const Sol = S.TaggedStruct('Sol', { network: SolanaNetwork })
/** Native SOL on the executable Solana Devnet Layer. */
export const SolanaDevnetSol = S.TaggedStruct('Sol', {
  network: SolanaDevnet,
})
/** USDC on a supported network. */
export const Usdc = S.TaggedStruct('Usdc', {
  network: Network,
  tokenAddress: S.String,
})
/** USDC on the executable Ethereum Sepolia Layer. */
export const EthereumSepoliaUsdc = S.TaggedStruct('Usdc', {
  network: EthereumSepolia,
  tokenAddress: S.String,
})
/** USDC on the executable Solana Devnet Layer. */
export const SolanaDevnetUsdc = S.TaggedStruct('Usdc', {
  network: SolanaDevnet,
  tokenAddress: S.String,
})
/** A fiat currency used to value public wallet balances. */
export const Fiat = S.TaggedStruct('Fiat', {
  code: FiatCurrencyCode,
  decimalPlaces: CurrencyDecimalPlaces,
})

/** A currency supported by the Wallet Program. */
export const Currency = S.Union([Eth, Sol, Usdc, Fiat])
/** A currency supported by the Wallet Program. */
export type Currency = typeof Currency.Type

/** An exact signed integer encoded in portable decimal notation. */
export const AtomicUnits = S.TemplateLiteral([S.BigInt])
/** An exact signed integer encoded in portable decimal notation. */
export type AtomicUnits = typeof AtomicUnits.Type

/** An exact integer quantity expressed in a currency's atomic units. */
export const CurrencyValue = S.Struct({
  currency: Currency,
  atomicUnits: AtomicUnits,
  decimalPlaces: CurrencyDecimalPlaces,
  observedAt: S.Number,
})
/** An exact integer quantity expressed in a currency's atomic units. */
export type CurrencyValue = typeof CurrencyValue.Type

const ExactCurrencyValueFields = {
  atomicUnits: AtomicUnits,
  observedAt: S.Number,
}

/** An exact executable ETH value on Ethereum Sepolia. */
export const EthereumSepoliaEthValue = S.Struct({
  currency: Eth,
  decimalPlaces: S.Literal(18),
  ...ExactCurrencyValueFields,
})
/** An exact executable ETH value on Ethereum Sepolia. */
export type EthereumSepoliaEthValue = typeof EthereumSepoliaEthValue.Type

/** An exact executable USDC value on Ethereum Sepolia. */
export const EthereumSepoliaUsdcValue = S.Struct({
  currency: EthereumSepoliaUsdc,
  decimalPlaces: S.Literal(6),
  ...ExactCurrencyValueFields,
})
/** An exact executable USDC value on Ethereum Sepolia. */
export type EthereumSepoliaUsdcValue = typeof EthereumSepoliaUsdcValue.Type

/** An exact executable SOL value on Solana Devnet. */
export const SolanaDevnetSolValue = S.Struct({
  currency: SolanaDevnetSol,
  decimalPlaces: S.Literal(9),
  ...ExactCurrencyValueFields,
})
/** An exact executable SOL value on Solana Devnet. */
export type SolanaDevnetSolValue = typeof SolanaDevnetSolValue.Type

/** An exact executable USDC value on Solana Devnet. */
export const SolanaDevnetUsdcValue = S.Struct({
  currency: SolanaDevnetUsdc,
  decimalPlaces: S.Literal(6),
  ...ExactCurrencyValueFields,
})
/** An exact executable USDC value on Solana Devnet. */
export type SolanaDevnetUsdcValue = typeof SolanaDevnetUsdcValue.Type

/** Returns the optional network carried by a currency. */
export const maybeNetworkForCurrency = (
  currency: Currency,
): Option.Option<Network> =>
  M.value(currency).pipe(
    M.withReturnType<Option.Option<Network>>(),
    M.tagsExhaustive({
      Eth: ({ network }) => Option.some(network),
      Sol: ({ network }) => Option.some(network),
      Usdc: ({ network }) => Option.some(network),
      Fiat: () => Option.none(),
    }),
  )
