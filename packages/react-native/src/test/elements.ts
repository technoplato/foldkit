import { Array, Predicate, pipe } from 'effect'
import { type ReactElement, isValidElement } from 'react'

type Props = Readonly<Record<string, unknown>>

/** An element's props as a record. */
export const propsOf = (element: ReactElement): Props =>
  Predicate.isObject(element.props) ? { ...element.props } : {}

const memoMark = Symbol.for('react.memo')

// NOTE: a painter keeps some parts by memo, such as one node or one row.
// A test reads the tree without React, so a kept part that needs no hooks
// is painted here, as React would paint it the first time.
const painted = (value: unknown): unknown => {
  if (!isValidElement(value)) {
    return value
  }
  const type: unknown = value.type
  if (
    Predicate.isObject(type) &&
    Predicate.hasProperty(type, '$$typeof') &&
    type.$$typeof === memoMark &&
    Predicate.hasProperty(type, 'type') &&
    Predicate.isFunction(type.type)
  ) {
    try {
      return painted(type.type(value.props))
    } catch {
      return value
    }
  } else {
    return value
  }
}

const childrenOf = (element: ReactElement): ReadonlyArray<unknown> => {
  const flatten = (value: unknown): ReadonlyArray<unknown> =>
    globalThis.Array.isArray(value) ? value.flatMap(flatten) : [painted(value)]
  return flatten(propsOf(element)['children'])
}

/** Every element under one, depth first. */
export const descendants = (
  element: ReactElement,
): ReadonlyArray<ReactElement> =>
  pipe(
    childrenOf(element),
    Array.filter(isValidElement),
    Array.flatMap(child => [child, ...descendants(child)]),
  )

/** An element and every element under it. */
export const allOf = (element: ReactElement): ReadonlyArray<ReactElement> => [
  element,
  ...descendants(element),
]

/** The elements of one host type, such as `'Text'`, in and under an element. */
export const hostsOf = (
  element: ReactElement,
  type: unknown,
): ReadonlyArray<ReactElement> =>
  Array.filter(allOf(element), child => child.type === type)

/** The words an element shows, its own and those under it, in order. */
export const wordsOf = (element: ReactElement): string =>
  Array.join(
    Array.map(childrenOf(element), child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child)
      } else if (isValidElement(child)) {
        return wordsOf(child)
      } else {
        return ''
      }
    }),
    '',
  )

/** An element's style, with every merged style folded into one record. */
export const styleOf = (element: ReactElement): Props => {
  const flatten = (value: unknown): Props => {
    if (globalThis.Array.isArray(value)) {
      return value.reduce<Props>(
        (merged, part) => ({ ...merged, ...flatten(part) }),
        {},
      )
    } else if (Predicate.isObject(value)) {
      return { ...value }
    } else {
      return {}
    }
  }
  return flatten(propsOf(element)['style'])
}

/** Calls one of an element's handlers, such as `onPress`. */
export const callProp = (
  element: ReactElement,
  name: string,
  ...args: ReadonlyArray<unknown>
): void => {
  const handler = propsOf(element)[name]
  if (typeof handler === 'function') {
    handler(...args)
  }
}

/** The first element matching, or a failed test. */
export const firstOf = (
  elements: ReadonlyArray<ReactElement>,
  isIt: (element: ReactElement) => boolean,
): ReactElement => {
  const found = elements.find(isIt)
  if (found === undefined) {
    throw new Error('no element matched')
  }
  return found
}
