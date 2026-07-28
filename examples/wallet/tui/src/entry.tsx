import { Array, Data, Effect, Option, pipe } from 'effect'
import { parseWalletProgramRoute } from 'wallet-core-example'
import { type WalletInitialRoute } from 'wallet-react-bindings-example'

import { CliRenderEvents, createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from './host.js'

class WalletOpenTuiCarrierError extends Data.TaggedError(
  'WalletOpenTuiCarrierError',
)<{ readonly message: string }> {}

const relativeRouteForCarrier = (
  carrier: string,
): Effect.Effect<string, WalletOpenTuiCarrierError> => {
  if (!carrier.includes('://')) {
    return Effect.succeed(carrier)
  }
  return Effect.try({
    try: () => {
      const url = new URL(carrier)
      return `${url.pathname}${url.search}`
    },
    catch: () =>
      new WalletOpenTuiCarrierError({
        message: `Invalid Wallet URI: ${carrier}`,
      }),
  })
}

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)

const maybeInitialRoute = await Effect.runPromise(
  Option.match(maybeCarrier, {
    onNone: () => Effect.succeed(Option.none<WalletInitialRoute>()),
    onSome: carrier =>
      Effect.gen(function* () {
        const relativeRoute = yield* relativeRouteForCarrier(carrier)
        const route = yield* parseWalletProgramRoute(relativeRoute)
        if (route._tag === 'SavedReplay') {
          return yield* Effect.fail(
            new WalletOpenTuiCarrierError({
              message: `Saved replay ${route.tapeId} needs a ReplayTapeStore`,
            }),
          )
        }
        return Option.some(route)
      }),
  }),
)

const renderer = await createCliRenderer({
  clearOnShutdown: true,
  consoleMode: 'disabled',
  exitOnCtrlC: true,
})
const root = createRoot(renderer)
renderer.once(CliRenderEvents.DESTROY, () => root.unmount())

if (Option.isSome(maybeInitialRoute)) {
  root.render(
    <App initialRoute={maybeInitialRoute.value} renderer={renderer} />,
  )
} else {
  root.render(<App renderer={renderer} />)
}
