// @vitest-environment happy-dom
import {
  Array,
  Effect,
  Fiber,
  Layer,
  Option,
  Queue,
  Stream,
  pipe,
} from 'effect'
import { Program, Runtime, Subscription } from 'foldkit'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  AcquiredAudioPlayer,
  type AudioPlayerService,
  Capture,
  ChangedFindQuery,
  ClickedPlay,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
  Message,
  Model,
  ObservedFileUrls,
  ObservedRecording,
  PlaybackRoute,
  type ReadyPlayback,
  type RecordingDetail,
  RecordingRoute,
  type Section,
  SectionRoute,
  Share,
  SignedIn,
  SteppedFind,
  StoredAudio,
  UploadingAudio,
  makeStaticWordsResources,
  modelForRoute,
  update,
} from 'words-core-example'

import {
  browserCaptureEnvironment,
  browserClipboard,
  browserKeyboardInput,
  browserLinkSharer,
  browserNetworkStatus,
  browserOriginLayer,
  browserTranscriptScroller,
} from '../browser.js'
import type { WordsServices } from '../start.js'
import { view } from './view.js'

const WINDOW_HEIGHT_PX = 800
const WINDOW_WIDTH_PX = 1200
const ROOT_FONT_PX = 16
const TRANSCRIPT_TOP_PX = 300
const LINE_HEIGHT_PX = 100
const CHARACTERS_PER_LINE = 30
const FRAME_MS = 20
const SETTLE_ROUNDS = 12
const WALL_CLOCK_MS = 1_795_200_000_000

const LANDING_TOP_PX = 72
const LANDING_BOTTOM_PX = 192
const MIDDLE_PX = (LANDING_TOP_PX + WINDOW_HEIGHT_PX - LANDING_BOTTOM_PX) / 2
const MIDDLE_HALF_TOP_PX = WINDOW_HEIGHT_PX * 0.25
const MIDDLE_HALF_BOTTOM_PX = WINDOW_HEIGHT_PX * 0.75

const LEAVE_CHECK_MS = 250
const QUIET_MS = 1000

const stylesheet = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'),
  'utf8',
)

const rootRemOf = (property: string): number =>
  pipe(
    Option.fromNullishOr(
      new RegExp(`${property}:\\s*([\\d.]+)rem`).exec(stylesheet),
    ),
    Option.flatMap(Array.get(1)),
    Option.map(Number),
    Option.getOrThrow,
  )

type Move = Readonly<{ top: number; behavior: string }>

type Frame = Readonly<{ id: number; run: FrameRequestCallback }>

// NOTE: the window these tests look through. happy-dom lays nothing out, so
// the tests say where each word is: a passage's words run 30 characters to
// a line of 100 px, the passages stack below 300 px of title, and a word's
// rectangle is its line. The tests keep the scroll position, run animation
// frames by hand, and say what time it is: `Date.now()` reads
// `WALL_CLOCK_MS + nowMs`. Only the quarter second the shared rule waits
// before it looks for the spoken word is waited for in real time.
const fakeWindow: {
  nowMs: number
  frameCount: number
  frames: ReadonlyArray<Frame>
  moves: ReadonlyArray<Move>
  isMotionReduced: boolean
  pages: ReadonlyArray<Readonly<{ close: () => Promise<void> }>>
} = {
  nowMs: 0,
  frameCount: 0,
  frames: [],
  moves: [],
  isMotionReduced: false,
  pages: [],
}

const wordsOf = (passage: Element): ReadonlyArray<Element> =>
  Array.fromIterable(passage.querySelectorAll('.fk-word'))

const lengthOf = (element: Element): number => {
  const text = element.textContent ?? ''
  return text.length
}

const lineCountOf = (passage: Element): number => {
  const letters = Array.match(wordsOf(passage), {
    onEmpty: () => lengthOf(passage),
    onNonEmpty: words =>
      Array.reduce(words, 0, (total, word) => total + lengthOf(word)),
  })
  return Math.max(1, Math.ceil(letters / CHARACTERS_PER_LINE))
}

const passageTopOf = (passage: Element): number =>
  pipe(
    Array.fromIterable(document.querySelectorAll('.fk-passage')),
    Array.takeWhile(other => other !== passage),
    Array.reduce(
      TRANSCRIPT_TOP_PX,
      (top, other) => top + lineCountOf(other) * LINE_HEIGHT_PX,
    ),
  )

