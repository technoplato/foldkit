import { Option } from 'effect'
import { Avatar, Clipboard, Progress, QrCode, Timer } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { Cluster5Fixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves all 5 Cluster 5 core Parts (Timer, Progress, Avatar,
// Clipboard, QrCode) on the React Native painter through the existing generic
// RN host (`interaction/host.ts`), with zero widget-specific painter logic.

const stage = (overrides: Cluster5Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster5Fixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('Cluster 5 core Parts on the React Native generic host', () => {
  it('proves Timer: starts via press, steps via TickTimer, records lap, and pauses', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-timer-area'))['accessibilityValue'],
    ).toMatchObject({ now: 5000, text: '00:00:05' })

    callProp(staged.buttonNamed('Start timer'), 'onPress')
    expect(Timer.isRunning(staged.fixture.timerState())).toBe(true)

    staged.fixture.send(Timer.TickTimer({ nowMs: 1000 }))
    callProp(staged.buttonNamed('Lap timer'), 'onPress')
    expect(
      propsOf(staged.viewWithId('fixture-timer-item-seconds'))[
        'accessibilityValue'
      ],
    ).toMatchObject({ now: 4, text: '04' })
    expect(Timer.lapsOf(staged.fixture.timerState())).toEqual([4000])

    callProp(staged.buttonNamed('Pause timer'), 'onPress')
    expect(Timer.isPaused(staged.fixture.timerState())).toBe(true)
  })

  it('proves Progress & Meter: paints accessibilityValue min/max/now/text and drops now when indeterminate', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-progress-track'))[
        'accessibilityValue'
      ],
    ).toEqual({ min: 0, max: 100, now: 0, text: '0%' })

    staged.fixture.send(Progress.SetProgressValue({ value: 80 }))
    expect(
      propsOf(staged.viewWithId('fixture-progress-track'))[
        'accessibilityValue'
      ],
    ).toEqual({ min: 0, max: 100, now: 80, text: '80%' })

    staged.fixture.send(Progress.SetProgressIndeterminate())
    expect(
      propsOf(staged.viewWithId('fixture-progress-track'))[
        'accessibilityValue'
      ],
    ).toEqual({ min: 0, max: 100, text: 'Loading' })
  })

  it('proves Avatar: updates accessibilityElementsHidden across Image and Fallback views', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-avatar-image'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
    expect(
      propsOf(staged.viewWithId('fixture-avatar-fallback'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(
      Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
    )
    staged.fixture.send(Avatar.LoadedAvatarImage())
    expect(
      propsOf(staged.viewWithId('fixture-avatar-image'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-avatar-fallback'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('proves Clipboard: presses Copy into Copying, unhides Indicator when Copied, and resets on ElapsedClipboardHint', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-clipboard-indicator'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Copy value'), 'onPress')
    expect(
      Clipboard.pendingCopyTextOf(staged.fixture.clipboardState()),
    ).toEqual(Option.some('https://foldkit.dev/cluster5'))

    staged.fixture.send(Clipboard.SucceededClipboardCopy())
    expect(
      propsOf(staged.buttonNamed('Copy value'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.viewWithId('fixture-clipboard-indicator'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(
      Clipboard.ElapsedClipboardHint({
        version: staged.fixture.clipboardState().hint.version,
      }),
    )
    expect(
      propsOf(staged.viewWithId('fixture-clipboard-indicator'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('proves QrCode: reveals Frame and Pattern SVG path via accessibilityValue and triggers download', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-qr-frame'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    staged.fixture.send(QrCode.SetQrCodeValue({ value: 'Foldkit RN' }))
    expect(
      propsOf(staged.viewWithId('fixture-qr-frame'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-qr-frame'))['accessibilityValue'],
    ).toEqual({ text: '0 0 21 21' })

    callProp(staged.buttonNamed('Download QR'), 'onPress')
    expect(QrCode.downloadCountOf(staged.fixture.qrCodeState())).toBe(1)
  })
})
