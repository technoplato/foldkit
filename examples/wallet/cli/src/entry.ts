#!/usr/bin/env node
import { Array, Console, Effect, Match as M, Option, pipe } from 'effect'
import type { WalletNetworkMode } from 'wallet-core-example'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  WalletChallengeInput,
  WalletCliError,
  WalletCliOperation,
  WalletTestFundingInput,
  WalletTransferInput,
  executeWalletCli,
  formatWalletCliExecution,
} from './host.js'

const exitOneShotWalletCli = (): void => {
  const code = process.exitCode ?? 0
  const flush = (
    stream: Readonly<{
      writableEnded: boolean
      write: (chunk: string, callback: () => void) => boolean
    }>,
    done: () => void,
  ): void => {
    if (stream.writableEnded) {
      done()
      return
    }
    stream.write('', done)
  }
  flush(process.stdout, () => {
    flush(process.stderr, () => {
      process.exit(code)
    })
  })
}

const usage = `Usage:
  foldkit-wallet show [--uri <state-or-replay-path>] [--verbose]
  foldkit-wallet create [--network <devnet|testnet|live>] [--uri <path>] [--verbose]
  foldkit-wallet receive --account <id> --asset <asset-id> [--uri <path>] [--verbose]
  foldkit-wallet history [--uri <path>] [--verbose]
  foldkit-wallet history-next [--uri <path>] [--verbose]
  foldkit-wallet fund --mode <mode> --chain <id> --network <id> --account <id> --asset <id> [--display-amount <amount>] [--verbose]
  foldkit-wallet preview <transfer flags> [--uri <path>] [--verbose]
  foldkit-wallet send <transfer flags> [--uri <path>] [--verbose]
  foldkit-wallet sign-challenge <challenge flags> [--uri <path>] [--verbose]
  foldkit-wallet replay [--frame <number>] [--uri <state-or-replay-path>] [--verbose]

Transfer flags: --transfer-id, --mode, --chain, --network, --account, --asset, --to, --amount; optional --message
Challenge flags: --challenge-id, --account, --algorithm, --domain, --digest, --encoding
A prepared send-intent --uri supplies transfer data instead of transfer flags.`

const walletResources =
  process.env['FOLDKIT_WALLET_RESOURCES'] === 'simulated'
    ? SimulatedWalletResources
    : MacOSLiveWalletResources

const arguments_ = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
)

const valueForFlag = (
  name: string,
): Effect.Effect<Option.Option<string>, WalletCliError> => {
  const maybeIndex = Array.findFirstIndex(
    arguments_,
    argument => argument === name,
  )
  if (Option.isNone(maybeIndex)) {
    return Effect.succeed(Option.none())
  }
  const maybeValue = Array.get(arguments_, maybeIndex.value + 1)
  if (Option.isSome(maybeValue) && !maybeValue.value.startsWith('--')) {
    return Effect.succeed(maybeValue)
  }
  return Effect.fail(
    new WalletCliError({ message: `Missing value for ${name}` }),
  )
}

const requiredValueForFlag = (
  name: string,
): Effect.Effect<string, WalletCliError> =>
  Effect.flatMap(valueForFlag(name), maybeValue =>
    Option.match(maybeValue, {
      onNone: () =>
        Effect.fail(
          new WalletCliError({ message: `Missing required flag ${name}` }),
        ),
      onSome: Effect.succeed,
    }),
  )

const networkModeForFlag = (
  maybeNetworkMode: Option.Option<string>,
): Effect.Effect<WalletNetworkMode, WalletCliError> => {
  if (Option.isNone(maybeNetworkMode)) {
    return Effect.succeed('Testnet')
  }
  return M.value(maybeNetworkMode.value.toLowerCase()).pipe(
    M.withReturnType<Effect.Effect<WalletNetworkMode, WalletCliError>>(),
    M.when('devnet', () => Effect.succeed('Devnet')),
    M.when('testnet', () => Effect.succeed('Testnet')),
    M.when('live', () => Effect.succeed('Live')),
    M.orElse(networkMode =>
      Effect.fail(
        new WalletCliError({
          message: `Unsupported network mode: ${networkMode}. Use devnet, testnet, or live.`,
        }),
      ),
    ),
  )
}

const transferInput = Effect.gen(function* () {
  const transferId = yield* requiredValueForFlag('--transfer-id')
  const networkMode = yield* networkModeForFlag(
    Option.some(yield* requiredValueForFlag('--mode')),
  )
  const chainId = yield* requiredValueForFlag('--chain')
  const networkId = yield* requiredValueForFlag('--network')
  const accountId = yield* requiredValueForFlag('--account')
  const assetId = yield* requiredValueForFlag('--asset')
  const destinationAddress = yield* requiredValueForFlag('--to')
  const atomicUnits = yield* requiredValueForFlag('--amount')
  const maybeMessage = yield* valueForFlag('--message')
  return WalletTransferInput.make({
    transferId,
    networkMode,
    chainId,
    networkId,
    accountId,
    assetId,
    destinationAddress,
    atomicUnits,
    maybeMessage,
  })
})