const lineOf = (passage: Element, word: Element): number =>
  Math.floor(
    pipe(
      wordsOf(passage),
      Array.takeWhile(other => other !== word),
      Array.reduce(0, (letters, other) => letters + lengthOf(other)),
    ) / CHARACTERS_PER_LINE,
  )

const rectOf = (element: Element): DOMRect =>
  Option.match(Option.fromNullishOr(element.closest('.fk-passage')), {
    onNone: () => new DOMRect(0, 0, 0, 0),
    onSome: passage =>
      element.classList.contains('fk-word')
        ? new DOMRect(
            0,
            passageTopOf(passage) +
              lineOf(passage, element) * LINE_HEIGHT_PX -
              window.scrollY,
            WINDOW_WIDTH_PX,
            LINE_HEIGHT_PX,
          )
        : new DOMRect(
            0,
            passageTopOf(passage) - window.scrollY,
            WINDOW_WIDTH_PX,
            lineCountOf(passage) * LINE_HEIGHT_PX,
          ),
  })

const moveWindowTo = (top: number): void => {
  const next = Math.max(0, top)
  if (next !== window.scrollY) {
    vi.stubGlobal('scrollY', next)
    document.dispatchEvent(new Event('scroll', { bubbles: true }))
  }
}

const scrollWindowTo = (options: ScrollToOptions): void => {
  const top = options.top ?? window.scrollY
  fakeWindow.moves = [
    ...fakeWindow.moves,
    { top, behavior: options.behavior ?? 'auto' },
  ]
  moveWindowTo(top)
}

const runFrame = (): void => {
  const due = fakeWindow.frames
  fakeWindow.frames = []
  due.forEach(frame => {
    frame.run(fakeWindow.nowMs)
  })
}

const pause = (milliseconds: number = 0): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })

const settle = async (rounds: number = SETTLE_ROUNDS): Promise<void> => {
  if (rounds > 0) {
    await pause()
    runFrame()
    await settle(rounds - 1)
  }
}

const pass = async (milliseconds: number): Promise<void> => {
  if (milliseconds > 0) {
    fakeWindow.nowMs += FRAME_MS
    await pause()
    runFrame()
    await pass(milliseconds - FRAME_MS)
  } else {
    await settle()
  }
}

const leaveCheck = async (): Promise<void> => {
  fakeWindow.nowMs += LEAVE_CHECK_MS
  await pause(LEAVE_CHECK_MS + 50)
  await settle()
}

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// NOTE: made-up words. Nothing here is from a real recording.
const sentences: ReadonlyArray<ReadonlyArray<string>> = [
  ['The', 'keeper', 'lit', 'the', 'lamp.'],
  ['Far', 'out', 'a', 'bell', 'answered.'],
  ['Gulls', 'settled', 'on', 'the', 'gallery.'],
  ['A', 'boat', 'rounded', 'the', 'point.'],
]

const startOf = (index: number): number => 10 + index * 10

