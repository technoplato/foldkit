import { Option, Schema as S } from 'effect'
import {
  type Digit,
  PressedClear,
  PressedDigit,
  PressedEnter,
  RequestedCopyAddress,
  VendingDisplay,
  howToVend,
} from 'vending-core-example'
import { encodeQrDataUrl } from 'wallet-qr-example'

import { type VendingSceneState, createVendingScene } from './scene.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}
const hudCopy = document.getElementById('hud-copy')
const hudAddress = document.getElementById('hud-address')
const copyAddress = document.getElementById('copy-address')

const decodeDisplay = S.decodeUnknownSync(VendingDisplay)

const isDigit = (value: string): value is Digit =>
  value.length === 1 && value >= '0' && value <= '9'

const tillPath = (pathname: string): string => `/till${pathname}`

const sceneStateFromDisplay = (display: VendingDisplay): VendingSceneState => {
  const maybeQr =
    display.solanaPayUri === null
      ? Option.none()
      : encodeQrDataUrl(display.solanaPayUri)
  return {
    digits: display.digits,
    lastControl: display.lastControl ?? undefined,
    skuLabel: display.skuLabel,
    listPriceDisplay: display.listPriceDisplay,
    vendPhase: display.vendPhase,
    address: display.address ?? undefined,
    clipboard: display.clipboard,
    copyLabel: display.copyLabel,
    qrDataUrl: Option.isSome(maybeQr) ? maybeQr.value : undefined,
    incomingCount: display.incomingCount,
    clipPlayback: display.clipPlayback,
    clipLines: display.clipLines,
  }
}

const offlineState: VendingSceneState = {
  digits: '',
  lastControl: undefined,
  skuLabel: 'the clip',
  listPriceDisplay: '14.28',
  vendPhase: 'Idle',
  address: undefined,
  clipboard: 'idle',
  copyLabel: 'Copy Solana Pay',
  qrDataUrl: undefined,
  incomingCount: 0,
  clipPlayback: 'Idle',
  clipLines: [],
}

let paintedHudKey = ''
let isTillOnline = false

const shortenAddress = (address: string): string => {
  if (address.length <= 16) {
    return address
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

const paintHud = (state: VendingSceneState, viewMode: string) => {
  if (hudCopy === null) {
    return
  }
  const copy = howToVend({
    vendPhase: state.vendPhase,
    digits: state.digits,
    clipPlayback: state.clipPlayback,
  })
  const key = `${copy.currentStep}:${copy.now}:${state.digits}:${state.clipboard}:${viewMode}:${isTillOnline}`
  if (key !== paintedHudKey) {
    paintedHudKey = key
    const steps = copy.steps
      .map(step => {
        const className =
          step.step < copy.currentStep
            ? 'is-done'
            : step.step === copy.currentStep
              ? 'is-now'
              : ''
        return `<li class="${className}">${step.step}. ${step.label}</li>`
      })
      .join('')
    const viewNote =
      viewMode === 'final' ? '' : `<p class="hud-hint">view ${viewMode}</p>`
    const showNow = !(
      copy.currentStep === 1 &&
      state.digits === '' &&
      state.vendPhase === 'Idle'
    )
    const now = showNow ? `<p class="hud-now">${copy.now}</p>` : ''
    const hint =
      copy.currentStep >= 3 ? '' : `<p class="hud-hint">${copy.hint}</p>`
    const dialed = state.digits === '' ? '----' : state.digits
    const tillNote = isTillOnline
      ? ''
      : '<p class="hud-now">Till offline. The machine is a display.</p>'
    hudCopy.innerHTML = `<p class="hud-kicker">${copy.title}</p><p class="hud-now">${dialed}</p><ol class="hud-steps">${steps}</ol>${tillNote}${now}${hint}${viewNote}`
  }
  if (hudAddress !== null) {
    if (state.address === undefined) {
      hudAddress.hidden = true
      hudAddress.textContent = ''
    } else {
      hudAddress.hidden = false
      hudAddress.textContent = shortenAddress(state.address)
    }
  }
  if (copyAddress !== null) {
    const isReady = state.address !== undefined
    copyAddress.classList.toggle('is-visible', isReady)
    copyAddress.classList.toggle('is-copied', state.clipboard === 'copied')
    copyAddress.textContent = state.copyLabel
  }
}

const postMessage = async (message: unknown): Promise<void> => {
  await fetch(tillPath('/messages'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
}

const scene = createVendingScene(root, {
  onDigit: digit => {
    if (isDigit(digit)) {
      void postMessage(PressedDigit.make({ digit }))
    }
  },
  onEnter: () => {
    void postMessage(PressedEnter.make({}))
  },
  onClear: () => {
    void postMessage(PressedClear.make({}))
  },
})

const sync = (display: VendingDisplay) => {
  isTillOnline = true
  const state = sceneStateFromDisplay(display)
  scene.syncState(state)
  paintHud(state, scene.viewMode)
}

const paintOffline = () => {
  isTillOnline = false
  scene.syncState(offlineState)
  paintHud(offlineState, scene.viewMode)
}

const loadModel = async (): Promise<void> => {
  const response = await fetch(tillPath('/model'))
  if (!response.ok) {
    throw new Error(`till model ${String(response.status)}`)
  }
  sync(decodeDisplay(await response.json()))
}

if (copyAddress instanceof HTMLButtonElement) {
  copyAddress.addEventListener('click', () => {
    void postMessage(RequestedCopyAddress.make({}))
  })
}

const start = async (): Promise<void> => {
  try {
    await loadModel()
  } catch {
    paintOffline()
  }
  const source = new EventSource(tillPath('/events'))
  source.addEventListener('message', event => {
    sync(decodeDisplay(JSON.parse(event.data)))
  })
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED) {
      paintOffline()
    }
  })
}

void start()
