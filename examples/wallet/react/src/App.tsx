import { Array, Match as M, Option } from 'effect'
import {
  type Model,
  type TransactionPreview,
  type TransactionState,
  currencyValueLabel,
  invalidNetworkAddressMessage,
  makeWalletTestChallenge,
  networkAddressRuleMessages,
  networkLabel,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletBalance,
  shortenedAddress,
  transferRecipientFormat,
  transferRecipientInput,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  initialWalletRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import {
  makeRemoteWalletResources,
  publicTestnetWalletEndpoint,
} from 'wallet-remote-example'

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(makeRemoteWalletResources(publicTestnetWalletEndpoint))

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
      FailedTransactionSubmission: () => 'Send failed',
    }),
  )

const WalletHero = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio' ? 'Loading…' : '—',
    onSome: balance => currencyValueLabel(balance.value),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account =>
      `${networkLabel(account.network)} · ${shortenedAddress(account.address)}`,
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
        <small>{accountLabel}</small>
      </div>
    </header>
  )
}

const SendMoney = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeBalance = primaryWalletBalance(model)
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const recipientValue = transferRecipientInput(model.transferRecipient)
  const recipientFormat = transferRecipientFormat(model.transferRecipient)

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
          <h2>0.00001 ETH</h2>
        </div>
        <span className="wallet-status">
          {transactionStatus(model.transaction)}
        </span>
      </div>
      <label className="wallet-recipient" htmlFor="wallet-recipient">
        <span>Recipient on {recipientFormat.networkName}</span>
        <input
          autoCapitalize="none"
          autoComplete="off"
          disabled={model.transaction._tag === 'SubmittingTransaction'}
          id="wallet-recipient"
          onChange={event =>
            actions.changedTransferRecipient(event.currentTarget.value)
          }
          placeholder={recipientFormat.exampleAddress}
          spellCheck={false}
          type="text"
          value={recipientValue}
        />
      </label>
      {model.transferRecipient._tag === 'InvalidTransferRecipient' ? (
        <div className="wallet-validation" role="alert">
          <p>
            {invalidNetworkAddressMessage(model.transferRecipient.validation)}
          </p>
          <ul>
            {Array.map(
              networkAddressRuleMessages(
                model.transferRecipient.validation.format,
              ),
              rule => (
                <li key={rule}>{rule}</li>
              ),
            )}
          </ul>
        </div>
      ) : null}
      {Option.isSome(maybePreview) ? (
        <div className="wallet-preview">
          <div>
            <span>To</span>
            <strong>
              {shortenedAddress(maybePreview.value.draft.destinationAddress)}
            </strong>
          </div>
          <div>
            <span>Network fee</span>
            <strong>
              {currencyValueLabel(maybePreview.value.estimatedFee)}
            </strong>
          </div>
          <div>
            <span>Balance after</span>
            <strong>
              {currencyValueLabel(maybePreview.value.resultingBalance)}
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
                    .explorer
                }
                .
              </span>
              <a
                href={
                  model.transaction.submission.maybeExplorerConfirmation.value
                    .transactionUri
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                View on{' '}
                {
                  model.transaction.submission.maybeExplorerConfirmation.value
                    .explorer
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
            model.transferRecipient._tag !== 'ValidTransferRecipient' ||
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
    {Array.match(model.observedTransactions, {
      onEmpty: () => <p className="wallet-empty">Nothing sent yet.</p>,
      onNonEmpty: transactions => (
        <ul>
          {Array.map(transactions, transaction => (
            <li key={transaction.transactionId}>
              <span>{transaction.status}</span>
              <strong>{currencyValueLabel(transaction.value)}</strong>
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
          <code>{maybeAccount.value.address}</code>
        </>
      ) : (
        <p>Account data is not loaded.</p>
      )}
      {Option.isSome(maybeReceivingInstruction) ? (
        <>
          <h3>Receive</h3>
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
