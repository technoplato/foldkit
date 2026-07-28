import {
  Array,
  Cause,
  Data,
  Deferred,
  Effect,
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
  ComposedTransfer,
  DomainSeparatedDigest,
  type Message,
  Model,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedWalletCreation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SigningChallenge,
  TransferRequest,
  WalletIntentRouteError,
  WalletProgram,
  activeWalletAccounts,
  demoTransferAtomicUnitsForSelection,
  nextSendNetworkSelection,
  parseWalletProgramRoute,
  primaryReceivingInstruction,
  toggledWalletNetworkMode,
} from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

const clearScreen = '\u001b[2J\u001b[H'
const defaultAccountId = 'simulated-ethereum-account'
const observationTimeout = '2 seconds'

/** A native input action supported by the interactive Effect Terminal host. */
export const WalletTerminalAction = S.Literals([
  'Show',
  'CreateWallet',
  'ToggleNetwork',
  'SelectNextSendNetwork',
  'Receive',
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

/** Render input for one Effect Terminal frame. */
export const WalletTerminalSnapshot = S.Struct({
  model: Model,
  mode: S.Literals(['Live', 'Inspecting']),
  frame: S.Int,
  finalFrame: S.Int,
  maybeNotice: S.Option(S.String),
})
/** Render input for one Effect Terminal frame. */
export type WalletTerminalSnapshot = typeof WalletTerminalSnapshot.Type

/** An interactive Wallet operation could not be completed. */
export class WalletTerminalError extends Data.TaggedError(
  'WalletTerminalError',
)<{ readonly message: string }> {}

/** The exact Program object consumed by the Effect Terminal host. */
export const walletTerminalProgram: typeof WalletProgram = WalletProgram

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
): Option.Option<WalletTerminalAction> =>
  M.value(input.toLowerCase()).pipe(
    M.withReturnType<Option.Option<WalletTerminalAction>>(),
    M.when('s', () => Option.some('Show')),
    M.when('w', () => Option.some('CreateWallet')),
    M.when('t', () => Option.some('ToggleNetwork')),
    M.when('x', () => Option.some('SelectNextSendNetwork')),
    M.when('r', () => Option.some('Receive')),
    M.when('p', () => Option.some('Preview')),
    M.when('n', () => Option.some('Send')),
    M.when('c', () => Option.some('SignChallenge')),
    M.when('left', () => Option.some('InspectPrevious')),
    M.when('h', () => Option.some('InspectPrevious')),
    M.when('right', () => Option.some('InspectNext')),
    M.when('l', () => Option.some('InspectNext')),
    M.when('v', () => Option.some('ReturnLive')),
    M.when('q', () => Option.some('Quit')),
    M.orElse(() => Option.none()),
  )

const modelLines = (model: Model): ReadonlyArray<string> => {
  const portfolioLines = M.value(model.portfolio).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      LoadingPortfolio: () => ['Portfolio: loading'],
      FailedPortfolio: ({ failure }) => [
        `Portfolio: failed ${failure.operation}/${failure.code}`,
      ],
      LoadedPortfolio: ({ snapshot }) => [
        `Portfolio: ${snapshot.accounts.length.toString()} accounts`,
        ...Array.map(
          snapshot.balanceSnapshot.balances,
          balance =>
            `${balance.accountId} | ${balance.amount.assetId} ${balance.amount.atomicUnits}`,
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
      activeWalletAccounts(wallet, model.walletNetworkMode),
      account =>
        `  ${account.chain} | ${account.networkName} | ${account.address}`,
    ),
  ])
  return [
    ...portfolioLines,
    `Wallets: ${model.wallets.length.toString()} | ${model.walletNetworkMode}`,
    `Send network: ${Option.match(model.maybeSendNetworkSelection, {
      onNone: () => 'unavailable',
      onSome: selection => `${selection.chainId} | ${selection.networkId}`,
    })}`,
    ...walletLines,
    `Transaction: ${model.transaction._tag}`,
    ...transactionLines,
    ...addressValidationLines,
    `Signature: ${model.signature._tag}`,
    `Transactions: ${model.transactions.length.toString()}`,
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
  return Array.join(
    [
      clearScreen,
      'Foldkit Wallet | Effect Terminal',
      `${snapshot.mode} | frame ${snapshot.frame.toString()} of ${snapshot.finalFrame.toString()}`,
      '',
      ...modelLines(snapshot.model),
      ...noticeLines,
      '',
      '[s] Show  [w] Create wallet  [t] Toggle Devnet/Testnet  [x] Next send network',
      '[r] Receive  [p] Preview  [n] Send  [c] Sign challenge',
      '[←/h] Previous replay frame  [→/l] Next replay frame  [v] Live',
      '[q] Quit',
    ],
    '\n',
  )
}

const defaultTransferRequest = (
  model: Model,
): Effect.Effect<typeof TransferRequest.Type, WalletTerminalError> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Effect.fail(
      new WalletTerminalError({ message: 'Wallet portfolio is not loaded' }),
    )
  }
  if (Option.isNone(model.maybeSendNetworkSelection)) {
    return Effect.fail(
      new WalletTerminalError({ message: 'No send network is selected' }),
    )
  }
  const selection = model.maybeSendNetworkSelection.value
  const maybeAccount = Array.findFirst(
    model.portfolio.snapshot.accounts,
    account => account.accountId === selection.accountId,
  )
  const maybeBalance = Array.findFirst(
    model.portfolio.snapshot.balanceSnapshot.balances,
    balance =>
      balance.accountId === selection.accountId &&
      balance.amount.assetId === selection.assetId,
  )
  if (Option.isNone(maybeAccount) || Option.isNone(maybeBalance)) {
    return Effect.fail(
      new WalletTerminalError({
        message: 'The selected simulated account is unavailable',
      }),
    )
  }
  return Effect.succeed(
    TransferRequest.make({
      transferId: `terminal-transfer-${selection.networkId}`,
      accountId: selection.accountId,
      assetId: selection.assetId,
      destinationAddress: maybeAccount.value.address,
      atomicUnits: demoTransferAtomicUnitsForSelection(selection),
      maybeMessage: Option.none(),
    }),
  )
}