const sectionWith = (index: number, texts: ReadonlyArray<string>): Section => ({
  id: `section-${index.toString()}`,
  index,
  startSeconds: startOf(index),
  endSeconds: startOf(index) + 0.2 + texts.length * 0.5,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `section-${index.toString()}:${at.toString()}`,
    text,
    startSeconds: startOf(index) + 0.2 + at * 0.5,
    endSeconds: startOf(index) + 0.6 + at * 0.5,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const sentenceOf = (index: number): ReadonlyArray<string> =>
  Option.getOrElse(Array.get(sentences, index % sentences.length), () => [])

const sectionOf = (index: number): Section =>
  sectionWith(index, sentenceOf(index))

const sectionsUpTo = (count: number): ReadonlyArray<Section> =>
  Array.makeBy(count, sectionOf)

const longSection = sectionWith(
  0,
  Array.flatMap(Array.makeBy(8, sentenceOf), sentence => sentence),
)

const finished = (sections: ReadonlyArray<Section>): RecordingDetail => ({
  summary: {
    id: recordingID,
    title: 'The Lantern Keeper',
    startedAtMs: 0,
    durationSeconds: 140,
    maybeUpdatedAtMs: Option.none(),
    maybeOwnerUserID: Option.none(),
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
    isLiveRoomSet: false,
    captureGaps: [],
  },
  sections,
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
})

const recording = (sections: ReadonlyArray<Section>): RecordingDetail => ({
  ...finished(sections),
  summary: { ...finished(sections).summary, activity: 'Recording' },
  audio: UploadingAudio({ byteCount: 0 }),
})

const observed = (detail: RecordingDetail): Message =>
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(detail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

const folded = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const opening = modelForRoute(RecordingRoute({ recordingID }))

const pausedAt = (
  seconds: number,
  detail: RecordingDetail = finished(sectionsUpTo(12)),
): Model =>
  folded(opening, [
    observed(detail),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    AcquiredAudioPlayer(),
    HeardAudioPosition({ seconds, wallClockMs: WALL_CLOCK_MS }),
  ])

const playingAt = (
  seconds: number,
  detail: RecordingDetail = finished(sectionsUpTo(12)),
): Model =>
  folded(pausedAt(seconds, detail), [
    ClickedPlay(),
    HeardAudioPlaying(),
    HeardAudioPosition({ seconds, wallClockMs: WALL_CLOCK_MS }),
  ])

const resources: Layer.Layer<WordsServices> = Layer.mergeAll(
  makeStaticWordsResources(
    SignedIn({
      userID: 'c0ffee00-1234-4abc-8def-0123456789ab',
      maybeEmail: Option.some('listener@example.com'),
      isGuest: false,
    }),
    { recordings: [], skipped: { count: 0, maybeFirstReason: Option.none() } },
    {},
  ),
  Capture.makeAcceptingRecordingWriter(),
  Share.makeAcceptingShareWriter(),
  browserOriginLayer,
  browserClipboard,
  browserLinkSharer,
  browserCaptureEnvironment,
  browserTranscriptScroller,
  browserKeyboardInput,
  browserNetworkStatus,
)

type Page = Readonly<{
  tell: (message: Message) => Promise<void>
  ready: () => ReadyPlayback
  close: () => Promise<void>
}>

// NOTE: the real page: the Words `update` and `view` on Foldkit's runtime,
// with the browser's own scroller and the shared reader's own edge. Only
// what the store and the player would report is told by hand, and no audio
// is opened, so a test tells the page nothing that would ask the player to
// play, pause or seek.
const openPage = async (start: Model): Promise<Page> => {
  const root = document.createElement('div')
  root.id = 'words-page'
  document.body.append(root)
  const told = Effect.runSync(Queue.unbounded<Message>())
  const held = { model: start }
  const application = Runtime.makeFoldkitApplication({
    container: root,
    program: Program.make<
      Model,
      Message,
      WordsServices,
      AudioPlayerService | Capture.CaptureSessionService
    >({
      id: 'words-page-follow',
      version: 1,
      Model,
      Message,
      init: () => [start, []],
      update,
      subscriptions: Subscription.make<Model, Message>()(() => ({
        told: Subscription.persistent(Stream.fromQueue(told)),
      })),
    }),
    resources,
    view: view({ appScheme: 'scribe-shared-dev', canShareLinks: false }),
    slow: false,
    onModel: model => {
      held.model = model
    },
  })
  const fiber = Effect.runFork(application.start())
  const page: Page = {
    tell: async message => {
      Queue.offerUnsafe(told, message)
      await settle()
    },
    ready: () => readyOf(held.model),
    close: async () => {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    },
  }
  fakeWindow.pages = [...fakeWindow.pages, page]
  await settle()
  return page
}

const elementAt = (selector: string): Element =>
  Option.getOrThrow(Option.fromNullishOr(document.querySelector(selector)))

const passageOf = (index: number): Element =>
  elementAt(`.fk-passage[data-key="section-${index.toString()}"]`)

const wordOf = (token: string): Element =>
  elementAt(`.fk-word[data-token="${token}"]`)

const middleOf = (element: Element): number => {
  const rect = element.getBoundingClientRect()
  return rect.top + rect.height / 2
}

const isInMiddleHalf = (element: Element): boolean => {
  const rect = element.getBoundingClientRect()
  return rect.top > MIDDLE_HALF_TOP_PX && rect.bottom < MIDDLE_HALF_BOTTOM_PX
}

const attributesOf = (
  selector: string,
  attribute: string,
): ReadonlyArray<string> =>
  Array.map(
    Array.fromIterable(document.querySelectorAll(selector)),
    element => element.getAttribute(attribute) ?? '',
  )

const markedSections = (): ReadonlyArray<string> =>
  attributesOf('.fk-passage[data-current]', 'data-key')

const markedWords = (): ReadonlyArray<string> =>
  attributesOf('.fk-word[data-current]', 'data-token')

const spokenWord = (): Element => elementAt('.fk-word[data-current]')

const returnPills = (): ReadonlyArray<HTMLButtonElement> =>
  Array.filter(
    Array.fromIterable(document.querySelectorAll('button')),
    button => (button.textContent ?? '').includes('Back to '),
  )

const returnPillLabels = (): ReadonlyArray<string> =>
  Array.map(returnPills(), pill =>
    (pill.textContent ?? '').includes('Back to Live')
      ? 'Back to Live'
      : 'Back to Playhead',
  )

const pressReturn = async (): Promise<void> => {
  Array.forEach(returnPills(), pill => {
    pill.click()
  })
  await settle()
}

const wheelOver = async (element: Element, top: number): Promise<void> => {
  element.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, deltaY: top - window.scrollY }),
  )
  moveWindowTo(top)
  await settle()
}

