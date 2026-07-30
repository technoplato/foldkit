import {
  Array,
  Data,
  Deferred,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import {
  AtomicUnits,
  ChangedTransferAmount,
  ComposedTransfer,
  DomainSeparatedDigest,
  type Message,
  Model,
  RequestedChallengeSignature,
  RequestedNextTransactionHistoryPage,
  RequestedSignedTransactionSubmission,
  RequestedTestFunding,
  RequestedTransactionHistoryReload,
  RequestedWalletCreation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SendAssetIntent,
  SendNetworkSelection,
  SigningChallenge,
  type TransactionPreview,
  TransferRequest,
  WalletIntentRouteError,
  type WalletNetworkMode,
  WalletProgram,
  type WalletResources,
  activeWalletAccounts,
  chainForId,
  parseWalletProgramRoute,
  primaryReceivingInstruction,
  primaryWalletTestFundingMethod,
  resolveSendNetworkSelection,
  walletIntentRouter,
} from 'wallet-core-example'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'

/** Input shared by preview and send operations. */
export const WalletTransferInput = S.Struct({
  transferId: S.String,
  networkMode: S.Literals(['Devnet', 'Testnet', 'Live']),
  chainId: S.String,
  networkId: S.String,
  accountId: S.String,
  assetId: S.String,
  destinationAddress: S.String,
  atomicUnits: S.String,
  maybeMessage: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
})
/** Input shared by preview and send operations. */
export type WalletTransferInput = typeof WalletTransferInput.Type

/** Input for one capability-gated test-funding request. */
export const WalletTestFundingInput = S.Struct({
  networkMode: S.Literals(['Devnet', 'Testnet', 'Live']),
  chainId: S.String,
  networkId: S.String,
  accountId: S.String,
  assetId: S.String,
  maybeDisplayAmount: S.Option(S.String),
})
/** Input for one capability-gated test-funding request. */
export type WalletTestFundingInput = typeof WalletTestFundingInput.Type

/** Input for one domain-separated challenge signature. */
export const WalletChallengeInput = S.Struct({
  challengeId: S.String,
  accountId: S.String,
  algorithm: S.String,
  domain: S.String,
  digest: S.String,
  encoding: S.String,
})
/** Input for one domain-separated challenge signature. */
export type WalletChallengeInput = typeof WalletChallengeInput.Type

/** One raw CLI operation over the canonical Wallet Program. */
export const WalletCliOperation = S.Union([
  S.TaggedStruct('Show', {}),
  S.TaggedStruct('CreateWallet', {
    networkMode: S.Literals(['Devnet', 'Testnet', 'Live']),
  }),
  S.TaggedStruct('Receive', {
    accountId: S.String,
    assetId: S.String,
  }),
  S.TaggedStruct('History', {}),
  S.TaggedStruct('NextHistoryPage', {}),
  S.TaggedStruct('RequestTestFunding', { input: WalletTestFundingInput }),
  S.TaggedStruct('Preview', { maybeInput: S.Option(WalletTransferInput) }),
  S.TaggedStruct('Send', { maybeInput: S.Option(WalletTransferInput) }),
  S.TaggedStruct('SignChallenge', { input: WalletChallengeInput }),
  S.TaggedStruct('InspectReplay', { maybeFrame: S.Option(S.Int) }),
])
/** One raw CLI operation over the canonical Wallet Program. */
export type WalletCliOperation = typeof WalletCliOperation.Type

/** The complete result of one finite raw CLI execution. */
export const WalletCliExecution = S.Struct({
  summary: S.String,
  progress: S.Array(S.String),
  model: Model,
  statePath: S.String,
  replayPath: S.String,
})
/** The complete result of one finite raw CLI execution. */
export type WalletCliExecution = typeof WalletCliExecution.Type

/** A raw Wallet host operation could not be completed. */
export class WalletCliError extends Data.TaggedError('WalletCliError')<{
  readonly message: string
}> {}

/** Every typed failure produced by the raw Wallet CLI contract. */
export type WalletCliExecutionError =
  | WalletCliError
  | WalletIntentRouteError
  | Program.ProgramRouteError
  | Runtime.ProgramRuntimeStartError
  | Runtime.ReplayFrameError
  | Runtime.UnsettledReplayFrameError

/** The exact Program object consumed by the raw CLI host. */
export const walletCliProgram: typeof WalletProgram = WalletProgram

const walletRouter = Program.makeRouter(WalletProgram)
const observationTimeout = '8 seconds'

const relativeRouteForCarrier = (
  carrier: string,
): Effect.Effect<string, WalletCliError> => {
  if (!carrier.includes('://')) {
    return Effect.succeed(carrier)
  }
  return Effect.try({
    try: () => {
      const url = new URL(carrier)
      return `${url.pathname}${url.search}`
    },
    catch: () =>
      new WalletCliError({ message: `Invalid Wallet URI: ${carrier}` }),
  })
}

const startForCarrier = (
  maybeCarrier: Option.Option<string>,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  | WalletCliError
  | WalletIntentRouteError
  | Program.ProgramRouteError
  | Runtime.ReplayFrameError
  | Runtime.UnsettledReplayFrameError
> => {
  if (Option.isNone(maybeCarrier)) {
    return Effect.succeed(Runtime.fresh())
  }
  return Effect.gen(function* () {
    const relativeRoute = yield* relativeRouteForCarrier(maybeCarrier.value)
    const route = yield* parseWalletProgramRoute(relativeRoute)
    return yield* M.value(route).pipe(
      M.withReturnType<
        Effect.Effect<
          Runtime.ProgramStart<Model, Message>,
          | WalletCliError
          | Runtime.ReplayFrameError
          | Runtime.UnsettledReplayFrameError
        >
      >(),
      M.tagsExhaustive({
        State: ({ model }) => Effect.succeed(Runtime.fromModel(model)),
        Replay: ({ tape, frame }) =>
          Effect.gen(function* () {
            const session = yield* Runtime.makeReplaySession(
              WalletProgram,
              tape,
              frame,
            )
            const branch = yield* session.branch()
            return Runtime.fromReplay(branch)
          }),
        SavedReplay: ({ tapeId }) =>
          Effect.fail(
            new WalletCliError({
              message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
            }),
          ),
      }),
    )
  })
}

const loadedSnapshot = (model: Model) => {
  if (model.portfolio._tag === 'LoadedPortfolio') {
    return Effect.succeed(model.portfolio.snapshot)
  } else if (model.portfolio._tag === 'FailedPortfolio') {
    return Effect.fail(
      new WalletCliError({
        message: `Wallet loading failed: ${model.portfolio.failure.operation}/${model.portfolio.failure.code}`,
      }),
    )
  } else {
    return Effect.fail(
      new WalletCliError({ message: 'Wallet portfolio is still loading' }),
    )
  }
}

const transferRequest = (
  model: Model,
  input: WalletTransferInput,
): Effect.Effect<
  Readonly<{
    request: typeof TransferRequest.Type
    selection: typeof SendNetworkSelection.Type
  }>,
  WalletCliError
> =>
  Effect.gen(function* () {
    const snapshot = yield* loadedSnapshot(model)
    const selection = SendNetworkSelection.make({
      networkMode: input.networkMode,
      chainId: input.chainId,
      networkId: input.networkId,
      accountId: input.accountId,
      assetId: input.assetId,
    })
    if (Option.isNone(resolveSendNetworkSelection(snapshot, selection))) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Unknown send network selection: ${input.networkMode}/${input.chainId}/${input.networkId}/${input.accountId}/${input.assetId}`,
        }),
      )
    }
    const maybeAccount = Array.findFirst(
      snapshot.accounts,
      account => account.accountId === input.accountId,
    )
    if (Option.isNone(maybeAccount)) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Unknown Wallet account: ${input.accountId}`,
        }),
      )
    }
    const maybeAsset = Array.findFirst(
      snapshot.assets,
      asset =>
        asset.assetId === input.assetId &&
        asset.networkId === maybeAccount.value.networkId,
    )
    if (Option.isNone(maybeAsset)) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Unknown Wallet asset for ${input.accountId}: ${input.assetId}`,
        }),
      )
    }
    const maybeBalance = Array.findFirst(
      snapshot.balanceSnapshot.balances,
      balance =>
        balance.accountId === input.accountId &&
        balance.amount.assetId === input.assetId,
    )
    if (Option.isNone(maybeBalance)) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `${input.assetId} is unavailable for ${input.accountId}`,
        }),
      )
    }
    const atomicUnits = yield* S.decodeUnknownEffect(AtomicUnits)(
      input.atomicUnits,
    ).pipe(
      Effect.mapError(
        () =>
          new WalletCliError({
            message: `Invalid atomic-unit amount: ${input.atomicUnits}`,
          }),
      ),
    )
    return {
      selection,
      request: TransferRequest.make({
        transferId: input.transferId,
        accountId: input.accountId,
        assetId: input.assetId,
        destinationAddress: input.destinationAddress,
        atomicUnits,
        maybeMessage: input.maybeMessage,
      }),
    }
  })

const challengeForInput = (
  input: WalletChallengeInput,
): typeof SigningChallenge.Type =>
  SigningChallenge.make({
    challengeId: input.challengeId,
    accountId: input.accountId,
    digest: DomainSeparatedDigest.make({
      algorithm: input.algorithm,
      domain: input.domain,
      digest: input.digest,
      encoding: input.encoding,
    }),
  })

const selectionForTestFunding = (
  model: Model,
  input: WalletTestFundingInput,
): Effect.Effect<SendNetworkSelection, WalletCliError> =>
  Effect.gen(function* () {
    const snapshot = yield* loadedSnapshot(model)
    const selection = SendNetworkSelection.make({
      networkMode: input.networkMode,
      chainId: input.chainId,
      networkId: input.networkId,
      accountId: input.accountId,
      assetId: input.assetId,
    })
    if (Option.isNone(resolveSendNetworkSelection(snapshot, selection))) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Unknown test-funding selection: ${input.networkMode}/${input.chainId}/${input.networkId}/${input.accountId}/${input.assetId}`,
        }),
      )
    }
    return selection
  })

