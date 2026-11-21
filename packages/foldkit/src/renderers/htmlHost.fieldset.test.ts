import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Fieldset from '../behavior/fieldset.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as FieldsetFixture from '../test/fieldsetFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Fieldset Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Fieldset-specific painter
// logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    props?: Readonly<Record<string, unknown>>
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
  if (
    element instanceof HTMLButtonElement &&
    node.data?.props?.['disabled'] === true
  ) {
    element.disabled = true
  }
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

const stage = (
  overrides: Partial<Fieldset.Props> = {},
  options: Readonly<{ defaultDisabled?: boolean }> = {},
) => {
  const fixture = FieldsetFixture.start(overrides, options)
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
    throw new Error(`the painted fieldset fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Fieldset Part on the HTML generic host', () => {
  it('projects group WAI-ARIA, shows per-field errors, and handles submit/fail/retry/reset', () => {
    const staged = stage()

    const group = staged.elementWith('#fixture-fieldset-fieldset')
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-labelledby')).toBe(
      'fixture-fieldset-legend',
    )
    expect(group.getAttribute('aria-describedby')).toBe(
      'fixture-fieldset-description',
    )
    expect(staged.elementWith('#fixture-fieldset-legend').textContent).toBe(
      'Account details',
    )
    expect(
      staged
        .elementWith('#fixture-fieldset-field-email-message')
        .hasAttribute('hidden'),
    ).toBe(true)

    // Submit transitions to Submitting and disables SubmitButton
    staged.elementWith('#fixture-fieldset-submit').click()
    staged.repaint()
    expect(Fieldset.isSubmitting(staged.fixture.fieldsetState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-fieldset-submit')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Server failure exposes FieldError alert and aria-invalid on group
    staged.fixture.send(
      Fieldset.FailedSubmit({
        error: 'Could not save account',
        serverErrors: { email: 'Email already taken' },
      }),
    )
    staged.repaint()
    const failedGroup = staged.elementWith('#fixture-fieldset-fieldset')
    expect(failedGroup.getAttribute('aria-invalid')).toBe('true')
    expect(failedGroup.getAttribute('aria-describedby')).toBe(
      'fixture-fieldset-description fixture-fieldset-error',
    )
    const emailError = staged.elementWith(
      '#fixture-fieldset-field-email-message',
    )
    expect(emailError.getAttribute('role')).toBe('alert')
    expect(emailError.getAttribute('aria-live')).toBe('polite')
    expect(emailError.hasAttribute('hidden')).toBe(false)
    expect(emailError.textContent).toBe('Email already taken')

    // Reset clears server errors and returns to Idle
    staged.elementWith('#fixture-fieldset-reset').click()
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

  it('projects disabled ARIA on group, legend, and buttons and blocks submission', () => {
    const staged = stage({}, { defaultDisabled: true })

    expect(
      staged
        .elementWith('#fixture-fieldset-fieldset')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-fieldset-legend')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-fieldset-submit')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-fieldset-reset')
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
