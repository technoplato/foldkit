import { Array, Option } from 'effect'

import { hintStylesheet } from './hintStyles.js'
import type { Echo } from './interaction.js'

/**
 * How long a pointer rests on a control before its hint shows. The
 * browser's own `title` tooltip waits about a second and a half; this is
 * a third of a second, and none at all once one hint is already showing.
 */
export const hintShowDelayMs = 350

const hintWarmMs = 400

const echoShownMs = 1_600

const edgeGapPx = 8

const hintSelector = '[data-hint], [data-hint-title], [data-hint-because]'

const styleMarker = 'data-foldkit-hint-styles'

const ensureStyles = (target: Document): void => {
  if (target.head.querySelector(`style[${styleMarker}]`) === null) {
    const style = target.createElement('style')
    style.setAttribute(styleMarker, '')
    style.textContent = hintStylesheet
    target.head.append(style)
  }
}

const elementOf = (
  target: Document,
  tag: string,
  className: string,
  text: string,
): HTMLElement => {
  const element = target.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

const keysOf = (
  target: Document,
  className: string,
  keyClassName: string,
  keys: ReadonlyArray<string>,
): ReadonlyArray<HTMLElement> => {
  if (Array.isReadonlyArrayEmpty(keys)) {
    return []
  } else {
    const row = elementOf(target, 'span', className, '')
    row.append(
      ...Array.map(keys, key => elementOf(target, 'kbd', keyClassName, key)),
    )
    return [row]
  }
}

const linesOf = (
  target: Document,
  lines: ReadonlyArray<readonly [className: string, text: string | null]>,
): ReadonlyArray<HTMLElement> =>
  Array.flatMap(lines, ([className, text]) =>
    text === null || text === ''
      ? []
      : [elementOf(target, 'span', className, text)],
  )

const fillHint = (
  target: Document,
  panel: HTMLElement,
  from: Element,
): void => {
  const text = elementOf(target, 'span', 'fk-hint-text', '')
  text.append(
    ...linesOf(target, [
      ['fk-hint-title', from.getAttribute('data-hint-title')],
      ['fk-hint-what', from.getAttribute('data-hint')],
      ['fk-hint-because', from.getAttribute('data-hint-because')],
    ]),
  )
  panel.replaceChildren(
    text,
    ...keysOf(
      target,
      'fk-hint-keys',
      'fk-hint-key',
      (from.getAttribute('data-hint-keys') ?? '')
        .split(' ')
        .filter(key => key !== ''),
    ),
  )
}

const placeHint = (
  target: Document,
  panel: HTMLElement,
  from: Element,
): void => {
  const view = target.defaultView
  const viewWidth = view === null ? 0 : view.innerWidth
  const rect = from.getBoundingClientRect()
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const above = rect.top - height - edgeGapPx
  const top = above < edgeGapPx ? rect.bottom + edgeGapPx : above
  const centered = rect.left + rect.width / 2 - width / 2
  const left = Math.max(
    edgeGapPx,
    Math.min(centered, viewWidth - width - edgeGapPx),
  )
  panel.style.top = `${Math.round(top).toString()}px`
  panel.style.left = `${Math.round(left).toString()}px`
  panel.dataset['side'] = above < edgeGapPx ? 'below' : 'above'
}

type Listening = {
  count: number
  stop: () => void
}

const listening = new WeakMap<Document, Listening>()

const startListening = (target: Document): (() => void) => {
  ensureStyles(target)
  const panel = elementOf(target, 'div', 'fk-hint', '')
  panel.setAttribute('role', 'tooltip')
  panel.setAttribute('aria-hidden', 'true')
  panel.dataset['shown'] = 'false'
  target.body.append(panel)

  const state: {
    maybeShown: Option.Option<Element>
    maybeTimer: Option.Option<ReturnType<typeof setTimeout>>
    hiddenAtMs: number
    isKeyboard: boolean
  } = {
    maybeShown: Option.none(),
    maybeTimer: Option.none(),
    hiddenAtMs: 0,
    isKeyboard: false,
  }

  const cancel = (): void => {
    Option.map(state.maybeTimer, clearTimeout)
    state.maybeTimer = Option.none()
  }

  const hide = (): void => {
    cancel()
    if (Option.isSome(state.maybeShown)) {
      state.maybeShown = Option.none()
      state.hiddenAtMs = Date.now()
      panel.dataset['shown'] = 'false'
    }
  }

  const show = (from: Element): void => {
    cancel()
    if (from.isConnected) {
      fillHint(target, panel, from)
      placeHint(target, panel, from)
      panel.dataset['shown'] = 'true'
      state.maybeShown = Option.some(from)
    }
  }

  const hintedOf = (event: Event): Option.Option<Element> =>
    event.target instanceof Element
      ? Option.fromNullishOr(event.target.closest(hintSelector))
      : Option.none()

  const onPointerOver = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      return
    }
    Option.match(hintedOf(event), {
      onNone: hide,
      onSome: from => {
        if (Option.contains(state.maybeShown, from)) {
          return
        }
        const isWarm =
          Option.isSome(state.maybeShown) ||
          Date.now() - state.hiddenAtMs < hintWarmMs
        cancel()
        if (isWarm) {
          show(from)
        } else {
          state.maybeTimer = Option.some(
            setTimeout(() => {
              show(from)
            }, hintShowDelayMs),
          )
        }
      },
    })
  }

  const onPointerOut = (event: Event): void => {
    const related = event instanceof MouseEvent ? event.relatedTarget : null
    const isStillInside = Option.exists(
      hintedOf(event),
      from => related instanceof Node && from.contains(related),
    )
    if (!isStillInside) {
      hide()
    }
  }

  const onFocusIn = (event: Event): void => {
    if (state.isKeyboard) {
      Option.match(hintedOf(event), { onNone: hide, onSome: show })
    }
  }

  const onKeyDown = (event: Event): void => {
    state.isKeyboard = true
    if (event instanceof KeyboardEvent && event.key === 'Escape') {
      hide()
    }
  }

  const onPointerDown = (): void => {
    state.isKeyboard = false
    hide()
  }

  const events: ReadonlyArray<readonly [string, (event: Event) => void]> = [
    ['pointerover', onPointerOver],
    ['pointerout', onPointerOut],
    ['focusin', onFocusIn],
    ['focusout', hide],
    ['keydown', onKeyDown],
    ['pointerdown', onPointerDown],
    ['click', hide],
    ['scroll', hide],
  ]
  Array.forEach(events, ([type, listener]) => {
    target.addEventListener(type, listener, true)
  })
  return () => {
    cancel()
    Array.forEach(events, ([type, listener]) => {
      target.removeEventListener(type, listener, true)
    })
    panel.remove()
  }
}

