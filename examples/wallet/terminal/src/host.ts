import {
  Array,
  Cause,
  Data,
  Deferred,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Pull,
  Queue,
  Schema as S,
  Terminal,
} from 'effect'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import {
  ChangedTransferAmount,
  ChangedTransferRecipient,
  ComposedTransfer,
  DomainSeparatedDigest,
  type Message,
  Model,
  RequestedChallengeSignature,
  RequestedClipboardCopy,
  RequestedNextTransactionHistoryPage,
  RequestedSignedTransactionSubmission,
  RequestedTestFunding,
  RequestedTransactionHistoryReload,
  RequestedTransferPreview,
  RequestedWalletCreation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SigningChallenge,
  TransferRequest,
  WalletIntentRouteError,
  WalletProgram,
  type WalletResources,
  activeWalletAccounts,
  assetAmountLabelForModel,
  clipboardCopyRequestForAddress,
  isTransferPreviewActionEnabled,
  nextSendNetworkSelection,
  parseWalletProgramRoute,
  primaryReceivingInstruction,
  primaryWalletSuggestedTestTransferAmount,
  primaryWalletSuggestedTestTransferLabel,
  primaryWalletTestFundingMethod,
  selectedSendNetworkLabel,
  toggledWalletNetworkMode,
  transferAmountInput,
  transferPreviewReadinessLabel,
  transferRecipientInput,
  walletAccountBalanceLabel,
} from 'wallet-core-example'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'

const clearScreen = '\u001b[2J\u001b[H'
const observationTimeout = '8 seconds'

/** A native input action supported by the interactive Effect Terminal host. */
export const WalletTerminalAction = S.Literals([
  'Show',
  'CreateWallet',
  'ToggleNetwork',
  'SelectNextSendNetwork',
  'UseSuggestedTestAmount',
  'EditAmount',
  'EditRecipient',
  'Receive',
  'ReloadHistory',
  'NextHistoryPage',
  'RequestTestFunding',
  'Preview',
  'Send',
  'SignChallenge',
  'InspectPrevious',
  'InspectNext',
  'ReturnLive',
  'Quit',
])
/** A native input action supported by the interactive Effect Terminal host. */
export type WalletTerminalAction = typeof WalletTerminalAction.Type

const WalletTerminalInputMode = S.Literals(['Actions', 'Amount', 'Recipient'])
type WalletTerminalInputMode = typeof WalletTerminalInputMode.Type

/** Render input for one Effect Terminal frame. */
export const WalletTerminalSnapshot = S.Struct({
  model: Model,
  mode: S.Literals(['Live', 'Inspecting']),
  frame: S.Int,
  finalFrame: S.Int,
  maybeNotice: S.Option(S.String),
  inputMode: WalletTerminalInputMode,
})
/** Render input for one Effect Terminal frame. */
export type WalletTerminalSnapshot = typeof WalletTerminalSnapshot.Type

/** An interactive Wallet operation could not be completed. */
export class WalletTerminalError extends Data.TaggedError(
  'WalletTerminalError',
)<{ readonly message: string }> {}

/** The exact Program object consumed by the Effect Terminal host. */
export const walletTerminalProgram: typeof WalletProgram = WalletProgram

const replayActionForWalletTerminalInput = (
  input: string,
): Option.Option<WalletTerminalAction> =>
  M.value(input).pipe(
    M.withReturnType<Option.Option<WalletTerminalAction>>(),
    M.when('left', () => Option.some('InspectPrevious')),
    M.when('h', () => Option.some('InspectPrevious')),
    M.when('right', () => Option.some('InspectNext')),
    M.when('l', () => Option.some('InspectNext')),
    M.when('v', () => Option.some('ReturnLive')),
    M.when('q', () => Option.some('Quit')),
    M.orElse(() => Option.none()),
  )

