import { Effect, Layer, Option, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { afterPaint } from 'foldkit/render'
import {
  Capture,
  ClipboardWriteError,
  ClipboardWriter,
  type Connectivity,
  type KeyPress,
  type KeyTarget,
  KeyboardInput,
  LinkShareError,
  LinkSharer,
  NetworkStatus,
  type SectionPlacement,
  TranscriptScroller,
  type WordsDatabase,
  WordsOrigin,
  WordsOriginError,
  type WordsOriginOperation,
  type WordsOriginService,
  accessIdentityPath,
  decodeAccessResponse,
  decodeLiveBeatResponse,
  decodeSessionResponse,
  decodeTranscriptionTokenResponse,
  hostedSessionPath,
  liveBeatPath,
  scribeSchema,
  sectionElementIDOf,
  transcriptionTokenPath,
} from 'words-core-example'

import { init } from '@instantdb/core'

import { originFailureReason } from './originFailure.js'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Scribe's Instant app id, public, from the build environment. */
export const scribeInstantAppId = typeof appId === 'string' ? appId : ''

/** The Instant client for Scribe's app, the same app the iPhone writes. */
export const makeWordsDatabase = (): WordsDatabase =>
  init({ appId: scribeInstantAppId, schema: scribeSchema, devtool: false })

/** The system clipboard through the browser Clipboard API. */
export const browserClipboard = Layer.succeed(ClipboardWriter, {
  writeText: text =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text),
      catch: cause => new ClipboardWriteError({ cause }),
    }),
})

const ORIGIN_TIMEOUT_MS = 5_000

const requestOrigin = <A>(
  operation: WordsOriginOperation,
  path: string,
  method: 'GET' | 'POST',
  decode: (status: number, body: unknown) => Effect.Effect<A, WordsOriginError>,
): Effect.Effect<A, WordsOriginError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
      })
      const body: unknown = await response.json().catch(() => ({}))
      return { status: response.status, body }
    },
    catch: cause =>
      new WordsOriginError({ operation, reason: originFailureReason(cause) }),
  }).pipe(Effect.flatMap(({ status, body }) => decode(status, body)))

/** Whether this browser has a system share sheet for links (the Web Share API). */
export const canShareLinks = typeof navigator.share === 'function'

/** The system share sheet through the Web Share API, where the browser has one. */
export const browserLinkSharer = Layer.succeed(LinkSharer, {
  shareLink: ({ url, title }) =>
    Effect.tryPromise({
      try: () => navigator.share({ url, title }),
      catch: cause => new LinkShareError({ cause }),
    }),
})

/** Web Scribe's requests to its own origin, with the Cloudflare Access cookie. */
export const browserOrigin: WordsOriginService = {
  checkAccess: requestOrigin(
    'CheckAccess',
    accessIdentityPath,
    'GET',
    decodeAccessResponse,
  ),
  mintSession: requestOrigin(
    'MintSession',
    hostedSessionPath,
    'GET',
    decodeSessionResponse,
  ),
  mintTranscriptionToken: requestOrigin(
    'MintTranscriptionToken',
    transcriptionTokenPath,
    'POST',
    decodeTranscriptionTokenResponse,
  ),
  readLiveBeat: recordingID =>
    requestOrigin(
      'ReadLiveBeat',
      `${liveBeatPath}?recording=${encodeURIComponent(recordingID)}`,
      'GET',
      decodeLiveBeatResponse,
    ),
}

/** The origin requests as a Layer. */
export const browserOriginLayer = Layer.succeed(WordsOrigin, browserOrigin)

const deviceIconOf = (userAgent: string): string => {
  if (/iPhone|Android.+Mobile/.test(userAgent)) {
    return 'phone'
  } else if (/iPad|Android/.test(userAgent)) {
    return 'tablet'
  } else {
    return 'laptop'
  }
}

const buildInfo = Option.fromNullishOr(
  import.meta.env.VITE_WORDS_BUILD_COMMIT === undefined
    ? undefined
    : {
        branch: import.meta.env.VITE_WORDS_BUILD_BRANCH ?? 'unknown',
        builtAtISO8601: import.meta.env.VITE_WORDS_BUILD_TIME ?? '',
        commit: import.meta.env.VITE_WORDS_BUILD_COMMIT,
        worktree: import.meta.env.VITE_WORDS_BUILD_WORKTREE ?? 'unknown',
      },
)

const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
  event.preventDefault()
}

/**
 * The browser's clock, ids, device kind, and date format for new recordings,
 * and a guard that makes the browser ask before closing while recorded audio
 * is not saved yet.
 */
