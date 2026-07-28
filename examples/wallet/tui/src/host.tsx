import { Array, Match as M, Option } from 'effect'
import { type ReactNode, useState } from 'react'
import {
  DomainSeparatedDigest,
  type Model,
  SigningChallenge,
  transferDraftFromInput,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  WalletProvider,
  WalletTransferComposition,
  useWalletActions,
  useWalletModel,
  useWalletReplay,
} from 'wallet-react-bindings-example'

import { type CliRenderer, type SelectOption } from '@opentui/core'
import { useKeyboard } from '@opentui/react'

import {
  interactionsForWalletOpenTui,
  walletOpenTuiSummary,
} from './presentation.js'

export * from './presentation.js'

const defaultAccountId = 'simulated-ethereum-account'
const defaultDestinationAddress = '0x2222222222222222222222222222222222222222'

const defaultTransferComposition = (
  model: Model,
): Option.Option<WalletTransferComposition> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
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
    return Option.none()
  }
  return transferDraftFromInput({
    transferId: 'opentui-transfer',
    accountId: defaultAccountId,
    network: maybeAccount.value.network,
    destinationAddress: defaultDestinationAddress,
    value: {
      ...maybeBalance.value.value,
      atomicUnits: '1000000000000000',
    },
    maybeMessage: Option.none(),
  })
}

const defaultChallenge = (): typeof SigningChallenge.Type =>
  SigningChallenge.make({
    challengeId: 'opentui-challenge',
    accountId: defaultAccountId,
    digest: DomainSeparatedDigest.make({
      algorithm: 'Keccak256',
      domain: 'wallet.example/access/v1',
      digestHex: '0xPublicDigest',
    }),
  })

/** Runs Wallet through the OpenTUI React reconciler. */
export const App = ({
  initialRoute,
  renderer,
}: Readonly<{
  initialRoute?: WalletInitialRoute
  renderer: CliRenderer
}>) => {
  const content = <WalletTerminal renderer={renderer} />
  if (initialRoute === undefined) {
    return (
      <WalletProvider fallback={<text fg="#a8a29e">Starting Wallet…</text>}>
        {content}
      </WalletProvider>
    )
  }
  return (
    <WalletProvider
      fallback={<text fg="#a8a29e">Opening Wallet path…</text>}
      initialRoute={initialRoute}
    >
      {content}
    </WalletProvider>
  )
}