const relativeRouteForCarrier = (
  carrier: string,
): Effect.Effect<string, WalletTerminalError> => {
  if (!carrier.includes('://')) {
    return Effect.succeed(carrier)
  }
  return Effect.try({
    try: () => {
      const url = new URL(carrier)
      return `${url.pathname}${url.search}`
    },
    catch: () =>
      new WalletTerminalError({ message: `Invalid Wallet URI: ${carrier}` }),
  })
}

/** Maps native terminal input to one discoverable Wallet action. */
export const actionForWalletTerminalInput = (
  input: string,
): Option.Option<WalletTerminalAction> => {
  const normalizedInput = input.toLowerCase()
  return M.value(normalizedInput).pipe(
    M.withReturnType<Option.Option<WalletTerminalAction>>(),
    M.when('s', () => Option.some('Show')),
    M.when('w', () => Option.some('CreateWallet')),
    M.when('t', () => Option.some('ToggleNetwork')),
    M.when('x', () => Option.some('SelectNextSendNetwork')),
    M.when('u', () => Option.some('UseSuggestedTestAmount')),
    M.when('a', () => Option.some('EditAmount')),
    M.when('d', () => Option.some('EditRecipient')),
    M.when('r', () => Option.some('Receive')),
    M.when('y', () => Option.some('ReloadHistory')),
    M.when('g', () => Option.some('NextHistoryPage')),
    M.when('f', () => Option.some('RequestTestFunding')),
    M.when('p', () => Option.some('Preview')),
    M.when('n', () => Option.some('Send')),
    M.when('c', () => Option.some('SignChallenge')),
    M.orElse(() => replayActionForWalletTerminalInput(normalizedInput)),
  )
}

const modelLines = (model: Model): ReadonlyArray<string> => {
  const networks =
    model.portfolio._tag === 'LoadedPortfolio'
      ? model.portfolio.snapshot.networks
      : []
  const portfolioLines = M.value(model.portfolio).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      WaitingForWalletProfiles: () => [
        'Portfolio: waiting for wallet profiles',
      ],
      LoadingPortfolio: () => ['Portfolio: loading'],
      FailedPortfolio: ({ failure }) => [
        `Portfolio: failed ${failure.operation}/${failure.code}`,
      ],
      LoadedPortfolio: ({ snapshot }) => [
        `Portfolio: ${snapshot.accounts.length.toString()} accounts | ${snapshot.balanceSnapshot.unavailableAccountIds.length.toString()} balances unavailable`,
        ...Array.map(
          snapshot.balanceSnapshot.balances,
          balance =>
            `${balance.accountId} | ${balance.amount.assetId} ${balance.amount.atomicUnits}`,
        ),
        ...Array.map(
          snapshot.balanceSnapshot.unavailableAccountIds,
          accountId => `${accountId} | balance unavailable, refresh to retry`,
        ),
      ],
    }),
  )
  const transactionLines =
    model.transaction._tag === 'SubmittedTransaction' &&
    Option.isSome(model.transaction.submission.maybeExplorerConfirmation)
      ? [
          `Confirm on ${model.transaction.submission.maybeExplorerConfirmation.value.label}: ${model.transaction.submission.maybeExplorerConfirmation.value.url}`,
        ]
      : []
  const addressValidationLines =
    model.transferRecipient._tag === 'InvalidTransferRecipient'
      ? [
          model.transferRecipient.guidance.summary,
          ...Array.map(
            model.transferRecipient.guidance.details,
            detail => `- ${detail}`,
          ),
        ]
      : []
  const walletLines = Array.flatMap(model.wallets, wallet => [
    `${wallet.displayName} | ${model.walletNetworkMode}`,
    ...Array.map(
      activeWalletAccounts(wallet, networks, model.walletNetworkMode),
      account =>
        `  ${account.chainId} | ${account.networkName} | ${walletAccountBalanceLabel(model, account.accountId)} | ${account.address}`,
    ),
  ])
  return [
    ...portfolioLines,
    `Wallets: ${model.wallets.length.toString()} | ${model.walletNetworkMode}`,
    `Send network: ${Option.match(model.maybeSendNetworkSelection, {
      onNone: () => 'unavailable',
      onSome: () => selectedSendNetworkLabel(model),
    })}`,
    ...walletLines,
    `Transaction: ${model.transaction._tag}`,
    `Amount: ${transferAmountInput(model.transferAmount)}`,
    `Recipient: ${transferRecipientInput(model.transferRecipient)}`,
    `Send readiness: ${transferPreviewReadinessLabel(model)}`,
    ...transactionLines,
    ...addressValidationLines,
    `Signature: ${model.signature._tag}`,
    `History: ${model.transactionHistory._tag} | Observation: ${model.transactionObservation._tag} | Funding: ${model.testFunding._tag} | Clipboard: ${model.clipboardCopy._tag}`,
    `Transactions: ${model.transactions.length.toString()}`,
    ...Array.map(
      Array.take(model.transactions, 6),
      transaction =>
        `  ${transaction.direction} | ${transaction.status} | ${assetAmountLabelForModel(model, transaction.amount)} | ${transaction.transactionId}`,
    ),
  ]
}

