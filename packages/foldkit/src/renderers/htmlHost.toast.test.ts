import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Toast from '../behavior/toast.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as ToastFixture from '../test/toastFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Toast Part on the HTML painter through the existing
// generic slot attributes (`Slot.ariaOf` + `slotAttributesOf`), with zero
// Toast-specific painter logic.

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

const stageRunning = (fixture: ToastFixture.Running) => {
  const root = document.createElement('div')
  document.body.append(root)

  const repaint = (): void => {
    const vnode = paintedOf(fixture.tree(), fixture.press)
    root.replaceChildren(elementOf(vnode))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted toast fixture has no ${selector}`)
  }

  const maybeElementWith = (selector: string): HTMLElement | null => {
    const found = root.querySelector(selector)
    return found instanceof HTMLElement ? found : null
  }

  return {
    fixture,
    repaint,
    elementWith,
    maybeElementWith,
    strike: () => {
      root.remove()
    },
  }
}

const struck: Array<() => void> = []

afterEach(() => {
  struck.splice(0).forEach(strike => {
    strike()
  })
})

const staged = (overrides: Partial<Toast.Props> = {}) => {
  const made = stageRunning(ToastFixture.start(overrides))
  struck.push(made.strike)
  return made
}

describe('core Toast Part on the HTML generic host', () => {
  it('paints the live region, stacked Variant ARIA roles/politeness, hover pause/resume, and Dismiss/DismissAll through generic slot attributes', () => {
    const made = staged()

    const region = made.elementWith('#fixture-toast-region')
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-label')).toBe('Notifications')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('tabindex')).toBe('-1')

    // Show Info + Error stacked toasts
    made.fixture.send(
      Toast.ShowToast({
        title: 'Saved draft',
        description: 'Stored locally.',
        variant: 'Info',
      }),
    )
    made.fixture.send(
      Toast.ShowToast({
        title: 'Network error',
        variant: 'Error',
      }),
    )
    made.repaint()

    const infoEntry = made.elementWith('#fixture-toast-entry-0')
    expect(infoEntry.getAttribute('role')).toBe('status')
    expect(infoEntry.getAttribute('aria-live')).toBe('polite')
    expect(infoEntry.getAttribute('aria-atomic')).toBe('true')
    expect(infoEntry.getAttribute('aria-labelledby')).toBe(
      'fixture-toast-entry-0-title',
    )
    expect(infoEntry.getAttribute('aria-describedby')).toBe(
      'fixture-toast-entry-0-description',
    )

    const errorEntry = made.elementWith('#fixture-toast-entry-1')
    expect(errorEntry.getAttribute('role')).toBe('alert')
    expect(errorEntry.getAttribute('aria-live')).toBe('assertive')
    expect(errorEntry.getAttribute('aria-atomic')).toBe('true')
    expect(errorEntry.getAttribute('aria-labelledby')).toBe(
      'fixture-toast-entry-1-title',
    )
    expect(errorEntry.hasAttribute('aria-describedby')).toBe(false)

    // Hover pauses entry-0 and rejects stale ElapsedToast(v1); Leave reschedules v3
    made.fixture.send(Toast.HoverToast({ entryId: 'fixture-toast-entry-0' }))
    made.fixture.send(
      Toast.ElapsedToast({ entryId: 'fixture-toast-entry-0', version: 1 }),
    )
    made.repaint()
    expect(made.maybeElementWith('#fixture-toast-entry-0')).not.toBeNull()

    made.fixture.send(Toast.LeaveToast({ entryId: 'fixture-toast-entry-0' }))
    expect(made.fixture.lastCommands()[0]?.args).toEqual({
      entryId: 'fixture-toast-entry-0',
      version: 3,
      afterMs: 4000,
    })

    // Clicking the dismiss button dispatches DismissToast via Catalog action press
    const dismissZero = made.elementWith('#fixture-toast-entry-0-dismiss')
    expect(dismissZero.getAttribute('role')).toBe('button')
    expect(dismissZero.getAttribute('aria-label')).toBe('Dismiss notification')
    dismissZero.click()
    made.repaint()
    expect(made.maybeElementWith('#fixture-toast-entry-0')).toBeNull()
    expect(made.maybeElementWith('#fixture-toast-entry-1')).not.toBeNull()

    // DismissAllToasts clears the remaining stack
    made.fixture.press(Toast.DismissAllToasts.tag)
    made.repaint()
    expect(made.maybeElementWith('#fixture-toast-entry-1')).toBeNull()
    expect(Toast.isEmpty(made.fixture.toastState())).toBe(true)
  })

  it('keeps animated leaving toasts mounted with disabled dismiss button until Presence settles', () => {
    const made = staged({ isAnimated: true })
    made.fixture.send(
      Toast.ShowToast({ title: 'Uploading', variant: 'Success' }),
    )
    made.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    made.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )
    made.repaint()

    made.elementWith('#fixture-toast-entry-0-dismiss').click()
    made.repaint()
    expect(made.maybeElementWith('#fixture-toast-entry-0')).not.toBeNull()
    expect(
      made
        .elementWith('#fixture-toast-entry-0-dismiss')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    made.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    made.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )
    made.repaint()
    expect(made.maybeElementWith('#fixture-toast-entry-0')).toBeNull()
  })
})