const testFundingSummary = (
  model: Model,
): Effect.Effect<string, WalletCliError> => {
  if (model.testFunding._tag === 'ReceivedTestFunding') {
    const receipt = model.testFunding.receipt
    return Effect.succeed(
      `Test funding accepted: ${receipt.amount.atomicUnits} ${receipt.amount.assetId} | ${receipt.fundingId}`,
    )
  } else if (
    model.testFunding._tag === 'FailedTestFunding' ||
    model.testFunding._tag === 'UnavailableTestFunding'
  ) {
    return Effect.fail(
      new WalletCliError({
        message: `Test funding failed: ${model.testFunding.failure.operation}/${model.testFunding.failure.code}`,
      }),
    )
  } else {
    return Effect.fail(
      new WalletCliError({
        message: `Test funding did not settle: ${model.testFunding._tag}`,
      }),
    )
  }
}

const externalTestFundingSummary = (
  model: Model,
): Effect.Effect<string, WalletCliError> => {
  const maybeMethod = primaryWalletTestFundingMethod(model)
  const maybeInstruction = primaryReceivingInstruction(model)
  if (
    Option.isNone(maybeMethod) ||
    maybeMethod.value._tag !== 'ExternalTestFundingMethod' ||
    Option.isNone(maybeInstruction)
  ) {
    return Effect.fail(
      new WalletCliError({
        message: 'No external test-funding handoff is available.',
      }),
    )
  }
  return Effect.succeed(
    Array.join(
      [
        `Open ${maybeMethod.value.providerName}: ${maybeMethod.value.providerUrl}`,
        `Receiving address: ${maybeInstruction.value.destinationAddress}`,
        'Complete the provider-owned authentication or CAPTCHA flow, then reload history.',
      ],
      '\n',
    ),
  )
}

