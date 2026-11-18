import { Array, Match as M, Option, Predicate } from 'effect'
import { type ReactElement, useEffect, useRef, useState } from 'react'

import type { EmbedProps } from '@foldkit/react'

// VIEW

/**
 * One Google Books viewer, as the Embedded Viewer API makes it: it loads a
 * volume, reports whether it could, and turns to a printed page number.
 */
type BooksViewer = Readonly<{
  load: (
    identifier: string,
    onNotFound: () => void,
    onLoaded: () => void,
  ) => void
  goToPage: (page: string) => boolean
  resize: () => void
}>

/** The Embedded Viewer API once `jsapi.js` and its viewer code are here. */
type BooksApi = Readonly<{
  DefaultViewer: new (element: HTMLElement) => BooksViewer
}>

type Status = 'Loading' | 'Loaded' | 'Unavailable'

const loaderUrl = 'https://www.google.com/books/jsapi.js'

const loaderSelector = 'script[data-google-books-api]'

const parkId = 'google-books-viewers'

const volumeAttribute = 'data-google-books-volume'

const statusEvent = 'googlebooksstatus'

const viewerProperty = 'googleBooksViewer'

const apiPollMs = 100

const apiTimeoutMs = 15_000

const isBooksApi = (value: unknown): value is BooksApi =>
  Predicate.hasProperty(value, 'DefaultViewer') &&
  typeof value.DefaultViewer === 'function'

const isBooksViewer = (value: unknown): value is BooksViewer =>
  Predicate.hasProperty(value, 'goToPage') &&
  typeof value.goToPage === 'function' &&
  Predicate.hasProperty(value, 'resize') &&
  typeof value.resize === 'function'

const booksOf = (): unknown => {
  const google: unknown = Reflect.get(globalThis, 'google')
  return Predicate.hasProperty(google, 'books') ? google.books : undefined
}

const maybeApiOf = (): Option.Option<BooksApi> =>
  Option.liftPredicate(booksOf(), isBooksApi)

const requestViewerCode = (): void => {
  const books = booksOf()
  if (
    Predicate.hasProperty(books, 'load') &&
    typeof books.load === 'function'
  ) {
    books.load()
  }
}

const startLoader = (): void => {
  if (document.querySelector(loaderSelector) === null) {
    const script = document.createElement('script')
    script.src = loaderUrl
    script.dataset['googleBooksApi'] = 'Loading'
    script.addEventListener('load', () => {
      script.dataset['googleBooksApi'] = 'Requested'
      requestViewerCode()
    })
    document.head.append(script)
  }
}

/**
 * The Embedded Viewer API, loading it once per page.
 *
 * NOTE: Google's `setOnLoadCallback` only waits for the window's load
 * event, and its `callback` option calls a function its own viewer code
 * replaces, so a viewer added after the page loaded waits for
 * `DefaultViewer` to appear instead.
 */
const booksApi = (): Promise<BooksApi> =>
  new Promise((resolve, reject) => {
    const startedAtMs = Date.now()
    startLoader()
    const check = (): void => {
      const maybeApi = maybeApiOf()
      if (Option.isSome(maybeApi)) {
        resolve(maybeApi.value)
      } else if (Date.now() - startedAtMs > apiTimeoutMs) {
        reject(new Error('Google Books did not load'))
      } else {
        setTimeout(check, apiPollMs)
      }
    }
    check()
  })

const statusOf = (holder: HTMLElement): Status =>
  M.value(holder.dataset['status']).pipe(
    M.withReturnType<Status>(),
    M.when('Loaded', () => 'Loaded'),
    M.when('Unavailable', () => 'Unavailable'),
    M.orElse(() => 'Loading'),
  )

const markStatus = (holder: HTMLElement, status: Status): void => {
  holder.dataset['status'] = status
  holder.dispatchEvent(new Event(statusEvent))
}

const viewerOf = (holder: HTMLElement): Option.Option<BooksViewer> =>
  Option.liftPredicate(Reflect.get(holder, viewerProperty), isBooksViewer)

const parkOf = (): HTMLElement => {
  const existing = document.getElementById(parkId)
  if (existing !== null) {
    return existing
  } else {
    const park = document.createElement('div')
    park.id = parkId
    park.hidden = true
    document.body.append(park)
    return park
  }
}

const parkedHolderOf = (volume: string): Option.Option<HTMLElement> =>
  Array.findFirst(
    Array.filter(
      Array.fromIterable(parkOf().children),
      (child): child is HTMLElement => child instanceof HTMLElement,
    ),
    child => child.getAttribute(volumeAttribute) === volume,
  )

