import { Array, Match as M, Option } from 'effect'
import {
  type Model,
  type SendNetworkSelection,
  type TransactionPreview,
  type TransactionState,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabel,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  chainForId,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  clipboardCopyRequestForAddress,
  demoTransferAtomicUnitsForSelection,
  isSameClipboardCopyRequest,
  makeWalletTestChallenge,
  networkForId,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  shortenedAddress,
  transferRecipientInput,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  initialWalletRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import { makeSimulatedWalletResources } from 'wallet-simulated-client-example'
import { WalletWebClipboard } from 'wallet-web-client-example'

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(
    makeSimulatedWalletResources({
      walletClipboard: WalletWebClipboard,
    }),
  )

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      ValidatingTransfer: () => Option.none(),
      InvalidTransfer: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransferValidation: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      ValidatingTransfer: () => 'Validating recipient…',
      InvalidTransfer: () => 'Recipient needs attention',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
      FailedTransferValidation: () => 'Validation failed',
      FailedTransactionSubmission: () => 'Send failed',
    }),
  )

const walletCreationLabel = (walletCreation: WalletCreationState): string =>
  M.value(walletCreation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReadyToCreateWallet: () => 'Create wallet',
      CreatingWallet: () => 'Creating…',
      FailedWalletCreation: () => 'Try again',
    }),
  )

const CopyAddressButton = ({
  address,
  copyId,
  model,
}: Readonly<{ address: string; copyId: string; model: Model }>) => {
  const actions = useWalletActions()
  const request = clipboardCopyRequestForAddress(address, copyId)
  const maybeFailure = clipboardCopyFailureMessage(model.clipboardCopy, request)
  const isCopying =
    model.clipboardCopy._tag === 'CopyingToClipboard' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  return (
    <div className="wallet-copy-control">
      <button
        aria-live="polite"
        className="wallet-copy-button"
        disabled={isCopying}
        onClick={() => actions.requestedClipboardCopy(request)}
        type="button"
      >
        {clipboardCopyLabel(model.clipboardCopy, request)}
      </button>
      {Option.isSome(maybeFailure) ? (
        <small className="wallet-copy-error" role="alert">
          {maybeFailure.value}
        </small>
      ) : null}
    </div>
  )
}

const NetworkModeButton = ({
  model,
  networkMode,
}: Readonly<{ model: Model; networkMode: WalletNetworkMode }>) => {
  const actions = useWalletActions()
  const className =
    model.walletNetworkMode === networkMode
      ? 'wallet-network-option selected'
      : 'wallet-network-option'
  return (
    <button
      aria-pressed={model.walletNetworkMode === networkMode}
      className={className}
      onClick={() => actions.selectedWalletNetworkMode(networkMode)}
      type="button"
    >
      {networkMode}
    </button>
  )
}

const WalletProfileCard = ({
  model,
  wallet,
}: Readonly<{ model: Model; wallet: WalletProfile }>) => (
  <article className="wallet-profile">
    <div className="wallet-profile-heading">
      <div>
        <p className="cardboard-eyebrow">Multi-chain wallet</p>
        <h3>{wallet.displayName}</h3>
      </div>
      <span>{model.walletNetworkMode}</span>
    </div>
    <ul className="wallet-chain-list">
      {Array.map(
        activeWalletAccounts(wallet, model.walletNetworkMode),
        account => (
          <li key={account.accountId}>
            <div>
              <strong>{account.chain}</strong>
              <span>{account.networkName}</span>
            </div>
            <div className="wallet-address-line">
              <code>{shortenedAddress(account.address)}</code>
              <CopyAddressButton
                address={account.address}
                copyId={`profile:${wallet.walletId}:${account.accountId}`}
                model={model}
              />
            </div>
            <small>{account.detail}</small>
          </li>
        ),
      )}
    </ul>
  </article>
)

