import { Array, Data, Effect, Schema as S, String, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash } from 'foldkit/route'

import { AssetId, AtomicUnits } from './currency.js'

/** A renderer-neutral request to send one normalized asset. */
export const SendAssetIntent = S.TaggedStruct('SendAssetIntent', {
  accountId: S.String,
  assetId: AssetId,
  atomicUnits: AtomicUnits,
  destinationAddress: S.String,
})
/** A renderer-neutral request to send one normalized asset. */
export type SendAssetIntent = typeof SendAssetIntent.Type

/** Every portable intent accepted by the Wallet domain. */
export const WalletIntent = SendAssetIntent
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

const SendAssetRoute = r('SendAssetRoute', {
  account: S.String,
  asset: S.String,
  amount: S.String,
  to: S.String,
})

const sendAssetRouter = pipe(
  literal('wallet'),
  slash(literal('intent')),
  slash(literal('send')),
  Route.query(
    S.Struct({
      account: S.String,
      asset: S.String,
      amount: S.String,
      to: S.String,
    }),
  ),
  Route.mapTo(SendAssetRoute),
)

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

const parseIntent = (
  relativeRoute: string,
): Effect.Effect<WalletIntent, WalletIntentRouteError> => {
  const { segments, search } = splitRelativeRoute(relativeRoute)
  return sendAssetRouter.parse(segments, search).pipe(
    Effect.mapError(toRouteError('Could not parse Wallet intent path')),
    Effect.flatMap(([route]) =>
      S.decodeUnknownEffect(AtomicUnits)(route.amount).pipe(
        Effect.mapError(
          toRouteError('Wallet intent amount must use atomic units'),
        ),
        Effect.map(atomicUnits =>
          SendAssetIntent.make({
            accountId: route.account,
            assetId: route.asset,
            atomicUnits,
            destinationAddress: route.to,
          }),
        ),
      ),
    ),
  )
}

const printIntent = (
  intent: WalletIntent,
): Effect.Effect<string, WalletIntentRouteError> =>
  Effect.sync(() =>
    sendAssetRouter({
      account: intent.accountId,
      asset: intent.assetId,
      amount: intent.atomicUnits,
      to: intent.destinationAddress,
    }),
  ).pipe(Effect.mapError(toRouteError('Could not print Wallet intent path')))

/** The global relative URI parser-printer for normalized Wallet intents. */
export const walletIntentRouter: WalletIntentRouter = {
  Route: WalletIntent,
  parse: parseIntent,
  print: printIntent,
  canonicalize: relativeRoute =>
    parseIntent(relativeRoute).pipe(Effect.flatMap(printIntent)),
}
