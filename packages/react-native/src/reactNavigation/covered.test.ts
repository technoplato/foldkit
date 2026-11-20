import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { isCoveredOf } from './stack.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('@foldkit/react/interaction', () => ({}))

const entry = (
  key: string,
  maybeStyle: Option.Option<Navigation.PresentationStyle> = Option.none(),
) => ({
  key,
  identity: key,
  uri: key,
  destination: { _tag: 'Page' },
  maybeStyle,
  maybeTitle: Option.none(),
  isTab: false,
})

const planOf = (
  ...entries: ReadonlyArray<ReturnType<typeof entry>>
): Navigation.CarrierPlan<unknown> => ({
  entries: [entry('/books'), ...entries],
  uri: entries.at(-1)?.key ?? '/books',
  history: 'Record',
})

describe('a page another page covers', () => {
  it('is covered once a page is pushed over it, however deep', () => {
    const plan = planOf(entry('/books/a'), entry('/books/a/listen'))
    expect(isCoveredOf(plan, '/books')).toBe(true)
    expect(isCoveredOf(plan, '/books/a#2')).toBe(true)
  })

  it('is not covered while it is the page on top', () => {
    const plan = planOf(entry('/books/a'))
    expect(isCoveredOf(plan, '/books/a')).toBe(false)
  })

  it('is not covered by what floats over it and leaves it in sight', () => {
    const plan = planOf(
      entry('/books/a'),
      entry('/books/a/contents', Option.some(Navigation.Sheet())),
      entry('/books/a/menu', Option.some(Navigation.Dialog())),
    )
    expect(isCoveredOf(plan, '/books/a')).toBe(false)
    expect(isCoveredOf(plan, '/books')).toBe(true)
  })

  it('is covered by a cover that fills the screen', () => {
    const plan = planOf(
      entry('/books/a'),
      entry('/books/a/read', Option.some(Navigation.FullScreenCover())),
    )
    expect(isCoveredOf(plan, '/books/a')).toBe(true)
  })

  it('is not covered when the plan does not hold it', () => {
    expect(isCoveredOf(planOf(), '/gone')).toBe(false)
  })
})