const WalletHome = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  return (
    <section className="wallet-home cardboard-panel">
      <div className="wallet-heading-row">
        <div>
          <p className="cardboard-eyebrow">Session-only custody</p>
          <h2>Your wallets</h2>
        </div>
        <button
          className="cardboard-button primary"
          disabled={model.walletCreation._tag === 'CreatingWallet'}
          onClick={actions.requestedWalletCreation}
          type="button"
        >
          {walletCreationLabel(model.walletCreation)}
        </button>
      </div>
      <div className="wallet-network-control">
        <div>
          <strong>Network mode</strong>
          <span>Switches every wallet and chain together.</span>
        </div>
        <div aria-label="Wallet network mode" className="wallet-network-switch">
          <NetworkModeButton model={model} networkMode="Devnet" />
          <NetworkModeButton model={model} networkMode="Testnet" />
        </div>
      </div>
      {model.walletCreation._tag === 'FailedWalletCreation' ? (
        <p className="wallet-validation" role="alert">
          Wallet creation failed ({model.walletCreation.code}). No secret key
          entered the Model or replay journal.
        </p>
      ) : null}
      {Array.match(model.wallets, {
        onEmpty: () => (
          <div className="wallet-home-empty">
            <strong>No wallets yet.</strong>
            <p>
              Create one wallet with Bitcoin, Ethereum, Solana, and Sui
              accounts.
            </p>
          </div>
        ),
        onNonEmpty: wallets => (
          <div className="wallet-profile-list">
            {Array.map(wallets, wallet => (
              <WalletProfileCard
                key={wallet.walletId}
                model={model}
                wallet={wallet}
              />
            ))}
          </div>
        ),
      })}
    </section>
  )
}

const WalletHero = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio' ? 'Loading…' : '—',
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
  })

  return (
    <header className="wallet-hero cardboard-panel">
      <div className="wallet-heading-row">
        <div>
          <p className="cardboard-eyebrow">Test money</p>
          <h1 className="cardboard-embossed">Wallet</h1>
        </div>
        <button
          className="cardboard-button"
          onClick={actions.requestedWalletRefresh}
          type="button"
        >
          Refresh
        </button>
      </div>
      <div className="wallet-balance">
        <p>Available balance</p>
        <strong className="cardboard-embossed">{balanceLabel}</strong>
        <div className="wallet-address-line">
          <small>{accountLabel}</small>
          {Option.isSome(maybeAccount) ? (
            <CopyAddressButton
              address={maybeAccount.value.address}
              copyId="primary-account"
              model={model}
            />
          ) : null}
        </div>
      </div>
    </header>
  )
}

const SendNetworkButton = ({
  model,
  selection,
}: Readonly<{ model: Model; selection: SendNetworkSelection }>) => {
  const actions = useWalletActions()
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  const portfolio = model.portfolio.snapshot
  const chainName = Option.match(
    chainForId(portfolio.chains, selection.chainId),
    {
      onNone: () => selection.chainId,
      onSome: chain => chain.displayName,
    },
  )
  const networkName = Option.match(
    networkForId(portfolio.networks, selection.networkId),
    {
      onNone: () => selection.networkId,
      onSome: network => network.displayName,
    },
  )
  const isSelected = Option.exists(
    model.maybeSendNetworkSelection,
    current =>
      current.networkId === selection.networkId &&
      current.accountId === selection.accountId &&
      current.assetId === selection.assetId,
  )
  return (
    <button
      aria-pressed={isSelected}
      className={
        isSelected ? 'wallet-send-network selected' : 'wallet-send-network'
      }
      onClick={() => actions.selectedSendNetwork(selection)}
      type="button"
    >
      <strong>{chainName}</strong>
      <span>{networkName}</span>
    </button>
  )
}

const SendNetworkPicker = ({ model }: Readonly<{ model: Model }>) => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  const selections = availableSendNetworkSelections(
    model.portfolio.snapshot,
    model.walletNetworkMode,
  )
  return (
    <div aria-label="Send network selection" className="wallet-send-networks">
      {Array.map(selections, selection => (
        <SendNetworkButton
          key={selection.networkId}
          model={model}
          selection={selection}
        />
      ))}
    </div>
  )
}

