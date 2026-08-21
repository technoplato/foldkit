import { describe, expect, test } from 'vitest'

import { howToVend } from './how-to.js'

const idle = (digits: string) =>
  howToVend({
    vendPhase: 'Idle',
    digits,
    clipPlayback: 'Idle',
  })

describe('how to vend', () => {
  test('idle with an empty buffer starts on tapping 1 4 2 8', () => {
    const copy = idle('')
    expect(copy.currentStep).toBe(1)
    expect(copy.now).toContain('1 4 2 8')
    expect(copy.steps).toHaveLength(4)
    expect(copy.steps[0]?.label).toContain('1 4 2 8')
    expect(copy.steps[2]?.label).toContain('0.001 SOL')
  })

  test('partial code names the next digit', () => {
    expect(idle('1').now).toContain('4')
    expect(idle('14').now).toContain('2')
    expect(idle('142').now).toContain('8')
  })

  test('1428 on the display asks for Enter', () => {
    const copy = idle('1428')
    expect(copy.currentStep).toBe(2)
    expect(copy.now).toContain('Enter (ENT)')
    expect(copy.steps[1]?.label).toContain('Enter (ENT)')
  })

  test('wrong code tells you to CLR and start over', () => {
    const copy = howToVend({
      vendPhase: 'WrongCode',
      digits: '9999',
      clipPlayback: 'Idle',
    })
    expect(copy.currentStep).toBe(1)
    expect(copy.now).toContain('CLR')
  })

  test('awaiting payment is the QR step', () => {
    const copy = howToVend({
      vendPhase: 'AwaitingPayment',
      digits: '1428',
      clipPlayback: 'Idle',
    })
    expect(copy.currentStep).toBe(3)
    expect(copy.now.toLowerCase()).toContain('qr')
    expect(copy.now).toContain('Devnet')
  })

  test('dispensed playback is watch the iPhone', () => {
    const copy = howToVend({
      vendPhase: 'Dispensed',
      digits: '1428',
      clipPlayback: 'Playing',
    })
    expect(copy.currentStep).toBe(4)
    expect(copy.now.toLowerCase()).toContain('iphone')
  })

  test('type mode says type and enter instead of tap', () => {
    const copy = howToVend({
      vendPhase: 'Idle',
      digits: '1428',
      clipPlayback: 'Idle',
      input: 'type',
    })
    expect(copy.steps[0]?.label.toLowerCase()).toContain('type')
    expect(copy.now.toLowerCase()).toContain('enter')
  })
})
