import { clipSku, listPriceDisplay, settleSolDisplay } from './model.js'

export type HowToInput = 'tap' | 'type'
export type HowToStep = 1 | 2 | 3 | 4

export type HowToVendStep = Readonly<{
  step: HowToStep
  label: string
}>

export type HowToVend = Readonly<{
  title: string
  steps: ReadonlyArray<HowToVendStep>
  currentStep: HowToStep
  now: string
  hint: string
}>

const skuDigits = clipSku.code.split('').join(' ')
const settleSol = `${settleSolDisplay} SOL`

const nextSkuDigit = (digits: string): string | undefined => {
  if (digits.length >= clipSku.code.length) {
    return undefined
  }
  if (clipSku.code.startsWith(digits)) {
    return clipSku.code.slice(digits.length, digits.length + 1)
  }
  return undefined
}

/** Host-facing how-to for buying the clip. Core owns the SKU and settle amount. */
export const howToVend = ({
  vendPhase,
  digits,
  clipPlayback,
  input = 'tap',
}: {
  vendPhase: string
  digits: string
  clipPlayback: string
  input?: HowToInput
}): HowToVend => {
  const tap = input === 'tap'
  const enterLabel = tap ? 'Enter (ENT)' : 'Enter'
  const steps: ReadonlyArray<HowToVendStep> = [
    {
      step: 1,
      label: `${tap ? 'Tap' : 'Type'} ${skuDigits}`,
    },
    {
      step: 2,
      label: `${tap ? 'Tap' : 'Press'} ${enterLabel}`,
    },
    {
      step: 3,
      label: `Pay the QR · ${settleSol} Devnet`,
    },
    {
      step: 4,
      label: 'Watch the iPhone play the clip',
    },
  ]
  const hint = tap
    ? 'Keypad on the machine · drag to look'
    : 'Type the code. Esc leaves the machine.'

  if (
    vendPhase === 'Dispensed' ||
    vendPhase === 'Received' ||
    vendPhase === 'Vending'
  ) {
    const now =
      clipPlayback === 'Complete'
        ? 'That’s the clip — FoldKit state, not a video.'
        : vendPhase === 'Dispensed'
          ? 'Watch the iPhone. This is the clip, played from FoldKit state.'
          : 'Payment landed. The door is opening.'
    return {
      title: `The clip · $${listPriceDisplay}`,
      steps,
      currentStep: 4,
      now,
      hint,
    }
  }

  if (vendPhase === 'AwaitingPayment') {
    return {
      title: `The clip · $${listPriceDisplay}`,
      steps,
      currentStep: 3,
      now: `Scan the QR · ${settleSol} Devnet, not mainnet.`,
      hint,
    }
  }

  if (vendPhase === 'WrongCode' || vendPhase === 'TimedOut') {
    const now =
      vendPhase === 'TimedOut'
        ? `Timed out. ${tap ? 'Tap CLR' : 'Press Backspace'}, then ${skuDigits}.`
        : `Wrong code. ${tap ? 'Tap CLR' : 'Press Backspace'}, then ${skuDigits}.`
    return {
      title: `The clip · $${listPriceDisplay}`,
      steps,
      currentStep: 1,
      now,
      hint,
    }
  }

  if (digits === clipSku.code) {
    return {
      title: `The clip · $${listPriceDisplay}`,
      steps,
      currentStep: 2,
      now: `Now ${tap ? 'tap Enter (ENT)' : 'press Enter'}.`,
      hint,
    }
  }

  const nextDigit = nextSkuDigit(digits)
  const now =
    nextDigit === undefined
      ? digits === ''
        ? `${tap ? 'Tap' : 'Type'} ${skuDigits}, then ${enterLabel}.`
        : `Need ${clipSku.code}. ${tap ? 'Tap CLR' : 'Press Backspace'} if this is wrong.`
      : digits === ''
        ? `${tap ? 'Tap' : 'Type'} ${skuDigits}, then ${enterLabel}.`
        : `Next: ${nextDigit}`

  return {
    title: `The clip · $${listPriceDisplay}`,
    steps,
    currentStep: 1,
    now,
    hint,
  }
}