const maybeTransferInput = Effect.gen(function* () {
  const maybeCarrier = yield* valueForFlag('--uri')
  return Option.isSome(maybeCarrier)
    ? Option.none<typeof WalletTransferInput.Type>()
    : Option.some(yield* transferInput)
})

const testFundingInput = Effect.gen(function* () {
  const networkMode = yield* networkModeForFlag(
    Option.some(yield* requiredValueForFlag('--mode')),
  )
  return WalletTestFundingInput.make({
    networkMode,
    chainId: yield* requiredValueForFlag('--chain'),
    networkId: yield* requiredValueForFlag('--network'),
    accountId: yield* requiredValueForFlag('--account'),
    assetId: yield* requiredValueForFlag('--asset'),
    maybeDisplayAmount: yield* valueForFlag('--display-amount'),
  })
})

const challengeInput = Effect.gen(function* () {
  const challengeId = yield* requiredValueForFlag('--challenge-id')
  const accountId = yield* requiredValueForFlag('--account')
  const algorithm = yield* requiredValueForFlag('--algorithm')
  const domain = yield* requiredValueForFlag('--domain')
  const digest = yield* requiredValueForFlag('--digest')
  const encoding = yield* requiredValueForFlag('--encoding')
  return WalletChallengeInput.make({
    challengeId,
    accountId,
    algorithm,
    domain,
    digest,
    encoding,
  })
})

const operation = Effect.gen(function* () {
  const maybeName = Array.head(arguments_)
  if (Option.isNone(maybeName)) {
    return yield* Effect.fail(new WalletCliError({ message: usage }))
  }
  return yield* M.value(maybeName.value).pipe(
    M.withReturnType<Effect.Effect<WalletCliOperation, WalletCliError>>(),
    M.when('show', () =>
      Effect.succeed(WalletCliOperation.make({ _tag: 'Show' })),
    ),
    M.when('create', () =>
      Effect.gen(function* () {
        const maybeNetworkMode = yield* valueForFlag('--network')
        const networkMode = yield* networkModeForFlag(maybeNetworkMode)
        return WalletCliOperation.make({ _tag: 'CreateWallet', networkMode })
      }),
    ),
    M.when('receive', () =>
      Effect.gen(function* () {
        const accountId = yield* requiredValueForFlag('--account')
        const assetId = yield* requiredValueForFlag('--asset')
        return WalletCliOperation.make({
          _tag: 'Receive',
          accountId,
          assetId,
        })
      }),
    ),
    M.when('history', () =>
      Effect.succeed(WalletCliOperation.make({ _tag: 'History' })),
    ),
    M.when('history-next', () =>
      Effect.succeed(WalletCliOperation.make({ _tag: 'NextHistoryPage' })),
    ),
    M.when('fund', () =>
      Effect.map(testFundingInput, input =>
        WalletCliOperation.make({ _tag: 'RequestTestFunding', input }),
      ),
    ),
    M.when('preview', () =>
      Effect.map(maybeTransferInput, maybeInput =>
        WalletCliOperation.make({ _tag: 'Preview', maybeInput }),
      ),
    ),
    M.when('send', () =>
      Effect.map(maybeTransferInput, maybeInput =>
        WalletCliOperation.make({ _tag: 'Send', maybeInput }),
      ),
    ),
    M.when('sign-challenge', () =>
      Effect.map(challengeInput, input =>
        WalletCliOperation.make({ _tag: 'SignChallenge', input }),
      ),
    ),
    M.when('replay', () =>
      Effect.gen(function* () {
        const maybeFrameText = yield* valueForFlag('--frame')
        if (Option.isNone(maybeFrameText)) {
          return WalletCliOperation.make({
            _tag: 'InspectReplay',
            maybeFrame: Option.none(),
          })
        }
        const frame = Number.parseInt(maybeFrameText.value, 10)
        if (!Number.isInteger(frame) || frame < 0) {
          return yield* Effect.fail(
            new WalletCliError({
              message: `Invalid replay frame: ${maybeFrameText.value}`,
            }),
          )
        }
        return WalletCliOperation.make({
          _tag: 'InspectReplay',
          maybeFrame: Option.some(frame),
        })
      }),
    ),
    M.orElse(name =>
      Effect.fail(
        new WalletCliError({
          message: `Unknown operation: ${name}\n\n${usage}`,
        }),
      ),
    ),
  )
})

const program = Effect.gen(function* () {
  const selectedOperation = yield* operation
  const maybeCarrier = yield* valueForFlag('--uri')
  const execution = yield* executeWalletCli(
    selectedOperation,
    maybeCarrier,
    walletResources,
  )
  yield* Console.log(
    formatWalletCliExecution(
      execution,
      Array.contains(arguments_, '--verbose'),
    ),
  )
}).pipe(
  Effect.catch(error =>
    Console.error(error instanceof Error ? error.message : String(error)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1
        }),
      ),
    ),
  ),
  Effect.ensuring(Effect.sync(exitOneShotWalletCli)),
)

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