const receiveSummary = (
  model: Model,
  accountId: string,
  assetId: string,
): Effect.Effect<string, WalletCliError> =>
  Effect.gen(function* () {
    const snapshot = yield* loadedSnapshot(model)
    const maybeInstruction = Array.findFirst(
      snapshot.receivingInstructions,
      instruction =>
        instruction.accountId === accountId && instruction.assetId === assetId,
    )
    if (Option.isNone(maybeInstruction)) {
      return yield* Effect.fail(
        new WalletCliError({
          message: `No ${assetId} receiving instruction for ${accountId}`,
        }),
      )
    }
    return Array.join(
      [
        `Receive ${assetId}`,
        maybeInstruction.value.destinationAddress,
        maybeInstruction.value.portableUri,
      ],
      '\n',
    )
  })

const modelSummary = (model: Model): string => {
  const portfolio = M.value(model.portfolio).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WaitingForWalletProfiles: () => 'Portfolio: waiting for wallet profiles',
      LoadingPortfolio: () => 'Portfolio: loading',
      FailedPortfolio: ({ failure }) =>
        `Portfolio: failed ${failure.operation}/${failure.code}`,
      LoadedPortfolio: ({ snapshot }) =>
        `Portfolio: ${snapshot.accounts.length.toString()} accounts, ${snapshot.balanceSnapshot.balances.length.toString()} balances, ${snapshot.balanceSnapshot.unavailableAccountIds.length.toString()} unavailable`,
    }),
  )
  return Array.join(
    [
      portfolio,
      `Wallets: ${model.wallets.length.toString()} (${model.walletNetworkMode})`,
      `Transaction: ${model.transaction._tag}`,
      `Signature: ${model.signature._tag}`,
      `Transactions: ${model.transactions.length.toString()}`,
    ],
    '\n',
  )
}

