import {
  Array,
  Data,
  Effect,
  Match as M,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash } from 'foldkit/route'

import { AtomicUnits } from './currency.js'

/** An asset accepted by the portable send-money intent. */
export const TransferIntentAsset = S.Literals(['Eth', 'Sol', 'Usd'])
/** An asset accepted by the portable send-money intent. */
export type TransferIntentAsset = typeof TransferIntentAsset.Type

/** A deployment mode selected by the portable send-money intent. */
export const TransferIntentMode = S.Literals(['Devnet', 'Testnet', 'Live'])
/** A deployment mode selected by the portable send-money intent. */
export type TransferIntentMode = typeof TransferIntentMode.Type

/** A settlement rail selected by the portable send-money intent. */
export const TransferIntentRail = S.Literals(['Ethereum', 'Solana'])
/** A settlement rail selected by the portable send-money intent. */
export type TransferIntentRail = typeof TransferIntentRail.Type

/** A renderer-neutral request to compose one public money transfer. */
export const SendMoneyIntent = S.TaggedStruct('SendMoneyIntent', {
  asset: TransferIntentAsset,
  mode: TransferIntentMode,
  rail: TransferIntentRail,
  atomicUnits: AtomicUnits,
  destinationAddress: S.String,
})
/** A renderer-neutral request to compose one public money transfer. */
export type SendMoneyIntent = typeof SendMoneyIntent.Type

/** Every portable intent accepted by the Wallet domain. */
export const WalletIntent = S.Union([SendMoneyIntent])
/** Every portable intent accepted by the Wallet domain. */
export type WalletIntent = typeof WalletIntent.Type

/** Current implementation support for a parsed Wallet intent. */
export const WalletIntentSupport = S.Literals([
  'Implemented',
  'TypedUnsupported',
])
/** Current implementation support for a parsed Wallet intent. */
export type WalletIntentSupport = typeof WalletIntentSupport.Type

/** Current Layer support for a parsed Wallet intent. */
export const WalletIntentCapability = S.Struct({
  support: WalletIntentSupport,
  network: S.String,
  reason: S.String,
})
/** Current Layer support for a parsed Wallet intent. */
export type WalletIntentCapability = typeof WalletIntentCapability.Type

/** A portable Wallet intent could not be parsed or printed. */
export class WalletIntentRouteError extends Data.TaggedError(
  'WalletIntentRouteError',
)<{
  readonly message: string
  readonly cause: unknown
}> {}

/** The shared parser-printer for renderer-neutral Wallet intent paths. */
export type WalletIntentRouter = Readonly<{
  Route: typeof WalletIntent
  parse: (
    relativeRoute: string,
  ) => Effect.Effect<WalletIntent, WalletIntentRouteError>
  print: (intent: WalletIntent) => Effect.Effect<string, WalletIntentRouteError>
  canonicalize: (
    relativeRoute: string,
  ) => Effect.Effect<string, WalletIntentRouteError>
}>

const BaseQuery = {
  mode: S.String,
  amount: S.String,
  to: S.String,
}

const EthSendRoute = r('EthSendRoute', BaseQuery)
const SolSendRoute = r('SolSendRoute', BaseQuery)
const UsdSendRoute = r('UsdSendRoute', {
  ...BaseQuery,
  rail: S.String,
})

const sendPath = pipe(
  literal('wallet'),
  slash(literal('intent')),
  slash(literal('send')),
)

const ethSendRouter = pipe(
  sendPath,
  slash(literal('eth')),
  Route.query(S.Struct(BaseQuery)),
  Route.mapTo(EthSendRoute),
)

const solSendRouter = pipe(
  sendPath,
  slash(literal('sol')),
  Route.query(S.Struct(BaseQuery)),
  Route.mapTo(SolSendRoute),
)

const usdSendRouter = pipe(
  sendPath,
  slash(literal('usd')),
  Route.query(S.Struct({ ...BaseQuery, rail: S.String })),
  Route.mapTo(UsdSendRoute),
)

