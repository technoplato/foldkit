import {
  AngleSlider,
  ColorPicker,
  ScrollArea,
  Splitter,
  TableOfContents,
  TimedHint,
} from 'foldkit/behavior'
import { Cluster3Fixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves all six Cluster 3 core Parts (Steps, TableOfContents,
// ScrollArea, Splitter, AngleSlider, ColorPicker) on the React painter through
// the existing generic React host (`paintReact/host.tsx`), with zero
// widget-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Cluster3Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster3Fixture.start(overrides)
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
    throw new Error(`the painted cluster3 fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('Cluster 3 core Parts on the React generic host', () => {
  it('proves Steps (#38) and TableOfContents (#39) ARIA and interaction', () => {
    const staged = stage()

    expect(
      staged
        .elementWith('#fixture-steps-trigger-0')
        .getAttribute('aria-current'),
    ).toBe('true')
    fireEvent.click(staged.elementWith('#fixture-steps-next'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-steps-trigger-1')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-steps-content-1').hasAttribute('hidden'),
    ).toBe(false)

    fireEvent.click(staged.elementWith('#fixture-toc-item-api'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toc-item-api').getAttribute('aria-current'),
    ).toBe('true')

    staged.fixture.send(
      TableOfContents.ObserveScroll({
        scrollTop: 390,
        positions: { intro: 0, guide: 400, api: 900 },
      }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-toc-item-guide')
        .getAttribute('aria-current'),
    ).toBe('true')
  })

  it('proves ScrollArea (#40) and Splitter (#41) drag, TimedHint auto-hide, and collapse', () => {
    const staged = stage()

    expect(
      staged.elementWith('#fixture-scroll-scrollbar').hasAttribute('hidden'),
    ).toBe(true)

    staged.fixture.send(ScrollArea.BeginThumbDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(ScrollArea.MoveThumbDrag({ pointerId: 1, x: 0, y: 80 }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-scroll-scrollbar').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged
        .elementWith('#fixture-scroll-scrollbar')
        .getAttribute('aria-valuenow'),
    ).toBe('400')

    staged.fixture.send(ScrollArea.EndThumbDrag({ pointerId: 1 }))
    const version = TimedHint.versionOf(
      staged.fixture.scrollAreaState().hideHint,
    )
    staged.fixture.send(ScrollArea.ElapsedScrollbarHide({ version }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-scroll-scrollbar').hasAttribute('hidden'),
    ).toBe(true)

    // Splitter
    const handle = staged.elementWith('#fixture-splitter-handle-0')
    expect(handle.getAttribute('role')).toBe('slider')
    expect(handle.getAttribute('aria-valuenow')).toBe('30')

    staged.fixture.send(
      Splitter.BeginResize({ handleIndex: 0, pointerId: 2, x: 300, y: 0 }),
    )
    staged.fixture.send(
      Splitter.MoveResize({
        pointerId: 2,
        x: 450,
        y: 0,
        containerSizePx: 1000,
      }),
    )
    staged.fixture.send(Splitter.EndResize({ pointerId: 2 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-splitter-handle-0')
        .getAttribute('aria-valuenow'),
    ).toBe('45')

    fireEvent.click(staged.elementWith('#fixture-splitter-handle-0'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-splitter-panel-sidebar')
        .hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves AngleSlider (#42) and ColorPicker (#43) ARIA, drag, swatches, and popup dismissal', () => {
    const staged = stage()

    const thumb = staged.elementWith('#fixture-angle-thumb')
    expect(thumb.getAttribute('role')).toBe('slider')
    expect(thumb.getAttribute('aria-valuemin')).toBe('0')
    expect(thumb.getAttribute('aria-valuemax')).toBe('360')
    expect(thumb.getAttribute('aria-valuetext')).toBe('90°')

    staged.fixture.send(AngleSlider.PressedAngleKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-angle-thumb').getAttribute('aria-valuetext'),
    ).toBe('105°')

    // ColorPicker
    fireEvent.click(staged.elementWith('#fixture-color-trigger'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-color-content').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-color-content').getAttribute('role'),
    ).toBe('dialog')

    fireEvent.click(staged.elementWith('#fixture-color-swatch-0000ff'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-color-channel-hue')
        .getAttribute('aria-valuenow'),
    ).toBe('240')

    staged.fixture.send(
      ColorPicker.BeginChannelDrag({
        channel: 'Alpha',
        pointerId: 3,
        x: 50,
        y: 0,
        value: 0.5,
      }),
    )
    staged.fixture.send(ColorPicker.EndColorDrag({ pointerId: 3 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-color-channel-alpha')
        .getAttribute('aria-valuetext'),
    ).toBe('50%')

    staged.fixture.send(
      ColorPicker.PressedOutsideColorPicker({ insideIds: [] }),
    )
    staged.repaint()
    expect(
      staged.elementWith('#fixture-color-content').hasAttribute('hidden'),
    ).toBe(true)
  })
})
