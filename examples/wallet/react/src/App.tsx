import { Option } from 'effect'
import {
  type CurrencyValue,
  type Model,
  SigningChallenge,
  type TransactionPreview,
  type TransactionState,
  transferDraftFromInput,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  WalletProvider,
  initialWalletRoute,
  useWalletActions,
  useWalletModel,
  useWalletReplay,
} from 'wallet-react-bindings-example'

const cardClassName =
  'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60'
const primaryButtonClassName =
  'rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClassName =
  'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition enabled:hover:border-cyan-500 enabled:hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40'

const valueText = (value: CurrencyValue): string =>
  `${value.atomicUnits} ${value.currency._tag} atomic units (${value.decimalPlaces.toString()} decimals)`

const previewForTransaction = (
  transaction: TransactionState,
): TransactionPreview | undefined => {
  if (transaction._tag === 'PreviewedTransaction') {
    return transaction.preview
  } else if (transaction._tag === 'SubmittingTransaction') {
    return transaction.preview
  } else if (transaction._tag === 'SubmittedTransaction') {
    return transaction.preview
  } else if (transaction._tag === 'FailedTransactionSubmission') {
    return transaction.preview
  } else {
    return undefined
  }
}

const Portfolio = ({ model }: Readonly<{ model: Model }>) => {
  if (model.portfolio._tag === 'LoadingPortfolio') {
    return <p className="text-sm text-slate-500">Loading public accounts…</p>
  } else if (model.portfolio._tag === 'FailedPortfolio') {
    return (
      <p className="text-sm text-rose-700">
        Portfolio failed: {model.portfolio.failure.operation}
      </p>
    )
  } else {
    const portfolio = model.portfolio.snapshot
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {portfolio.accounts.map(account => {
          const balances = portfolio.balanceSnapshot.balances.filter(
            balance => balance.accountId === account.accountId,
          )
          const receivingInstructions = portfolio.receivingInstructions.filter(
            instruction => instruction.accountId === account.accountId,
          )
          return (
            <article
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              key={account.accountId}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                {account.network._tag}
              </p>
              <h3 className="mt-2 text-lg font-semibold">
                {account.displayName}
              </h3>
              <p className="mt-1 break-all font-mono text-xs text-slate-500">
                {account.address}
              </p>
              <ul className="mt-4 space-y-2">
                {balances.map(balance => (
                  <li
                    className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700"
                    key={`${balance.accountId}:${balance.value.currency._tag}`}
                  >
                    {valueText(balance.value)}
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-3">
                {receivingInstructions.map(instruction => (
                  <div
                    className="rounded-xl border border-dashed border-cyan-300 bg-cyan-50 p-3"
                    key={`${instruction.accountId}:${instruction.currency._tag}`}
                  >
                    <p className="text-xs font-semibold text-cyan-900">
                      Receive {instruction.currency._tag}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-cyan-800">
                      QR payload: {instruction.portableUri}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    )
  }
}

const Transaction = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const portfolio =
    model.portfolio._tag === 'LoadedPortfolio'
      ? model.portfolio.snapshot
      : undefined
  const account = portfolio?.accounts.find(
    candidate => candidate.network._tag === 'EthereumSepolia',
  )
  const balance = portfolio?.balanceSnapshot.balances.find(
    candidate =>
      candidate.accountId === account?.accountId &&
      candidate.value.currency._tag === 'Eth',
  )
  const preview = previewForTransaction(model.transaction)

  const composeTransfer = () => {
    if (account !== undefined && balance !== undefined) {
      const maybeDraft = transferDraftFromInput({
        transferId: 'react-demo-transfer',
        accountId: account.accountId,
        network: account.network,
        destinationAddress: '0x2222222222222222222222222222222222222222',
        value: {
          ...balance.value,
          atomicUnits: '100000000000000000',
        },
        maybeMessage: Option.some('Shared React Wallet demo'),
      })
      if (Option.isSome(maybeDraft)) {
        actions.composedTransfer(maybeDraft.value)
      }
    }
  }

  const submitPreview = () => {
    if (preview !== undefined) {
      actions.requestedSignedTransactionSubmission(preview.previewId)
    }
  }

  return (
    <section className={cardClassName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Transaction composition
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Preview, sign, submit</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButtonClassName}
            disabled={account === undefined || balance === undefined}
            onClick={composeTransfer}
            type="button"
          >
            Compose preset transfer
          </button>
          <button
            className={primaryButtonClassName}
            disabled={model.transaction._tag !== 'PreviewedTransaction'}
            onClick={submitPreview}
            type="button"
          >
            Sign and submit
          </button>
        </div>
      </div>
      <p className="mt-5 text-sm text-slate-600">
        State: <strong>{model.transaction._tag}</strong>
      </p>
      {preview === undefined ? null : (
        <div className="mt-4 grid gap-3 rounded-2xl bg-slate-950 p-5 text-sm text-slate-200 md:grid-cols-2">
          <p className="break-all">
            Destination: {preview.draft.destinationAddress}
          </p>
          <p>{valueText(preview.draft.value)}</p>
          <p>Estimated fee: {valueText(preview.estimatedFee)}</p>
          <p>Resulting balance: {valueText(preview.resultingBalance)}</p>
        </div>
      )}
    </section>
  )
}

const Activity = ({ model }: Readonly<{ model: Model }>) => (
  <section className={cardClassName}>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
      Observed transaction stream
    </p>
    <h2 className="mt-2 text-2xl font-semibold">
      {model.transactionObservation._tag}
    </h2>
    {!model.observedTransactions.some(() => true) ? (
      <p className="mt-4 text-sm text-slate-500">
        Submit the preview to emit a simulated network observation.
      </p>
    ) : (
      <ul className="mt-4 space-y-3">
        {model.observedTransactions.map(transaction => (
          <li
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            key={transaction.transactionId}
          >
            <p className="font-mono text-xs text-slate-500">
              {transaction.transactionId}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {transaction.direction} · {transaction.status} ·{' '}
              {valueText(transaction.value)}
            </p>
          </li>
        ))}
      </ul>
    )}
  </section>
)

const Signature = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const account =
    model.portfolio._tag === 'LoadedPortfolio'
      ? model.portfolio.snapshot.accounts.find(
          candidate => candidate.network._tag === 'EthereumSepolia',
        )
      : undefined

  const signChallenge = () => {
    if (account !== undefined) {
      actions.requestedChallengeSignature(
        SigningChallenge.make({
          challengeId: 'react-demo-challenge',
          accountId: account.accountId,
          digest: {
            algorithm: 'Keccak256',
            domain: 'foldkit.example.wallet',
            digestHex: '0x666f6c646b6974',
          },
        }),
      )
    }
  }

  return (
    <section className={cardClassName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Challenge signing
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {model.signature._tag}
          </h2>
        </div>
        <button
          className={secondaryButtonClassName}
          disabled={account === undefined}
          onClick={signChallenge}
          type="button"
        >
          Sign canonical challenge
        </button>
      </div>
      {model.signature._tag === 'SignedChallenge' ? (
        <p className="mt-4 break-all rounded-2xl bg-emerald-50 p-4 font-mono text-xs text-emerald-900">
          Verified proof: {model.signature.proof._tag} ·{' '}
          {model.signature.proof.challengeId}
        </p>
      ) : null}
    </section>
  )
}

const Replay = () => {
  const replay = useWalletReplay()

  return (
    <section className={cardClassName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Replay
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{replay.mode}</h2>
        </div>
        <p className="font-mono text-sm text-slate-500">
          Frame {replay.frame.toString()} of {replay.finalFrame.toString()}
        </p>
      </div>
      <input
        aria-label="Replay frame"
        className="mt-5 w-full accent-cyan-700"
        max={replay.finalFrame}
        min={0}
        onChange={event => replay.seek(Number(event.currentTarget.value))}
        type="range"
        value={replay.frame}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={secondaryButtonClassName}
          disabled={replay.frame === 0}
          onClick={replay.stepBackward}
          type="button"
        >
          Previous frame
        </button>
        <button
          className={secondaryButtonClassName}
          disabled={replay.mode === 'Inspecting'}
          onClick={() => replay.inspect()}
          type="button"
        >
          Inspect
        </button>
        <button
          className={secondaryButtonClassName}
          disabled={
            replay.mode === 'Live' || replay.frame === replay.finalFrame
          }
          onClick={replay.stepForward}
          type="button"
        >
          Next frame
        </button>
      </div>
    </section>
  )
}

const WalletScreen = () => {
  const model = useWalletModel()
  const actions = useWalletActions()

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-8 text-white shadow-xl shadow-cyan-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Shared public Model · React host
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                Portable Wallet
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Public accounts, deterministic simulated signing, transaction
                observation, and replay through domain-shaped hooks.
              </p>
            </div>
            <button
              className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
              onClick={actions.requestedWalletRefresh}
              type="button"
            >
              Refresh wallet
            </button>
          </div>
        </header>
        <section className={cardClassName}>
          <h2 className="mb-5 text-2xl font-semibold">Accounts and balances</h2>
          <Portfolio model={model} />
        </section>
        <Transaction model={model} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Activity model={model} />
          <Signature model={model} />
        </div>
        <Replay />
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