const openedHolder = (volume: string): HTMLElement => {
  const holder = document.createElement('div')
  holder.className = 'ra-preview-holder'
  holder.setAttribute(volumeAttribute, volume)
  markStatus(holder, 'Loading')
  booksApi().then(
    api => {
      const viewer = new api.DefaultViewer(holder)
      Reflect.set(holder, viewerProperty, viewer)
      viewer.load(
        volume,
        () => {
          markStatus(holder, 'Unavailable')
        },
        () => {
          markStatus(holder, 'Loaded')
        },
      )
    },
    () => {
      markStatus(holder, 'Unavailable')
    },
  )
  return holder
}

const previewStylesheet = `
.ra-preview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin: 0;
}

.ra-preview-viewer {
  box-sizing: border-box;
  width: 100%;
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px -18px rgb(15 23 42 / 0.45);
}

.ra-preview-holder {
  width: 100%;
  height: 100%;
}

.ra-preview[data-status='Unavailable'] .ra-preview-viewer {
  display: none;
}

.ra-preview-note {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  text-align: center;
}

.ra-preview-link {
  color: #2563eb;
  text-align: center;
}
`

/**
 * A book's preview from Google Books' Embedded Viewer, drawn where the
 * Text with its embed sits, turned to the embed's page with `goToPage`
 * each time the page changes. The viewer outlives the screen around it:
 * when the screen goes and comes back, as on going back to the shelf and
 * opening the same book, the viewer for that volume is kept in the
 * document and taken up again, so it turns instead of loading the book
 * again. Where Google's preview has no such page, it says so in the
 * embed's words and stays where it was. Where the viewer cannot open the
 * book, it shows the Text's words as a link to the book on Google Books.
 *
 * @example
 * ```tsx
 * <EmbedPaintersProvider value={{ GoogleBooksPreview }}>
 *   <NavigationFrame />
 * </EmbedPaintersProvider>
 * ```
 */
export const GoogleBooksPreview = ({
  embed,
  text,
}: EmbedProps): ReactElement => {
  const viewerBoxRef = useRef<HTMLDivElement>(null)
  const holderRef = useRef<Option.Option<HTMLElement>>(Option.none())
  const [status, setStatus] = useState<Status>('Loading')
  const [isPageMissing, setIsPageMissing] = useState(false)
  const volume = embed.params['volume'] ?? ''
  const page = embed.params['page'] ?? ''

  useEffect(() => {
    const viewerBox = viewerBoxRef.current
    if (viewerBox === null || volume === '') {
      setStatus('Unavailable')
      return undefined
    }
    const holder = Option.getOrElse(parkedHolderOf(volume), () =>
      openedHolder(volume),
    )
    viewerBox.append(holder)
    holderRef.current = Option.some(holder)
    const onStatus = (): void => {
      setStatus(statusOf(holder))
    }
    onStatus()
    holder.addEventListener(statusEvent, onStatus)
    const observer = new ResizeObserver(() => {
      const maybeViewer = viewerOf(holder)
      if (Option.isSome(maybeViewer)) {
        maybeViewer.value.resize()
      }
    })
    observer.observe(viewerBox)
    return () => {
      observer.disconnect()
      holder.removeEventListener(statusEvent, onStatus)
      holderRef.current = Option.none()
      parkOf().append(holder)
    }
  }, [volume])

  useEffect(() => {
    const maybeViewer = Option.flatMap(holderRef.current, viewerOf)
    if (status === 'Loaded' && Option.isSome(maybeViewer)) {
      setIsPageMissing(!maybeViewer.value.goToPage(page))
    }
  }, [page, status])

  return (
    <figure
      className="ra-preview"
      data-status={status}
      style={{ width: `min(100%, ${embed.width.toString()}px)` }}
    >
      <style href="read-aloud-preview" precedence="read-aloud">
        {previewStylesheet}
      </style>
      <div
        ref={viewerBoxRef}
        className="ra-preview-viewer"
        role="region"
        aria-label={text.content}
        aria-busy={status === 'Loading'}
        style={{
          aspectRatio: `${embed.width.toString()} / ${embed.height.toString()}`,
        }}
      />
      {status === 'Unavailable' ? (
        <a className="ra-preview-link" href={text.href}>
          {embed.params['unavailable'] ?? text.content}
        </a>
      ) : null}
      {status === 'Loaded' && isPageMissing ? (
        <p className="ra-preview-note">{embed.params['missingPage']}</p>
      ) : null}
    </figure>
  )
}
