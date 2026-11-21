import { Textarea } from 'foldkit/behavior'
import { TextareaFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Textarea Part on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero
// Textarea-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Textarea.Props> = {}) => {
  const fixture = TextareaFixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
      onInput: (token, value) => {
        fixture.type(token, value)
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
    throw new Error(`the painted textarea fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Textarea Part on the React generic host', () => {
  it('projects multiline textbox WAI-ARIA, handles multiline typing, Ctrl+Enter commit, Escape cancel, and clear', () => {
    const staged = stage({ isRequired: true, isInvalid: true })

    const textarea = staged.elementWith('#fixture-textarea-textarea')
    expect(textarea.getAttribute('role')).toBe('textbox')
    expect(textarea.getAttribute('aria-multiline')).toBe('true')
    expect(textarea.getAttribute('aria-labelledby')).toBe(
      'fixture-textarea-label',
    )
    expect(textarea.getAttribute('aria-describedby')).toBe(
      'fixture-textarea-description fixture-textarea-error',
    )
    expect(textarea.getAttribute('aria-required')).toBe('true')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.getAttribute('tabindex')).toBe('0')

    staged.fixture.type(
      `${Textarea.ChangeTextarea.tag}:`,
      'First line\nSecond line',
    )
    staged.repaint()
    expect(Textarea.draftOf(staged.fixture.textareaState())).toBe(
      'First line\nSecond line',
    )
    expect(Textarea.isDirty(staged.fixture.textareaState())).toBe(true)

    // Plain Enter keeps editing
    staged.fixture.send(Textarea.PressedTextareaKey({ key: 'Enter' }))
    staged.repaint()
    expect(Textarea.isEditing(staged.fixture.textareaState())).toBe(true)

    // Ctrl+Enter commits
    staged.fixture.send(
      Textarea.PressedTextareaKey({ key: 'Enter', isControl: true }),
    )
    staged.repaint()
    expect(Textarea.isIdle(staged.fixture.textareaState())).toBe(true)
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe(
      'First line\nSecond line',
    )

    fireEvent.click(staged.elementWith('#fixture-textarea-clear'))
    staged.repaint()
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe('')
  })

  it('projects disabled ARIA and refuses edits when disabled', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked' })
    const disabledField = disabled.elementWith('#fixture-textarea-textarea')
    expect(disabledField.getAttribute('aria-multiline')).toBe('true')
    expect(disabledField.getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(disabledField, { target: { value: 'nope' } })
    disabled.repaint()
    expect(Textarea.draftOf(disabled.fixture.textareaState())).toBe('locked')
  })

  it('projects readOnly ARIA and refuses edits when readOnly', () => {
    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly' })
    const readOnlyField = readOnly.elementWith('#fixture-textarea-textarea')
    expect(readOnlyField.getAttribute('aria-multiline')).toBe('true')
    expect(readOnlyField.getAttribute('aria-readonly')).toBe('true')
    fireEvent.change(readOnlyField, { target: { value: 'nope' } })
    readOnly.repaint()
    expect(Textarea.draftOf(readOnly.fixture.textareaState())).toBe('readonly')
  })
})
