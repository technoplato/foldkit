import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Avatar from '../behavior/avatar.js'
import * as Clipboard from '../behavior/clipboard.js'
import * as Progress from '../behavior/progress.js'
import * as QrCode from '../behavior/qrCode.js'
import * as Timer from '../behavior/timer.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as Cluster5Fixture from '../test/cluster5Fixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves all 5 Cluster 5 core Parts (Timer, Progress, Avatar,
// Clipboard, QrCode) on the HTML painter through the existing generic
// `htmlHost` (`slotAttributesOf`), with zero widget-specific painter logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode, onAction: (tag: string) => void): Vnode => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return paintHtml(tree, tag => tag) as unknown as Vnode
  } finally {
    clearHtmlRuntime()
  }
}

const elementOf = (node: Vnode): HTMLElement => {
  const tag = Option.getOrElse(
    Array.head((node.sel ?? 'div').split(/[.#]/u)),
    () => 'div',
  )
  const element = document.createElement(tag === '' ? 'div' : tag)
  Object.entries(node.data?.attrs ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value))
  })
  Object.entries(node.data?.class ?? {}).forEach(([name, isOn]) => {
    if (isOn) {
      element.classList.add(name)
    }
  })
  const clickHandler = node.data?.on?.['click']
  if (typeof clickHandler === 'function') {
    element.addEventListener('click', event => {
      clickHandler(event)
    })
  }
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const roots: Array<HTMLElement> = []

afterEach(() => {
  roots.splice(0).forEach(root => root.remove())
})

const stage = (overrides: Cluster5Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster5Fixture.start(overrides)
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)

  const repaint = (): void => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree(), fixture.press)))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted cluster5 fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('Cluster 5 core Parts on the HTML generic host', () => {
  it('proves Timer: starts via trigger, ticks via TickTimer, records lap, pauses/resumes, and completes', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-timer-area').getAttribute('aria-valuetext'),
    ).toBe('00:00:05')
    expect(
      staged.elementWith('#fixture-timer-start').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-timer-pause').hasAttribute('hidden'),
    ).toBe(true)

    staged.elementWith('#fixture-timer-start').click()
    staged.repaint()
    expect(Timer.isRunning(staged.fixture.timerState())).toBe(true)
    expect(
      staged.elementWith('#fixture-timer-start').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-timer-pause').hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(Timer.TickTimer({ nowMs: 2000 }))
    staged.elementWith('#fixture-timer-lap').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-timer-item-seconds')
        .getAttribute('aria-valuetext'),
    ).toBe('04')
    expect(Timer.lapsOf(staged.fixture.timerState())).toEqual([4000])

    staged.elementWith('#fixture-timer-pause').click()
    staged.repaint()
    expect(Timer.isPaused(staged.fixture.timerState())).toBe(true)
    expect(
      staged.elementWith('#fixture-timer-resume').hasAttribute('hidden'),
    ).toBe(false)
  })

  it('proves Progress & Meter: projects aria-valuemin/max/now/text, indeterminate omission, and Meter thresholds', () => {
    const staged = stage()
    const track = staged.elementWith('#fixture-progress-track')
    expect(track.getAttribute('role')).toBe('status')
    expect(track.getAttribute('aria-valuemin')).toBe('0')
    expect(track.getAttribute('aria-valuemax')).toBe('100')
    expect(track.getAttribute('aria-valuenow')).toBe('0')
    expect(track.getAttribute('aria-valuetext')).toBe('0%')

    staged.fixture.send(Progress.SetProgressValue({ value: 60 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuenow'),
    ).toBe('60')
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuetext'),
    ).toBe('60%')

    staged.fixture.send(Progress.SetProgressIndeterminate())
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuenow'),
    ).toBeNull()
    expect(
      staged
        .elementWith('#fixture-progress-track')
        .getAttribute('aria-valuetext'),
    ).toBe('Loading')

    const meterStaged = stage({
      progress: { kind: 'Meter', low: 25, high: 75, optimum: 90 },
    })
    meterStaged.fixture.send(Progress.SetProgressValue({ value: 20 }))
    meterStaged.repaint()
    expect(
      meterStaged.elementWith('#fixture-progress-track').getAttribute('role'),
    ).toBe('region')
    expect(
      Progress.meterZoneOf(
        meterStaged.fixture.progressState(),
        meterStaged.fixture.props.progress,
      ),
    ).toBe('Critical')
  })

  it('proves Avatar: switches hidden between Image and Fallback slots across Loading, Loaded, and Error', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-avatar-image').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-avatar-fallback').hasAttribute('hidden'),
    ).toBe(false)
    expect(staged.elementWith('#fixture-avatar-fallback').textContent).toBe(
      'AL',
    )

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

    staged.fixture.send(Avatar.FailedAvatarImage())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-avatar-image').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-avatar-fallback').hasAttribute('hidden'),
    ).toBe(false)
  })

  it('proves Clipboard: enters Copying via trigger click, transitions to Copied with visible Indicator, and resets on ElapsedClipboardHint', () => {
    const staged = stage()
    expect(
      staged
        .elementWith('#fixture-clipboard-input')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-clipboard-trigger')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      staged.elementWith('#fixture-clipboard-indicator').hasAttribute('hidden'),
    ).toBe(true)

    staged.elementWith('#fixture-clipboard-trigger').click()
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

    const currentHintVersion = staged.fixture.clipboardState().hint.version
    staged.fixture.send(
      Clipboard.ElapsedClipboardHint({ version: currentHintVersion }),
    )
    staged.repaint()
    expect(Clipboard.copiedOf(staged.fixture.clipboardState())).toBe(false)
    expect(
      staged.elementWith('#fixture-clipboard-indicator').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves QrCode: reveals Frame, Pattern SVG path, Overlay, and enables DownloadTrigger when Ready', () => {
    const staged = stage()
    expect(staged.elementWith('#fixture-qr-frame').hasAttribute('hidden')).toBe(
      true,
    )
    expect(
      staged.elementWith('#fixture-qr-download').getAttribute('aria-disabled'),
    ).toBe('true')

    staged.fixture.send(QrCode.SetQrCodeValue({ value: 'https://foldkit.dev' }))
    staged.repaint()
    expect(staged.elementWith('#fixture-qr-frame').hasAttribute('hidden')).toBe(
      false,
    )
    expect(
      staged.elementWith('#fixture-qr-frame').getAttribute('aria-valuetext'),
    ).toBe('0 0 25 25')
    expect(
      staged
        .elementWith('#fixture-qr-pattern')
        .getAttribute('aria-valuetext')
        ?.startsWith('M0 0h7'),
    ).toBe(true)

    staged.elementWith('#fixture-qr-download').click()
    staged.repaint()
    expect(QrCode.downloadCountOf(staged.fixture.qrCodeState())).toBe(1)
  })
})