const wheelTo = (top: number): Promise<void> => wheelOver(passageOf(0), top)

const fingerTo = async (top: number): Promise<void> => {
  passageOf(0).dispatchEvent(new TouchEvent('touchmove', { bubbles: true }))
  moveWindowTo(top)
  await settle()
}

const keyTo = async (key: string, top: number): Promise<void> => {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  )
  moveWindowTo(top)
  await settle()
}

const scrollbarTo = async (top: number): Promise<void> => {
  moveWindowTo(top)
  await settle()
}

const heard = (page: Page, seconds: number): Promise<void> =>
  page.tell(HeardAudioPosition({ seconds, wallClockMs: Date.now() }))

const secondsOf = (word: Element): number =>
  Number(word.getAttribute('data-start-ms')) / 1000

beforeEach(() => {
  fakeWindow.nowMs = 0
  fakeWindow.frames = []
  fakeWindow.moves = []
  fakeWindow.isMotionReduced = false
  fakeWindow.pages = []
  vi.spyOn(Date, 'now').mockImplementation(
    () => WALL_CLOCK_MS + fakeWindow.nowMs,
  )
  vi.stubGlobal('innerHeight', WINDOW_HEIGHT_PX)
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal('scrollTo', scrollWindowTo)
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    fakeWindow.frameCount += 1
    fakeWindow.frames = [
      ...fakeWindow.frames,
      { id: fakeWindow.frameCount, run },
    ]
    return fakeWindow.frameCount
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    fakeWindow.frames = Array.filter(
      fakeWindow.frames,
      frame => frame.id !== id,
    )
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches:
      fakeWindow.isMotionReduced && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return rectOf(this)
    },
  )
  vi.spyOn(Element.prototype, 'scrollIntoView')
  document.documentElement.style.setProperty(
    'scroll-padding-top',
    `${(rootRemOf('scroll-padding-top') * ROOT_FONT_PX).toString()}px`,
  )
  document.documentElement.style.setProperty(
    'scroll-padding-bottom',
    `${(rootRemOf('scroll-padding-bottom') * ROOT_FONT_PX).toString()}px`,
  )
})

