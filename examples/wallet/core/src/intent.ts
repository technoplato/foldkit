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

/** A deployment mode selected by the portable send-money intent. */
export const TransferIntentMode = S.Literals(['Devnet', 'Testnet', 'Live'])
/** A deployment mode selected by the portable send-money intent. */
export type TransferIntentMode = typeof TransferIntentMode.Type

/** A settlement rail selected by the portable send-money intent. */
export const TransferIntentRail = S.Literals(['Ethereum', 'Solana'])
/** A settlement rail selected by the portable send-money intent. */
export type TransferIntentRail = typeof TransferIntentRail.Type

const SendMoneyIntentFields = {
  atomicUnits: AtomicUnits,
  destinationAddress: S.String,
}

/** A renderer-neutral request to send ETH on Ethereum. */
export const SendEthIntent = S.TaggedStruct('SendEthIntent', {
  mode: TransferIntentMode,
  ...SendMoneyIntentFields,
})
/** A renderer-neutral request to send ETH on Ethereum. */
export type SendEthIntent = typeof SendEthIntent.Type

/** A renderer-neutral request to send SOL on Solana. */
export const SendSolIntent = S.TaggedStruct('SendSolIntent', {
  mode: TransferIntentMode,
  ...SendMoneyIntentFields,
})
/** A renderer-neutral request to send SOL on Solana. */
export type SendSolIntent = typeof SendSolIntent.Type

/** A renderer-neutral request to send USD-denominated USDC on one rail. */
export const SendUsdIntent = S.TaggedStruct('SendUsdIntent', {
  mode: TransferIntentMode,
  rail: TransferIntentRail,
  ...SendMoneyIntentFields,
})
/** A renderer-neutral request to send USD-denominated USDC on one rail. */
export type SendUsdIntent = typeof SendUsdIntent.Type

/** Every portable intent accepted by the Wallet domain. */
export const WalletIntent = S.Union([
  SendEthIntent,
  SendSolIntent,
  SendUsdIntent,
])
/** Every portable intent accepted by the Wallet domain. */
export type WalletIntent = typeof WalletIntent.Type

/** The Wallet was opened without a portable transfer intent. */
export const NoWalletIntent = S.TaggedStruct('NoWalletIntent', {})

/** A portable transfer intent is waiting for the public portfolio. */
export const PendingWalletIntent = S.TaggedStruct('PendingWalletIntent', {
  intent: WalletIntent,
})

/** A portable transfer intent was accepted into the transaction workflow. */
export const AppliedWalletIntent = S.TaggedStruct('AppliedWalletIntent', {
  intent: WalletIntent,
})

/** A portable transfer intent could not be applied by the available wallet. */
export const RejectedWalletIntent = S.TaggedStruct('RejectedWalletIntent', {
  intent: WalletIntent,
  reason: S.String,
})

/** The Wallet's behaviorally meaningful portable-intent state. */
export const WalletIntentState = S.Union([
  NoWalletIntent,
  PendingWalletIntent,
  AppliedWalletIntent,
  RejectedWalletIntent,
])
/** The Wallet's behaviorally meaningful portable-intent state. */
export type WalletIntentState = typeof WalletIntentState.Type

/** An executable ETH transfer through the Ethereum Sepolia Layer. */
export const SepoliaEthTransferIntent = S.TaggedStruct(
  'SepoliaEthTransferIntent',
  SendMoneyIntentFields,
)
/** An executable ETH transfer through the Ethereum Sepolia Layer. */
export type SepoliaEthTransferIntent = typeof SepoliaEthTransferIntent.Type

/** An executable USDC transfer through the Ethereum Sepolia Layer. */
export const SepoliaUsdcTransferIntent = S.TaggedStruct(
  'SepoliaUsdcTransferIntent',
  SendMoneyIntentFields,
)
/** An executable USDC transfer through the Ethereum Sepolia Layer. */
export type SepoliaUsdcTransferIntent = typeof SepoliaUsdcTransferIntent.Type

/** An executable SOL transfer through the Solana Devnet Layer. */
export const SolanaDevnetSolTransferIntent = S.TaggedStruct(
  'SolanaDevnetSolTransferIntent',
  SendMoneyIntentFields,
)
/** An executable SOL transfer through the Solana Devnet Layer. */
export type SolanaDevnetSolTransferIntent =
  typeof SolanaDevnetSolTransferIntent.Type