const createdWalletSummary = (
  model: Model,
  networkMode: WalletNetworkMode,
): Effect.Effect<string, WalletCliError> => {
  if (model.walletCreation._tag === 'FailedWalletCreation') {
    return Effect.fail(
      new WalletCliError({
        message: `Wallet creation failed: ${model.walletCreation.code}`,
      }),
    )
  }
  const maybeWallet = Array.last(model.wallets)
  if (Option.isNone(maybeWallet)) {
    return Effect.fail(
      new WalletCliError({ message: 'Wallet creation did not settle' }),
    )
  }
  return Effect.gen(function* () {
    const snapshot = yield* loadedSnapshot(model)
    return Array.join(
      [
        `Created ${maybeWallet.value.displayName} (${networkMode})`,
        ...Array.map(
          activeWalletAccounts(
            maybeWallet.value,
            snapshot.networks,
            networkMode,
          ),
          account => {
            const chainName = Option.match(
              chainForId(snapshot.chains, account.chainId),
              {
                onNone: () => account.chainId,
                onSome: chain => chain.displayName,
              },
            )
            return `${chainName} | ${account.networkName} | ${account.address}`
          },
        ),
      ],
      '\n',
    )
  })
}

const transferPropertyLines = (
  model: Model,
  preview: TransactionPreview,
): Effect.Effect<ReadonlyArray<string>> => {
  if (Option.isNone(model.maybeSendNetworkSelection)) {
    return Effect.succeed([])
  }
  const source = model.maybeSendNetworkSelection.value
  const request = preview.transfer.request
  return walletIntentRouter
    .print(
      SendAssetIntent.make({
        source,
        atomicUnits: request.atomicUnits,
        destinationAddress: request.destinationAddress,
      }),
    )
    .pipe(
      Effect.orDie,
      Effect.map(intentPath => [
        `Intent: ${intentPath}`,
        `Network mode: ${source.networkMode}`,
        `Chain: ${source.chainId}`,
        `Network: ${source.networkId}`,
        `Account: ${source.accountId}`,
        `Asset: ${source.assetId}`,
        `Amount atomic units: ${request.atomicUnits}`,
        `To: ${request.destinationAddress}`,
      ]),
    )
}

