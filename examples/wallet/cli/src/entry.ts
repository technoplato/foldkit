#!/usr/bin/env node
import { Array, Console, Effect, Match as M, Option, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  WalletAsset,
  WalletChallengeInput,
  WalletCliError,
  WalletCliOperation,
  WalletTransferInput,
  defaultWalletChallengeInput,
  defaultWalletTransferInput,
  executeWalletCli,
  formatWalletCliExecution,
} from './host.js'

const usage = `Usage:
  foldkit-wallet show [--uri <state-or-replay-path>] [--verbose]
  foldkit-wallet receive [--account <id>] [--asset <eth|sol|usdc>] [--uri <path>] [--verbose]
  foldkit-wallet preview [transfer flags] [--uri <path>] [--verbose]
  foldkit-wallet send [transfer flags] [--uri <path>] [--verbose]
  foldkit-wallet sign-challenge [challenge flags] [--uri <path>] [--verbose]
  foldkit-wallet replay [--frame <number>] [--uri <state-or-replay-path>] [--verbose]

Transfer flags: --transfer-id, --account, --asset, --to, --amount, --message
Challenge flags: --challenge-id, --account, --algorithm, --domain, --digest`

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

const assetForFlag = (
  maybeAsset: Option.Option<string>,
): Effect.Effect<WalletAsset, WalletCliError> => {
  if (Option.isNone(maybeAsset)) {
    return Effect.succeed(defaultWalletTransferInput.asset)
  }
  return M.value(maybeAsset.value.toLowerCase()).pipe(
    M.withReturnType<Effect.Effect<WalletAsset, WalletCliError>>(),
    M.when('eth', () => Effect.succeed(WalletAsset.make('Eth'))),
    M.when('sol', () => Effect.succeed(WalletAsset.make('Sol'))),
    M.when('usdc', () => Effect.succeed(WalletAsset.make('Usdc'))),
    M.orElse(asset =>
      Effect.fail(
        new WalletCliError({
          message: `Unsupported asset: ${asset}. Use eth, sol, or usdc.`,
        }),
      ),
    ),
  )
}

const transferInput = Effect.gen(function* () {
  const transferId = yield* valueForFlag('--transfer-id')
  const accountId = yield* valueForFlag('--account')
  const asset = yield* assetForFlag(yield* valueForFlag('--asset'))
  const destinationAddress = yield* valueForFlag('--to')
  const atomicUnits = yield* valueForFlag('--amount')
  const maybeMessage = yield* valueForFlag('--message')
  return WalletTransferInput.make({
    transferId: Option.getOrElse(
      transferId,
      () => defaultWalletTransferInput.transferId,
    ),
    accountId: Option.getOrElse(
      accountId,
      () => defaultWalletTransferInput.accountId,
    ),
    asset,
    destinationAddress: Option.getOrElse(
      destinationAddress,
      () => defaultWalletTransferInput.destinationAddress,
    ),
    atomicUnits: Option.getOrElse(
      atomicUnits,
      () => defaultWalletTransferInput.atomicUnits,
    ),
    maybeMessage,
  })
})

const challengeInput = Effect.gen(function* () {
  const challengeId = yield* valueForFlag('--challenge-id')
  const accountId = yield* valueForFlag('--account')
  const algorithm = yield* valueForFlag('--algorithm')
  const domain = yield* valueForFlag('--domain')
  const digestHex = yield* valueForFlag('--digest')
  const nextAlgorithm = Option.getOrElse(
    algorithm,
    () => defaultWalletChallengeInput.algorithm,
  )
  if (nextAlgorithm !== 'Keccak256' && nextAlgorithm !== 'Sha256') {
    return yield* Effect.fail(
      new WalletCliError({
        message: `Unsupported digest algorithm: ${nextAlgorithm}`,
      }),
    )
  }
  return WalletChallengeInput.make({
    challengeId: Option.getOrElse(
      challengeId,
      () => defaultWalletChallengeInput.challengeId,
    ),
    accountId: Option.getOrElse(
      accountId,
      () => defaultWalletChallengeInput.accountId,
    ),
    algorithm: nextAlgorithm,
    domain: Option.getOrElse(domain, () => defaultWalletChallengeInput.domain),
    digestHex: Option.getOrElse(
      digestHex,
      () => defaultWalletChallengeInput.digestHex,
    ),
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
    M.when('receive', () =>
      Effect.gen(function* () {
        const accountId = yield* valueForFlag('--account')
        const asset = yield* assetForFlag(yield* valueForFlag('--asset'))
        return WalletCliOperation.make({
          _tag: 'Receive',
          accountId: Option.getOrElse(
            accountId,
            () => defaultWalletTransferInput.accountId,
          ),
          asset,
        })
      }),
    ),
    M.when('preview', () =>
      Effect.map(transferInput, input =>
        WalletCliOperation.make({ _tag: 'Preview', input }),
      ),
    ),
    M.when('send', () =>
      Effect.map(transferInput, input =>
        WalletCliOperation.make({ _tag: 'Send', input }),
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
  const execution = yield* executeWalletCli(selectedOperation, maybeCarrier)
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
)

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
