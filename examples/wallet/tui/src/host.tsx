import { Array, Layer, Match as M, Option, Schema as S } from 'effect'
import { type ReactNode, useMemo, useState } from 'react'
import {
  DomainSeparatedDigest,
  type Model,
  SigningChallenge,
  type WalletNetworkMode,
  type WalletResources,
  activeWalletAccounts,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  clipboardCopyRequestForAddress,
  isTransferPreviewActionEnabled,
  nextSendNetworkSelection,
  primaryReceivingInstruction,
  primaryWalletSuggestedTestTransferAmount,
  primaryWalletTestFundingMethod,
  sendNetworkSelectionIdentity,
  sendNetworkSelectionLabel,
  toggledWalletNetworkMode,
  transferAmountInput,
  transferPreviewReadinessLabel,
  transferRecipientInput,
  walletAccountBalanceLabel,
} from 'wallet-core-example'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'
import {
  type WalletInitialRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'

import { type CliRenderer, type SelectOption } from '@opentui/core'
import { useKeyboard } from '@opentui/react'

import {
  interactionsForWalletOpenTui,
  walletOpenTuiSummary,
} from './presentation.js'

export * from './presentation.js'

type WalletReactClient = ReturnType<typeof makeWalletReactClient>

const WalletOpenTuiFocus = S.Literals([
  'Mode',
  'SendNetwork',
  'Amount',
  'Recipient',
  'Operations',
])
type WalletOpenTuiFocus = typeof WalletOpenTuiFocus.Type

const walletNetworkModes: ReadonlyArray<WalletNetworkMode> = [
  'Devnet',
  'Testnet',
  'Live',
]
const walletNetworkModeOptions: Array<SelectOption> = Array.map(
  walletNetworkModes,
  networkMode => ({
    name: networkMode,
    description: `Show every Wallet on ${networkMode}`,
  }),
)

const defaultChallenge = (
  model: Model,
): Option.Option<typeof SigningChallenge.Type> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  const maybeSelection = model.maybeSendNetworkSelection
  const maybeAccount = Option.isSome(maybeSelection)
    ? Array.findFirst(
        model.portfolio.snapshot.accounts,
        account => account.accountId === maybeSelection.value.accountId,
      )
    : Array.head(model.portfolio.snapshot.accounts)
  return Option.map(maybeAccount, account =>
    SigningChallenge.make({
      challengeId: 'opentui-challenge',
      accountId: account.accountId,
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

const explorerStatus = (model: Model): string => {
  if (model.transaction._tag !== 'SubmittedTransaction') {
    return 'Explorer: available after a network submission'
  }
  const maybeConfirmation =
    model.transaction.submission.maybeExplorerConfirmation
  if (Option.isSome(maybeConfirmation)) {
    return `Confirm on ${maybeConfirmation.value.label}: ${maybeConfirmation.value.url}`
  } else {
    return 'Explorer: unavailable for this submission'
  }
}

/** Runs Wallet through the OpenTUI React reconciler. */
export const App = ({
  initialRoute,
  renderer,
  resources = MacOSLiveWalletResources,
}: Readonly<{
  initialRoute?: WalletInitialRoute
  renderer: CliRenderer
  resources?: Layer.Layer<WalletResources>
}>) => {
  const walletClient = useMemo(
    () => makeWalletReactClient(resources),
    [resources],
  )
  const WalletProvider = walletClient.WalletProvider
  const content = (
    <WalletTerminal renderer={renderer} walletClient={walletClient} />
  )
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

const WalletTerminal = ({
  renderer,
  walletClient,
}: Readonly<{
  renderer: CliRenderer
  walletClient: WalletReactClient
}>) => {
  const model = walletClient.useWalletModel()
  const actions = walletClient.useWalletActions()
  const replay = walletClient.useWalletReplay()
  const [maybeNotice, setNotice] = useState(Option.none<string>())
  const [focus, setFocus] = useState<WalletOpenTuiFocus>('Operations')
  const interactions = interactionsForWalletOpenTui(model)
  const portfolio = model.portfolio
  const options: Array<SelectOption> = Array.map(interactions, interaction => ({
    name: interaction.label,
    description: interaction._tag,
  }))
  const sendNetworkSelections =
    portfolio._tag === 'LoadedPortfolio'
      ? availableSendNetworkSelections(
          portfolio.snapshot,
          model.walletNetworkMode,
        )
      : []
  const sendNetworkOptions: Array<SelectOption> =
    portfolio._tag === 'LoadedPortfolio'
      ? Array.map(sendNetworkSelections, selection => ({
          name: sendNetworkSelectionLabel(
            portfolio.snapshot,
            model.wallets,
            selection,
          ),
          description: selection.networkId,
        }))
      : []
  const selectedModeIndex = Math.max(
    0,
    Array.findFirstIndex(
      walletNetworkModes,
      networkMode => networkMode === model.walletNetworkMode,
    ).pipe(Option.getOrElse(() => 0)),
  )
  const selectedSendNetworkIndex = Math.max(
    0,
    Option.match(model.maybeSendNetworkSelection, {
      onNone: () => 0,
      onSome: selected =>
        Option.getOrElse(
          Array.findFirstIndex(
            sendNetworkSelections,
            selection =>
              sendNetworkSelectionIdentity(selection) ===
              sendNetworkSelectionIdentity(selected),
          ),
          () => 0,
        ),
    }),
  )

  useKeyboard(key => {
    if (key.name === 'f1') {
      setFocus('Mode')
    } else if (key.name === 'f2') {
      setFocus('SendNetwork')
    } else if (key.name === 'f3') {
      setFocus('Amount')
    } else if (key.name === 'f4') {
      setFocus('Recipient')
    } else if (key.name === 'f5') {
      setFocus('Operations')
    } else if (focus === 'Operations' && key.name === 'q') {
      renderer.destroy()
    } else if (focus === 'Operations' && key.name === 'left') {
      replay.stepBackward()
    } else if (focus === 'Operations' && key.name === 'right') {
      replay.stepForward()
    } else if (focus === 'Operations' && key.name === 'i') {
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
        CreateWallet: () => {
          setNotice(Option.some('Creating multi-chain wallet…'))
          actions.requestedWalletCreation()
        },
        ToggleWalletNetwork: () => {
          actions.selectedWalletNetworkMode(
            toggledWalletNetworkMode(model.walletNetworkMode),
          )
        },
        SelectNextSendNetwork: () => {
          if (
            model.portfolio._tag !== 'LoadedPortfolio' ||
            Option.isNone(model.maybeSendNetworkSelection)
          ) {
            setNotice(Option.some('No send network is available.'))
            return
          }
          const maybeSelection = nextSendNetworkSelection(
            model.portfolio.snapshot,
            model.maybeSendNetworkSelection.value,
          )
          if (Option.isSome(maybeSelection)) {
            setNotice(
              Option.some(`Selecting ${maybeSelection.value.networkId}…`),
            )
            actions.selectedSendNetwork(maybeSelection.value)
          }
        },
        UseSuggestedTestTransferAmount: () => {
          const maybeAmount = primaryWalletSuggestedTestTransferAmount(model)
          if (Option.isSome(maybeAmount)) {
            actions.changedTransferAmount(maybeAmount.value)
            setNotice(Option.some(`Test amount: ${maybeAmount.value}`))
            setFocus('Recipient')
          }
        },
        ShowReceivingInstruction: () => {
          const maybeInstruction = primaryReceivingInstruction(model)
          setNotice(
            Option.map(
              maybeInstruction,
              instruction =>
                `Receive ${instruction.assetId}: ${instruction.destinationAddress} | ${instruction.portableUri}`,
            ),
          )
        },
        ReloadWalletHistory: () => {
          setNotice(Option.some('Reloading transaction history…'))
          actions.requestedTransactionHistoryReload()
        },
        NextWalletHistoryPage: () => {
          setNotice(Option.some('Loading the next transaction history page…'))
          actions.requestedNextTransactionHistoryPage()
        },
        RequestWalletTestFunding: () => {
          const maybeMethod = primaryWalletTestFundingMethod(model)
          if (
            Option.isSome(maybeMethod) &&
            maybeMethod.value._tag === 'ExternalTestFundingMethod'
          ) {
            const maybeInstruction = primaryReceivingInstruction(model)
            if (Option.isSome(maybeInstruction)) {
              actions.requestedClipboardCopy(
                clipboardCopyRequestForAddress(
                  maybeInstruction.value.destinationAddress,
                  'external-faucet',
                ),
              )
            }
            setNotice(
              Option.some(
                Option.isSome(maybeInstruction)
                  ? `Address copied. Open ${maybeMethod.value.providerName}: ${maybeMethod.value.providerUrl} | ${maybeInstruction.value.destinationAddress}`
                  : `Open ${maybeMethod.value.providerName}: ${maybeMethod.value.providerUrl}`,
              ),
            )
          } else if (
            Option.isSome(maybeMethod) &&
            maybeMethod.value._tag === 'AdapterTestFundingMethod'
          ) {
            setNotice(Option.some('Requesting test funds…'))
            actions.requestedTestFunding()
          } else {
            setNotice(
              Option.some('Test funding is unavailable for this network.'),
            )
          }
        },
        PreviewWalletTransaction: () => {
          if (isTransferPreviewActionEnabled(model)) {
            setNotice(Option.some('Validating and previewing the transfer…'))
            actions.requestedTransferPreview()
          } else {
            setNotice(Option.some(transferPreviewReadinessLabel(model)))
          }
        },
        SendWalletTransaction: () => {
          if (model.transaction._tag === 'PreviewedTransaction') {
            setNotice(Option.some('Signing and submitting preview…'))
            actions.requestedSignedTransactionSubmission(
              model.transaction.preview.previewId,
            )
          } else {
            setNotice(Option.some('No prepared transfer preview is available.'))
          }
        },
        SignWalletChallenge: () => {
          const maybeChallenge = defaultChallenge(model)
          if (Option.isSome(maybeChallenge)) {
            setNotice(Option.some('Signing challenge…'))
            actions.requestedChallengeSignature(maybeChallenge.value)
          } else {
            setNotice(Option.some('No Wallet account is available.'))
          }
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
          content="F1 mode. F2 wallet/crypto. F3 amount. F4 recipient. F5 operations. Enter selects. q quits."
          fg="#6ee7b7"
          height={1}
        />
      </box>

      <box flexDirection="row" gap={1} height={8}>
        <box
          border
          borderColor="#36534a"
          flexDirection="column"
          padding={1}
          title="Network mode"
          width="30%"
        >
          <select
            focused={focus === 'Mode'}
            height="100%"
            onSelect={index => {
              const maybeMode = Array.get(walletNetworkModes, index)
              if (Option.isSome(maybeMode)) {
                actions.selectedWalletNetworkMode(maybeMode.value)
                setFocus('SendNetwork')
              }
            }}
            options={walletNetworkModeOptions}
            selectedBackgroundColor="#164e3c"
            selectedIndex={selectedModeIndex}
            selectedTextColor="#a7f3d0"
          />
        </box>
        <box
          border
          borderColor="#36534a"
          flexDirection="column"
          padding={1}
          title="Wallet and cryptocurrency"
          width="70%"
        >
          <select
            focused={focus === 'SendNetwork'}
            height="100%"
            onSelect={index => {
              const maybeSelection = Array.get(sendNetworkSelections, index)
              if (Option.isSome(maybeSelection)) {
                actions.selectedSendNetwork(maybeSelection.value)
                setFocus('Amount')
              }
            }}
            options={sendNetworkOptions}
            selectedBackgroundColor="#164e3c"
            selectedIndex={selectedSendNetworkIndex}
            selectedTextColor="#a7f3d0"
            showScrollIndicator
            wrapSelection
          />
        </box>
      </box>

      <WalletModelView model={model} />

      <box
        border
        borderColor="#36534a"
        flexDirection="column"
        height={8}
        padding={1}
        title="Transfer draft"
      >
        <text content="Amount" fg="#a8a29e" height={1} />
        <input
          focused={focus === 'Amount'}
          onInput={actions.changedTransferAmount}
          onSubmit={() => setFocus('Recipient')}
          placeholder="0.00"
          value={transferAmountInput(model.transferAmount)}
        />
        <text
          content={transferPreviewReadinessLabel(model)}
          fg="#fbbf24"
          height={1}
        />
        <text content="Recipient" fg="#a8a29e" height={1} />
        <input
          focused={focus === 'Recipient'}
          onInput={actions.changedTransferRecipient}
          onSubmit={() => {
            if (isTransferPreviewActionEnabled(model)) {
              setNotice(Option.some('Validating and previewing the transfer…'))
              actions.requestedTransferPreview()
            } else {
              setNotice(Option.some(transferPreviewReadinessLabel(model)))
            }
            setFocus('Operations')
          }}
          placeholder="Recipient address"
          value={transferRecipientInput(model.transferRecipient)}
        />
      </box>

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
          focused={focus === 'Operations'}
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

const WalletModelView = ({ model }: Readonly<{ model: Model }>) => {
  const networks =
    model.portfolio._tag === 'LoadedPortfolio'
      ? model.portfolio.snapshot.networks
      : []
  return (
    <box
      border
      borderColor="#36534a"
      flexDirection="column"
      minHeight={16}
      padding={1}
      title="Canonical Wallet Model"
    >
      <PortfolioView model={model} />
      <text
        content={`Wallets: ${model.wallets.length.toString()} | ${model.walletNetworkMode} | ${model.walletCreation._tag}`}
        height={1}
      />
      {Array.flatMap(model.wallets, wallet =>
        Array.map(
          activeWalletAccounts(wallet, networks, model.walletNetworkMode),
          account => (
            <text
              content={`${wallet.displayName} · ${account.chainId} · ${account.networkName} · ${walletAccountBalanceLabel(model, account.accountId)} · ${account.address}`}
              height={1}
              key={account.accountId}
            />
          ),
        ),
      )}
      <text content={`Transaction: ${model.transaction._tag}`} height={1} />
      <text
        content={
          model.transferRecipient._tag === 'InvalidTransferRecipient'
            ? Array.join(
                [
                  model.transferRecipient.guidance.summary,
                  ...model.transferRecipient.guidance.details,
                ],
                ' ',
              )
            : 'Recipient address: ready for validation'
        }
        height={2}
      />
      <text content={explorerStatus(model)} height={1} />
      <text content={`Signature: ${model.signature._tag}`} height={1} />
      <text
        content={`History: ${model.transactionHistory._tag} | Observation: ${model.transactionObservation._tag} | Funding: ${model.testFunding._tag} | Clipboard: ${model.clipboardCopy._tag}`}
        height={1}
      />
      {Array.map(Array.take(model.transactions, 4), transaction => (
        <text
          content={`${transaction.direction} · ${transaction.status} · ${assetAmountLabelForModel(model, transaction.amount)} · ${transaction.transactionId}`}
          height={1}
          key={transaction.recordId}
        />
      ))}
    </box>
  )
}

const PortfolioView = ({ model }: Readonly<{ model: Model }>): ReactNode =>
  M.value(model.portfolio).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      WaitingForWalletProfiles: () => (
        <text content="Waiting for secure wallet profiles…" height={1} />
      ),
      LoadingPortfolio: () => <text content="Loading portfolio…" height={1} />,
      FailedPortfolio: ({ failure }) => (
        <text
          content={`${failure.operation}/${failure.code}`}
          fg="#fca5a5"
          height={1}
        />
      ),
      LoadedPortfolio: ({ snapshot }) => (
        <text
          content={`${snapshot.accounts.length.toString()} accounts · ${snapshot.balanceSnapshot.balances.length.toString()} balances · ${snapshot.balanceSnapshot.unavailableAccountIds.length.toString()} unavailable`}
          height={1}
        />
      ),
    }),
  )