/** Renders one canonical Wallet Model for the Effect Terminal client. */
export const renderWalletTerminal = (
  snapshot: WalletTerminalSnapshot,
): string => {
  const noticeLines = Option.match(snapshot.maybeNotice, {
    onNone: () => Array.empty<string>(),
    onSome: notice => ['', notice],
  })
  const inputLines = M.value(snapshot.inputMode).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.when('Actions', () => []),
    M.when('Amount', () => [
      '',
      'Editing amount. Type, Backspace, then Enter to finish.',
    ]),
    M.when('Recipient', () => [
      '',
      'Editing recipient. Type or paste, Backspace, then Enter to finish.',
    ]),
    M.exhaustive,
  )
  return Array.join(
    [
      clearScreen,
      'Foldkit Wallet | Effect Terminal',
      `${snapshot.mode} | frame ${snapshot.frame.toString()} of ${snapshot.finalFrame.toString()}`,
      '',
      ...modelLines(snapshot.model),
      ...noticeLines,
      ...inputLines,
      '',
      '[s] Show  [w] Create wallet  [t] Cycle Devnet/Testnet/Live  [x] Next send network',
      '[a] Edit amount  [u] Use small test amount  [d] Edit recipient  [p] Preview  [n] Send',
      '[r] Receive  [y] Reload history  [g] Next history page',
      '[f] Request test funds  [c] Sign challenge',
      '[←/h] Previous replay frame  [→/l] Next replay frame  [v] Live',
      '[q] Quit',
    ],
    '\n',
  )
}

const defaultChallenge = (
  model: Model,
): Effect.Effect<typeof SigningChallenge.Type, WalletTerminalError> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Effect.fail(
      new WalletTerminalError({ message: 'Wallet portfolio is not loaded' }),
    )
  }
  const maybeSelection = model.maybeSendNetworkSelection
  const maybeAccount = Option.isSome(maybeSelection)
    ? Array.findFirst(
        model.portfolio.snapshot.accounts,
        account => account.accountId === maybeSelection.value.accountId,
      )
    : Array.head(model.portfolio.snapshot.accounts)
  if (Option.isNone(maybeAccount)) {
    return Effect.fail(
      new WalletTerminalError({ message: 'No Wallet account is available' }),
    )
  }
  return Effect.succeed(
    SigningChallenge.make({
      challengeId: 'terminal-challenge',
      accountId: maybeAccount.value.accountId,
      digest: DomainSeparatedDigest.make({
        algorithm: 'keccak256',
        domain: 'wallet.example/access/v1',
        digest:
          '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22',
        encoding: 'hex',
      }),
    }),
  )
}

const receivingNotice = (model: Model): string => {
  const maybeInstruction = primaryReceivingInstruction(model)
  if (Option.isSome(maybeInstruction)) {
    return `Receive ${maybeInstruction.value.assetId}: ${maybeInstruction.value.destinationAddress} | ${maybeInstruction.value.portableUri}`
  } else {
    return 'No receiving instruction is available for the selected network.'
  }
}

