import { Option } from 'effect'
import { Avatar, Clipboard, Progress, QrCode, Timer } from 'foldkit/behavior'
import { Cluster5Fixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves all 5 Cluster 5 core Parts (Timer, Progress, Avatar,
// Clipboard, QrCode) on the React painter through the existing generic React
// host (`paintReact/host.tsx`), with zero widget-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Cluster5Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster5Fixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const found = view.container.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted cluster5 fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('Cluster 5 core Parts on the React generic host', () => {
  it('proves Timer: starts via trigger click, ticks down, records lap, and resets', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-timer-start'))
    staged.repaint()
    expect(Timer.isRunning(staged.fixture.timerState())).toBe(true)
    expect(
      staged.elementWith('#fixture-timer-start').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-timer-pause').hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(Timer.TickTimer({ nowMs: 1000 }))
    staged.fixture.send(Timer.TickTimer({ nowMs: 3000 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-timer-item-seconds')
        .getAttribute('aria-valuetext'),
    ).toBe('02')

    fireEvent.click(staged.elementWith('#fixture-timer-reset'))
    staged.repaint()
    expect(Timer.isIdle(staged.fixture.timerState())).toBe(true)
  })

  it('proves Progress & Meter: reflects aria-valuenow / aria-valuetext and omits valuenow when indeterminate', () => {
    const staged = stage()
    staged.fixture.send(Progress.SetProgressValue({ value: 75 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuenow'),
    ).toBe('75')
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuetext'),
    ).toBe('75%')

    staged.fixture.send(Progress.SetProgressIndeterminate())
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuenow'),
    ).toBeNull()
  })

  it('proves Avatar: toggles hidden between Image and Fallback across Loaded and Error', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-avatar-image').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-avatar-fallback').hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(
      Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
    )
    staged.fixture.send(Avatar.LoadedAvatarImage())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-avatar-image').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-avatar-fallback').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Clipboard: clicks Trigger into Copying, marks Copied, and auto-resets via ElapsedClipboardHint', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-clipboard-trigger'))
    staged.repaint()
    expect(
      Clipboard.pendingCopyTextOf(staged.fixture.clipboardState()),
    ).toEqual(Option.some('https://foldkit.dev/cluster5'))

    staged.fixture.send(Clipboard.SucceededClipboardCopy())
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-clipboard-trigger')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-clipboard-indicator').hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(
      Clipboard.ElapsedClipboardHint({
        version: staged.fixture.clipboardState().hint.version,
      }),
    )
    staged.repaint()
    expect(
      staged.elementWith('#fixture-clipboard-indicator').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves QrCode: encodes matrix into Frame & Pattern slots and clicks DownloadTrigger', () => {
    const staged = stage()
    staged.fixture.send(QrCode.SetQrCodeValue({ value: 'Foldkit React' }))
    staged.repaint()
    expect(staged.elementWith('#fixture-qr-frame').hasAttribute('hidden')).toBe(
      false,
    )
    expect(
      staged
        .elementWith('#fixture-qr-pattern')
        .getAttribute('aria-valuetext')
        ?.startsWith('M0 0h7'),
    ).toBe(true)

    fireEvent.click(staged.elementWith('#fixture-qr-download'))
    staged.repaint()
    expect(QrCode.downloadCountOf(staged.fixture.qrCodeState())).toBe(1)
  })
})