const routeParser = Route.oneOf(ethSendRouter, solSendRouter, usdSendRouter)

const splitRelativeRoute = (
  relativeRoute: string,
): Readonly<{
  segments: ReadonlyArray<string>
  search: string
}> => {
  const queryIndex = relativeRoute.indexOf('?')
  const pathname =
    queryIndex === -1 ? relativeRoute : relativeRoute.slice(0, queryIndex)
  const search = queryIndex === -1 ? '' : relativeRoute.slice(queryIndex + 1)
  return {
    segments: pipe(
      pathname,
      String.split('/'),
      Array.filter(String.isNonEmpty),
    ),
    search,
  }
}

const toRouteError = (message: string) => (cause: unknown) =>
  new WalletIntentRouteError({ message, cause })

const decodeMode = (
  mode: string,
): Effect.Effect<TransferIntentMode, WalletIntentRouteError> =>
  M.value(mode).pipe(
    M.withReturnType<
      Effect.Effect<TransferIntentMode, WalletIntentRouteError>
    >(),
    M.when('devnet', () => Effect.succeed('Devnet')),
    M.when('testnet', () => Effect.succeed('Testnet')),
    M.when('live', () => Effect.succeed('Live')),
    M.orElse(actual =>
      Effect.fail(
        new WalletIntentRouteError({
          message: 'Wallet intent mode must be devnet, testnet, or live',
          cause: actual,
        }),
      ),
    ),
  )

const decodeRail = (
  rail: string,
): Effect.Effect<TransferIntentRail, WalletIntentRouteError> =>
  M.value(rail).pipe(
    M.withReturnType<
      Effect.Effect<TransferIntentRail, WalletIntentRouteError>
    >(),
    M.when('ethereum', () => Effect.succeed('Ethereum')),
    M.when('solana', () => Effect.succeed('Solana')),
    M.orElse(actual =>
      Effect.fail(
        new WalletIntentRouteError({
          message: 'USD intent rail must be ethereum or solana',
          cause: actual,
        }),
      ),
    ),
  )

const decodeAtomicUnits = (
  amount: string,
): Effect.Effect<AtomicUnits, WalletIntentRouteError> =>
  S.decodeUnknownEffect(AtomicUnits)(amount).pipe(
    Effect.mapError(toRouteError('Wallet intent amount must use atomic units')),
  )

const makeSendMoneyIntent = (
  asset: TransferIntentAsset,
  rail: TransferIntentRail,
  mode: string,
  amount: string,
  destinationAddress: string,
): Effect.Effect<SendMoneyIntent, WalletIntentRouteError> =>
  Effect.all({
    mode: decodeMode(mode),
    atomicUnits: decodeAtomicUnits(amount),
  }).pipe(
    Effect.map(({ mode: decodedMode, atomicUnits }) =>
      SendMoneyIntent.make({
        asset,
        mode: decodedMode,
        rail,
        atomicUnits,
        destinationAddress,
      }),
    ),
  )

const parseIntent = (
  relativeRoute: string,
): Effect.Effect<WalletIntent, WalletIntentRouteError> => {
  const { segments, search } = splitRelativeRoute(relativeRoute)
  return routeParser.parse(segments, search).pipe(
    Effect.mapError(toRouteError('Could not parse Wallet intent path')),
    Effect.flatMap(([route]) =>
      M.value(route).pipe(
        M.withReturnType<Effect.Effect<WalletIntent, WalletIntentRouteError>>(),
        M.tagsExhaustive({
          EthSendRoute: ({ mode, amount, to }) =>
            makeSendMoneyIntent('Eth', 'Ethereum', mode, amount, to),
          SolSendRoute: ({ mode, amount, to }) =>
            makeSendMoneyIntent('Sol', 'Solana', mode, amount, to),
          UsdSendRoute: ({ mode, amount, to, rail }) =>
            decodeRail(rail).pipe(
              Effect.flatMap(decodedRail =>
                makeSendMoneyIntent('Usd', decodedRail, mode, amount, to),
              ),
            ),
        }),
      ),
    ),
  )
}