const waitForObservedTransaction = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  transactionId: string,
  observationStartFrame: number,
): Effect.Effect<Model, WalletTerminalError> => {
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
        new WalletTerminalError({
          message: `Submitted transaction ${transactionId} was not observed`,
        }),
      )
    }
  })
}

/** Submits a prepared route preview or an explicitly supplied transfer request. */
export const sendWalletTransaction = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  maybeRequest = Option.none<typeof TransferRequest.Type>(),
): Effect.Effect<Model, WalletTerminalError> =>
  Effect.gen(function* () {
    const previewed = Option.isSome(maybeRequest)
      ? yield* runtime.run(
          ComposedTransfer.make({ request: maybeRequest.value }),
        )
      : runtime.readModel()
    if (previewed.transaction._tag !== 'PreviewedTransaction') {
      return yield* Effect.fail(
        new WalletTerminalError({
          message:
            'No prepared transfer is available. Open the terminal with a Foldkit send-intent URI.',
        }),
      )
    }
    const observationStartFrame = runtime.replay.readTape().transitions.length
    const submitted = yield* runtime.run(
      RequestedSignedTransactionSubmission.make({
        previewId: previewed.transaction.preview.previewId,
      }),
    )
    if (submitted.transaction._tag !== 'SubmittedTransaction') {
      return yield* Effect.fail(
        new WalletTerminalError({
          message: `Submission did not settle: ${submitted.transaction._tag}`,
        }),
      )
    }
    return yield* waitForObservedTransaction(
      runtime,
      submitted.transaction.submission.transactionId,
      observationStartFrame,
    )
  })

type TerminalState = Readonly<{
  runtime: Runtime.ProgramRuntime<Model, Message>
  maybeReplaySession: Option.Option<Runtime.ReplaySession<Model, Message>>
  maybeNotice: Option.Option<string>
  inputMode: WalletTerminalInputMode
}>

const snapshotForState = (state: TerminalState): WalletTerminalSnapshot => {
  if (Option.isSome(state.maybeReplaySession)) {
    const session = state.maybeReplaySession.value
    return {
      model: session.readModel(),
      mode: 'Inspecting',
      frame: session.readFrame(),
      finalFrame: session.readTape().transitions.length,
      maybeNotice: state.maybeNotice,
      inputMode: state.inputMode,
    }
  }
  const tape = state.runtime.replay.readTape()
  return {
    model: state.runtime.readModel(),
    mode: 'Live',
    frame: tape.transitions.length,
    finalFrame: tape.transitions.length,
    maybeNotice: state.maybeNotice,
    inputMode: state.inputMode,
  }
}

const runLiveAction = (
  state: TerminalState,
  action: Exclude<
    WalletTerminalAction,
    'InspectPrevious' | 'InspectNext' | 'ReturnLive' | 'Quit'
  >,
): Effect.Effect<
  TerminalState,
  WalletTerminalError | Runtime.ReplayFrameError