const previewSummary = (
  model: Model,
): Effect.Effect<string, WalletCliError> => {
  if (model.transaction._tag === 'PreviewedTransaction') {
    const preview = model.transaction.preview
    return Effect.map(transferPropertyLines(model, preview), propertyLines =>
      Array.join(
        [
          `Preview ${preview.previewId}`,
          ...propertyLines,
          `Fee: ${preview.estimatedFee.atomicUnits} ${preview.estimatedFee.assetId}`,
          `Resulting balance: ${preview.resultingBalance.atomicUnits}`,
        ],
        '\n',
      ),
    )
  } else if (model.transaction._tag === 'FailedTransactionPreview') {
    return Effect.fail(
      new WalletCliError({
        message: `Preview failed: ${model.transaction.failure.operation}/${model.transaction.failure.code}`,
      }),
    )
  } else if (model.transaction._tag === 'InvalidTransfer') {
    return Effect.fail(
      new WalletCliError({
        message: Array.join(
          [
            model.transaction.guidance.summary,
            ...Array.map(
              model.transaction.guidance.details,
              detail => `- ${detail}`,
            ),
          ],
          '\n',
        ),
      }),
    )
  } else {
    return Effect.fail(
      new WalletCliError({
        message: `Preview did not settle: ${model.transaction._tag}`,
      }),
    )
  }
}

const waitForObservedTransaction = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  transactionId: string,
  observationStartFrame: number,
): Effect.Effect<Model, WalletCliError> => {
  const hasObservedTransaction = (): boolean =>
    Array.some(
      Array.drop(runtime.replay.readTape().transitions, observationStartFrame),
      transition =>
        transition.message._tag === 'ObservedTransaction' &&
        transition.message.transaction.transactionId === transactionId,
    )
  if (hasObservedTransaction()) {
    return Effect.succeed(runtime.readModel())
  }
  return Effect.gen(function* () {
    const observedModel = yield* Deferred.make<Model>()
    const stopObserving = runtime.observeModel(model => {
      if (hasObservedTransaction()) {
        Deferred.doneUnsafe(observedModel, Effect.succeed(model))
      }
    })
    if (hasObservedTransaction()) {
      Deferred.doneUnsafe(observedModel, Effect.succeed(runtime.readModel()))
    }
    const maybeObserved = yield* Deferred.await(observedModel).pipe(
      Effect.timeoutOption(observationTimeout),
      Effect.ensuring(Effect.sync(stopObserving)),
    )
    if (Option.isSome(maybeObserved)) {
      return maybeObserved.value
    } else {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Submitted transaction ${transactionId} was not observed within ${observationTimeout}`,
        }),
      )
    }
  })
}

const sendSummary = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  observationStartFrame: number,
): Effect.Effect<Readonly<{ model: Model; summary: string }>, WalletCliError> =>
  Effect.gen(function* () {
    const model = runtime.readModel()
    if (model.transaction._tag === 'FailedTransactionSubmission') {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Submission failed: ${model.transaction.failure.operation}/${model.transaction.failure.code}`,
        }),
      )
    }
    if (model.transaction._tag !== 'SubmittedTransaction') {
      return yield* Effect.fail(
        new WalletCliError({
          message: `Submission did not settle: ${model.transaction._tag}`,
        }),
      )
    }
    const transactionId = model.transaction.submission.transactionId
    const observedModel = yield* waitForObservedTransaction(
      runtime,
      transactionId,
      observationStartFrame,
    )
    const maybeConfirmation =
      model.transaction.submission.maybeExplorerConfirmation
    const confirmationLines = Option.isSome(maybeConfirmation)
      ? [
          `Confirm on ${maybeConfirmation.value.label}: ${maybeConfirmation.value.url}`,
        ]
      : []
    const propertyLines = yield* transferPropertyLines(
      model,
      model.transaction.preview,
    )
    return {
      model: observedModel,
      summary: Array.join(
        [
          `Submitted ${transactionId}`,
          ...propertyLines,
          ...confirmationLines,
          'Observed: yes',
        ],
        '\n',
      ),
    }
  })