afterEach(async () => {
  await Promise.all(Array.map(fakeWindow.pages, page => page.close()))
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the Words page follows the voice as Books does (plan 14, slice 2)', () => {
  describe('the spoken word is kept in the middle, word by word', () => {
    test('a page that opens with the spoken word outside the middle half brings that word to the middle', async () => {
      await openPage(playingAt(50.3))

      expect(markedWords()).toEqual(['section-4:0'])
      expect(markedSections()).toEqual(['section-4'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('the mark moves on with the voice between the player’s reports, and a word still in the middle half moves nothing', async () => {
      await openPage(playingAt(50.3))
      await pass(500)

      expect(markedWords()).toEqual(['section-4:1'])
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('the voice entering the next section moves nothing while its word is in the middle half', async () => {
      const page = await openPage(playingAt(50.3))
      await heard(page, 60.3)

      expect(markedSections()).toEqual(['section-5'])
      expect(isInMiddleHalf(spokenWord())).toBe(true)
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('once the spoken word is out of the middle half it is brought to the middle', async () => {
      const page = await openPage(playingAt(50.3))
      await heard(page, 60.3)
      await heard(page, 70.3)
      expect(fakeWindow.moves).toHaveLength(1)

      await heard(page, 80.3)
      expect(markedSections()).toEqual(['section-7'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(2)
    })

    test('inside one long paragraph the view follows the word down its lines, without waiting for the next section', async () => {
      const page = await openPage(
        playingAt(10.3, finished([longSection, sectionOf(1), sectionOf(2)])),
      )
      expect(fakeWindow.moves).toEqual([])
      const words = Array.fromIterable(
        passageOf(0).querySelectorAll('.fk-word'),
      )
      const firstBelow = Option.getOrThrow(
        Array.findFirstIndex(words, word => !isInMiddleHalf(word)),
      )
      const lastInside = Option.getOrThrow(Array.get(words, firstBelow - 1))
      const below = Option.getOrThrow(Array.get(words, firstBelow))

      await heard(page, secondsOf(lastInside))
      expect(fakeWindow.moves).toEqual([])

      await heard(page, secondsOf(below))
      expect(markedSections()).toEqual(['section-0'])
      expect(spokenWord()).toBe(below)
      expect(middleOf(below)).toBe(MIDDLE_PX)
    })

    test('paused, the mark stays on the word at the place', async () => {
      const page = await openPage(playingAt(50.3))
      await page.tell(HeardAudioPaused())
      await pass(1000)

      expect(markedWords()).toEqual(['section-4:0'])
    })
  })

  describe('for a second after the listener scrolls, the words are left alone', () => {
    test('words spoken within a second of a scroll are not brought to the middle, and the first word after that second is', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelTo(window.scrollY + 40)
      await leaveCheck()
      expect(page.ready().reader._tag).toBe('Following')

      await pass(250)
      await heard(page, 80.3)
      expect(markedWords()).toEqual(['section-7:0'])
      expect(isInMiddleHalf(spokenWord())).toBe(false)
      expect(fakeWindow.moves).toHaveLength(1)

      await pass(450)
      expect(markedWords()).toEqual(['section-7:1'])
      expect(fakeWindow.moves).toHaveLength(1)

      await pass(500)
      expect(markedWords()).toEqual(['section-7:2'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(2)
    })
  })

  describe('the listener leaves only once the spoken word is out of the middle half', () => {
    test('a wheel that leaves the spoken word in the middle half does not stop following', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelTo(window.scrollY + 40)
      await leaveCheck()

      expect(isInMiddleHalf(spokenWord())).toBe(true)
      expect(page.ready().reader._tag).toBe('Following')
      expect(returnPillLabels()).toEqual([])
    })

    test('a wheel that takes the spoken word out of the middle half stops following a quarter of a second later, not at once', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelTo(1500)
      expect(page.ready().reader._tag).toBe('Following')

      await leaveCheck()
      expect(page.ready().reader._tag).toBe('Detached')
      expect(returnPillLabels()).toEqual(['Back to Playhead'])
    })

    test('a finger that takes the spoken word out of the middle half stops following', async () => {
      const page = await openPage(playingAt(50.3))
      await fingerTo(1500)
      await leaveCheck()

      expect(page.ready().reader._tag).toBe('Detached')
    })

    test('the scrollbar counts as the listener’s scroll', async () => {
      const page = await openPage(playingAt(50.3))
      await pass(QUIET_MS)
      await scrollbarTo(1500)
      await leaveCheck()

      expect(page.ready().reader._tag).toBe('Detached')
    })

    test('a key that scrolls the page counts as the listener’s scroll', async () => {
      const page = await openPage(playingAt(50.3))
      await pass(QUIET_MS)
      await keyTo('PageDown', 1500)
      await leaveCheck()

      expect(page.ready().reader._tag).toBe('Detached')
    })

    test('the page’s own move to the spoken word does not', async () => {
      const page = await openPage(playingAt(50.3))
      expect(fakeWindow.moves).toHaveLength(1)
      await leaveCheck()

      expect(page.ready().reader._tag).toBe('Following')
    })

    test('a wheel over the recording list that does not move the page does not', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelOver(
        elementAt('aside[aria-label="Recordings"]'),
        window.scrollY,
      )
      await leaveCheck()

      expect(page.ready().reader._tag).toBe('Following')
    })
  })

  describe('detached stays detached', () => {
    test('the voice moves on and the view stays, and the mark still moves', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelTo(1500)
      await leaveCheck()
      await heard(page, 80.3)
      await pass(QUIET_MS + 500)

      expect(markedSections()).toEqual(['section-7'])
      expect(window.scrollY).toBe(1500)
      expect(fakeWindow.moves).toHaveLength(1)
      expect(page.ready().reader._tag).toBe('Detached')
    })

    test('scrolling the spoken word back into the middle does not follow again, and Back to Playhead stays', async () => {
      const page = await openPage(playingAt(50.3))
      const followedAt = window.scrollY
      await wheelTo(1500)
      await leaveCheck()
      await scrollbarTo(followedAt)
      await leaveCheck()
      await pass(QUIET_MS)

      expect(isInMiddleHalf(spokenWord())).toBe(true)
      expect(page.ready().reader._tag).toBe('Detached')
      expect(returnPillLabels()).toEqual(['Back to Playhead'])
    })
  })

  describe('Back to Playhead and Back to Live', () => {
    test('neither shows while the words follow the voice', async () => {
      await openPage(playingAt(50.3))

      expect(returnPillLabels()).toEqual([])
    })

    test('pressing Back to Playhead follows again and brings the spoken word to the middle', async () => {
      const page = await openPage(pausedAt(50.3))
      await wheelTo(1500)
      await leaveCheck()
      expect(returnPillLabels()).toEqual(['Back to Playhead'])

      await pass(QUIET_MS)
      await pressReturn()
      expect(page.ready().reader._tag).toBe('Following')
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(returnPillLabels()).toEqual([])
    })

    test('pressed right after the scroll, while paused, Back to Playhead still brings the spoken word to the middle', async () => {
      const page = await openPage(pausedAt(50.3))
      await wheelTo(1500)
      await leaveCheck()
      await pressReturn()

      expect(page.ready().reader._tag).toBe('Following')
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(returnPillLabels()).toEqual([])
    })

    test('after Back to Playhead the very next word is followed, with no second of quiet', async () => {
      const page = await openPage(playingAt(50.3))
      await wheelTo(1500)
      await leaveCheck()
      await pressReturn()
      await heard(page, 90.3)

      expect(markedWords()).toEqual(['section-8:0'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
    })

    test('while recording it reads Back to Live, and pressing it brings the newest word to the middle', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(30))))
      await pass(QUIET_MS)
      await wheelTo(0)
      await leaveCheck()
      expect(page.ready().reader._tag).toBe('Detached')
      expect(returnPillLabels()).toEqual(['Back to Live'])

      await pass(QUIET_MS)
      await pressReturn()
      expect(page.ready().reader._tag).toBe('Following')
      expect(markedWords()).toEqual(['section-29:4'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(returnPillLabels()).toEqual([])
    })
  })

  describe('while recording, the newest word is the one followed', () => {
    test('a recording in progress opens with its newest word marked and in the middle', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))

      expect(markedWords()).toEqual(['section-8:4'])
      expect(markedSections()).toEqual(['section-8'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
    })

    test('new words are marked as they arrive, left alone in the middle half and brought to the middle once out of it', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      const movesBefore = fakeWindow.moves.length

      await page.tell(observed(recording(sectionsUpTo(10))))
      expect(markedWords()).toEqual(['section-9:4'])
      expect(isInMiddleHalf(spokenWord())).toBe(true)
      expect(fakeWindow.moves).toHaveLength(movesBefore)

      await page.tell(observed(recording(sectionsUpTo(12))))
      expect(markedWords()).toEqual(['section-11:4'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(movesBefore + 1)
    })

    test('a word added to the newest section becomes the marked one', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      const grown = sectionWith(8, [...sentenceOf(8), 'Again.'])
      await page.tell(observed(recording([...sectionsUpTo(8), grown])))

      expect(markedWords()).toEqual(['section-8:5'])
    })

    test('time passing moves nothing', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      const movesBefore = fakeWindow.moves.length
      await pass(2000)

      expect(markedWords()).toEqual(['section-8:4'])
      expect(fakeWindow.moves).toHaveLength(movesBefore)
    })

    test('once the listener has scrolled the newest word away, new words move nothing', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(30))))
      await pass(QUIET_MS)
      await wheelTo(0)
      await leaveCheck()
      const movesBefore = fakeWindow.moves.length
      await pass(QUIET_MS)
      await page.tell(observed(recording(sectionsUpTo(31))))

      expect(markedWords()).toEqual(['section-30:4'])
      expect(window.scrollY).toBe(0)
      expect(fakeWindow.moves).toHaveLength(movesBefore)
    })
  })

  describe('a section with no word times is marked and followed as one unit', () => {
    const withoutWordTimes = finished(
      Array.map(sectionsUpTo(12), (section): Section => {
        if (section.index === 6) {
          return { ...section, words: [] }
        } else if (section.index === 9) {
          return {
            ...section,
            words: [],
            maybeWordsSeal: Option.some('Voice'),
          }
        } else {
          return section
        }
      }),
    )

    test('a section of text with no word times is marked alone, with no word, and brought to the middle', async () => {
      await openPage(pausedAt(75, withoutWordTimes))

      expect(markedSections()).toEqual(['section-6'])
      expect(markedWords()).toEqual([])
      expect(middleOf(passageOf(6))).toBe(MIDDLE_PX)
    })

    test('a sealed section is marked alone and brought to the middle', async () => {
      await openPage(pausedAt(105, withoutWordTimes))

      expect(markedSections()).toEqual(['section-9'])
      expect(markedWords()).toEqual([])
      expect(middleOf(passageOf(9))).toBe(MIDDLE_PX)
    })

    test('the mark passes from the word before it to the section, and on to the next word', async () => {
      const page = await openPage(playingAt(63, withoutWordTimes))
      expect(markedWords()).toEqual(['section-5:4'])

      await heard(page, 70.1)
      expect(markedSections()).toEqual(['section-6'])
      expect(markedWords()).toEqual([])

      await heard(page, 80.3)
      expect(markedSections()).toEqual(['section-7'])
      expect(markedWords()).toEqual(['section-7:0'])
    })

    test('scrolled out of the middle, it is left as a spoken word is, and Back to Playhead brings it back', async () => {
      const page = await openPage(pausedAt(75, withoutWordTimes))
      await pass(QUIET_MS)
      await wheelTo(3000)
      await leaveCheck()
      expect(page.ready().reader._tag).toBe('Detached')

      await pressReturn()
      expect(middleOf(passageOf(6))).toBe(MIDDLE_PX)
    })

    test('while recording, a newest section with no word times is the one marked and brought to the middle', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      await page.tell(
        observed(
          recording([...sectionsUpTo(11), { ...sectionOf(11), words: [] }]),
        ),
      )

      expect(markedSections()).toEqual(['section-11'])
      expect(markedWords()).toEqual([])
      expect(middleOf(passageOf(11))).toBe(MIDDLE_PX)
    })
  })

  describe('where a recording opens', () => {
    test('a recording opened by its plain link is put at the top of its page, following the voice', async () => {
      moveWindowTo(900)
      const page = await openPage(opening)
      await page.tell(observed(finished(sectionsUpTo(12))))
      await leaveCheck()

      expect(fakeWindow.moves).toEqual([{ top: 0, behavior: 'auto' }])
      expect(window.scrollY).toBe(0)
      expect(page.ready().reader._tag).toBe('Following')
    })

    test('a recording opened at a linked section shows that section in the middle, stays there, and offers Back to Playhead', async () => {
      const page = await openPage(
        modelForRoute(
          SectionRoute({
            recordingID,
            sectionID: 'section-6',
            t: Option.none(),
          }),
        ),
      )
      await page.tell(observed(finished(sectionsUpTo(12))))
      await leaveCheck()
      await pass(QUIET_MS)

      expect(markedWords()).toEqual(['section-5:4'])
      expect(middleOf(passageOf(6))).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
      expect(page.ready().reader._tag).toBe('Detached')
      expect(returnPillLabels()).toEqual(['Back to Playhead'])
    })

    test('a recording opened at a moment brings the word spoken then to the middle, once', async () => {
      const page = await openPage(
        modelForRoute(
          PlaybackRoute({
            recordingID,
            t: Option.some('41'),
            focus: Option.none(),
          }),
        ),
      )
      await page.tell(observed(finished(sectionsUpTo(12))))

      expect(markedWords()).toEqual(['section-3:1'])
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
    })
  })

  describe('a match the search found', () => {
    test('stepping to a match brings its first word to the middle, stops following, and leaves the voice where it is', async () => {
      const page = await openPage(pausedAt(20.3))
      await page.tell(ChangedFindQuery({ query: 'boat' }))
      await page.tell(SteppedFind({ direction: 'Next' }))

      expect(middleOf(wordOf('section-3:1'))).toBe(MIDDLE_PX)
      expect(page.ready().reader._tag).toBe('Detached')
      expect(markedWords()).toEqual(['section-1:0'])
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('stepping on brings the next match to the middle', async () => {
      const page = await openPage(pausedAt(20.3))
      await page.tell(ChangedFindQuery({ query: 'boat' }))
      await page.tell(SteppedFind({ direction: 'Next' }))
      await page.tell(SteppedFind({ direction: 'Next' }))

      expect(middleOf(wordOf('section-7:1'))).toBe(MIDDLE_PX)
    })
  })

  describe('a recording that just finished stays where the listener is', () => {
    test('with its place before the first word, nothing moves, the words keep following, and no word stays marked', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      const topBefore = window.scrollY
      const movesBefore = fakeWindow.moves.length
      await page.tell(observed(finished(sectionsUpTo(9))))
      await pass(QUIET_MS)

      expect(window.scrollY).toBe(topBefore)
      expect(fakeWindow.moves).toHaveLength(movesBefore)
      expect(page.ready().reader._tag).toBe('Following')
      expect(returnPillLabels()).toEqual([])
      expect(markedWords()).toEqual([])
      expect(markedSections()).toEqual([])
    })

    test('with its place on a word, nothing moves, the words stop following, and Back to Playhead takes the listener to that word', async () => {
      const page = await openPage(
        modelForRoute(
          PlaybackRoute({
            recordingID,
            t: Option.some('12'),
            focus: Option.none(),
          }),
        ),
      )
      await page.tell(observed(recording(sectionsUpTo(9))))
      expect(markedWords()).toEqual(['section-8:4'])
      const topBefore = window.scrollY
      const movesBefore = fakeWindow.moves.length

      await page.tell(observed(finished(sectionsUpTo(9))))
      await pass(QUIET_MS)
      expect(window.scrollY).toBe(topBefore)
      expect(fakeWindow.moves).toHaveLength(movesBefore)
      expect(markedWords()).toEqual(['section-0:3'])
      expect(returnPillLabels()).toEqual(['Back to Playhead'])

      await pressReturn()
      expect(page.ready().reader._tag).toBe('Following')
      expect(middleOf(spokenWord())).toBe(MIDDLE_PX)
    })
  })

  describe('how the page moves', () => {
    test('the page’s stylesheet keeps 4.5rem free at the top and 12rem at the bottom, and a word lands halfway between them', async () => {
      expect(rootRemOf('scroll-padding-top') * ROOT_FONT_PX).toBe(
        LANDING_TOP_PX,
      )
      expect(rootRemOf('scroll-padding-bottom') * ROOT_FONT_PX).toBe(
        LANDING_BOTTOM_PX,
      )
      await openPage(playingAt(50.3))

      expect(middleOf(spokenWord())).toBe(340)
    })

    test('it glides, and jumps with no animation under Reduce Motion', async () => {
      const page = await openPage(playingAt(50.3))
      expect(Array.map(fakeWindow.moves, move => move.behavior)).toEqual([
        'smooth',
      ])

      fakeWindow.isMotionReduced = true
      await heard(page, 90.3)
      expect(Array.map(fakeWindow.moves, move => move.behavior)).toEqual([
        'smooth',
        'auto',
      ])
    })

    test('it scrolls the window itself and never asks an element to scroll into view', async () => {
      const page = await openPage(pausedAt(50.3))
      await page.tell(ChangedFindQuery({ query: 'boat' }))
      await page.tell(SteppedFind({ direction: 'Next' }))
      await pass(QUIET_MS)
      await pressReturn()

      expect(fakeWindow.moves).toHaveLength(3)
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
