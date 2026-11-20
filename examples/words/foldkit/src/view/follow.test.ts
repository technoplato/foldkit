// @vitest-environment happy-dom
import {
  Array,
  Effect,
  Fiber,
  Layer,
  Option,
  Queue,
  Stream,
  String,
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
const CHARACTERS_PER_LINE = 60
const FRAME_MS = 20
const SETTLE_ROUNDS = 12

const TOP_BAR_PX = 64
const BOTTOM_CONTROLS_PX = 168
const LANDING_TOP_PX = 72
const LANDING_BOTTOM_PX = 192
const BOTTOM_EDGE_PX = WINDOW_HEIGHT_PX - LANDING_BOTTOM_PX
const MIDDLE_PX = (LANDING_TOP_PX + BOTTOM_EDGE_PX) / 2

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

type Sighting = Readonly<{ isIntersecting: boolean; target: Element }>

type Watcher = {
  report: (sightings: ReadonlyArray<Sighting>) => void
  topInsetPx: number
  bottomInsetPx: number
  targets: ReadonlyArray<Element>
  reported: ReadonlyArray<Sighting>
}

// NOTE: the window these tests look through. happy-dom lays nothing out, so
// the tests say where each passage is (one line of 100 px for every 60
// characters, below 300 px of title), keep the scroll position, run
// animation frames by hand at a time they choose, and answer every
// IntersectionObserver that watches the window with pixel margins from the
// same rectangles, once a frame.
const fakeWindow: {
  nowMs: number
  frameCount: number
  frames: ReadonlyArray<Frame>
  moves: ReadonlyArray<Move>
  watchers: ReadonlyArray<Watcher>
  isMotionReduced: boolean
  pages: ReadonlyArray<Readonly<{ close: () => Promise<void> }>>
} = {
  nowMs: 0,
  frameCount: 0,
  frames: [],
  moves: [],
  watchers: [],
  isMotionReduced: false,
  pages: [],
}

const passageHeightOf = (passage: Element): number => {
  const text = passage.textContent ?? ''
  return (
    Math.max(1, Math.ceil(text.length / CHARACTERS_PER_LINE)) * LINE_HEIGHT_PX
  )
}

const passageTopOf = (passage: Element): number =>
  pipe(
    Array.fromIterable(document.querySelectorAll('.fk-passage')),
    Array.takeWhile(other => other !== passage),
    Array.reduce(
      TRANSCRIPT_TOP_PX,
      (top, other) => top + passageHeightOf(other),
    ),
  )

const rectOf = (element: Element): DOMRect =>
  Option.match(Option.fromNullishOr(element.closest('.fk-passage')), {
    onNone: () => new DOMRect(0, 0, 0, 0),
    onSome: passage =>
      new DOMRect(
        0,
        passageTopOf(passage) - window.scrollY,
        WINDOW_WIDTH_PX,
        passageHeightOf(passage),
      ),
  })

const moveWindowTo = (top: number): void => {
  vi.stubGlobal('scrollY', Math.max(0, top))
  document.dispatchEvent(new Event('scroll', { bubbles: true }))
}

const scrollWindowTo = (options: ScrollToOptions): void => {
  const top = options.top ?? window.scrollY
  fakeWindow.moves = [
    ...fakeWindow.moves,
    { top, behavior: options.behavior ?? 'auto' },
  ]
  moveWindowTo(top)
}

const insetOf = (maybeLength: Option.Option<string>): number =>
  Option.match(maybeLength, {
    onNone: () => 0,
    onSome: length => -Number.parseFloat(length),
  })

const isSeenBy = (watcher: Watcher, target: Element): boolean => {
  const rect = target.getBoundingClientRect()
  return (
    rect.bottom > watcher.topInsetPx &&
    rect.top < WINDOW_HEIGHT_PX - watcher.bottomInsetPx
  )
}

const lookThroughWatchers = (): void => {
  fakeWindow.watchers.forEach(watcher => {
    const sightings = Array.map(watcher.targets, target => ({
      target,
      isIntersecting: isSeenBy(watcher, target),
    }))
    const changed = Array.filter(
      sightings,
      sighting =>
        !Array.some(
          watcher.reported,
          reported =>
            reported.target === sighting.target &&
            reported.isIntersecting === sighting.isIntersecting,
        ),
    )
    watcher.reported = sightings
    if (Array.isArrayNonEmpty(changed)) {
      watcher.report(changed)
    }
  })
}

class WindowWatcher {
  readonly watcher: Watcher

  constructor(
    report: (sightings: ReadonlyArray<Sighting>) => void,
    options?: IntersectionObserverInit,
  ) {
    const rootMargin = options?.rootMargin ?? '0px'
    const lengths = rootMargin.split(' ')
    const isWindowWatched = (options?.root ?? undefined) === undefined
    this.watcher = {
      report,
      topInsetPx: insetOf(Array.head(lengths)),
      bottomInsetPx: insetOf(
        Option.orElse(Array.get(lengths, 2), () => Array.head(lengths)),
      ),
      targets: [],
      reported: [],
    }
    if (isWindowWatched && Array.every(lengths, String.endsWith('px'))) {
      fakeWindow.watchers = [...fakeWindow.watchers, this.watcher]
    }
  }

  observe(target: Element): void {
    this.watcher.targets = [...this.watcher.targets, target]
  }

  unobserve(target: Element): void {
    this.watcher.targets = Array.filter(
      this.watcher.targets,
      other => other !== target,
    )
  }

  disconnect(): void {
    fakeWindow.watchers = Array.filter(
      fakeWindow.watchers,
      watcher => watcher !== this.watcher,
    )
  }

  takeRecords(): ReadonlyArray<Sighting> {
    return []
  }
}

const runFrame = (): void => {
  const due = fakeWindow.frames
  fakeWindow.frames = []
  due.forEach(frame => {
    frame.run(fakeWindow.nowMs)
  })
  lookThroughWatchers()
}

const pause = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0)
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

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// NOTE: made-up words. Nothing here is from a real recording.
const sentences: ReadonlyArray<ReadonlyArray<string>> = [
  ['The', 'keeper', 'lit', 'the', 'lamp.'],
  ['Far', 'out', 'a', 'bell', 'answered.'],
  ['Gulls', 'settled', 'on', 'the', 'gallery.'],
  ['A', 'boat', 'rounded', 'the', 'point.'],
]