> =>
  M.value(action).pipe(
    M.withReturnType<
      Effect.Effect<
        TerminalState,
        WalletTerminalError | Runtime.ReplayFrameError
      >
    >(),
    M.when('Show', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some('Current public Wallet Model.'),
      }),
    ),
    M.when('CreateWallet', () =>
      Effect.map(
        state.runtime.run(RequestedWalletCreation.make({})),
        model => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Wallet creation settled: ${model.walletCreation._tag}`,
          ),
        }),
      ),
    ),
    M.when('ToggleNetwork', () =>
      Effect.map(
        state.runtime.run(
          SelectedWalletNetworkMode.make({
            networkMode: toggledWalletNetworkMode(
              state.runtime.readModel().walletNetworkMode,
            ),
          }),
        ),
        model => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `All wallets switched to ${model.walletNetworkMode}.`,
          ),
        }),
      ),
    ),
    M.when('SelectNextSendNetwork', () => {
      const model = state.runtime.readModel()
      if (
        model.portfolio._tag !== 'LoadedPortfolio' ||
        Option.isNone(model.maybeSendNetworkSelection)
      ) {
        return Effect.succeed({
          ...state,
          maybeNotice: Option.some('No send network is available.'),
        })
      }
      const maybeSelection = nextSendNetworkSelection(
        model.portfolio.snapshot,
        model.maybeSendNetworkSelection.value,
      )
      if (Option.isNone(maybeSelection)) {
        return Effect.succeed({
          ...state,
          maybeNotice: Option.some('No send network is available.'),
        })
      }
      return Effect.map(
        state.runtime.run(
          SelectedSendNetwork.make({ selection: maybeSelection.value }),
        ),
        nextModel => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Send network selected: ${Option.match(
              nextModel.maybeSendNetworkSelection,
              {
                onNone: () => 'unavailable',
                onSome: selection => selection.networkId,
              },
            )}.`,
          ),
        }),
      )
    }),
    M.when('UseSuggestedTestAmount', () => {
      const model = state.runtime.readModel()
      const maybeAmount = primaryWalletSuggestedTestTransferAmount(model)
      const maybeLabel = primaryWalletSuggestedTestTransferLabel(model)
      if (Option.isNone(maybeAmount)) {
        return Effect.succeed({
          ...state,
          maybeNotice: Option.some(
            'No adapter-suggested test amount is available.',
          ),
        })
      }
      return Effect.map(
        state.runtime.run(
          ChangedTransferAmount.make({ value: maybeAmount.value }),
        ),
        () => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Small test amount selected: ${Option.getOrElse(
              maybeLabel,
              () => maybeAmount.value,
            )}.`,
          ),
        }),
      )
    }),
    M.when('EditAmount', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some('Editing the selected transfer amount.'),
        inputMode: 'Amount',
      }),
    ),
    M.when('EditRecipient', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some('Editing the selected transfer recipient.'),
        inputMode: 'Recipient',
      }),
    ),
    M.when('Receive', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some(receivingNotice(state.runtime.readModel())),
      }),
    ),
    M.when('ReloadHistory', () =>
      Effect.map(
        state.runtime.run(RequestedTransactionHistoryReload.make({})),
        model => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `History reload settled: ${model.transactionHistory._tag}.`,
          ),
        }),
      ),
    ),
    M.when('NextHistoryPage', () =>
      Effect.map(
        state.runtime.run(RequestedNextTransactionHistoryPage.make({})),
        model => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Next history page settled: ${model.transactionHistory._tag}.`,
          ),
        }),
      ),
    ),
    M.when('RequestTestFunding', () => {
      const model = state.runtime.readModel()
      const maybeMethod = primaryWalletTestFundingMethod(model)
      if (
        Option.isSome(maybeMethod) &&
        maybeMethod.value._tag === 'ExternalTestFundingMethod'
      ) {
        const maybeInstruction = primaryReceivingInstruction(model)
        if (Option.isNone(maybeInstruction)) {
          return Effect.succeed({
            ...state,
            maybeReplaySession: Option.none(),
            maybeNotice: Option.some(
              `Open ${maybeMethod.value.providerName}: ${maybeMethod.value.providerUrl}`,
            ),
          })
        }
        return Effect.map(
          state.runtime.run(
            RequestedClipboardCopy.make({
              request: clipboardCopyRequestForAddress(
                maybeInstruction.value.destinationAddress,
                'external-faucet',
              ),
            }),
          ),
          () => ({
            ...state,
            maybeReplaySession: Option.none(),
            maybeNotice: Option.some(
              `Address copied. Open ${maybeMethod.value.providerName}: ${maybeMethod.value.providerUrl} | ${maybeInstruction.value.destinationAddress}`,
            ),
          }),
        )
      }
      if (
        Option.isNone(maybeMethod) ||
        maybeMethod.value._tag !== 'AdapterTestFundingMethod'
      ) {
        return Effect.succeed({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            'Test funding is unavailable for this network.',
          ),
        })
      }
      return Effect.map(
        state.runtime.run(RequestedTestFunding.make({})),
        nextModel => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Test funding settled: ${nextModel.testFunding._tag}.`,
          ),
        }),
      )
    }),
    M.when('Preview', () => {
      const model = state.runtime.readModel()
      if (!isTransferPreviewActionEnabled(model)) {
        return Effect.succeed({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(transferPreviewReadinessLabel(model)),
        })
      }
      return Effect.map(
        state.runtime.run(RequestedTransferPreview.make({})),
        nextModel => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            nextModel.transaction._tag === 'PreviewedTransaction'
              ? 'The transfer preview is ready to send.'
              : `Preview failed to settle: ${nextModel.transaction._tag}.`,
          ),
        }),
      )
    }),
    M.when('Send', () =>
      Effect.map(sendWalletTransaction(state.runtime), model => ({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some(
          model.transaction._tag === 'SubmittedTransaction' &&
            Option.isSome(
              model.transaction.submission.maybeExplorerConfirmation,
            )
            ? `Send settled: ${model.transaction._tag}; confirm on ${model.transaction.submission.maybeExplorerConfirmation.value.label}: ${model.transaction.submission.maybeExplorerConfirmation.value.url}`
            : `Send settled: ${model.transaction._tag}; transactions ${model.transactions.length.toString()}`,
        ),
      })),
    ),
    M.when('SignChallenge', () =>
      Effect.gen(function* () {
        const challenge = yield* defaultChallenge(state.runtime.readModel())
        const model = yield* state.runtime.run(
          RequestedChallengeSignature.make({ challenge }),
        )
        return {
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Signature settled: ${model.signature._tag}`,
          ),
        }
      }),
    ),
    M.exhaustive,
  )

