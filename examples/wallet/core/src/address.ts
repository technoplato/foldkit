import { Array, Match as M, Schema as S } from 'effect'
import { isAddress as isEthereumAddress } from 'viem'

import { isAddress as isSolanaAddress } from '@solana/addresses'

import {
  EthereumSepolia,
  type Network,
  SolanaDevnet,
  SolanaNetwork,
} from './currency.js'

/** One required prefix at the start of an address. */
export const AddressPrefixRule = S.TaggedStruct('AddressPrefixRule', {
  prefix: S.String,
})
/** One required prefix at the start of an address. */
export type AddressPrefixRule = typeof AddressPrefixRule.Type

/** The encoded alphabet permitted by an address format. */
export const AddressCharacterSet = S.Literals(['Hexadecimal', 'Base58'])
/** The encoded alphabet permitted by an address format. */
export type AddressCharacterSet = typeof AddressCharacterSet.Type

/** One permitted encoded alphabet for an address. */
export const AddressCharacterSetRule = S.TaggedStruct(
  'AddressCharacterSetRule',
  { characterSet: AddressCharacterSet },
)
/** One permitted encoded alphabet for an address. */
export type AddressCharacterSetRule = typeof AddressCharacterSetRule.Type

/** Which part of an address an encoded length describes. */
export const AddressLengthScope = S.Literals(['WholeAddress', 'AfterPrefix'])
/** Which part of an address an encoded length describes. */
export type AddressLengthScope = typeof AddressLengthScope.Type

/** The permitted encoded character count for an address. */
export const AddressEncodedLengthRule = S.TaggedStruct(
  'AddressEncodedLengthRule',
  {
    scope: AddressLengthScope,
    minimumCharacterCount: S.Int,
    maximumCharacterCount: S.Int,
  },
)
/** The permitted encoded character count for an address. */
export type AddressEncodedLengthRule = typeof AddressEncodedLengthRule.Type

/** The exact decoded byte count represented by an address. */
export const AddressDecodedLengthRule = S.TaggedStruct(
  'AddressDecodedLengthRule',
  { byteCount: S.Int },
)
/** The exact decoded byte count represented by an address. */
export type AddressDecodedLengthRule = typeof AddressDecodedLengthRule.Type

/** One machine-readable rule in a network address format. */
export const NetworkAddressRule = S.Union([
  AddressPrefixRule,
  AddressCharacterSetRule,
  AddressEncodedLengthRule,
  AddressDecodedLengthRule,
])
/** One machine-readable rule in a network address format. */
export type NetworkAddressRule = typeof NetworkAddressRule.Type

/** Printable and machine-readable guidance for one network address format. */
export const NetworkAddressFormat = S.Struct({
  network: S.Union([EthereumSepolia, SolanaNetwork]),
  networkName: S.String,
  exampleAddress: S.String,
  rules: S.Array(NetworkAddressRule),
})
/** Printable and machine-readable guidance for one network address format. */
export type NetworkAddressFormat = typeof NetworkAddressFormat.Type

/** A validated Ethereum Sepolia address paired with its network. */
export const EthereumNetworkAddress = S.TaggedStruct('EthereumNetworkAddress', {
  network: EthereumSepolia,
  value: S.String.check(
    S.makeFilter(value =>
      isEthereumAddress(value)
        ? undefined
        : 'Expected a valid Ethereum address',
    ),
  ),
})
/** A validated Ethereum Sepolia address paired with its network. */
export type EthereumNetworkAddress = typeof EthereumNetworkAddress.Type

/** A validated Solana address paired with its test network. */
export const SolanaNetworkAddress = S.TaggedStruct('SolanaNetworkAddress', {
  network: SolanaNetwork,
  value: S.String.check(
    S.makeFilter(value =>
      isSolanaAddress(value) ? undefined : 'Expected a valid Solana address',
    ),
  ),
})
/** A validated Solana address paired with its test network. */
export type SolanaNetworkAddress = typeof SolanaNetworkAddress.Type

/** A public address proven valid for its paired network. */
export const ValidatedNetworkAddress = S.Union([
  EthereumNetworkAddress,
  SolanaNetworkAddress,
])
/** A public address proven valid for its paired network. */
export type ValidatedNetworkAddress = typeof ValidatedNetworkAddress.Type

/** An address was valid for its requested network. */
export const ValidNetworkAddress = S.TaggedStruct('ValidNetworkAddress', {
  address: ValidatedNetworkAddress,
})
/** An address was valid for its requested network. */
export type ValidNetworkAddress = typeof ValidNetworkAddress.Type

/** An address failed its requested network's rules. */
export const InvalidNetworkAddress = S.TaggedStruct('InvalidNetworkAddress', {
  input: S.String,
  format: NetworkAddressFormat,
})
/** An address failed its requested network's rules. */
export type InvalidNetworkAddress = typeof InvalidNetworkAddress.Type

/** The result of validating an address against one network. */
export const NetworkAddressValidation = S.Union([
  ValidNetworkAddress,
  InvalidNetworkAddress,
])
/** The result of validating an address against one network. */
export type NetworkAddressValidation = typeof NetworkAddressValidation.Type

