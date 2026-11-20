import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Transcript } from './elements.js'
import { paintHtml } from './html.js'
import {
  leftPlayheadEventName,
  shouldFollowWord,
  transcriptMount,
} from './htmlEdge.js'

// Made-up words: nothing here is from a real recording or book.
const reader = (isFollowing: boolean, focusToken?: string) =>
  Transcript({
    label: 'Words',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    isFollowing,
    leaveAction: 'LeavePlayhead',
    ...(focusToken === undefined ? {} : { focusToken }),
    passages: [
      {
        key: 'p1',
        label: '0:00',
        words: [
          { token: 'w1', text: 'The', startMs: 400, isCurrent: true },
          { token: 'w2', text: 'keeper', startMs: 900 },
        ],
      },
    ],
  })

type Vnode = Readonly<{
  data?: Readonly<{ on?: Readonly<Record<string, unknown>> }>
}>

const until = async (isSo: () => boolean): Promise<void> => {
  const tries = Array.from({ length: 400 })
  for (const _ of tries) {
    if (isSo()) {
      return
    }
    await new Promise(resolve => {
      setTimeout(resolve, 5)
    })
  }
}

describe('reading away from the voice, in the Foldkit HTML painter', () => {
  it('says whether the words follow the voice, which word to show, and listens for the reader leaving', () => {
    const following = paintHtml(reader(true), tag => tag)
    const html = JSON.stringify(following)
    expect(html).toContain('"data-following":"true"')
    expect(html).toContain('"data-leave":"true"')
    // NOTE: the painter returns the library's own element tree, read here
    // as plain data.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const section = following as unknown as Vnode
    expect(typeof section.data?.on?.[leftPlayheadEventName]).toBe('function')
    const away = JSON.stringify(paintHtml(reader(false, 'w2'), tag => tag))
    expect(away).toContain('"data-following":"false"')
    expect(away).toContain('"data-focus-token":"w2"')
  })

  it('follows a new word only while following, and not for a moment after the reader scrolled', () => {
    const base = {
      isFollowing: true,
      hasLeave: true,
      nowMs: 10_000,
      userScrolledAtMs: 0,
    }
    expect(shouldFollowWord(base)).toBe(true)
    expect(shouldFollowWord({ ...base, isFollowing: false })).toBe(false)
    expect(shouldFollowWord({ ...base, userScrolledAtMs: 9_500 })).toBe(false)
    expect(shouldFollowWord({ ...base, userScrolledAtMs: 8_900 })).toBe(true)
    expect(
      shouldFollowWord({ ...base, hasLeave: false, userScrolledAtMs: 7_000 }),
    ).toBe(false)
  })
})

describe('the reader scrolling away, at the edge', () => {
  const page = () => {
    const transcript = document.createElement('section')
    transcript.className = 'fk-transcript'
    transcript.setAttribute('data-following', 'true')
    transcript.setAttribute('data-leave', 'true')
    const word = document.createElement('span')
    word.className = 'fk-word'
    word.setAttribute('data-token', 'w1')
    word.setAttribute('data-current', 'true')
    // NOTE: the test DOM lays nothing out, so the word is given a place
    // well below the middle of the window, as after a scroll away.
    word.getBoundingClientRect = () =>
      new DOMRect(0, window.innerHeight * 3, 40, 20)
    transcript.append(word)
    document.body.append(transcript)
    return { transcript, word }
  }

  it('tells the view the reader left once a scroll has taken the spoken word out of the middle', async () => {
    const { transcript } = page()
    const left: Array<string> = []
    transcript.addEventListener(leftPlayheadEventName, () => left.push('left'))
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    window.dispatchEvent(new Event('wheel'))
    await until(() => left.length === 1)
    expect(left).toEqual(['left'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    window.dispatchEvent(new Event('wheel'))
    await new Promise(resolve => {
      setTimeout(resolve, 320)
    })
    expect(left).toEqual(['left'])
    transcript.remove()
  })

  it('says nothing while the words do not follow the voice', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    const left: Array<string> = []
    transcript.addEventListener(leftPlayheadEventName, () => left.push('left'))
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    window.dispatchEvent(new Event('wheel'))
    await new Promise(resolve => {
      setTimeout(resolve, 320)
    })
    expect(left).toEqual([])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  // NOTE: the word sits three windows down, 20 px tall, so its middle is
  // 10 px below that, and the window scrolls until that is the middle.
  const topThatCentersTheWord = (): number =>
    window.innerHeight * 3 + 10 - window.innerHeight / 2

  const recordedScrolls = (): Array<ScrollToOptions> => {
    const scrolls: Array<ScrollToOptions> = []
    vi.spyOn(window, 'scrollTo').mockImplementation(
      (options?: ScrollToOptions | number) => {
        if (typeof options === 'object') {
          scrolls.push(options)
        }
      },
    )
    return scrolls
  }

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty('scroll-padding-top')
    document.documentElement.style.removeProperty('scroll-padding-bottom')
  })

  it('brings the spoken word back to the middle when the Program says the words follow again', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    expect(scrolls).toEqual([])
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord(), behavior: 'smooth' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('brings the word it is told to show into view', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    expect(scrolls).toEqual([])
    transcript.setAttribute('data-focus-token', 'w1')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord(), behavior: 'smooth' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('brings the spoken word back at once when the words follow again a moment after the reader scrolled', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    window.dispatchEvent(new Event('wheel'))
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord(), behavior: 'smooth' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('follows a passage with no words that is marked current, as it does a word', async () => {
    const { transcript, word } = page()
    word.remove()
    const text = document.createElement('article')
    text.className = 'fk-passage'
    text.setAttribute('data-current', 'true')
    text.getBoundingClientRect = () =>
      new DOMRect(0, window.innerHeight * 3, 400, 20)
    transcript.append(text)
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord(), behavior: 'smooth' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('scrolls the window itself and never asks the word to scroll into view, which in Chromium would move where Tab starts from', async () => {
    const { transcript, word } = page()
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    const asked: Array<string> = []
    word.scrollIntoView = () => {
      asked.push('scrollIntoView')
    }
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(asked).toEqual([])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('jumps with no animation where the reader asked for reduced motion', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    const scrolls = recordedScrolls()
    vi.spyOn(window, 'matchMedia').mockImplementation(query =>
      Object.assign(new EventTarget(), {
        media: query,
        matches: query === '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    )
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord(), behavior: 'auto' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('puts the word in the middle of what the page’s scroll padding leaves free: 60 px lower for 120 px kept at the top', async () => {
    const { transcript } = page()
    transcript.setAttribute('data-following', 'false')
    document.documentElement.style.setProperty('scroll-padding-top', '120px')
    const scrolls = recordedScrolls()
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    transcript.setAttribute('data-following', 'true')
    await until(() => scrolls.length === 1)
    expect(scrolls).toEqual([
      { top: topThatCentersTheWord() - 60, behavior: 'smooth' },
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })
})