const signatureSummary = (
  model: Model,
): Effect.Effect<string, WalletCliError> => {
  if (model.signature._tag === 'SignedChallenge') {
    return Effect.succeed(
      `Signed ${model.signature.challenge.challengeId}\n${model.signature.proof.algorithm}: ${model.signature.proof.signature}`,
    )
  } else if (model.signature._tag === 'FailedChallengeSignature') {
    return Effect.fail(
      new WalletCliError({
        message: `Challenge signing failed: ${model.signature.failure.operation}/${model.signature.failure.code}`,
      }),
    )
  } else {
    return Effect.fail(
      new WalletCliError({
        message: `Challenge signing did not settle: ${model.signature._tag}`,
      }),
    )
  }
}

const historySummary = (model: Model): string => {
  const state = M.value(model.transactionHistory).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NotLoadedTransactionHistory: () => 'not loaded',
      LoadingTransactionHistory: () => 'loading',
      LoadedTransactionHistory: ({ maybeNextCursor }) =>
        Option.isSome(maybeNextCursor) ? 'loaded, more available' : 'loaded',
      FailedTransactionHistory: ({ failure }) =>
        `failed ${failure.operation}/${failure.code}`,
    }),
  )
  const records = Array.map(
    model.transactions,
    transaction =>
      `${transaction.direction} ${transaction.status} | ${transaction.amount.atomicUnits} ${transaction.amount.assetId} | ${transaction.transactionId}`,
  )
  return Array.join(
    [
      `History: ${state}`,
      ...Array.match(records, {
        onEmpty: () => ['No transactions found.'],
        onNonEmpty: transactions => transactions,
      }),
    ],
    '\n',
  )
}

