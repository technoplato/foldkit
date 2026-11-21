import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Dialog from '../behavior/dialog.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as DialogFixture from '../test/dialogFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Dialog Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Dialog-specific painter logic.

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

const stage = (mode: 'dialog' | 'alertdialog' = 'dialog') => {
  const fixture =
    mode === 'alertdialog' ? DialogFixture.startAlert() : DialogFixture.start()
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
    throw new Error(`the painted dialog fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Dialog Part on the HTML generic host', () => {
  it('opens, projects dialog ARIA and focus trap state, dismisses on Escape and backdrop, and restores return focus', () => {
    const staged = stage('dialog')

    const trigger = staged.elementWith('#fixture-dialog-trigger')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-dialog-panel')

    // Click trigger -> opens Dialog and projects ARIA on Panel + CloseButton
    trigger.click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-dialog-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')

    const panel = staged.elementWith('#fixture-dialog-panel')
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-activedescendant')).toBe(
      'fixture-dialog-close',
    )
    expect(
      staged.elementWith('#fixture-dialog-close').getAttribute('aria-current'),
    ).toBe('true')

    // Tab wraps focus inside the dialog scope and updates Panel active descendant
    staged.fixture.send(Dialog.PressedDialogKey({ key: 'Tab' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dialog-panel')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-dialog-confirm')
    expect(
      staged.elementWith('#fixture-dialog-close').getAttribute('aria-current'),
    ).toBe('false')

    // Backdrop click dismisses regular dialog and records return focus
    staged.elementWith('#fixture-dialog-backdrop').click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
    expect(Dialog.returnFocusIdOf(staged.fixture.dialogState())).toEqual(
      Option.some('fixture-dialog-trigger'),
    )

    // Reopen and dismiss via Escape
    staged.elementWith('#fixture-dialog-trigger').click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    staged.fixture.send(Dialog.PressedDialogKey({ key: 'Escape' }))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
  })

  it('projects alertdialog role and refuses backdrop dismissal while honoring CloseButton', () => {
    const staged = stage('alertdialog')

    staged.elementWith('#fixture-alert-trigger').click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    expect(
      staged.elementWith('#fixture-alert-panel').getAttribute('role'),
    ).toBe('alertdialog')

    // Backdrop click does not dismiss alertdialog
    staged.elementWith('#fixture-alert-backdrop').click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)

    // Close button closes alertdialog
    staged.elementWith('#fixture-alert-close').click()
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
  })
})