const ethereumAddressFormat: NetworkAddressFormat = NetworkAddressFormat.make({
  network: EthereumSepolia.make({}),
  networkName: 'Ethereum Sepolia',
  exampleAddress: '0x1234567890abcdef1234567890abcdef12345678',
  rules: [
    AddressPrefixRule.make({ prefix: '0x' }),
    AddressCharacterSetRule.make({ characterSet: 'Hexadecimal' }),
    AddressEncodedLengthRule.make({
      scope: 'AfterPrefix',
      minimumCharacterCount: 40,
      maximumCharacterCount: 40,
    }),
    AddressDecodedLengthRule.make({ byteCount: 20 }),
  ],
})

const solanaDevnetAddressFormat: NetworkAddressFormat =
  NetworkAddressFormat.make({
    network: SolanaDevnet.make({}),
    networkName: 'Solana Devnet',
    exampleAddress: '11111111111111111111111111111111',
    rules: [
      AddressCharacterSetRule.make({ characterSet: 'Base58' }),
      AddressEncodedLengthRule.make({
        scope: 'WholeAddress',
        minimumCharacterCount: 32,
        maximumCharacterCount: 44,
      }),
      AddressDecodedLengthRule.make({ byteCount: 32 }),
    ],
  })

/** Returns printable address guidance for one executable Wallet network. */
export const networkAddressFormat = (network: Network): NetworkAddressFormat =>
  M.value(network).pipe(
    M.withReturnType<NetworkAddressFormat>(),
    M.tagsExhaustive({
      EthereumSepolia: () => ethereumAddressFormat,
      SolanaDevnet: () => solanaDevnetAddressFormat,
      SolanaTestnet: solanaNetwork =>
        NetworkAddressFormat.make({
          ...solanaDevnetAddressFormat,
          network: solanaNetwork,
          networkName: 'Solana Testnet',
        }),
    }),
  )

const validSolanaAddress = (
  network: SolanaNetwork,
  input: string,
): ValidNetworkAddress =>
  ValidNetworkAddress.make({
    address: SolanaNetworkAddress.make({
      network,
      value: input,
    }),
  })

/** Validates untrusted address text against the selected network. */
export const validateNetworkAddress = (
  network: Network,
  input: string,
): NetworkAddressValidation => {
  const trimmedInput = input.trim()
  return M.value(network).pipe(
    M.withReturnType<NetworkAddressValidation>(),
    M.tagsExhaustive({
      EthereumSepolia: ethereumNetwork =>
        isEthereumAddress(trimmedInput)
          ? ValidNetworkAddress.make({
              address: EthereumNetworkAddress.make({
                network: ethereumNetwork,
                value: trimmedInput,
              }),
            })
          : InvalidNetworkAddress.make({
              input,
              format: networkAddressFormat(ethereumNetwork),
            }),
      SolanaDevnet: solanaNetwork =>
        isSolanaAddress(trimmedInput)
          ? validSolanaAddress(solanaNetwork, trimmedInput)
          : InvalidNetworkAddress.make({
              input,
              format: networkAddressFormat(solanaNetwork),
            }),
      SolanaTestnet: solanaNetwork =>
        isSolanaAddress(trimmedInput)
          ? validSolanaAddress(solanaNetwork, trimmedInput)
          : InvalidNetworkAddress.make({
              input,
              format: networkAddressFormat(solanaNetwork),
            }),
    }),
  )
}

/** Formats the human-friendly heading for an invalid network address. */
export const invalidNetworkAddressMessage = (
  invalid: InvalidNetworkAddress,
): string =>
  `That is not a valid address for ${invalid.format.networkName}. Valid addresses for ${invalid.format.networkName} look like ${invalid.format.exampleAddress} and follow the following rules.`

/** Formats one machine-readable address rule for a person. */
export const networkAddressRuleMessage = (rule: NetworkAddressRule): string =>
  M.value(rule).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AddressPrefixRule: ({ prefix }) => `It starts with ${prefix}.`,
      AddressCharacterSetRule: ({ characterSet }) =>
        characterSet === 'Hexadecimal'
          ? 'It uses only hexadecimal characters: 0-9 and A-F.'
          : 'It uses only Base58 characters and excludes 0, O, I, and l.',
      AddressEncodedLengthRule: ({
        maximumCharacterCount,
        minimumCharacterCount,
        scope,
      }) => {
        const location =
          scope === 'AfterPrefix' ? ' after the prefix' : ' in total'
        if (minimumCharacterCount === maximumCharacterCount) {
          return `It contains exactly ${minimumCharacterCount.toString()} characters${location}.`
        } else {
          return `It contains between ${minimumCharacterCount.toString()} and ${maximumCharacterCount.toString()} characters${location}.`
        }
      },
      AddressDecodedLengthRule: ({ byteCount }) =>
        `It represents exactly ${byteCount.toString()} bytes.`,
    }),
  )

/** Formats every address rule for direct display by any client. */
export const networkAddressRuleMessages = (
  format: NetworkAddressFormat,
): ReadonlyArray<string> => Array.map(format.rules, networkAddressRuleMessage)
