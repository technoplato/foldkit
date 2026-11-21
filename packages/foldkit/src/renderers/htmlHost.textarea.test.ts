import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Textarea from '../behavior/textarea.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as TextareaFixture from '../test/textareaFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Textarea Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Textarea-specific painter
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
    element instanceof HTMLInputElement &&
    typeof node.data?.props?.['value'] === 'string'
  ) {
    element.value = node.data.props['value']
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
  const inputHandler = node.data?.on?.['input']
  if (typeof inputHandler === 'function') {
    element.addEventListener('input', event => {
      inputHandler(event)
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

const stage = (overrides: Partial<Textarea.Props> = {}) => {
  const fixture = TextareaFixture.start(overrides)
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
    throw new Error(`the painted textarea fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Textarea Part on the HTML generic host', () => {
  it('projects multiline textbox WAI-ARIA, handles multiline typing, Mod+Enter commit, Escape cancel, and clear', () => {
    const staged = stage({
      isRequired: true,
      isInvalid: true,
      minRows: 2,
      maxRows: 5,
    })

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

    // Clear button hidden while empty
    expect(
      staged.elementWith('#fixture-textarea-clear').hasAttribute('hidden'),
    ).toBe(true)

    // Label click begins editing
    staged.elementWith('#fixture-textarea-label').click()
    staged.repaint()
    expect(Textarea.isEditing(staged.fixture.textareaState())).toBe(true)

    // Typing multiline text updates draft and unhides ClearButton
    staged.fixture.type(
      `${Textarea.ChangeTextarea.tag}:`,
      'Line one\nLine two\nLine three',
    )
    staged.repaint()
    expect(Textarea.draftOf(staged.fixture.textareaState())).toBe(
      'Line one\nLine two\nLine three',
    )
    expect(Textarea.lineCountOf(staged.fixture.textareaState())).toBe(3)
    expect(
      Textarea.visibleRowsOf(
        staged.fixture.textareaState(),
        staged.fixture.props,
      ),
    ).toBe(3)
    expect(
      staged.elementWith('#fixture-textarea-clear').hasAttribute('hidden'),
    ).toBe(false)

    // Plain Enter keeps editing (preserves newline)
    staged.fixture.send(Textarea.PressedTextareaKey({ key: 'Enter' }))
    staged.repaint()
    expect(Textarea.isEditing(staged.fixture.textareaState())).toBe(true)

    // Mod+Enter commits
    staged.fixture.send(
      Textarea.PressedTextareaKey({ key: 'Enter', isMeta: true }),
    )
    staged.repaint()
    expect(Textarea.isIdle(staged.fixture.textareaState())).toBe(true)
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe(
      'Line one\nLine two\nLine three',
    )

    // Subsequent edit cancelled by Escape reverts to committed value
    staged.fixture.type(`${Textarea.ChangeTextarea.tag}:`, 'discarded')
    staged.fixture.send(Textarea.PressedTextareaKey({ key: 'Escape' }))
    staged.repaint()
    expect(Textarea.isIdle(staged.fixture.textareaState())).toBe(true)
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe(
      'Line one\nLine two\nLine three',
    )

    // Clicking clear empties the field and hides ClearButton again
    staged.elementWith('#fixture-textarea-clear').click()
    staged.repaint()
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe('')
    expect(
      staged.elementWith('#fixture-textarea-clear').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('projects disabled and readOnly ARIA and refuses edits', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked\nnotes' })
    const disabledField = disabled.elementWith('#fixture-textarea-textarea')
    expect(disabledField.getAttribute('aria-multiline')).toBe('true')
    expect(disabledField.getAttribute('aria-disabled')).toBe('true')
    expect(disabledField.getAttribute('tabindex')).toBe('-1')
    disabled.fixture.type(`${Textarea.ChangeTextarea.tag}:`, 'changed')
    disabled.repaint()
    expect(Textarea.draftOf(disabled.fixture.textareaState())).toBe(
      'locked\nnotes',
    )

    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly\nnote' })
    expect(
      readOnly
        .elementWith('#fixture-textarea-textarea')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    readOnly.fixture.type(`${Textarea.ChangeTextarea.tag}:`, 'changed')
    readOnly.repaint()
    expect(Textarea.draftOf(readOnly.fixture.textareaState())).toBe(
      'readonly\nnote',
    )
  })
})
