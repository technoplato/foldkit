import { Array } from 'effect'
import { Document, type Html, html } from 'foldkit/html'
import {
  type Digit,
  type Message,
  type Model,
  PressedClear,
  PressedDigit,
  PressedEnter,
  RequestedCopyAddress,
  RequestedTestFunding,
  copyAddressLabel,
  lastControlLabel,
  revealedLines,
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
      return 'Dial a SKU code'
    case 'WrongCode':
      return 'Wrong code'
    case 'AwaitingPayment':
      return 'Awaiting SOL Devnet payment'
    case 'Received':
      return 'Payment received'
    case 'Vending':
      return 'Vending'
    case 'Dispensed':
      return 'Dispensed — the clip'
    case 'TimedOut':
      return 'Timed out'
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

const keypadButton = (digit: Digit, isLit: boolean): Html => {
  const el = html<Message>()
  return el.button(
    [
      el.OnClick(PressedDigit.make({ digit })),
      el.Class(isLit ? 'ios-key is-lit' : 'ios-key'),
    ],
    [digit],
  )
}

const qrPanel = (model: Model, hostOrigin: ReceivingQrHostOrigin): Html => {
  const el = html<Message>()
  const address =
    model.selection._tag === 'Locked'
      ? model.selection.address
      : model.wallet._tag === 'ready'
        ? model.wallet.address
        : undefined
  if (address === undefined || model.wallet._tag !== 'ready') {
    return el.p(
      [el.Class('ios-muted')],
      [
        model.wallet._tag === 'failed'
          ? `wallet failed: ${model.wallet.code}`
          : 'Loading SOL Devnet receive…',
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
      [el.Class('ios-muted')],
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
          el.Class('ios-qr'),
          el.Src(projection.dataUrl),
          el.Alt('SOL Devnet receive QR'),
          el.Width('192'),
          el.Height('192'),
        ])
      : el.p(
          [el.Class('ios-muted')],
          [receivingQrUnavailableLabel(projection.reason)],
        )
  return el.div(
    [el.Class('ios-stack')],
    [
      el.p([el.Class('ios-section-label')], ['SOL Devnet receive']),
      el.code([el.Class('ios-address')], [address]),
      qr,
      el.button(
        [
          el.OnClick(RequestedCopyAddress.make({})),
          el.Class('ios-text-button'),
        ],
        [copyAddressLabel(model.clipboard)],
      ),
    ],
  )
}

const messages = (model: Model): Html => {
  const el = html<Message>()
  const lines = revealedLines(model.clipPlayback)
  if (model.vendPhase._tag !== 'Dispensed') {
    return el.div([], [])
  }
  return el.section(
    [el.Class('ios-card ios-messages')],
    [
      el.p([el.Class('ios-section-label')], ['Messages · TJ']),
      ...Array.map(lines, line =>
        el.div(
          [
            el.Class(
              line.speaker === 'Michael'
                ? 'ios-bubble mine'
                : 'ios-bubble theirs',
            ),
          ],
          [el.p([], [line.text])],
        ),
      ),
    ],
  )
}

/** Renders the vending page as Html. */
export const body = (model: Model, hostOrigin: ReceivingQrHostOrigin): Html => {
  const el = html<Message>()
  return el.div(
    [el.Class('ios-shell')],
    [
      el.header(
        [el.Class('ios-status')],
        [el.p([], ['9:41']), el.p([], ['VENDING · KNOPHY'])],
      ),
      el.main(
        [el.Class('ios-main')],
        [
          el.p([el.Class('ios-eyebrow')], ['Vending']),
          el.h1([el.Class('ios-title')], ['the clip']),
          el.p([el.Class('ios-price')], [model.listPriceDisplay]),
          el.p(
            [el.Class('ios-muted')],
            ['Listed play · Devnet settle 0.001 SOL'],
          ),
          el.p([el.Class('ios-phase')], [phaseLine(model)]),
          el.p([el.Class('ios-muted')], [selectedLabel(model)]),
          messages(model),
          el.section(
            [el.Class('ios-card')],
            [
              el.p(
                [el.Class('ios-led')],
                [model.keypadBuffer === '' ? '----' : model.keypadBuffer],
              ),
              el.div(
                [el.Class('ios-pad')],
                [
                  ...Array.map(digits.slice(0, 9), digit =>
                    keypadButton(
                      digit,
                      lastControlLabel(model.lastControl) === digit,
                    ),
                  ),
                  el.button(
                    [
                      el.OnClick(PressedClear.make({})),
                      el.Class(
                        lastControlLabel(model.lastControl) === 'CLR'
                          ? 'ios-key ios-key-muted is-lit'
                          : 'ios-key ios-key-muted',
                      ),
                    ],
                    ['CLR'],
                  ),
                  keypadButton(
                    '0',
                    lastControlLabel(model.lastControl) === '0',
                  ),
                  el.button(
                    [
                      el.OnClick(PressedEnter.make({})),
                      el.Class(
                        lastControlLabel(model.lastControl) === 'ENT'
                          ? 'ios-key ios-key-go is-lit'
                          : 'ios-key ios-key-go',
                      ),
                    ],
                    ['ENT'],
                  ),
                ],
              ),
            ],
          ),
          el.section([el.Class('ios-card')], [qrPanel(model, hostOrigin)]),
          el.button(
            [
              el.OnClick(RequestedTestFunding.make({})),
              el.Class('ios-text-button'),
            ],
            ['Request Tiny Devnet Airdrop'],
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