const encodedMode = (mode: TransferIntentMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('Devnet', () => 'devnet'),
    M.when('Testnet', () => 'testnet'),
    M.when('Live', () => 'live'),
    M.exhaustive,
  )

const encodedRail = (rail: TransferIntentRail): string =>
  M.value(rail).pipe(
    M.withReturnType<string>(),
    M.when('Ethereum', () => 'ethereum'),
    M.when('Solana', () => 'solana'),
    M.exhaustive,
  )

const printIntent = (
  intent: WalletIntent,
): Effect.Effect<string, WalletIntentRouteError> =>
  Effect.sync(() =>
    M.value(intent).pipe(
      M.withReturnType<string>(),
      M.tagsExhaustive({
        SendMoneyIntent: value =>
          M.value(value.asset).pipe(
            M.withReturnType<string>(),
            M.when('Eth', () =>
              ethSendRouter({
                mode: encodedMode(value.mode),
                amount: value.atomicUnits,
                to: value.destinationAddress,
              }),
            ),
            M.when('Sol', () =>
              solSendRouter({
                mode: encodedMode(value.mode),
                amount: value.atomicUnits,
                to: value.destinationAddress,
              }),
            ),
            M.when('Usd', () =>
              usdSendRouter({
                mode: encodedMode(value.mode),
                amount: value.atomicUnits,
                to: value.destinationAddress,
                rail: encodedRail(value.rail),
              }),
            ),
            M.exhaustive,
          ),
      }),
    ),
  ).pipe(Effect.mapError(toRouteError('Could not print Wallet intent path')))

/** The global relative URI parser-printer for Wallet intents. */
export const walletIntentRouter: WalletIntentRouter = {
  Route: WalletIntent,
  parse: parseIntent,
  print: printIntent,
  canonicalize: relativeRoute =>
    parseIntent(relativeRoute).pipe(Effect.flatMap(printIntent)),
}

/** Reports whether the current testnet Layers can execute one Wallet intent. */
export const capabilityForWalletIntent = (
  intent: WalletIntent,
): WalletIntentCapability =>
  M.value(intent).pipe(
    M.withReturnType<WalletIntentCapability>(),
    M.tagsExhaustive({
      SendMoneyIntent: ({ asset, mode, rail }) => {
        if (mode === 'Live') {
          return WalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: `${rail} mainnet`,
            reason: 'No live-mainnet Wallet Layer is configured.',
          })
        } else if (
          asset === 'Eth' &&
          rail === 'Ethereum' &&
          mode === 'Testnet'
        ) {
          return WalletIntentCapability.make({
            support: 'Implemented',
            network: 'Ethereum Sepolia',
            reason: 'The Ethereum Sepolia Layer supports ETH.',
          })
        } else if (asset === 'Sol' && rail === 'Solana' && mode === 'Devnet') {
          return WalletIntentCapability.make({
            support: 'Implemented',
            network: 'Solana Devnet',
            reason: 'The Solana Devnet Layer supports SOL.',
          })
        } else if (
          asset === 'Usd' &&
          rail === 'Ethereum' &&
          mode === 'Testnet'
        ) {
          return WalletIntentCapability.make({
            support: 'Implemented',
            network: 'Ethereum Sepolia USDC',
            reason: 'USD intent settles as USDC through the Sepolia Layer.',
          })
        } else if (asset === 'Usd' && rail === 'Solana' && mode === 'Devnet') {
          return WalletIntentCapability.make({
            support: 'Implemented',
            network: 'Solana Devnet USDC',
            reason: 'USD intent settles as USDC through the Devnet Layer.',
          })
        } else if (rail === 'Solana' && mode === 'Testnet') {
          return WalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: 'Solana Testnet',
            reason: 'Solana Testnet is typed but its Layer rejects execution.',
          })
        } else {
          return WalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: `${rail} ${mode}`,
            reason: 'The selected asset, rail, and mode do not form a Layer.',
          })
        }
      },
    }),
  )