const defaultChallenge = (): typeof SigningChallenge.Type =>
  SigningChallenge.make({
    challengeId: 'terminal-challenge',
    accountId: defaultAccountId,
    digest: DomainSeparatedDigest.make({
      algorithm: 'keccak256',
      domain: 'wallet.example/access/v1',
      digest:
        '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22',
      encoding: 'hex',
    }),
  })

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
): Effect.Effect<Model, WalletTerminalError> => {
  const containsTransaction = (model: Model): boolean =>
    Array.some(
      model.transactions,
      transaction => transaction.transactionId === transactionId,
    )
  if (containsTransaction(runtime.readModel())) {
    return Effect.succeed(runtime.readModel())
  }
  return Effect.gen(function* () {
    const observedModel = yield* Deferred.make<Model>()
    const stopObserving = runtime.observeModel(model => {
      if (containsTransaction(model)) {
        Deferred.doneUnsafe(observedModel, Effect.succeed(model))
      }
    })
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

/** Runs the deterministic send path for tests and interactive input. */
export const sendSimulatedWalletTransaction = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<Model, WalletTerminalError> =>
  Effect.gen(function* () {
    const request = yield* defaultTransferRequest(runtime.readModel())
    const previewed = yield* runtime.run(ComposedTransfer.make({ request }))
    if (previewed.transaction._tag !== 'PreviewedTransaction') {
      return yield* Effect.fail(
        new WalletTerminalError({
          message: `Preview did not settle: ${previewed.transaction._tag}`,
        }),
      )
    }
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
    )
  })

type TerminalState = Readonly<{
  runtime: Runtime.ProgramRuntime<Model, Message>
  maybeReplaySession: Option.Option<Runtime.ReplaySession<Model, Message>>
  maybeNotice: Option.Option<string>
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
    }
  }
  const tape = state.runtime.replay.readTape()
  return {
    model: state.runtime.readModel(),
    mode: 'Live',
    frame: tape.transitions.length,
    finalFrame: tape.transitions.length,
    maybeNotice: state.maybeNotice,
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
    M.when('Receive', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some(receivingNotice(state.runtime.readModel())),
      }),
    ),
    M.when('Preview', () =>
      Effect.gen(function* () {
        const request = yield* defaultTransferRequest(state.runtime.readModel())
        const model = yield* state.runtime.run(
          ComposedTransfer.make({ request }),
        )
        return {
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Preview settled: ${model.transaction._tag}`,
          ),
        }
      }),
    ),
    M.when('Send', () =>
      Effect.map(sendSimulatedWalletTransaction(state.runtime), model => ({
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
      Effect.map(
        state.runtime.run(
          RequestedChallengeSignature.make({ challenge: defaultChallenge() }),
        ),
        model => ({
          ...state,
          maybeReplaySession: Option.none(),
          maybeNotice: Option.some(
            `Signature settled: ${model.signature._tag}`,
          ),
        }),
      ),
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
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      const maybeAction = actionForWalletTerminalInput(key)
      if (isControlQuit) {
        return Effect.void
      }
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
        resources: SimulatedWalletResources,
        start,
      })
      yield* runtime.initialization
      const state: TerminalState = {
        runtime,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.none(),
      }
      yield* terminal.display(renderWalletTerminal(snapshotForState(state)))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, state, terminal).pipe(
        Pull.catchDone(() => Effect.void),
      )
      yield* runtime.shutdown
    }),
  )