const startOf = (index: number): number => 10 + index * 10

const sectionOf = (index: number): Section => {
  const texts = Option.getOrElse(
    Array.get(sentences, index % sentences.length),
    () => [],
  )
  return {
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
  }
}

const sectionsUpTo = (count: number): ReadonlyArray<Section> =>
  Array.makeBy(count, sectionOf)

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

const startingAtOnce = (
  sections: ReadonlyArray<Section>,
): ReadonlyArray<Section> =>
  Array.map(sections, section =>
    section.index === 0 ? { ...section, startSeconds: 0 } : section,
  )

const grownBy = (section: Section, more: string): Section => ({
  ...section,
  text: `${section.text} ${more}`,
  words: [],
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

const playingAt = (seconds: number): Model =>
  folded(opening, [
    observed(finished(sectionsUpTo(12))),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    AcquiredAudioPlayer(),
    ClickedPlay(),
    HeardAudioPlaying(),
    HeardAudioPosition({ seconds }),
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
// with the browser's own scroller. Only what the store and the player
// would report is told by hand, and no audio is opened, so a test tells
// the page nothing that would ask the player to play, pause or seek.
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

const passageOf = (index: number): Element =>
  Option.getOrThrow(
    Option.fromNullishOr(
      document.querySelector(
        `.fk-passage[data-key="section-${index.toString()}"]`,
      ),
    ),
  )

const elementAt = (selector: string): Element =>
  Option.getOrThrow(Option.fromNullishOr(document.querySelector(selector)))

const topOf = (index: number): number =>
  passageOf(index).getBoundingClientRect().top

const bottomOf = (index: number): number =>
  passageOf(index).getBoundingClientRect().bottom

const middleOf = (index: number): number => (topOf(index) + bottomOf(index)) / 2

const attributesOf = (
  selector: string,
  attribute: string,
): ReadonlyArray<string> =>
  Array.map(
    Array.fromIterable(document.querySelectorAll(selector)),
    element => element.getAttribute(attribute) ?? '',
  )

const markedSections = (): ReadonlyArray<string> =>
  attributesOf('[data-section-current]', 'data-key')

const markedWords = (): ReadonlyArray<string> =>
  attributesOf('[data-word-current]', 'data-token')

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

// NOTE: the player reports the place about once a second. The voice
// enters a section between two reports: half a second after the one
// before, and half a second before the one after.
const voiceNears = (page: Page, index: number): Promise<void> =>
  page.tell(HeardAudioPosition({ seconds: startOf(index) - 0.5 }))

const voiceEnters = async (page: Page, index: number): Promise<void> => {
  await voiceNears(page, index)
  await pass(1000)
  await page.tell(HeardAudioPosition({ seconds: startOf(index) + 0.5 }))
}

beforeEach(() => {
  fakeWindow.nowMs = 0
  fakeWindow.frames = []
  fakeWindow.moves = []
  fakeWindow.watchers = []
  fakeWindow.isMotionReduced = false
  fakeWindow.pages = []
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
  vi.stubGlobal('IntersectionObserver', WindowWatcher)
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

describe('the Words page follows the voice (plan 14, slice 2)', () => {
  describe('nothing moves when a recording opens; where it opens is the Model’s to say', () => {
    test('a recording opened by its plain link is put at the top of its page, though its first section is already the spoken one', async () => {
      moveWindowTo(900)
      const page = await openPage(opening)
      await page.tell(observed(finished(startingAtOnce(sectionsUpTo(12)))))
      await pass(200)

      expect(markedSections()).toEqual(['section-0'])
      expect(fakeWindow.moves).toEqual([{ top: 0, behavior: 'auto' }])
      expect(window.scrollY).toBe(0)
    })

    test('a recording opened at a linked section shows that section in the middle, not the one the voice is in', async () => {
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
      await pass(200)

      expect(markedSections()).toEqual(['section-5'])
      expect(middleOf(6)).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
    })

    // NOTE: the Model opens a linked section detached, and the page follows
    // again at once: the section the voice is in sits right above the linked
    // one, on screen, and the first report of that starts following.
    test('a recording opened at a linked section follows the voice as soon as the page has looked, since the spoken section is on screen', async () => {
      const start = modelForRoute(
        SectionRoute({ recordingID, sectionID: 'section-6', t: Option.none() }),
      )
      expect(
        readyOf(folded(start, [observed(finished(sectionsUpTo(12)))])).follow,
      ).toBe('Detached')

      const page = await openPage(start)
      await page.tell(observed(finished(sectionsUpTo(12))))
      expect(page.ready().follow).toBe('Following')
    })

    test('a recording opened at a moment shows the section spoken then in the middle, once', async () => {
      const page = await openPage(
        modelForRoute(
          PlaybackRoute({
            recordingID,
            t: Option.some('45'),
            focus: Option.none(),
          }),
        ),
      )
      await page.tell(observed(finished(sectionsUpTo(12))))
      await pass(200)

      expect(markedSections()).toEqual(['section-3'])
      expect(middleOf(3)).toBe(MIDDLE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('a recording in progress opens with its newest words at the bottom edge', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      await pass(200)

      expect(bottomOf(8)).toBe(BOTTOM_EDGE_PX)
      expect(fakeWindow.moves).toHaveLength(1)
    })

    test('a page that opens while the voice is inside a section stays where it is until the voice enters the next one', async () => {
      await openPage(playingAt(50.3))
      await pass(1400)

      expect(markedSections()).toEqual(['section-4'])
      expect(fakeWindow.moves).toEqual([])
      expect(window.scrollY).toBe(0)
    })
  })

  describe('the view moves when the voice enters a new section, not on every word', () => {
    test('word after word in one section moves nothing', async () => {
      const page = await openPage(playingAt(20.3))
      await pass(1000)
      await page.tell(HeardAudioPosition({ seconds: 21.3 }))
      await pass(1000)
      await page.tell(HeardAudioPosition({ seconds: 22.3 }))

      expect(markedWords()).toEqual(['section-1:4'])
      expect(fakeWindow.moves).toEqual([])
    })

    test('the view moves at the moment the voice enters the next section, before the player reports the place again', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceNears(page, 2)
      await pass(400)
      expect(fakeWindow.moves).toEqual([])

      await pass(200)
      expect(markedSections()).toEqual(['section-2'])
      expect(middleOf(2)).toBe(MIDDLE_PX)
    })

    test('the player’s next report leaves the section where it was put', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)

      expect(middleOf(2)).toBe(MIDDLE_PX)
      expect(
        Array.dedupe(Array.map(fakeWindow.moves, move => move.top)),
      ).toEqual([window.scrollY])
    })

    test('a section the voice enters by a jump in the place is brought to the middle too', async () => {
      const page = await openPage(playingAt(20.3))
      await page.tell(HeardAudioPosition({ seconds: 90.3 }))

      expect(markedSections()).toEqual(['section-8'])
      expect(middleOf(8)).toBe(MIDDLE_PX)
    })
  })

  describe('every new section is centred, even one already in view', () => {
    test('a section that is wholly in view is still moved to the middle when the voice enters it', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)
      const movesBefore = fakeWindow.moves.length
      expect(topOf(3)).toBeGreaterThan(TOP_BAR_PX)
      expect(bottomOf(3)).toBeLessThan(WINDOW_HEIGHT_PX - BOTTOM_CONTROLS_PX)
      expect(middleOf(3)).not.toBe(MIDDLE_PX)

      await voiceEnters(page, 3)
      expect(middleOf(3)).toBe(MIDDLE_PX)
      expect(fakeWindow.moves.length).toBeGreaterThan(movesBefore)
    })
  })

  describe('while recording, the newest words sit at the bottom edge', () => {
    const live = folded(opening, [observed(recording(sectionsUpTo(9)))])

    test('no word and no section is marked, and time passing moves nothing', async () => {
      await openPage(live)
      await pass(2000)

      expect(markedSections()).toEqual([])
      expect(markedWords()).toEqual([])
      expect(fakeWindow.moves).toEqual([])
    })

    test('a new section arriving is brought to the bottom edge', async () => {
      const page = await openPage(live)
      await page.tell(observed(recording(sectionsUpTo(10))))

      expect(bottomOf(9)).toBe(BOTTOM_EDGE_PX)
    })

    test('the newest section growing is brought to the bottom edge again', async () => {
      const page = await openPage(live)
      await page.tell(observed(recording(sectionsUpTo(10))))
      const topBefore = window.scrollY
      const grown = grownBy(
        sectionOf(9),
        'It came in slowly, past the point and the long street, with its own small lantern swinging at the bow, and tied up below the tower.',
      )
      await page.tell(observed(recording([...sectionsUpTo(9), grown])))

      expect(bottomOf(9)).toBe(BOTTOM_EDGE_PX)
      expect(window.scrollY).toBeGreaterThan(topBefore)
    })

    test('once a wheel has stopped following, new words move nothing', async () => {
      const page = await openPage(live)
      await wheelTo(0)
      expect(page.ready().follow).toBe('Detached')
      const movesBefore = fakeWindow.moves.length
      await page.tell(observed(recording(sectionsUpTo(10))))

      expect(fakeWindow.moves).toHaveLength(movesBefore)
      expect(window.scrollY).toBe(0)
    })
  })

  describe('a recording that just finished stays where the listener is', () => {
    test('nothing moves when the recording finishes with its place before the first words', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(9))))
      const topBefore = window.scrollY
      const movesBefore = fakeWindow.moves.length
      await page.tell(observed(finished(sectionsUpTo(9))))
      await pass(200)

      expect(window.scrollY).toBe(topBefore)
      expect(fakeWindow.moves).toHaveLength(movesBefore)
    })

    // NOTE: this differs from the row. The Model asks for no move when a
    // recording finishes, but the page's own marking then marks the section
    // at the place for the first time and brings it to the middle.
    test('a recording that finishes with its place inside a section is taken from the newest words to that section', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(startingAtOnce(sectionsUpTo(9)))))
      expect(bottomOf(8)).toBe(BOTTOM_EDGE_PX)

      await page.tell(observed(finished(startingAtOnce(sectionsUpTo(9)))))
      await pass(200)
      expect(markedSections()).toEqual(['section-0'])
      expect(middleOf(0)).toBe(MIDDLE_PX)
    })
  })

  describe('only a wheel or a finger stops following', () => {
    test('a wheel stops following: the voice enters the next section and the view stays', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(1500)
      expect(page.ready().follow).toBe('Detached')

      await voiceEnters(page, 2)
      expect(markedSections()).toEqual(['section-2'])
      expect(fakeWindow.moves).toEqual([])
      expect(window.scrollY).toBe(1500)
    })

    test('a finger stops following: the voice enters the next section and the view stays', async () => {
      const page = await openPage(playingAt(20.3))
      await fingerTo(1500)
      expect(page.ready().follow).toBe('Detached')

      await voiceEnters(page, 2)
      expect(fakeWindow.moves).toEqual([])
      expect(window.scrollY).toBe(1500)
    })

    test('a key that scrolls the page does not: the next section is brought to the middle', async () => {
      const page = await openPage(playingAt(20.3))
      await keyTo('PageDown', 1500)
      expect(page.ready().follow).toBe('Following')

      await voiceEnters(page, 2)
      expect(middleOf(2)).toBe(MIDDLE_PX)
    })

    test('the scrollbar does not: the next section is brought to the middle', async () => {
      const page = await openPage(playingAt(20.3))
      await scrollbarTo(1500)
      expect(page.ready().follow).toBe('Following')

      await voiceEnters(page, 2)
      expect(middleOf(2)).toBe(MIDDLE_PX)
    })

    test('a jump the page makes itself does not: the section after it is brought to the middle too', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)
      expect(page.ready().follow).toBe('Following')

      await voiceEnters(page, 3)
      expect(middleOf(3)).toBe(MIDDLE_PX)
    })

    test('a wheel over the recording list, the top bar or the controls does not', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelOver(elementAt('aside[aria-label="Recordings"]'), 0)
      await wheelOver(elementAt('header'), 0)
      await wheelOver(elementAt('#player'), 0)

      expect(page.ready().follow).toBe('Following')
    })
  })

  describe('there is no quiet period', () => {
    test('a section the voice enters a tenth of a second after the scrollbar moved is brought to the middle', async () => {
      const page = await openPage(playingAt(20.3))
      await page.tell(HeardAudioPosition({ seconds: 29.9 }))
      await scrollbarTo(1500)
      await pass(200)

      expect(markedSections()).toEqual(['section-2'])
      expect(middleOf(2)).toBe(MIDDLE_PX)
    })

    test('a section the voice enters a tenth of a second after the page’s own jump is brought to the middle', async () => {
      const page = await openPage(playingAt(20.3))
      await page.tell(HeardAudioPosition({ seconds: 90.3 }))
      expect(middleOf(8)).toBe(MIDDLE_PX)

      await page.tell(HeardAudioPosition({ seconds: 99.9 }))
      await pass(200)
      expect(middleOf(9)).toBe(MIDDLE_PX)
    })
  })

  describe('following starts again by itself when the spoken section scrolls back into view', () => {
    test('scrolled away by a wheel and back by the scrollbar, the page follows again', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(1500)
      expect(page.ready().follow).toBe('Detached')

      await scrollbarTo(0)
      expect(page.ready().follow).toBe('Following')
      expect(fakeWindow.moves).toEqual([])

      await voiceEnters(page, 2)
      expect(middleOf(2)).toBe(MIDDLE_PX)
    })

    // NOTE: a wheel that leaves the spoken section on screen stops following
    // only until the voice moves on: the page then looks at the new section,
    // finds it on screen, and follows again without moving.
    test('after a wheel that left the spoken section on screen, following starts again when the voice enters the next section, which stays where it is', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(100)
      expect(page.ready().follow).toBe('Detached')

      await voiceEnters(page, 2)
      expect(page.ready().follow).toBe('Following')
      expect(fakeWindow.moves).toEqual([])
      expect(window.scrollY).toBe(100)

      await voiceEnters(page, 3)
      expect(middleOf(3)).toBe(MIDDLE_PX)
    })

    test('a section the voice is not in coming into view does not start it', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(1500)
      await scrollbarTo(900)

      expect(topOf(8)).toBeGreaterThan(TOP_BAR_PX)
      expect(page.ready().follow).toBe('Detached')
    })
  })

  describe('Back to Playhead shows only while detached with the playhead off screen', () => {
    test('it does not show while the page follows, with the spoken section on screen or off', async () => {
      await openPage(playingAt(20.3))
      expect(returnPillLabels()).toEqual([])

      await scrollbarTo(1500)
      expect(returnPillLabels()).toEqual([])
    })

    test('it does not show after a wheel that left the spoken section on screen', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(100)

      expect(page.ready().follow).toBe('Detached')
      expect(returnPillLabels()).toEqual([])
    })

    test('it shows after a wheel that took the spoken section off screen, and pressing it brings the section to the middle and follows again', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(1500)
      expect(returnPillLabels()).toEqual(['Back to Playhead'])

      Array.forEach(returnPills(), pill => {
        pill.click()
      })
      await settle()
      expect(middleOf(1)).toBe(MIDDLE_PX)
      expect(page.ready().follow).toBe('Following')
      expect(returnPillLabels()).toEqual([])
    })

    test('while recording it reads Back to Live, and pressing it brings the newest words to the bottom edge', async () => {
      const page = await openPage(opening)
      await page.tell(observed(recording(sectionsUpTo(30))))
      await wheelTo(0)
      expect(returnPillLabels()).toEqual(['Back to Live'])

      Array.forEach(returnPills(), pill => {
        pill.click()
      })
      await settle()
      expect(bottomOf(29)).toBe(BOTTOM_EDGE_PX)
      expect(page.ready().follow).toBe('Following')
    })
  })

  describe('on screen means clear of the top bar and the controls; a section lands clear of the root’s scroll padding', () => {
    const seventhTopPx = TRANSCRIPT_TOP_PX + 7 * LINE_HEIGHT_PX
    const withBottomAt = (px: number): number =>
      seventhTopPx + LINE_HEIGHT_PX - px
    const withTopAt = (px: number): number => seventhTopPx - px

    test('the page’s stylesheet keeps 4.5rem free at the top and 12rem at the bottom', () => {
      expect(rootRemOf('scroll-padding-top') * ROOT_FONT_PX).toBe(
        LANDING_TOP_PX,
      )
      expect(rootRemOf('scroll-padding-bottom') * ROOT_FONT_PX).toBe(
        LANDING_BOTTOM_PX,
      )
    })

    test('a section in the middle sits halfway between 72 px from the top and 192 px from the bottom', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)

      expect(middleOf(2)).toBe(340)
    })

    test('a section wholly under the top bar is off screen, and one showing below its 64 px is on screen', async () => {
      const page = await openPage(playingAt(80.3))
      await wheelTo(withBottomAt(TOP_BAR_PX - 4))
      expect(returnPillLabels()).toEqual(['Back to Playhead'])

      await scrollbarTo(withBottomAt(TOP_BAR_PX + 4))
      expect(bottomOf(7)).toBeLessThan(LANDING_TOP_PX)
      expect(page.ready().follow).toBe('Following')
      expect(returnPillLabels()).toEqual([])
    })

    test('a section wholly under the controls is off screen, and one showing above their 168 px is on screen', async () => {
      const page = await openPage(playingAt(80.3))
      const controlsTop = WINDOW_HEIGHT_PX - BOTTOM_CONTROLS_PX
      await scrollbarTo(withTopAt(MIDDLE_PX))
      await wheelTo(withTopAt(controlsTop + 4))
      expect(returnPillLabels()).toEqual(['Back to Playhead'])

      await scrollbarTo(withTopAt(controlsTop - 4))
      expect(topOf(7)).toBeGreaterThan(BOTTOM_EDGE_PX)
      expect(page.ready().follow).toBe('Following')
      expect(returnPillLabels()).toEqual([])
    })
  })

  describe('the spoken word and its section are marked', () => {
    test('one section and one word are marked, and the mark moves on with the voice', async () => {
      await openPage(playingAt(20.3))
      expect(markedSections()).toEqual(['section-1'])
      expect(markedWords()).toEqual(['section-1:0'])

      await pass(500)
      expect(markedSections()).toEqual(['section-1'])
      expect(markedWords()).toEqual(['section-1:1'])
    })

    test('before a section’s first word the section is marked and no word is', async () => {
      await openPage(playingAt(20.1))

      expect(markedSections()).toEqual(['section-1'])
      expect(markedWords()).toEqual([])
    })

    test('through the pause after a section’s last word, the section and that word stay marked', async () => {
      await openPage(playingAt(26))

      expect(markedSections()).toEqual(['section-1'])
      expect(markedWords()).toEqual(['section-1:4'])
    })

    test('before the first section nothing is marked', async () => {
      await openPage(playingAt(3))

      expect(markedSections()).toEqual([])
      expect(markedWords()).toEqual([])
    })

    test('the mark keeps moving after the listener scrolled away', async () => {
      const page = await openPage(playingAt(20.3))
      await wheelTo(1500)
      await voiceEnters(page, 2)

      expect(markedSections()).toEqual(['section-2'])
      expect(markedWords()).toEqual(['section-2:0'])
    })

    test('paused, the mark stays on the word at the place', async () => {
      const page = await openPage(playingAt(20.3))
      await page.tell(HeardAudioPaused())
      await pass(1000)

      expect(markedWords()).toEqual(['section-1:0'])
    })
  })

  describe('how the page moves', () => {
    test('it glides, and jumps with no animation under Reduce Motion', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)
      expect(
        Array.dedupe(Array.map(fakeWindow.moves, move => move.behavior)),
      ).toEqual(['smooth'])

      fakeWindow.isMotionReduced = true
      fakeWindow.moves = []
      await voiceEnters(page, 3)
      expect(
        Array.dedupe(Array.map(fakeWindow.moves, move => move.behavior)),
      ).toEqual(['auto'])
    })

    test('it scrolls the window itself and never asks an element to scroll into view', async () => {
      const page = await openPage(playingAt(20.3))
      await voiceEnters(page, 2)
      await wheelTo(1500)
      Array.forEach(returnPills(), pill => {
        pill.click()
      })
      await settle()

      expect(fakeWindow.moves).not.toEqual([])
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
