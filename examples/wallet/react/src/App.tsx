import { Array, Match as M, Option } from 'effect'
import {
  type Model,
  type TransactionPreview,
  type TransactionState,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  clipboardCopyRequestForAddress,
  isPrimaryWalletBalanceUnavailable,
  isSameClipboardCopyRequest,
  makeWalletTestChallenge,
  networkForId,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  primaryWalletTestFundingMethod,
  sendNetworkSelectionIdentity,
  sendNetworkSelectionLabel,
  shortenedAddress,
  transferAmountInput,
  transferRecipientInput,
  walletDataSourceDetail,
  walletDataSourceLabel,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  initialWalletRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import {
  makeWebWalletResources,
  walletDataSourceFromEnvironment,
} from 'wallet-web-client-example'

const walletDataSource = walletDataSourceFromEnvironment(
  import.meta.env['VITE_WALLET_DATA_SOURCE'],
)
const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(makeWebWalletResources(walletDataSource))

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

const transferAmountFailure = (model: Model): Option.Option<string> => {
  if (model.transferAmount._tag !== 'InvalidTransferAmount') {
    return Option.none()
  }
  return Option.some(
    M.value(model.transferAmount.code).pipe(
      M.withReturnType<string>(),
      M.when(
        'AssetUnavailable',
        () => 'Select an asset before entering an amount.',
      ),
      M.when(
        'InvalidFormat',
        () =>
          'Enter a positive decimal amount using digits and one decimal point.',
      ),
      M.when(
        'TooManyDecimalPlaces',
        () =>
          'This amount has more decimal places than the selected asset supports.',
      ),
      M.when('MustBePositive', () => 'The amount must be greater than zero.'),
      M.exhaustive,
    ),
  )
}

const selectedNetworkHasCapability = (
  model: Model,
  capability: 'TestFunding' | 'TransactionHistory',
): boolean => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return false
  }
  const maybeNetwork = networkForId(
    model.portfolio.snapshot.networks,
    model.maybeSendNetworkSelection.value.networkId,
  )
  return (
    Option.isSome(maybeNetwork) &&
    Array.contains(maybeNetwork.value.capabilities, capability)
  )
}

const walletNetworkModeFromValue = (
  value: string,
  current: WalletNetworkMode,
): WalletNetworkMode => {
  if (value === 'Devnet') {
    return 'Devnet'
  } else if (value === 'Testnet') {
    return 'Testnet'
  } else if (value === 'Live') {
    return 'Live'
  } else {
    return current
  }
}

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

const NetworkModePicker = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  return (
    <select
      aria-label="Wallet network mode"
      className="wallet-select"
      onChange={event =>
        actions.selectedWalletNetworkMode(
          walletNetworkModeFromValue(
            event.currentTarget.value,
            model.walletNetworkMode,
          ),
        )
      }
      value={model.walletNetworkMode}
    >
      <option value="Devnet">Devnet</option>
      <option value="Testnet">Testnet</option>
      <option value="Live">Live</option>
    </select>
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
        activeWalletAccounts(
          wallet,
          model.portfolio._tag === 'LoadedPortfolio'
            ? model.portfolio.snapshot.networks
            : [],
          model.walletNetworkMode,
        ),
        account => (
          <li key={account.accountId}>
            <div>
              <strong>{account.displayName}</strong>
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
            <small>{account.chainId}</small>
          </li>
        ),
      )}
    </ul>
  </article>
)

const WalletHome = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const profiles = (() => {
    if (model.walletProfileLoading._tag === 'LoadingWalletProfiles') {
      return (
        <div className="wallet-home-empty">
          <strong>Restoring secure wallets…</strong>
          <p>Loading locally protected custody and public addresses.</p>
        </div>
      )
    } else if (
      model.walletProfileLoading._tag === 'FailedWalletProfileLoading'
    ) {
      return (
        <div className="wallet-home-empty" role="alert">
          <strong>Secure wallet storage is unavailable.</strong>
          <p>
            No stored key material was loaded ({model.walletProfileLoading.code}
            ).
          </p>
          <button
            className="cardboard-button"
            onClick={actions.requestedWalletProfilesReload}
            type="button"
          >
            Retry secure storage
          </button>
        </div>
      )
    } else {
      return Array.match(model.wallets, {
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
      })
    }
  })()
  return (
    <section className="wallet-home cardboard-panel">
      <div className="wallet-heading-row">
        <div>
          <p className="cardboard-eyebrow">Secure local custody</p>
          <h2>Your wallets</h2>
        </div>
        <button
          className="cardboard-button primary"
          disabled={
            model.walletProfileLoading._tag !== 'LoadedWalletProfiles' ||
            model.walletCreation._tag === 'CreatingWallet'
          }
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
        <NetworkModePicker model={model} />
      </div>
      {model.walletCreation._tag === 'FailedWalletCreation' ? (
        <p className="wallet-validation" role="alert">
          Wallet creation failed ({model.walletCreation.code}). No secret key
          entered the Model or replay journal.
        </p>
      ) : null}
      {profiles}
    </section>
  )
}

