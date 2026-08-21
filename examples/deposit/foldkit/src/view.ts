import {
  type Chain,
  type IncomingSol,
  type Message,
  type Model,
  type Network,
  RequestedCopyAddress,
  RequestedCryptoDeposit,
  RequestedFiatDeposit,
  RequestedTestFunding,
  RequestedWalletCreation,
  SelectedCryptoRail,
} from 'deposit-core-example'
import { Array, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'
import { displayAmountFromAtomicUnits } from 'wallet-core-example'
import {
  type ReceivingQrHostOrigin,
  liveWalletRuntimeMode,
  projectReceivingQr,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'

const solLabel = (lamports: IncomingSol['lamports']): string =>
  `${displayAmountFromAtomicUnits(lamports, 9)} SOL`

const outcomeLine = (model: Model): string =>
  Option.match(model.lastOutcome, {
    onNone: () => 'effects appear here — unsupported rails refuse',
    onSome: outcome =>
      outcome._tag === 'ok' ? outcome.line : `refuse ${outcome.why}`,
  })

const railButton = (chain: Chain, network: Network, model: Model): Html => {
  const el = html<Message>()
  const selected =
    model.selectedChain === chain && model.selectedNetwork === network
  const live = chain === 'sol' && network === 'devnet'
  return el.button(
    [
      el.OnClick(SelectedCryptoRail.make({ chain, network })),
      el.Class(
        selected
          ? 'rounded border border-amber-400 bg-black/60 px-3 py-2 font-mono text-xs text-amber-200'
          : 'rounded border border-emerald-900 bg-black/30 px-3 py-2 font-mono text-xs text-emerald-300',
      ),
    ],
    [`${chain}:${network}${live ? ' · live' : ' · ADT'}`],
  )
}

const incomingRow = (item: IncomingSol): Html => {
  const el = html<Message>()
  return el.li(
    [
      el.Key(item.transactionId),
      el.Class('flex justify-between gap-4 font-mono text-sm text-emerald-200'),
    ],
    [
      el.span([], [solLabel(item.lamports)]),
      el.span(
        [el.Class('text-emerald-600')],
        [`${item.status} · ${item.transactionId.slice(0, 8)}`],
      ),
    ],
  )
}

const qrPanel = (model: Model, hostOrigin: ReceivingQrHostOrigin): Html => {
  const el = html<Message>()
  if (model.wallet._tag !== 'ready') {
    return el.p(
      [el.Class('font-mono text-sm text-emerald-500')],
      [
        model.wallet._tag === 'failed'
          ? `wallet failed: ${model.wallet.code}`
          : 'loading SOL Devnet receive…',
      ],
    )
  }
  const wallet = model.wallet
  const account = wallet.portfolio.accounts.find(
    item => item.accountId === wallet.accountId,
  )
  const instruction = wallet.portfolio.receivingInstructions.find(
    item => item.assetId === 'solana:devnet:sol',
  )
  if (account === undefined || instruction === undefined) {
    return el.p(
      [el.Class('font-mono text-sm text-red-400')],
      ['no SOL Devnet receiving instruction'],
    )
  }
  const projection = projectReceivingQr({
    account,
    hostOrigin,
    instruction,
    portfolio: wallet.portfolio,
    runtimeMode: liveWalletRuntimeMode,
  })
  const qr =
    projection._tag === 'AvailableReceivingQr'
      ? el.img([
          el.Class('mt-3 h-48 w-48 bg-white p-2'),
          el.Src(projection.dataUrl),
          el.Alt('SOL Devnet receive QR'),
          el.Width('192'),
          el.Height('192'),
        ])
      : el.p(
          [el.Class('mt-3 font-mono text-xs text-amber-400')],
          [receivingQrUnavailableLabel(projection.reason)],
        )
  return el.div(
    [el.Class('grid gap-3')],
    [
      el.p(
        [el.Class('font-mono text-xs uppercase tracking-wide text-amber-400')],
        ['SOL Devnet receive'],
      ),
      el.code(
        [el.Class('break-all font-mono text-sm text-emerald-100')],
        [wallet.address],
      ),
      qr,
      el.button(
        [
          el.OnClick(RequestedCopyAddress.make({})),
          el.Class(
            'w-fit rounded border border-emerald-700 px-3 py-2 font-mono text-xs text-emerald-200 hover:border-amber-400',
          ),
        ],
        ['copy address'],
      ),
    ],
  )
}

const rails = (): ReadonlyArray<readonly [Chain, Network]> => [
  ['sol', 'devnet'],
  ['sol', 'testnet'],
  ['sol', 'mainnet'],
  ['sui', 'devnet'],
  ['eth', 'mainnet'],
  ['btc', 'mainnet'],
]

/** Renders the deposit page as Html. */
export const body = (model: Model, hostOrigin: ReceivingQrHostOrigin): Html => {
  const el = html<Message>()
  return el.div(
    [el.Class('min-h-screen bg-zinc-950 text-emerald-100')],
    [
      el.header(
        [
          el.Class(
            'border-b border-emerald-900 bg-black px-6 py-3 font-mono text-sm',
          ),
        ],
        [el.p([el.Class('text-emerald-500')], ['sender@deposit:~$'])],
      ),
      el.main(
        [el.Class('mx-auto grid max-w-5xl gap-8 p-6')],
        [
          el.p(
            [
              el.Class(
                'font-mono text-xs uppercase tracking-[0.3em] text-amber-400',
              ),
            ],
            ['DEPOSIT · SOL DEVNET FIRST'],
          ),
          el.h1([el.Class('text-3xl font-semibold')], ['Deposit page']),
          el.p(
            [el.Class('font-mono text-sm text-emerald-400')],
            [outcomeLine(model)],
          ),
          el.section(
            [el.Class('rounded-xl border border-emerald-800 bg-black/40 p-5')],
            [qrPanel(model, hostOrigin)],
          ),
          el.section(
            [el.Class('grid gap-3')],
            [
              el.h2(
                [
                  el.Class(
                    'font-mono text-xs uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['crypto rails (ADT)'],
              ),
              el.div(
                [el.Class('flex flex-wrap gap-2')],
                Array.map(rails(), pair => railButton(pair[0], pair[1], model)),
              ),
              el.button(
                [
                  el.OnClick(
                    RequestedCryptoDeposit.make({
                      chain: model.selectedChain,
                      network: model.selectedNetwork,
                    }),
                  ),
                  el.Class(
                    'w-fit rounded border border-emerald-700 px-3 py-2 font-mono text-xs text-emerald-200',
                  ),
                ],
                ['request selected rail'],
              ),
            ],
          ),
          el.section(
            [el.Class('grid gap-3')],
            [
              el.h2(
                [
                  el.Class(
                    'font-mono text-xs uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['fiat'],
              ),
              el.button(
                [
                  el.OnClick(
                    RequestedFiatDeposit.make({
                      method: 'stripe',
                      currency: 'USD',
                      amount: '100',
                    }),
                  ),
                  el.Class(
                    'w-fit rounded border border-amber-700 px-3 py-2 font-mono text-xs text-amber-200',
                  ),
                ],
                ['Stripe (unconfigured)'],
              ),
              el.p(
                [el.Class('font-mono text-xs text-emerald-600')],
                ['Fiat ADT exists. Stripe keys are not in this repo.'],
              ),
            ],
          ),
          el.section(
            [el.Class('grid gap-3')],
            [
              el.h2(
                [
                  el.Class(
                    'font-mono text-xs uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['incoming SOL'],
              ),
              model.incoming.length === 0
                ? el.p(
                    [el.Class('font-mono text-sm text-emerald-600')],
                    ['no incoming yet'],
                  )
                : el.ul(
                    [el.Class('grid gap-1')],
                    Array.map(model.incoming, incomingRow),
                  ),
            ],
          ),
          el.section(
            [el.Class('grid gap-3')],
            [
              el.h2(
                [
                  el.Class(
                    'font-mono text-xs uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['unlocked capabilities'],
              ),
              model.sender.unlocked.length === 0
                ? el.p(
                    [el.Class('font-mono text-sm text-emerald-600')],
                    ['none — settle a SOL Devnet deposit'],
                  )
                : el.ul(
                    [el.Class('grid gap-1 font-mono text-sm text-emerald-200')],
                    Array.map(model.sender.unlocked, cap =>
                      el.li([el.Key(cap._tag)], [cap._tag]),
                    ),
                  ),
            ],
          ),
          el.section(
            [el.Class('flex flex-wrap gap-3')],
            [
              el.button(
                [
                  el.OnClick(RequestedTestFunding.make({})),
                  el.Class(
                    'rounded border border-emerald-700 px-3 py-2 font-mono text-xs text-emerald-200',
                  ),
                ],
                ['request tiny Devnet airdrop'],
              ),
              el.button(
                [
                  el.OnClick(RequestedWalletCreation.make({})),
                  el.Class(
                    'rounded border border-emerald-700 px-3 py-2 font-mono text-xs text-emerald-200',
                  ),
                ],
                ['create / restore wallet'],
              ),
            ],
          ),
          el.p(
            [el.Class('font-mono text-xs text-emerald-700')],
            [
              'Full wallet UI: wallet.knophy.com / wallet-foldkit.knophy.com. This page is not the orbit sim.',
            ],
          ),
        ],
      ),
    ],
  )
}

/** Renders the Deposit page with Foldkit HTML. */
export const makeView =
  (hostOrigin: ReceivingQrHostOrigin) =>
  (model: Model): Document => ({
    title: 'Deposit',
    body: body(model, hostOrigin),
  })