const runTerminalAction = (
  state: TerminalState,
  action: Exclude<WalletTerminalAction, 'Quit'>,
): Effect.Effect<
  TerminalState,
  WalletTerminalError | Runtime.ReplayFrameError
> => {
  if (action === 'ReturnLive') {
    return Effect.succeed({
      ...state,
      maybeReplaySession: Option.none(),
      maybeNotice: Option.some('Returned to the live Wallet runtime.'),
    })
  }
  if (action === 'InspectPrevious') {
    return Effect.gen(function* () {
      const session = Option.isSome(state.maybeReplaySession)
        ? state.maybeReplaySession.value
        : yield* state.runtime.replay.makeSession()
      yield* session.stepBackward
      return {
        ...state,
        maybeReplaySession: Option.some(session),
        maybeNotice: Option.some('Historical Commands remain inert.'),
      }
    })
  }
  if (action === 'InspectNext') {
    if (Option.isNone(state.maybeReplaySession)) {
      return Effect.succeed({
        ...state,
        maybeNotice: Option.some('Already at the live final frame.'),
      })
    }
    const session = state.maybeReplaySession.value
    return Effect.gen(function* () {
      yield* session.stepForward
      return { ...state, maybeNotice: Option.some('Inspected next frame.') }
    })
  }
  if (Option.isSome(state.maybeReplaySession)) {
    return Effect.succeed({
      ...state,
      maybeNotice: Option.some('Press v before sending a live Wallet action.'),
    })
  }
  return runLiveAction(state, action)
}