const executionForRuntime = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  operation: Exclude<WalletCliOperation, { _tag: 'InspectReplay' }>,
): Effect.Effect<Readonly<{ model: Model; summary: string }>, WalletCliError> =>
  M.value(operation).pipe(
    M.withReturnType<
      Effect.Effect<Readonly<{ model: Model; summary: string }>, WalletCliError>
    >(),
    M.tagsExhaustive({
      Show: () =>
        Effect.sync(() => ({
          model: runtime.readModel(),
          summary: modelSummary(runtime.readModel()),
        })),
      CreateWallet: ({ networkMode }) =>
        Effect.gen(function* () {
          yield* runtime.run(SelectedWalletNetworkMode.make({ networkMode }))
          const model = yield* runtime.run(RequestedWalletCreation.make({}))
          const summary = yield* createdWalletSummary(model, networkMode)
          return { model, summary }
        }),
      Receive: ({ accountId, assetId }) =>
        receiveSummary(runtime.readModel(), accountId, assetId).pipe(
          Effect.map(summary => ({ model: runtime.readModel(), summary })),
        ),
      History: () =>
        Effect.map(
          runtime.run(RequestedTransactionHistoryReload.make({})),
          model => ({ model, summary: historySummary(model) }),
        ),
      NextHistoryPage: () =>
        Effect.map(
          runtime.run(RequestedNextTransactionHistoryPage.make({})),
          model => ({ model, summary: historySummary(model) }),
        ),
      RequestTestFunding: ({ input }) =>
        Effect.gen(function* () {
          const selection = yield* selectionForTestFunding(
            runtime.readModel(),
            input,
          )
          const selectedModel = yield* runtime.run(
            SelectedSendNetwork.make({ selection }),
          )
          const maybeMethod = primaryWalletTestFundingMethod(selectedModel)
          if (
            Option.isSome(maybeMethod) &&
            maybeMethod.value._tag === 'ExternalTestFundingMethod'
          ) {
            const summary = yield* externalTestFundingSummary(selectedModel)
            return { model: selectedModel, summary }
          }
          if (
            Option.isNone(maybeMethod) ||
            maybeMethod.value._tag !== 'AdapterTestFundingMethod'
          ) {
            return yield* Effect.fail(
              new WalletCliError({
                message: 'Test funding is unavailable for this network.',
              }),
            )
          }
          if (Option.isNone(input.maybeDisplayAmount)) {
            return yield* Effect.fail(
              new WalletCliError({
                message:
                  '--display-amount is required for adapter-backed test funding.',
              }),
            )
          }
          yield* runtime.run(
            ChangedTransferAmount.make({
              value: input.maybeDisplayAmount.value,
            }),
          )
          const model = yield* runtime.run(RequestedTestFunding.make({}))
          const summary = yield* testFundingSummary(model)
          return { model, summary }
        }),
      Preview: ({ maybeInput }) =>
        Effect.gen(function* () {
          const initialModel = runtime.readModel()
          if (
            initialModel.walletIntent._tag === 'AppliedWalletIntent' &&
            initialModel.transaction._tag === 'PreviewedTransaction'
          ) {
            const summary = yield* previewSummary(initialModel)
            return { model: initialModel, summary }
          }
          if (Option.isNone(maybeInput)) {
            return yield* Effect.fail(
              new WalletCliError({
                message:
                  'Transfer flags are required unless --uri contains a prepared send intent.',
              }),
            )
          }
          const { request, selection } = yield* transferRequest(
            initialModel,
            maybeInput.value,
          )
          yield* runtime.run(SelectedSendNetwork.make({ selection }))
          const model = yield* runtime.run(ComposedTransfer.make({ request }))
          const summary = yield* previewSummary(model)
          return { model, summary }
        }),
      Send: ({ maybeInput }) =>
        Effect.gen(function* () {
          const initialModel = runtime.readModel()
          const previewedModel =
            initialModel.walletIntent._tag === 'AppliedWalletIntent' &&
            initialModel.transaction._tag === 'PreviewedTransaction'
              ? initialModel
              : yield* Effect.gen(function* () {
                  if (Option.isNone(maybeInput)) {
                    return yield* Effect.fail(
                      new WalletCliError({
                        message:
                          'Transfer flags are required unless --uri contains a prepared send intent.',
                      }),
                    )
                  }
                  const { request, selection } = yield* transferRequest(
                    initialModel,
                    maybeInput.value,
                  )
                  yield* runtime.run(SelectedSendNetwork.make({ selection }))
                  return yield* runtime.run(ComposedTransfer.make({ request }))
                })
          if (previewedModel.transaction._tag !== 'PreviewedTransaction') {
            const summary = yield* previewSummary(previewedModel)
            return { model: previewedModel, summary }
          }
          const observationStartFrame =
            runtime.replay.readTape().transitions.length
          yield* runtime.run(
            RequestedSignedTransactionSubmission.make({
              previewId: previewedModel.transaction.preview.previewId,
            }),
          )
          return yield* sendSummary(runtime, observationStartFrame)
        }),
      SignChallenge: ({ input }) =>
        Effect.gen(function* () {
          const model = yield* runtime.run(
            RequestedChallengeSignature.make({
              challenge: challengeForInput(input),
            }),
          )
          const summary = yield* signatureSummary(model)
          return { model, summary }
        }),
    }),
  )

const pathsForRuntime = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<
  Readonly<{ statePath: string; replayPath: string }>,
  Program.ProgramRouteError
> =>
  Effect.all({
    statePath: runtime.replay.router.print(runtime.replay.stateRoute()),
    replayPath: runtime.replay.router.print(runtime.replay.replayRoute()),
  })

const inspectReplay = (
  maybeFrame: Option.Option<number>,
  maybeCarrier: Option.Option<string>,
  resources: Layer.Layer<WalletResources>,
): Effect.Effect<
  WalletCliExecution,
  | WalletCliError
  | Program.ProgramRouteError
  | Runtime.ProgramRuntimeStartError
  | Runtime.ReplayFrameError
