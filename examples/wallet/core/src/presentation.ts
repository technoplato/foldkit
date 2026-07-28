import { Array, Match as M, Option } from 'effect'

import type { Currency, CurrencyValue, Network } from './currency.js'
import type {
  AccountBalance,
  Model,
  ReceivingInstruction,
  WalletAccount,
} from './model.js'

/** Returns the short public ticker used to present one Currency. */
export const currencyTicker = (currency: Currency): string =>
  M.value(currency).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Eth: () => 'ETH',
      Sol: () => 'SOL',
      Usdc: () => 'USDC',
      Fiat: ({ code }) => code,
    }),
  )

/** Returns the plain-language public label for one supported Network. */
export const networkLabel = (network: Network): string =>
  M.value(network).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      EthereumSepolia: () => 'Ethereum Sepolia',
      SolanaDevnet: () => 'Solana Devnet',
      SolanaTestnet: () => 'Solana Testnet',
    }),
  )

/** Formats exact atomic units as a human-readable Currency amount. */
export const currencyValueLabel = (value: CurrencyValue): string => {
  const isNegative = value.atomicUnits.startsWith('-')
  const unsignedAtomicUnits = isNegative
    ? value.atomicUnits.slice(1)
    : value.atomicUnits
  const paddedAtomicUnits = unsignedAtomicUnits.padStart(
    value.decimalPlaces + 1,
    '0',
  )
  const wholeUnits =
    value.decimalPlaces === 0
      ? paddedAtomicUnits
      : paddedAtomicUnits.slice(0, -value.decimalPlaces)
  const fractionalUnits =
    value.decimalPlaces === 0
      ? ''
      : paddedAtomicUnits.slice(-value.decimalPlaces).replace(/0+$/, '')
  const decimalValue =
    fractionalUnits === '' ? wholeUnits : `${wholeUnits}.${fractionalUnits}`
  return `${isNegative ? '-' : ''}${decimalValue} ${currencyTicker(value.currency)}`
}

/** Shortens a public address while preserving both identifying ends. */
export const shortenedAddress = (address: string): string =>
  address.length <= 18
    ? address
    : `${address.slice(0, 10)}…${address.slice(-6)}`

/** Selects the first Ethereum account used by the Wallet example's primary flow. */
export const primaryWalletAccount = (
  model: Model,
): Option.Option<WalletAccount> =>
  model.portfolio._tag === 'LoadedPortfolio'
    ? Array.findFirst(
        model.portfolio.snapshot.accounts,
        account => account.network._tag === 'EthereumSepolia',
      )
    : Option.none()

/** Selects the primary account's ETH balance. */
export const primaryWalletBalance = (
  model: Model,
): Option.Option<AccountBalance> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.balanceSnapshot.balances,
          balance =>
            balance.accountId === account.accountId &&
            balance.value.currency._tag === 'Eth',
        )
      : Option.none(),
  )

/** Selects the primary account's ETH receiving instruction. */
export const primaryReceivingInstruction = (
  model: Model,
): Option.Option<ReceivingInstruction> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.receivingInstructions,
          instruction =>
            instruction.accountId === account.accountId &&
            instruction.currency._tag === 'Eth',
        )
      : Option.none(),
  )