const SendMoney = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeBalance = primaryWalletBalance(model)
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const recipientValue = transferRecipientInput(model.transferRecipient)
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  const exampleAddress = Option.match(primaryWalletAccount(model), {
    onNone: () => 'Recipient address',
    onSome: account => account.address,
  })
  const transferAmount = Option.match(model.maybeSendNetworkSelection, {
    onNone: () => 'Select a network',
    onSome: selection =>
      Option.match(primaryWalletAsset(model), {
        onNone: () => demoTransferAtomicUnitsForSelection(selection),
        onSome: asset =>
          assetAmountLabel(
            {
              assetId: asset.assetId,
              atomicUnits: demoTransferAtomicUnitsForSelection(selection),
              observedAt: 0,
            },
            asset,
          ),
      }),
  })

  const submitPreview = (): void => {
    if (Option.isSome(maybePreview)) {
      actions.requestedSignedTransactionSubmission(maybePreview.value.previewId)
    }
  }

  return (
    <section className="wallet-send cardboard-panel">
      <div className="wallet-section-heading">
        <div>
          <p className="cardboard-eyebrow">Send</p>
          <h2>{transferAmount}</h2>
        </div>
        <span className="wallet-status">
          {transactionStatus(model.transaction)}
        </span>
      </div>
      <SendNetworkPicker model={model} />
      <label className="wallet-recipient" htmlFor="wallet-recipient">
        <span>Recipient on {networkName}</span>
        <input
          autoCapitalize="none"
          autoComplete="off"
          disabled={model.transaction._tag === 'SubmittingTransaction'}
          id="wallet-recipient"
          onChange={event =>
            actions.changedTransferRecipient(event.currentTarget.value)
          }
          placeholder={exampleAddress}
          spellCheck={false}
          type="text"
          value={recipientValue}
        />
      </label>
      {model.transferRecipient._tag === 'InvalidTransferRecipient' ? (
        <div className="wallet-validation" role="alert">
          <p>{model.transferRecipient.guidance.summary}</p>
          <ul>
            {Array.map(model.transferRecipient.guidance.details, detail => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {Option.isSome(maybePreview) ? (
        <div className="wallet-preview">
          <div>
            <span>To</span>
            <div className="wallet-preview-value">
              <strong>
                {shortenedAddress(
                  maybePreview.value.transfer.recipient.displayAddress,
                )}
              </strong>
              <CopyAddressButton
                address={maybePreview.value.transfer.recipient.displayAddress}
                copyId="transfer-preview-recipient"
                model={model}
              />
            </div>
          </div>
          <div>
            <span>Network fee</span>
            <strong>
              {assetAmountLabelForModel(model, maybePreview.value.estimatedFee)}
            </strong>
          </div>
          <div>
            <span>Balance after</span>
            <strong>
              {assetAmountLabelForModel(
                model,
                maybePreview.value.resultingBalance,
              )}
            </strong>
          </div>
        </div>
      ) : (
        <p className="wallet-help">
          Preview a fixed test transfer before anything is signed.
        </p>
      )}
      {model.transaction._tag === 'SubmittedTransaction' ? (
        <div className="wallet-confirmation" role="status">
          <strong>Transaction submitted</strong>
          {Option.isSome(
            model.transaction.submission.maybeExplorerConfirmation,
          ) ? (
            <>
              <span>
                Confirm it on{' '}
                {
                  model.transaction.submission.maybeExplorerConfirmation.value
                    .label
                }
                .
              </span>
              <a
                href={
                  model.transaction.submission.maybeExplorerConfirmation.value
                    .url
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                View on{' '}
                {
                  model.transaction.submission.maybeExplorerConfirmation.value
                    .label
                }
              </a>
            </>
          ) : null}
          <code>{model.transaction.submission.transactionId}</code>
        </div>
      ) : null}
      <div className="wallet-action-row">
        <button
          className="cardboard-button primary"
          disabled={
            Option.isNone(maybeBalance) ||
            model.transferRecipient._tag === 'EmptyTransferRecipient' ||
            model.transaction._tag === 'ValidatingTransfer' ||
            model.transaction._tag === 'PreviewingTransaction' ||
            model.transaction._tag === 'SubmittingTransaction'
          }
          onClick={
            model.transaction._tag === 'PreviewedTransaction'
              ? submitPreview
              : actions.requestedTransferPreview
          }
          type="button"
        >
          {model.transaction._tag === 'PreviewedTransaction'
            ? 'Confirm send'
            : 'Preview send'}
        </button>
      </div>
    </section>
  )
}

const Activity = ({ model }: Readonly<{ model: Model }>) => (
  <section className="wallet-activity cardboard-panel">
    <p className="cardboard-eyebrow">Recent activity</p>
    {Array.match(model.transactions, {
      onEmpty: () => <p className="wallet-empty">Nothing sent yet.</p>,
      onNonEmpty: transactions => (
        <ul>
          {Array.map(transactions, transaction => (
            <li key={transaction.transactionId}>
              <span>{transaction.status}</span>
              <strong>
                {assetAmountLabelForModel(model, transaction.amount)}
              </strong>
              <small>{shortenedAddress(transaction.transactionId)}</small>
            </li>
          ))}
        </ul>
      ),
    })}
  </section>
)

const AccountDetails = ({ model }: Readonly<{ model: Model }>) => {
  const maybeAccount = primaryWalletAccount(model)
  const maybeReceivingInstruction = primaryReceivingInstruction(model)
  return (
    <section className="wallet-detail-section">
      <h3>Account</h3>
      {Option.isSome(maybeAccount) ? (
        <>
          <p>{maybeAccount.value.displayName}</p>
          <div className="wallet-address-line">
            <code>{maybeAccount.value.address}</code>
            <CopyAddressButton
              address={maybeAccount.value.address}
              copyId="account-details"
              model={model}
            />
          </div>
        </>
      ) : (
        <p>Account data is not loaded.</p>
      )}
      {Option.isSome(maybeReceivingInstruction) ? (
        <>
          <h3>Receive</h3>
          <div className="wallet-address-line">
            <code>{maybeReceivingInstruction.value.destinationAddress}</code>
            <CopyAddressButton
              address={maybeReceivingInstruction.value.destinationAddress}
              copyId="receiving-address"
              model={model}
            />
          </div>
          <code>{maybeReceivingInstruction.value.portableUri}</code>
        </>
      ) : null}
    </section>
  )
}

const Signature = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const signChallenge = (): void => {
    if (Option.isSome(maybeAccount)) {
      actions.requestedChallengeSignature(
        makeWalletTestChallenge(
          'react-demo-challenge',
          maybeAccount.value.accountId,
        ),
      )
    }
  }
  return (
    <section className="wallet-detail-section">
      <h3>Proof</h3>
      <p>{model.signature._tag}</p>
      <button
        className="cardboard-button"
        disabled={Option.isNone(maybeAccount)}
        onClick={signChallenge}
        type="button"
      >
        Sign test challenge
      </button>
    </section>
  )
}

const Replay = () => {
  const replay = useWalletReplay()
  return (
    <section className="wallet-detail-section">
      <h3>Replay</h3>
      <p>
        {replay.mode} · frame {replay.frame.toString()} of{' '}
        {replay.finalFrame.toString()}
      </p>
      <input
        aria-label="Replay frame"
        max={replay.finalFrame}
        min={0}
        onChange={event => replay.seek(Number(event.currentTarget.value))}
        type="range"
        value={replay.frame}
      />
      <div className="wallet-action-row">
        <button
          className="cardboard-button"
          disabled={replay.frame === 0}
          onClick={replay.stepBackward}
          type="button"
        >
          Undo
        </button>
        <button
          className="cardboard-button"
          disabled={replay.mode === 'Live'}
          onClick={replay.resume}
          type="button"
        >
          Done
        </button>
        <button
          className="cardboard-button"
          disabled={replay.frame === replay.finalFrame}
          onClick={replay.stepForward}
          type="button"
        >
          Redo
        </button>
      </div>
    </section>
  )
}

const AdvancedDetails = ({ model }: Readonly<{ model: Model }>) => (
  <details className="wallet-details cardboard-panel">
    <summary>Account, proof, and replay</summary>
    <div className="wallet-detail-grid">
      <AccountDetails model={model} />
      <Signature model={model} />
      <Replay />
    </div>
  </details>
)

const WalletScreen = () => {
  const model = useWalletModel()
  return (
    <main className="wallet-shell cardboard-surface">
      <div className="wallet-stack">
        <WalletHome model={model} />
        <WalletHero model={model} />
        <SendMoney model={model} />
        <Activity model={model} />
        <AdvancedDetails model={model} />
      </div>
    </main>
  )
}

/** Renders one portable Wallet route through domain-only React hooks. */
export const App = ({
  initialRoute = initialWalletRoute,
}: Readonly<{ initialRoute?: WalletInitialRoute }>) => (
  <WalletProvider
    fallback={<p>Starting Wallet…</p>}
    initialRoute={initialRoute}
  >
    <WalletScreen />
  </WalletProvider>
)
