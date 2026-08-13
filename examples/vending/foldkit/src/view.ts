import { Array } from 'effect'
import { Document, html, type Html } from 'foldkit/html'
import {
  type Digit,
  type Message,
  type Model,
  PressedClear,
  PressedDigit,
  PressedEnter,
  RequestedCopyAddress,
  RequestedTestFunding,
} from 'vending-core-example'
import {
  type ReceivingQrHostOrigin,
  liveWalletRuntimeMode,
  projectReceivingQr,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'

const digits: ReadonlyArray<Digit> = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
]

const phaseLine = (model: Model): string => {
  switch (model.vendPhase._tag) {
    case 'Idle':
      return 'dial a SKU code'
    case 'WrongCode':
      return 'wrong code'
    case 'AwaitingPayment':
      return 'awaiting SOL Devnet payment'
    case 'Received':
      return 'payment received'
    case 'Vending':
      return 'vending'
    case 'Dispensed':
      return 'dispensed — the clip'
    case 'TimedOut':
      return 'timed out'
  }
}

const selectedLabel = (model: Model): string => {
  if (model.selection._tag === 'Locked') {
    return `${model.selection.sku.name} · slot ${model.selection.sku.slot}`
  }
  if (model.selection._tag === 'Dialed') {
    return `dialed ${model.selection.code}`
  }
  return 'no selection'
}

const keypadButton = (digit: Digit): Html => {
  const el = html<Message>()
  return el.button(
    [
      el.OnClick(PressedDigit.make({ digit })),
      el.Class(
        'h-12 rounded border border-amber-700 bg-black/50 font-mono text-lg text-amber-200 hover:border-amber-300',
      ),
    ],
    [digit],
  )
}

const qrPanel = (
  model: Model,
  hostOrigin: ReceivingQrHostOrigin,
): Html => {
  const el = html<Message>()
  const address =
    model.selection._tag === 'Locked'
      ? model.selection.address
      : model.wallet._tag === 'ready'
        ? model.wallet.address
        : undefined
  if (address === undefined || model.wallet._tag !== 'ready') {
    return el.p(
      [el.Class('font-mono text-sm text-amber-500')],
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
        [el.Class('break-all font-mono text-sm text-amber-100')],
        [address],
      ),
      qr,
      el.button(
        [
          el.OnClick(RequestedCopyAddress.make({})),
          el.Class(
            'w-fit rounded border border-amber-700 px-3 py-2 font-mono text-xs text-amber-200 hover:border-amber-300',
          ),
        ],
        ['copy address'],
      ),
    ],
  )
}

/** Renders the vending page as Html. */
export const body = (
  model: Model,
  hostOrigin: ReceivingQrHostOrigin,
): Html => {
  const el = html<Message>()
  return el.div(
    [el.Class('min-h-screen bg-zinc-950 text-amber-100')],
    [
      el.header(
        [el.Class('border-b border-amber-900 bg-black px-6 py-3 font-mono text-sm')],
        [el.p([el.Class('text-amber-500')], ['knophy@vending:~$'])],
      ),
      el.main(
        [el.Class('mx-auto grid max-w-3xl gap-8 p-6')],
        [
          el.p(
            [el.Class('font-mono text-xs uppercase tracking-[0.3em] text-amber-400')],
            ['VENDING · KNOPHY'],
          ),
          el.h1(
            [el.Class('text-3xl font-semibold')],
            ['the clip'],
          ),
          el.p(
            [el.Class('font-mono text-sm text-amber-300')],
            [model.listPriceDisplay],
          ),
          el.p(
            [el.Class('font-mono text-xs text-amber-500')],
            ['play listed · Devnet settle 0.001 SOL'],
          ),
          el.p(
            [el.Class('font-mono text-sm text-amber-400')],
            [phaseLine(model)],
          ),
          el.p(
            [el.Class('font-mono text-sm text-amber-200')],
            [selectedLabel(model)],
          ),
          el.section(
            [el.Class('rounded-xl border border-amber-800 bg-black/40 p-5')],
            [
              el.p(
                [el.Class('mb-3 font-mono text-3xl tracking-[0.4em] text-amber-100')],
                [model.keypadBuffer === '' ? '----' : model.keypadBuffer],
              ),
              el.div(
                [el.Class('grid grid-cols-3 gap-2')],
                [
                  ...Array.map(digits.slice(0, 9), keypadButton),
                  el.button(
                    [
                      el.OnClick(PressedClear.make({})),
                      el.Class(
                        'h-12 rounded border border-amber-800 font-mono text-xs text-amber-400',
                      ),
                    ],
                    ['CLR'],
                  ),
                  keypadButton('0'),
                  el.button(
                    [
                      el.OnClick(PressedEnter.make({})),
                      el.Class(
                        'h-12 rounded border border-emerald-700 font-mono text-xs text-emerald-300',
                      ),
                    ],
                    ['ENT'],
                  ),
                ],
              ),
            ],
          ),
          el.section(
            [el.Class('rounded-xl border border-amber-800 bg-black/40 p-5')],
            [qrPanel(model, hostOrigin)],
          ),
          el.button(
            [
              el.OnClick(RequestedTestFunding.make({})),
              el.Class(
                'w-fit rounded border border-amber-700 px-3 py-2 font-mono text-xs text-amber-200',
              ),
            ],
            ['request tiny Devnet airdrop'],
          ),
        ],
      ),
    ],
  )
}

/** Renders the Vending page with Foldkit HTML. */
export const makeView =
  (hostOrigin: ReceivingQrHostOrigin) =>
  (model: Model): Document => ({
    title: 'Vending',
    body: body(model, hostOrigin),
  })
