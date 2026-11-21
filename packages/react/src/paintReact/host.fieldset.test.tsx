import { Fieldset } from 'foldkit/behavior'
import { FieldsetFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Fieldset Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Fieldset-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (
  overrides: Partial<Fieldset.Props> = {},
  options: Readonly<{ defaultDisabled?: boolean }> = {},
) => {
  const fixture = FieldsetFixture.start(overrides, options)
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
    throw new Error(`the painted fieldset fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Fieldset Part on the React generic host', () => {
  it('projects group WAI-ARIA, live field errors, submit, and reset', () => {
    const staged = stage()

    const group = staged.elementWith('#fixture-fieldset-fieldset')
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-labelledby')).toBe(
      'fixture-fieldset-legend',
    )
    expect(group.getAttribute('aria-describedby')).toBe(
      'fixture-fieldset-description',
    )

    fireEvent.click(staged.elementWith('#fixture-fieldset-submit'))
    staged.repaint()
    expect(Fieldset.isSubmitting(staged.fixture.fieldsetState())).toBe(true)

    staged.fixture.send(
      Fieldset.FailedSubmit({
        error: 'Check your details',
        serverErrors: { email: 'Email already taken' },
      }),
    )
    staged.repaint()

    const failedGroup = staged.elementWith('#fixture-fieldset-fieldset')
    expect(failedGroup.getAttribute('aria-invalid')).toBe('true')
    expect(failedGroup.getAttribute('aria-describedby')).toBe(
      'fixture-fieldset-description fixture-fieldset-error',
    )

    const emailAlert = staged.elementWith(
      '#fixture-fieldset-field-email-message',
    )
    expect(emailAlert.getAttribute('role')).toBe('alert')
    expect(emailAlert.hasAttribute('hidden')).toBe(false)
    expect(emailAlert.textContent).toBe('Email already taken')

    fireEvent.click(staged.elementWith('#fixture-fieldset-reset'))
    staged.repaint()
    expect(Fieldset.submissionStateOf(staged.fixture.fieldsetState())).toBe(
      'Idle',
    )
    expect(Fieldset.isValidOf(staged.fixture.fieldsetState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-fieldset-field-email-message')
        .hasAttribute('hidden'),
    ).toBe(true)
  })

  it('projects disabled state and refuses submission when disabled', () => {
    const staged = stage({}, { defaultDisabled: true })

    expect(
      staged
        .elementWith('#fixture-fieldset-fieldset')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-fieldset-submit')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    staged.fixture.send(Fieldset.AttemptSubmit())
    staged.repaint()
    expect(Fieldset.submissionStateOf(staged.fixture.fieldsetState())).toBe(
      'Idle',
    )
    expect(Fieldset.hasAttemptedSubmit(staged.fixture.fieldsetState())).toBe(
      false,
    )
  })
})