export const browserCaptureEnvironment = Layer.succeed(
  Capture.CaptureEnvironment,
  {
    now: Effect.sync(() => Date.now()),
    newRecordingID: Effect.sync(() => crypto.randomUUID()),
    deviceIcon: Effect.sync(() => deviceIconOf(navigator.userAgent)),
    titleDateLabel: startedAtMs =>
      Effect.sync(() =>
        new Date(startedAtMs).toLocaleDateString(undefined, {
          dateStyle: 'medium',
        }),
      ),
    maybeBuildInfo: Effect.succeed(buildInfo),
    guardPageClose: Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() =>
          window.addEventListener('beforeunload', warnBeforeUnload),
        ),
        () =>
          Effect.sync(() =>
            window.removeEventListener('beforeunload', warnBeforeUnload),
          ),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  },
)

const isReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const scrollBehavior = (): ScrollBehavior =>
  isReducedMotion() ? 'auto' : 'smooth'

const pixelsOf = (length: string): number => {
  const pixels = Number.parseFloat(length)
  return Number.isFinite(pixels) ? pixels : 0
}

/**
 * How far the window scrolls to show `element` where `placement` puts it, in
 * the part of the window the root scroll padding leaves free of the top bar
 * and the floating controls.
 */
const scrollDeltaOf = (
  element: HTMLElement,
  placement: SectionPlacement,
): number => {
  const rect = element.getBoundingClientRect()
  const rootStyle = getComputedStyle(document.documentElement)
  const visibleTop = pixelsOf(rootStyle.scrollPaddingTop)
  const visibleBottom =
    window.innerHeight - pixelsOf(rootStyle.scrollPaddingBottom)
  return placement === 'LiveEdge'
    ? rect.bottom - visibleBottom
    : rect.top + rect.height / 2 - (visibleTop + visibleBottom) / 2
}

// NOTE: these scroll the window rather than call scrollIntoView. In Chromium,
// scrollIntoView moves the sequential focus navigation starting point, so with
// nothing focused the next Tab would skip the skip links, the top bar, and the
// recording list and land in the transcript.

/**
 * Scrolls a transcript section into view after the render that shows it: to
 * the middle of the window during playback, or with its last line above the
 * controls at the live edge. Reduce Motion jumps instead of gliding.
 */
export const browserTranscriptScroller = Layer.succeed(TranscriptScroller, {
  scrollToSection: (sectionID, placement) =>
    afterPaint.pipe(
      Effect.andThen(
        Effect.sync(() => {
          const element = document.getElementById(sectionElementIDOf(sectionID))
          if (element !== null) {
            window.scrollTo({
              top: window.scrollY + scrollDeltaOf(element, placement),
              behavior: scrollBehavior(),
            })
          }
        }),
      ),
    ),
  scrollToPageTop: afterPaint.pipe(
    Effect.andThen(
      Effect.sync(() => window.scrollTo({ top: 0, behavior: 'auto' })),
    ),
  ),
})

const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const CONTROL_SELECTOR = 'button, a[href], summary, [role="button"]'

const keyTargetOf = (target: EventTarget | null): KeyTarget => {
  if (!(target instanceof Element)) {
    return 'Page'
  } else if (target.closest(TEXT_ENTRY_SELECTOR) !== null) {
    return 'TextEntry'
  } else if (target.closest(CONTROL_SELECTOR) !== null) {
    return 'Control'
  } else {
    return 'Page'
  }
}

/** Key presses anywhere on the page, from `keydown` on the document. */
export const browserKeyboardInput = Layer.succeed(KeyboardInput, {
  claimKeyPresses: <A>(claim: (press: KeyPress) => Option.Option<A>) =>
    Subscription.fromEventFilterMap<KeyboardEvent, A>({
      target: () => document,
      type: 'keydown',
      toMessage: event => {
        if (event.defaultPrevented || event.isComposing) {
          return Option.none()
        } else {
          const maybeClaimed = claim({
            key: event.key,
            code: event.code,
            target: keyTargetOf(event.target),
            isModified: event.metaKey || event.ctrlKey || event.altKey,
            isShiftHeld: event.shiftKey,
            isCommandHeld: (event.metaKey || event.ctrlKey) && !event.altKey,
            isRepeat: event.repeat,
          })
          if (Option.isSome(maybeClaimed)) {
            event.preventDefault()
          }
          return maybeClaimed
        }
      },
    }),
})

const connectivityNow = (): Connectivity =>
  navigator.onLine ? 'Online' : 'Offline'

/** The browser's network connection: now, then each `online` and `offline` event. */
export const browserNetworkStatus = Layer.succeed(NetworkStatus, {
  changes: Stream.concat(
    Stream.fromEffect(Effect.sync(connectivityNow)),
    Stream.merge(
      Subscription.fromEvent<Event, Connectivity>({
        target: () => window,
        type: 'online',
        toMessage: () => 'Online',
      }),
      Subscription.fromEvent<Event, Connectivity>({
        target: () => window,
        type: 'offline',
        toMessage: () => 'Offline',
      }),
    ),
  ),
})