/** An executable USDC transfer through the Solana Devnet Layer. */
export const SolanaDevnetUsdcTransferIntent = S.TaggedStruct(
  'SolanaDevnetUsdcTransferIntent',
  SendMoneyIntentFields,
)
/** An executable USDC transfer through the Solana Devnet Layer. */
export type SolanaDevnetUsdcTransferIntent =
  typeof SolanaDevnetUsdcTransferIntent.Type

/** Every transfer the currently configured Wallet Layers can execute. */
export const ExecutableWalletIntent = S.Union([
  SepoliaEthTransferIntent,
  SepoliaUsdcTransferIntent,
  SolanaDevnetSolTransferIntent,
  SolanaDevnetUsdcTransferIntent,
])
/** Every transfer the currently configured Wallet Layers can execute. */
export type ExecutableWalletIntent = typeof ExecutableWalletIntent.Type

/** A parsed Wallet request resolved to one executable Layer operation. */
export const ImplementedWalletIntentCapability = S.TaggedStruct(
  'ImplementedWalletIntentCapability',
  {
    support: S.Literal('Implemented'),
    network: S.String,
    reason: S.String,
    intent: ExecutableWalletIntent,
  },
)

/** A parsed Wallet request with no configured executable Layer operation. */
export const UnsupportedWalletIntentCapability = S.TaggedStruct(
  'UnsupportedWalletIntentCapability',
  {
    support: S.Literal('TypedUnsupported'),
    network: S.String,
    reason: S.String,
    request: WalletIntent,
  },
)

/** Current Layer support for a parsed Wallet intent. */
export const WalletIntentCapability = S.Union([
  ImplementedWalletIntentCapability,
  UnsupportedWalletIntentCapability,
])
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

const decodeSendMoneyFields = (
  mode: string,
  amount: string,
  destinationAddress: string,
): Effect.Effect<
  Readonly<{
    mode: TransferIntentMode
    atomicUnits: AtomicUnits
    destinationAddress: string
  }>,
  WalletIntentRouteError
> =>
  Effect.all({
    mode: decodeMode(mode),
    atomicUnits: decodeAtomicUnits(amount),
  }).pipe(
    Effect.map(({ mode: decodedMode, atomicUnits }) => ({
      mode: decodedMode,
      atomicUnits,
      destinationAddress,
    })),
  )

const makeEthIntent = (
  mode: string,
  amount: string,
  destinationAddress: string,
): Effect.Effect<SendEthIntent, WalletIntentRouteError> =>
  decodeSendMoneyFields(mode, amount, destinationAddress).pipe(
    Effect.map(fields => SendEthIntent.make(fields)),
  )

const makeSolIntent = (
  mode: string,
  amount: string,
  destinationAddress: string,
): Effect.Effect<SendSolIntent, WalletIntentRouteError> =>
  decodeSendMoneyFields(mode, amount, destinationAddress).pipe(
    Effect.map(fields => SendSolIntent.make(fields)),
  )

