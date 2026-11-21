import { Option } from 'effect'
import { Dialog } from 'foldkit/behavior'
import { DialogFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Dialog Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Dialog-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (mode: 'dialog' | 'alertdialog' = 'dialog') => {
  const fixture =
    mode === 'alertdialog' ? DialogFixture.startAlert() : DialogFixture.start()
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
    throw new Error(`the painted dialog fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Dialog Part on the React generic host', () => {
  it('opens, projects dialog ARIA and focus trap state, and dismisses via backdrop, Escape, and CloseButton', () => {
    const staged = stage('dialog')

    const trigger = staged.elementWith('#fixture-dialog-trigger')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')

    fireEvent.click(trigger)
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

    // Tab wraps across focusable targets
    staged.fixture.send(Dialog.PressedDialogKey({ key: 'Tab' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dialog-panel')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-dialog-confirm')

    // Click backdrop -> dismisses regular dialog and records return focus
    fireEvent.click(staged.elementWith('#fixture-dialog-backdrop'))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
    expect(Dialog.returnFocusIdOf(staged.fixture.dialogState())).toEqual(
      Option.some('fixture-dialog-trigger'),
    )

    // Reopen and close via CloseButton
    fireEvent.click(staged.elementWith('#fixture-dialog-trigger'))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    fireEvent.click(staged.elementWith('#fixture-dialog-close'))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
  })

  it('projects alertdialog role and keeps alertdialog open on backdrop click until closed explicitly', () => {
    const staged = stage('alertdialog')

    fireEvent.click(staged.elementWith('#fixture-alert-trigger'))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    expect(
      staged.elementWith('#fixture-alert-panel').getAttribute('role'),
    ).toBe('alertdialog')

    // Backdrop click does not dismiss alertdialog
    fireEvent.click(staged.elementWith('#fixture-alert-backdrop'))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)

    // Escape dismisses alertdialog
    staged.fixture.send(Dialog.PressedDialogKey({ key: 'Escape' }))
    staged.repaint()
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
  })
})
