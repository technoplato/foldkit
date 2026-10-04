import { Array } from 'effect'
import { Text, type TextEmbed } from 'foldkit/renderers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { act, cleanup, render, screen } from '@testing-library/react'

import { GoogleBooksPreview } from './googleBooksPreview.js'

type Calls = {
  created: number
  loaded: Array<string>
  turned: Array<string>
}

const installBooksApi = (
  options: Readonly<{ pages: ReadonlyArray<string>; isFound: boolean }>,
): Calls => {
  const calls: Calls = { created: 0, loaded: [], turned: [] }
  class DefaultViewer {
    constructor() {
      calls.created += 1
    }
    load(identifier: string, onNotFound: () => void, onLoaded: () => void) {
      calls.loaded.push(identifier)
      setTimeout(() => {
        if (options.isFound) {
          onLoaded()
        } else {
          onNotFound()
        }
      }, 0)
    }
    goToPage(page: string) {
      calls.turned.push(page)
      return Array.contains(options.pages, page)
    }
    resize() {}
  }
  Reflect.set(globalThis, 'google', {
    books: { DefaultViewer, load: () => {} },
  })
  return calls
}

class ResizeObserverStandIn {
  observe() {}
  disconnect() {}
}

const embedAt = (page: string): TextEmbed => ({
  kind: 'GoogleBooksPreview',
  params: {
    volume: 'ISBN:9780544553729',
    page,
    missingPage: `Google's preview has no page ${page}.`,
    unavailable: 'The preview did not open here.',
  },
  width: 640,
  height: 600,
})

const textAt = (page: string) =>
  Text(`Little Blue Truck's Christmas, page ${page}, in Google Books`, {
    href: `https://books.google.com/books?id=l2WMBAAAQBAJ&pg=PA${page}`,
    embed: embedAt(page),
  })

const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
  })

beforeEach(() => {
  Reflect.set(globalThis, 'ResizeObserver', ResizeObserverStandIn)
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(globalThis, 'google')
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe('GoogleBooksPreview', () => {
  it('opens the volume at the page, and turns to the next page without loading it again', async () => {
    const calls = installBooksApi({ pages: ['3', '4'], isFound: true })
    const { rerender } = render(
      <GoogleBooksPreview embed={embedAt('3')} text={textAt('3')} />,
    )
    await settle()
    rerender(<GoogleBooksPreview embed={embedAt('4')} text={textAt('4')} />)
    await settle()
    expect(calls).toEqual({
      created: 1,
      loaded: ['ISBN:9780544553729'],
      turned: ['3', '4'],
    })
    expect(screen.queryByText("Google's preview has no page 4.")).toBeNull()
  })

  it('keeps the viewer when the screen around it repaints, and turns it there', async () => {
    const calls = installBooksApi({ pages: ['3', '4'], isFound: true })
    const first = render(
      <GoogleBooksPreview embed={embedAt('3')} text={textAt('3')} />,
    )
    await settle()
    first.unmount()
    render(<GoogleBooksPreview embed={embedAt('4')} text={textAt('4')} />)
    await settle()
    expect(calls).toEqual({
      created: 1,
      loaded: ['ISBN:9780544553729'],
      turned: ['3', '4'],
    })
  })

  it("says so where Google's preview has no such page", async () => {
    installBooksApi({ pages: ['3'], isFound: true })
    render(<GoogleBooksPreview embed={embedAt('9')} text={textAt('9')} />)
    await settle()
    expect(screen.getByText("Google's preview has no page 9.")).toBeDefined()
  })

  it('links to the book on Google Books where the viewer cannot open it', async () => {
    installBooksApi({ pages: [], isFound: false })
    render(<GoogleBooksPreview embed={embedAt('3')} text={textAt('3')} />)
    await settle()
    const link = screen.getByRole('link', {
      name: 'The preview did not open here.',
    })
    expect(link.getAttribute('href')).toBe(
      'https://books.google.com/books?id=l2WMBAAAQBAJ&pg=PA3',
    )
  })
})