const makeUsdIntent = (
  rail: string,
  mode: string,
  amount: string,
  destinationAddress: string,
): Effect.Effect<SendUsdIntent, WalletIntentRouteError> =>
  Effect.all({
    fields: decodeSendMoneyFields(mode, amount, destinationAddress),
    rail: decodeRail(rail),
  }).pipe(
    Effect.map(({ fields, rail: decodedRail }) =>
      SendUsdIntent.make({
        ...fields,
        rail: decodedRail,
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
            makeEthIntent(mode, amount, to),
          SolSendRoute: ({ mode, amount, to }) =>
            makeSolIntent(mode, amount, to),
          UsdSendRoute: ({ mode, amount, to, rail }) =>
            makeUsdIntent(rail, mode, amount, to),
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
        SendEthIntent: value =>
          ethSendRouter({
            mode: encodedMode(value.mode),
            amount: value.atomicUnits,
            to: value.destinationAddress,
          }),
        SendSolIntent: value =>
          solSendRouter({
            mode: encodedMode(value.mode),
            amount: value.atomicUnits,
            to: value.destinationAddress,
          }),
        SendUsdIntent: value =>
          usdSendRouter({
            mode: encodedMode(value.mode),
            amount: value.atomicUnits,
            to: value.destinationAddress,
            rail: encodedRail(value.rail),
          }),
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

const executableIntentFields = (
  request: WalletIntent,
): Readonly<{
  atomicUnits: AtomicUnits
  destinationAddress: string
}> => ({
  atomicUnits: request.atomicUnits,
  destinationAddress: request.destinationAddress,
})

/** Reports whether the current testnet Layers can execute one Wallet intent. */
export const capabilityForWalletIntent = (
  intent: WalletIntent,
): WalletIntentCapability =>
  M.value(intent).pipe(
    M.withReturnType<WalletIntentCapability>(),
    M.tagsExhaustive({
      SendEthIntent: request =>
        M.value(request.mode).pipe(
          M.withReturnType<WalletIntentCapability>(),
          M.when('Testnet', () =>
            ImplementedWalletIntentCapability.make({
              support: 'Implemented',
              network: 'Ethereum Sepolia',
              reason: 'The Ethereum Sepolia Layer supports ETH.',
              intent: SepoliaEthTransferIntent.make(
                executableIntentFields(request),
              ),
            }),
          ),
          M.when('Live', () =>
            UnsupportedWalletIntentCapability.make({
              support: 'TypedUnsupported',
              network: 'Ethereum mainnet',
              reason: 'No live-mainnet Wallet Layer is configured.',
              request,
            }),
          ),
          M.when('Devnet', () =>
            UnsupportedWalletIntentCapability.make({
              support: 'TypedUnsupported',
              network: 'Ethereum Devnet',
              reason: 'Ethereum has no configured Devnet Layer.',
              request,
            }),
          ),
          M.exhaustive,
        ),
      SendSolIntent: request =>
        M.value(request.mode).pipe(
          M.withReturnType<WalletIntentCapability>(),
          M.when('Devnet', () =>
            ImplementedWalletIntentCapability.make({
              support: 'Implemented',
              network: 'Solana Devnet',
              reason: 'The Solana Devnet Layer supports SOL.',
              intent: SolanaDevnetSolTransferIntent.make(
                executableIntentFields(request),
              ),
            }),
          ),
          M.when('Testnet', () =>
            UnsupportedWalletIntentCapability.make({
              support: 'TypedUnsupported',
              network: 'Solana Testnet',
              reason:
                'Solana Testnet is typed but its Layer rejects execution.',
              request,
            }),
          ),
          M.when('Live', () =>
            UnsupportedWalletIntentCapability.make({
              support: 'TypedUnsupported',
              network: 'Solana mainnet',
              reason: 'No live-mainnet Wallet Layer is configured.',
              request,
            }),
          ),
          M.exhaustive,
        ),
      SendUsdIntent: request => {
        if (request.rail === 'Ethereum' && request.mode === 'Testnet') {
          return ImplementedWalletIntentCapability.make({
            support: 'Implemented',
            network: 'Ethereum Sepolia USDC',
            reason: 'USD intent settles as USDC through the Sepolia Layer.',
            intent: SepoliaUsdcTransferIntent.make(
              executableIntentFields(request),
            ),
          })
        } else if (request.rail === 'Solana' && request.mode === 'Devnet') {
          return ImplementedWalletIntentCapability.make({
            support: 'Implemented',
            network: 'Solana Devnet USDC',
            reason: 'USD intent settles as USDC through the Devnet Layer.',
            intent: SolanaDevnetUsdcTransferIntent.make(
              executableIntentFields(request),
            ),
          })
        } else if (request.rail === 'Solana' && request.mode === 'Testnet') {
          return UnsupportedWalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: 'Solana Testnet USDC',
            reason: 'Solana Testnet is typed but its Layer rejects execution.',
            request,
          })
        } else if (request.mode === 'Live') {
          return UnsupportedWalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: `${request.rail} mainnet USDC`,
            reason: 'No live-mainnet Wallet Layer is configured.',
            request,
          })
        } else {
          return UnsupportedWalletIntentCapability.make({
            support: 'TypedUnsupported',
            network: `${request.rail} ${request.mode} USDC`,
            reason:
              'The selected rail and mode do not form a configured Layer.',
            request,
          })
        }
      },
    }),
  )
