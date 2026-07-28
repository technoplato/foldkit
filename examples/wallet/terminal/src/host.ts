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
  AtomicUnits,
  ComposedTransfer,
  CurrencyValue,
  DomainSeparatedDigest,
  type Message,
  Model,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  SigningChallenge,
  type TransferDraft,
  WalletProgram,
  invalidNetworkAddressMessage,
  networkAddressRuleMessages,
  transferDraftFromInput,
} from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

const clearScreen = '\u001b[2J\u001b[H'
const defaultAccountId = 'simulated-ethereum-account'
const defaultDestinationAddress = '0x2222222222222222222222222222222222222222'
const defaultAtomicUnits = '1000000000000000'
const observationTimeout = '2 seconds'

/** A native input action supported by the interactive Effect Terminal host. */
export const WalletTerminalAction = S.Literals([
  'Show',
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

const walletRouter = Program.makeRouter(WalletProgram)

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
            `${balance.accountId} | ${balance.value.currency._tag} ${balance.value.atomicUnits}`,
        ),
      ],
    }),
  )
  const transactionLines =
    model.transaction._tag === 'SubmittedTransaction' &&
    Option.isSome(model.transaction.submission.maybeExplorerConfirmation)
      ? [
          `Confirm on ${model.transaction.submission.maybeExplorerConfirmation.value.explorer}: ${model.transaction.submission.maybeExplorerConfirmation.value.transactionUri}`,
        ]
      : []
  const addressValidationLines =
    model.transferRecipient._tag === 'InvalidTransferRecipient'
      ? [
          invalidNetworkAddressMessage(model.transferRecipient.validation),
          ...Array.map(
            networkAddressRuleMessages(
              model.transferRecipient.validation.format,
            ),
            rule => `- ${rule}`,
          ),
        ]
      : []
  return [
    ...portfolioLines,
    `Transaction: ${model.transaction._tag}`,
    ...transactionLines,
    ...addressValidationLines,
    `Signature: ${model.signature._tag}`,
    `Observed: ${model.observedTransactions.length.toString()}`,
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
      '[s] Show  [r] Receive  [p] Preview  [n] Send  [c] Sign challenge',
      '[←/h] Previous replay frame  [→/l] Next replay frame  [v] Live',
      '[q] Quit',
    ],
    '\n',
  )
}

const defaultTransferDraft = (
  model: Model,
): Effect.Effect<typeof TransferDraft.Type, WalletTerminalError> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Effect.fail(
      new WalletTerminalError({ message: 'Wallet portfolio is not loaded' }),
    )
  }
  const maybeAccount = Array.findFirst(
    model.portfolio.snapshot.accounts,
    account => account.accountId === defaultAccountId,
  )
  const maybeBalance = Array.findFirst(
    model.portfolio.snapshot.balanceSnapshot.balances,
    balance =>
      balance.accountId === defaultAccountId &&
      balance.value.currency._tag === 'Eth',
  )
  if (Option.isNone(maybeAccount) || Option.isNone(maybeBalance)) {
    return Effect.fail(
      new WalletTerminalError({
        message: 'The simulated Ethereum account is unavailable',
      }),
    )
  }
  return S.decodeUnknownEffect(AtomicUnits)(defaultAtomicUnits).pipe(
    Effect.flatMap(atomicUnits => {
      const maybeDraft = transferDraftFromInput({
        transferId: 'terminal-transfer',
        accountId: defaultAccountId,
        network: maybeAccount.value.network,
        destinationAddress: defaultDestinationAddress,
        value: CurrencyValue.make({
          ...maybeBalance.value.value,
          atomicUnits,
        }),
        maybeMessage: Option.none(),
      })
      if (Option.isSome(maybeDraft)) {
        return Effect.succeed(maybeDraft.value)
      } else {
        return Effect.fail(
          new WalletTerminalError({
            message: 'The transfer does not match an executable Layer',
          }),
        )
      }
    }),
    Effect.mapError(
      () => new WalletTerminalError({ message: 'Invalid transfer amount' }),
    ),
  )
}

const defaultChallenge = (): typeof SigningChallenge.Type =>
  SigningChallenge.make({
    challengeId: 'terminal-challenge',
    accountId: defaultAccountId,
    digest: DomainSeparatedDigest.make({
      algorithm: 'Keccak256',
      domain: 'wallet.example/access/v1',
      digestHex: '0xPublicDigest',
    }),
  })

const receivingNotice = (model: Model): string => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return 'Receiving instructions are unavailable while loading.'
  }
  const maybeInstruction = Array.findFirst(
    model.portfolio.snapshot.receivingInstructions,
    instruction =>
      instruction.accountId === defaultAccountId &&
      instruction.currency._tag === 'Eth',
  )
  if (Option.isSome(maybeInstruction)) {
    return `Receive Eth: ${maybeInstruction.value.destinationAddress} | ${maybeInstruction.value.portableUri}`
  } else {
    return 'No simulated Ethereum receiving instruction is available.'
  }
}

const waitForObservedTransaction = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  transactionId: string,
): Effect.Effect<Model, WalletTerminalError> => {
  const containsTransaction = (model: Model): boolean =>
    Array.some(
      model.observedTransactions,
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
    const draft = yield* defaultTransferDraft(runtime.readModel())
    const previewed = yield* runtime.run(ComposedTransfer.make({ draft }))
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
    M.when('Receive', () =>
      Effect.succeed({
        ...state,
        maybeReplaySession: Option.none(),
        maybeNotice: Option.some(receivingNotice(state.runtime.readModel())),
      }),
    ),
    M.when('Preview', () =>
      Effect.gen(function* () {
        const draft = yield* defaultTransferDraft(state.runtime.readModel())
        const model = yield* state.runtime.run(ComposedTransfer.make({ draft }))
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
            ? `Send settled: ${model.transaction._tag}; confirm on ${model.transaction.submission.maybeExplorerConfirmation.value.explorer}: ${model.transaction.submission.maybeExplorerConfirmation.value.transactionUri}`
            : `Send settled: ${model.transaction._tag}; observed ${model.observedTransactions.length.toString()}`,
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
  | Program.ProgramRouteError
  | Runtime.ReplayFrameError
  | Runtime.UnsettledReplayFrameError
> => {
  if (Option.isNone(maybeCarrier)) {
    return Effect.succeed(Runtime.fresh())
  }
  return Effect.gen(function* () {
    const relativeRoute = yield* relativeRouteForCarrier(maybeCarrier.value)
    const route = yield* walletRouter.parse(relativeRoute)
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
