import {
  RAILS,
  displayForModel,
  isRailReady,
  quotedCents,
  readPresence,
  requireRail,
} from 'payments-core-example'
import {
  PaymentsProvider,
  usePaymentsActions,
  usePaymentsModel,
} from 'payments-react-bindings-example'

export const App = () => (
  <PaymentsProvider>
    <PaymentsScreen />
  </PaymentsProvider>
)

const PaymentsScreen = () => {
  const model = usePaymentsModel()
  const actions = usePaymentsActions()
  const selected = requireRail(model.selectedRail)

  return (
    <main className="min-h-screen bg-black text-zinc-100 px-4 py-8 flex flex-col items-center">
      <section className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl">Payments</h1>
          <p className="text-sm text-zinc-400">
            React adapter. Same Program as CLI and Foldkit HTML.
          </p>
        </header>
        <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300">
          {displayForModel(model)}
        </pre>
        <div className="flex flex-col gap-2">
          {RAILS.map(rail => {
            const ready = isRailReady(rail.id, model.presence, model.wallet)
            const isSelected = model.selectedRail === rail.id
            return (
              <button
                className={
                  isSelected
                    ? 'w-full rounded-xl border border-amber-400 bg-zinc-900 px-4 py-3 text-left'
                    : 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left'
                }
                key={rail.id}
                onClick={() => actions.selectedRail(rail.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium text-zinc-100">
                    {rail.title}
                  </span>
                  <span
                    className={
                      ready
                        ? 'text-emerald-400 text-xs'
                        : 'text-zinc-500 text-xs'
                    }
                  >
                    {ready ? 'ready' : 'wait'}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {rail.blurb}
                </span>
              </button>
            )
          })}
        </div>
        <div className="space-y-2">
          {selected.setup.map(link => (
            <a
              className="block font-mono text-xs text-amber-300 underline"
              href={link.href}
              key={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.fields.map(field => {
            const isPresent = readPresence(model.presence, field)
            return (
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-200"
                key={field}
                onClick={() =>
                  actions.recordedCredentialPresence(field, !isPresent)
                }
                type="button"
              >
                {field} {isPresent ? 'on' : 'off'}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-zinc-400">
          Quote {quotedCents(model)} cents
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="h-12 rounded-xl bg-zinc-800 text-sm font-medium"
            onClick={
              model.wallet._tag === 'Connected'
                ? actions.disconnectedWallet
                : actions.connectedWallet
            }
            type="button"
          >
            {model.wallet._tag === 'Connected'
              ? 'Disconnect wallet'
              : 'Connect wallet'}
          </button>
          <button
            className="h-12 rounded-xl bg-zinc-800 text-sm font-medium"
            onClick={actions.clearedCredentials}
            type="button"
          >
            Clear presence
          </button>
          <button
            className="h-12 rounded-xl bg-amber-500 text-sm font-medium text-black"
            onClick={actions.requestedSession}
            type="button"
          >
            Start session
          </button>
          <button
            className="h-12 rounded-xl bg-zinc-800 text-sm font-medium"
            onClick={actions.requestedVerify}
            type="button"
          >
            Verify
          </button>
        </div>
        <button
          className="h-11 w-full rounded-xl border border-zinc-700 text-sm"
          onClick={actions.resetCheckout}
          type="button"
        >
          Reset checkout
        </button>
      </section>
    </main>
  )
}

const presenceFlag = (
  presence: {
    readonly stripeSecret: boolean
    readonly stripePublishable: boolean
    readonly stripePaymentLink: boolean
    readonly polarToken: boolean
    readonly polarProductId: boolean
    readonly polarCheckoutUrl: boolean
    readonly lemonApiKey: boolean
    readonly lemonStoreId: boolean
    readonly lemonVariantId: boolean
    readonly lemonCheckoutUrl: boolean
    readonly paypalClientId: boolean
    readonly paypalSecret: boolean
    readonly paypalSandbox: boolean
    readonly coinbaseProjectId: boolean
  },
  field:
    | 'stripeSecret'
    | 'stripePublishable'
    | 'stripePaymentLink'
    | 'polarToken'
    | 'polarProductId'
    | 'polarCheckoutUrl'
    | 'lemonApiKey'
    | 'lemonStoreId'
    | 'lemonVariantId'
    | 'lemonCheckoutUrl'
    | 'paypalClientId'
    | 'paypalSecret'
    | 'paypalSandbox'
    | 'coinbaseProjectId',
): boolean => {
  if (field === 'stripeSecret') {
    return presence.stripeSecret
  }
  if (field === 'stripePublishable') {
    return presence.stripePublishable
  }
  if (field === 'stripePaymentLink') {
    return presence.stripePaymentLink
  }
  if (field === 'polarToken') {
    return presence.polarToken
  }
  if (field === 'polarProductId') {
    return presence.polarProductId
  }
  if (field === 'polarCheckoutUrl') {
    return presence.polarCheckoutUrl
  }
  if (field === 'lemonApiKey') {
    return presence.lemonApiKey
  }
  if (field === 'lemonStoreId') {
    return presence.lemonStoreId
  }
  if (field === 'lemonVariantId') {
    return presence.lemonVariantId
  }
  if (field === 'lemonCheckoutUrl') {
    return presence.lemonCheckoutUrl
  }
  if (field === 'paypalClientId') {
    return presence.paypalClientId
  }
  if (field === 'paypalSecret') {
    return presence.paypalSecret
  }
  if (field === 'paypalSandbox') {
    return presence.paypalSandbox
  }
  return presence.coinbaseProjectId
}