const runTransferInput = (
  state: TerminalState,
  input: Terminal.UserInput,
): Effect.Effect<TerminalState> => {
  const keyName = input.key.name.toLowerCase()
  if (keyName === 'enter' || keyName === 'return') {
    return Effect.succeed({
      ...state,
      inputMode: 'Actions',
      maybeNotice: Option.some('Transfer field editing finished.'),
    })
  }
  if (keyName === 'escape') {
    return Effect.succeed({
      ...state,
      inputMode: 'Actions',
      maybeNotice: Option.some('Returned to Wallet actions.'),
    })
  }
  const model = state.runtime.readModel()
  const currentValue =
    state.inputMode === 'Amount'
      ? transferAmountInput(model.transferAmount)
      : transferRecipientInput(model.transferRecipient)
  const nextValue =
    keyName === 'backspace'
      ? currentValue.slice(0, -1)
      : Option.match(input.input, {
          onNone: () => currentValue,
          onSome: value => currentValue + value,
        })
  if (nextValue === currentValue) {
    return Effect.succeed(state)
  }
  const message =
    state.inputMode === 'Amount'
      ? ChangedTransferAmount.make({ value: nextValue })
      : ChangedTransferRecipient.make({ value: nextValue })
  return Effect.map(state.runtime.run(message), () => state)
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  state: TerminalState,
  terminal: Terminal.Terminal,
): Effect.Effect<
  void,
  | Cause.Done
  | PlatformError.PlatformError
  | WalletTerminalError
  | Runtime.ReplayFrameError
> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const keyName = input.key.name.toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      if (isControlQuit) {
        return Effect.void
      }
      if (state.inputMode !== 'Actions') {
        return runTransferInput(state, input).pipe(
          Effect.flatMap(nextState =>
            terminal
              .display(renderWalletTerminal(snapshotForState(nextState)))
              .pipe(
                Effect.flatMap(() =>
                  runInputLoop(inputQueue, nextState, terminal),
                ),
              ),
          ),
        )
      }
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const maybeAction = actionForWalletTerminalInput(key)
      if (Option.isNone(maybeAction)) {
        const nextState = {
          ...state,
          maybeNotice: Option.some(`No Wallet action is bound to "${key}".`),
        }
        return terminal
          .display(renderWalletTerminal(snapshotForState(nextState)))
          .pipe(
            Effect.flatMap(() => runInputLoop(inputQueue, nextState, terminal)),
          )
      }
      const action = maybeAction.value
      if (action === 'Quit') {
        return Effect.void
      }
      return runTerminalAction(state, action).pipe(
        Effect.flatMap(nextState =>
          terminal
            .display(renderWalletTerminal(snapshotForState(nextState)))
            .pipe(
              Effect.flatMap(() =>
                runInputLoop(inputQueue, nextState, terminal),
              ),
            ),
        ),
      )
    }),
  )

const startForCarrier = (
  maybeCarrier: Option.Option<string>,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  | WalletTerminalError
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
    if (route._tag === 'SavedReplay') {
      return yield* Effect.fail(
        new WalletTerminalError({
          message: `Saved replay ${route.tapeId} needs a ReplayTapeStore`,
        }),
      )
    }
    if (route._tag === 'State') {
      return Runtime.fromModel(route.model)
    }
    const session = yield* Runtime.makeReplaySession(
      WalletProgram,
      route.tape,
      route.frame,
    )
    return Runtime.fromReplay(yield* session.branch())
  })
}

/** Runs the interactive Effect Terminal client over an optional portable path. */
export const runWalletTerminal = (
  maybeCarrier = Option.none<string>(),
  resources: Layer.Layer<WalletResources> = MacOSLiveWalletResources,
): Effect.Effect<
  void,
  | PlatformError.PlatformError
  | WalletTerminalError
  | WalletIntentRouteError
  | Program.ProgramRouteError
  | Runtime.ProgramRuntimeStartError
  | Runtime.ReplayFrameError
  | Runtime.UnsettledReplayFrameError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const start = yield* startForCarrier(maybeCarrier)
      const runtime = yield* Runtime.makeProgramRuntime({
        program: WalletProgram,
        resources,
        start,
      })
      yield* runtime.initialization
      const state: TerminalState = {
        runtime,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.none(),
        inputMode: 'Actions',
      }
      yield* terminal.display(renderWalletTerminal(snapshotForState(state)))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, state, terminal).pipe(
        Pull.catchDone(() => Effect.void),
      )
      yield* runtime.shutdown
    }),
  )
