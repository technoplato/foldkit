import { Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { isPage, maybePage } from './environment.js'

const originalWindow = Reflect.get(globalThis, 'window')
const originalDocument = Reflect.get(globalThis, 'document')

const setGlobal = (name: string, value: unknown): void => {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name)
  } else {
    Reflect.defineProperty(globalThis, name, { value, configurable: true })
  }
}

afterEach(() => {
  setGlobal('window', originalWindow)
  setGlobal('document', originalDocument)
})

describe('maybePage', () => {
  it('is None in Node with no window', () => {
    setGlobal('window', undefined)
    setGlobal('document', undefined)
    expect(maybePage()).toEqual(Option.none())
  })

  it('is None under the empty window a Node Instant client defines', () => {
    setGlobal('window', {})
    setGlobal('document', undefined)
    expect(isPage()).toBe(false)
  })

  it('is None in React Native, which has a window but no document', () => {
    setGlobal('window', { addEventListener: () => undefined })
    setGlobal('document', undefined)
    expect(isPage()).toBe(false)
  })

  it('is None in React Native even with a stand-in document', () => {
    setGlobal('window', { addEventListener: () => undefined })
    setGlobal('document', { title: '' })
    const product = navigator.product
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: 'ReactNative',
    })
    expect(isPage()).toBe(false)
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: product,
    })
  })

  it('is the window and document of a real page', () => {
    const pageWindow = { addEventListener: () => undefined }
    const pageDocument = { title: '' }
    setGlobal('window', pageWindow)
    setGlobal('document', pageDocument)
    expect(
      Option.map(maybePage(), page => [page.window, page.document]),
    ).toEqual(Option.some([pageWindow, pageDocument]))
  })
})