/**
 * Shows each control's hint in a document: what a press does, the keys
 * that press it, and why it is unavailable, read from the attributes
 * `hintAttributesOf` writes. The hint shows a third of a second after a
 * pointer rests on the control and at once when the keyboard reaches it,
 * and hides when the pointer or the keyboard leaves, on Escape, and on a
 * press. The browser's `title` tooltip is not used: it waits about a
 * second and a half, never shows for the keyboard, and cannot show keys.
 * A screen reader hears the same words from the control's
 * `aria-description`. Any number of painters may ask; a document keeps
 * one listener. Returns a function that stops listening.
 *
 * @example
 * ```typescript
 * const stop = listenForHints(document)
 * ```
 */
export const listenForHints = (target: Document): (() => void) => {
  const current = listening.get(target)
  const entry: Listening =
    current === undefined ? { count: 0, stop: startListening(target) } : current
  entry.count += 1
  listening.set(target, entry)
  const stopped = { isStopped: false }
  return () => {
    if (!stopped.isStopped) {
      stopped.isStopped = true
      entry.count -= 1
      if (entry.count === 0) {
        entry.stop()
        listening.delete(target)
      }
    }
  }
}

const echoTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/**
 * Says for a moment what a key just did, such as `Play title` after `p`,
 * or why it did nothing, `Reset · Unavailable: count is already 0`. It is
 * a status line at the top of the window that a screen reader also
 * announces, and it goes away by itself.
 *
 * @example
 * ```typescript
 * showEcho(document, { title: 'Play title', maybeNote: Option.none(), keys: ['p'] })
 * ```
 */
export const showEcho = (target: Document, echo: Echo): void => {
  ensureStyles(target)
  const existing = target.body.querySelector<HTMLElement>('.fk-echo')
  const line = existing ?? elementOf(target, 'div', 'fk-echo', '')
  if (existing === null) {
    line.setAttribute('role', 'status')
    line.setAttribute('aria-live', 'polite')
    target.body.append(line)
  }
  const text = elementOf(target, 'span', 'fk-echo-text', '')
  text.append(
    ...linesOf(target, [
      ['fk-echo-title', echo.title],
      ['fk-echo-note', Option.getOrNull(echo.maybeNote)],
    ]),
  )
  line.replaceChildren(
    ...keysOf(target, 'fk-echo-keys', 'fk-echo-key', echo.keys),
    text,
  )
  line.dataset['shown'] = 'true'
  const previous = echoTimers.get(line)
  if (previous !== undefined) {
    clearTimeout(previous)
  }
  echoTimers.set(
    line,
    setTimeout(() => {
      line.dataset['shown'] = 'false'
    }, echoShownMs),
  )
}

/**
 * Removes the echo line from a document, for a Client that stops
 * listening to its keys.
 */
export const clearEcho = (target: Document): void => {
  target.body.querySelector('.fk-echo')?.remove()
}