> =>
  Effect.scoped(
    Effect.gen(function* () {
      if (Option.isNone(maybeCarrier)) {
        const runtime = yield* Runtime.makeProgramRuntime({
          program: WalletProgram,
          resources,
        })
        yield* runtime.initialization
        const tape = runtime.replay.readTape()
        const frame = Option.getOrElse(
          maybeFrame,
          () => tape.transitions.length,
        )
        const model = yield* runtime.replay.inspect(frame)
        const statePath = yield* runtime.replay.router.print(
          Program.state(model),
        )
        const replayPath = yield* runtime.replay.router.print(
          Program.replay(tape, frame),
        )
        const progress = Array.map(
          Array.take(tape.transitions, frame),
          transition => transition.message._tag,
        )
        yield* runtime.shutdown
        return {
          summary: `Replay frame ${frame.toString()} of ${tape.transitions.length.toString()}\n${modelSummary(model)}`,
          progress,
          model,
          statePath,
          replayPath,
        }
      }

      const relativeRoute = yield* relativeRouteForCarrier(maybeCarrier.value)
      const route = yield* walletRouter.parse(relativeRoute)
      if (route._tag === 'SavedReplay') {
        return yield* Effect.fail(
          new WalletCliError({
            message: `Saved replay ${route.tapeId} needs a ReplayTapeStore`,
          }),
        )
      }
      if (route._tag === 'State') {
        const statePath = yield* walletRouter.print(route)
        return {
          summary: `State inspection\n${modelSummary(route.model)}`,
          progress: [],
          model: route.model,
          statePath,
          replayPath: statePath,
        }
      }
      const frame = Option.getOrElse(maybeFrame, () => route.frame)
      const model = yield* Runtime.replayToFrame(
        WalletProgram,
        route.tape,
        frame,
      )
      const statePath = yield* walletRouter.print(Program.state(model))
      const replayPath = yield* walletRouter.print(
        Program.replay(route.tape, frame),
      )
      return {
        summary: `Replay frame ${frame.toString()} of ${route.tape.transitions.length.toString()}\n${modelSummary(model)}`,
        progress: Array.map(
          Array.take(route.tape.transitions, frame),
          transition => transition.message._tag,
        ),
        model,
        statePath,
        replayPath,
      }
    }),
  )

/** Runs one raw CLI operation and awaits every finite causal Command chain. */
export const executeWalletCli = (
  operation: WalletCliOperation,
  maybeCarrier = Option.none<string>(),
  resources: Layer.Layer<WalletResources> = MacOSLiveWalletResources,
): Effect.Effect<WalletCliExecution, WalletCliExecutionError> => {
  if (operation._tag === 'InspectReplay') {
    return inspectReplay(operation.maybeFrame, maybeCarrier, resources)
  }
  return Effect.scoped(
    Effect.gen(function* () {
      const start = yield* startForCarrier(maybeCarrier)
      const runtime = yield* Runtime.makeProgramRuntime({
        program: WalletProgram,
        resources,
        start,
      })
      yield* runtime.initialization
      const result = yield* executionForRuntime(runtime, operation)
      const paths = yield* pathsForRuntime(runtime)
      const progress = Array.map(
        runtime.journal.read().transitions,
        transition => transition.message._tag,
      )
      yield* runtime.shutdown
      return { ...result, ...paths, progress }
    }),
  )
}

/** Formats one CLI result for normal or verbose stdout. */
export const formatWalletCliExecution = (
  execution: WalletCliExecution,
  isVerbose: boolean,
): string => {
  if (!isVerbose) {
    return execution.summary
  }
  const progress = Array.isReadonlyArrayEmpty(execution.progress)
    ? 'none'
    : Array.join(execution.progress, ' -> ')
  return Array.join(
    [
      execution.summary,
      '',
      `Progress: ${progress}`,
      `State: ${execution.statePath}`,
      `Replay: ${execution.replayPath}`,
      'Model:',
      JSON.stringify(execution.model, null, 2),
    ],
    '\n',
  )
}