const WalletHero = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const isBalanceUnavailable = isPrimaryWalletBalanceUnavailable(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () => {
      if (model.portfolio._tag === 'LoadingPortfolio') {
        return 'Loading…'
      } else if (isBalanceUnavailable) {
        return 'Unavailable. Refresh to retry.'
      } else {
        return '—'
      }
    },
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio'
        ? 'Loading adapter account…'
        : 'No adapter account available',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
  })
  const dataSourceLabel =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceLabel(model.portfolio.snapshot.dataSource)
      : walletDataSourceLabel(walletDataSource)
  const dataSourceDetail =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceDetail(model.portfolio.snapshot.dataSource)
      : `Connecting to the ${walletDataSourceLabel(walletDataSource).toLowerCase()} adapter.`

  return (
    <header className="wallet-hero cardboard-panel">
      <div className="wallet-heading-row">
        <div>
          <p className="cardboard-eyebrow">{dataSourceLabel}</p>
          <h1 className="cardboard-embossed">Portfolio</h1>
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
      <p className="wallet-data-source-detail">{dataSourceDetail}</p>
      {model.portfolio._tag === 'FailedPortfolio' ? (
        <p className="wallet-validation" role="alert">
          Portfolio failed: {model.portfolio.failure.operation} ·{' '}
          {model.portfolio.failure.code}
        </p>
      ) : null}
    </header>
  )
}

const SendNetworkPicker = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  const portfolio = model.portfolio.snapshot
  const selections = availableSendNetworkSelections(
    portfolio,
    model.walletNetworkMode,
  )
  const value = Option.match(model.maybeSendNetworkSelection, {
    onNone: () => '',
    onSome: sendNetworkSelectionIdentity,
  })
  return (
    <label className="wallet-picker" htmlFor="wallet-asset">
      <span>Cryptocurrency and network</span>
      <select
        className="wallet-select"
        id="wallet-asset"
        onChange={event => {
          const nextValue = event.currentTarget.value
          const maybeSelection = Array.findFirst(
            selections,
            selection => sendNetworkSelectionIdentity(selection) === nextValue,
          )
          if (Option.isSome(maybeSelection)) {
            actions.selectedSendNetwork(maybeSelection.value)
          }
        }}
        value={value}
      >
        {value === '' ? (
          <option value="">Select a cryptocurrency</option>
        ) : null}
        {Array.map(selections, selection => (
          <option
            key={sendNetworkSelectionIdentity(selection)}
            value={sendNetworkSelectionIdentity(selection)}
          >
            {sendNetworkSelectionLabel(portfolio, model.wallets, selection)}
          </option>
        ))}
      </select>
    </label>
  )
}