const WalletTerminal = ({ renderer }: Readonly<{ renderer: CliRenderer }>) => {
  const model = useWalletModel()
  const actions = useWalletActions()
  const replay = useWalletReplay()
  const [maybeNotice, setNotice] = useState(Option.none<string>())
  const interactions = interactionsForWalletOpenTui(model)
  const options: Array<SelectOption> = Array.map(interactions, interaction => ({
    name: interaction.label,
    description: interaction._tag,
  }))

  useKeyboard(key => {
    if (key.name === 'q') {
      renderer.destroy()
    } else if (key.name === 'left') {
      replay.stepBackward()
    } else if (key.name === 'right') {
      replay.stepForward()
    } else if (key.name === 'i') {
      replay.inspect()
    }
  })

  const showPath = (
    loadPath: () => Promise<string>,
    description: string,
  ): void => {
    void loadPath().then(
      path => setNotice(Option.some(`${description}: ${path}`)),
      error =>
        setNotice(
          Option.some(
            `${description} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
    )
  }

  const selectedInteraction = (index: number): void => {
    const maybeInteraction = Array.get(interactions, index)
    if (Option.isNone(maybeInteraction)) {
      return
    }
    M.value(maybeInteraction.value).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        ShowWallet: () => setNotice(Option.some(walletOpenTuiSummary(model))),
        ShowReceivingInstruction: () => {
          if (model.portfolio._tag !== 'LoadedPortfolio') {
            setNotice(Option.some('Receiving instructions are not loaded.'))
            return
          }
          const maybeInstruction = Array.findFirst(
            model.portfolio.snapshot.receivingInstructions,
            instruction =>
              instruction.accountId === defaultAccountId &&
              instruction.currency._tag === 'Eth',
          )
          setNotice(
            Option.map(
              maybeInstruction,
              instruction =>
                `Receive Eth: ${instruction.destinationAddress} | ${instruction.portableUri}`,
            ),
          )
        },
        PreviewWalletTransaction: () => {
          const maybeComposition = defaultTransferComposition(model)
          if (Option.isSome(maybeComposition)) {
            setNotice(Option.some('Previewing simulated transfer…'))
            actions.composedTransfer(maybeComposition.value)
          } else {
            setNotice(Option.some('The simulated account is not loaded.'))
          }
        },
        SendWalletTransaction: () => {
          if (model.transaction._tag === 'PreviewedTransaction') {
            setNotice(Option.some('Signing and submitting preview…'))
            actions.requestedSignedTransactionSubmission(
              model.transaction.preview.previewId,
            )
          }
        },
        SignWalletChallenge: () => {
          setNotice(Option.some('Signing challenge…'))
          actions.requestedChallengeSignature(defaultChallenge())
        },
        ShowWalletStatePath: () => showPath(replay.statePath, 'State path'),
        ShowWalletReplayPath: () => showPath(replay.replayPath, 'Replay path'),
      }),
    )
  }

  return (
    <box
      backgroundColor="#07130f"
      flexDirection="column"
      gap={1}
      height="100%"
      padding={1}
      width="100%"
    >
      <box
        border
        borderColor="#34d399"
        flexDirection="column"
        height={6}
        padding={1}
        title="Foldkit Wallet | OpenTUI React"
      >
        <text content={walletOpenTuiSummary(model)} fg="#d1fae5" height={1} />
        <text
          content={`Replay ${replay.mode} | frame ${replay.frame.toString()} of ${replay.finalFrame.toString()} | ${replay.isBranchable ? 'settled' : 'unsettled'}`}
          fg="#a8a29e"
          height={1}
        />
        <text
          content="Left/right inspect replay. i inspects current frame. Enter runs. q quits."
          fg="#6ee7b7"
          height={1}
        />
      </box>

      <WalletModelView model={model} />

      <box
        border
        borderColor="#36534a"
        flexDirection="column"
        flexGrow={1}
        minHeight={8}
        padding={1}
        title="Wallet operations"
      >
        <select
          focused
          height="100%"
          onSelect={selectedInteraction}
          options={options}
          selectedBackgroundColor="#164e3c"
          selectedTextColor="#a7f3d0"
          showScrollIndicator
          wrapSelection
        />
      </box>

      <text
        content={Option.getOrElse(maybeNotice, () => 'Ready.')}
        fg="#fbbf24"
        height={1}
      />
    </box>
  )
}

const WalletModelView = ({ model }: Readonly<{ model: Model }>) => (
  <box
    border
    borderColor="#36534a"
    flexDirection="column"
    height={9}
    padding={1}
    title="Canonical Wallet Model"
  >
    <PortfolioView model={model} />
    <text content={`Transaction: ${model.transaction._tag}`} height={1} />
    <text content={`Signature: ${model.signature._tag}`} height={1} />
    <text
      content={`Observed transactions: ${model.observedTransactions.length.toString()}`}
      height={1}
    />
  </box>
)

const PortfolioView = ({ model }: Readonly<{ model: Model }>): ReactNode =>
  M.value(model.portfolio).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      LoadingPortfolio: () => <text content="Loading portfolio…" height={1} />,
      FailedPortfolio: ({ failure }) => (
        <text
          content={`${failure.operation}/${failure.code}`}
          fg="#fca5a5"
          height={1}
        />
      ),
      LoadedPortfolio: ({ snapshot }) => (
        <box flexDirection="column">
          {Array.map(snapshot.accounts, account => (
            <text
              content={`${account.displayName} | ${account.address}`}
              height={1}
              key={account.accountId}
            />
          ))}
        </box>
      ),
    }),
  )