const testFundingButtonLabel = (model: Model): string => {
  if (model.testFunding._tag === 'RequestingTestFunding') {
    return 'Requesting test funds…'
  } else if (model.transferAmount._tag !== 'ValidTransferAmount') {
    return 'Enter amount to request test funds'
  } else {
    return 'Request test funds'
  }
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
  const maybeAsset = primaryWalletAsset(model)
  const amountSymbol = Option.match(maybeAsset, {
    onNone: () => 'Amount',
    onSome: asset => `Amount in ${asset.symbol}`,
  })
  const maybeAmountFailure = transferAmountFailure(model)
  const maybeExternalTestFunding = Option.flatMap(
    primaryWalletTestFundingMethod(model),
    method =>
      method._tag === 'ExternalTestFundingMethod'
        ? Option.some(method)
        : Option.none(),
  )
  const canRequestTestFunding = selectedNetworkHasCapability(
    model,
    'TestFunding',
  )
  const isTestFundingDisabled =
    model.testFunding._tag === 'RequestingTestFunding' ||
    model.transferAmount._tag !== 'ValidTransferAmount'

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
          <h2>
            {Option.match(maybeAsset, {
              onNone: () => 'Select an asset',
              onSome: asset => asset.symbol,
            })}
          </h2>
        </div>
        <span className="wallet-status">
          {transactionStatus(model.transaction)}
        </span>
      </div>
      <SendNetworkPicker model={model} />
      <label className="wallet-recipient" htmlFor="wallet-amount">
        <span>{amountSymbol}</span>
        <input
          autoComplete="off"
          disabled={model.transaction._tag === 'SubmittingTransaction'}
          id="wallet-amount"
          inputMode="decimal"
          onChange={event =>
            actions.changedTransferAmount(event.currentTarget.value)
          }
          placeholder="0.00"
          type="text"
          value={transferAmountInput(model.transferAmount)}
        />
      </label>
      {Option.isSome(maybeAmountFailure) ? (
        <p className="wallet-validation" role="alert">
          {maybeAmountFailure.value}
        </p>
      ) : null}
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
          placeholder="Recipient address"
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
          Enter an exact amount and recipient. The selected adapter validates a
          network quote before anything is signed.
        </p>
      )}
      {canRequestTestFunding ? (
        <div className="wallet-funding">
          <button
            className="cardboard-button"
            disabled={isTestFundingDisabled}
            onClick={actions.requestedTestFunding}
            type="button"
          >
            {testFundingButtonLabel(model)}
          </button>
          {model.testFunding._tag === 'ReceivedTestFunding' ? (
            <span role="status">
              Received{' '}
              {assetAmountLabelForModel(
                model,
                model.testFunding.receipt.amount,
              )}
            </span>
          ) : null}
        </div>
      ) : null}
      {Option.isSome(maybeExternalTestFunding) ? (
        <div className="wallet-funding">
          <a
            className="cardboard-button"
            href={maybeExternalTestFunding.value.providerUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open {maybeExternalTestFunding.value.providerName}
          </a>
          <span>
            Copy this Wallet’s receiving address, then complete the
            provider-owned faucet flow.
          </span>
        </div>
      ) : null}
      {model.testFunding._tag === 'FailedTestFunding' ||
      model.testFunding._tag === 'UnavailableTestFunding' ? (
        <p className="wallet-validation" role="alert">
          Test funding failed: {model.testFunding.failure.operation} ·{' '}
          {model.testFunding.failure.code}
        </p>
      ) : null}
      {model.transaction._tag === 'FailedTransferValidation' ||
      model.transaction._tag === 'FailedTransactionPreview' ||
      model.transaction._tag === 'FailedTransactionSubmission' ? (
        <p className="wallet-validation" role="alert">
          {model.transaction.failure.operation} failed:{' '}
          {model.transaction.failure.code}
        </p>
      ) : null}
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
            model.transferAmount._tag !== 'ValidTransferAmount' ||
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

const Activity = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const canLoadHistory = selectedNetworkHasCapability(
    model,
    'TransactionHistory',
  )
  const hasNextPage =
    model.transactionHistory._tag === 'LoadedTransactionHistory' &&
    Option.isSome(model.transactionHistory.maybeNextCursor)
  return (
    <section className="wallet-activity cardboard-panel">
      <div className="wallet-heading-row">
        <div>
          <p className="cardboard-eyebrow">Recent activity</p>
          <small>{model.transactionObservation._tag}</small>
        </div>
        {canLoadHistory ? (
          <button
            className="cardboard-button"
            disabled={
              model.transactionHistory._tag === 'LoadingTransactionHistory'
            }
            onClick={actions.requestedTransactionHistoryReload}
            type="button"
          >
            Reload history
          </button>
        ) : null}
      </div>
      {model.transactionObservation._tag === 'FailedTransactionObservation' ? (
        <div className="wallet-validation" role="alert">
          <p>
            Live observation failed: {model.transactionObservation.failure.code}
          </p>
          <button
            className="cardboard-button"
            onClick={actions.resumedTransactionObservation}
            type="button"
          >
            Retry live observation
          </button>
        </div>
      ) : null}
      {model.transactionHistory._tag === 'FailedTransactionHistory' ? (
        <p className="wallet-validation" role="alert">
          History failed: {model.transactionHistory.failure.operation} ·{' '}
          {model.transactionHistory.failure.code}
        </p>
      ) : null}
      {Array.match(model.transactions, {
        onEmpty: () => <p className="wallet-empty">No transactions found.</p>,
        onNonEmpty: transactions => (
          <ul>
            {Array.map(transactions, transaction => (
              <li key={transaction.recordId}>
                <span>
                  {transaction.direction} · {transaction.status}
                </span>
                <strong>
                  {assetAmountLabelForModel(model, transaction.amount)}
                </strong>
                <small>{shortenedAddress(transaction.transactionId)}</small>
              </li>
            ))}
          </ul>
        ),
      })}
      {canLoadHistory ? (
        <div className="wallet-action-row">
          <button
            className="cardboard-button"
            disabled={!hasNextPage}
            onClick={actions.requestedNextTransactionHistoryPage}
            type="button"
          >
            {hasNextPage ? 'Load next page' : 'No more history'}
          </button>
        </div>
      ) : (
        <p className="wallet-help">
          Transaction history is unavailable for the selected network.
        </p>
      )}
    </section>
  )
}

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
          'react-wallet-access-challenge',
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
