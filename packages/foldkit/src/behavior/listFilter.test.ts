import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import * as ListFilter from './listFilter.js'
import { Device, Settled, Synced } from './pace.js'

const sliceRanges = (
  text: string,
  ranges: ReadonlyArray<ListFilter.MatchRange>,
): ReadonlyArray<string> =>
  Array.map(ranges, range => text.slice(range.start, range.end))

describe('ListFilter block', () => {
  describe('normalization', () => {
    it('folds case, strips accents/diacritics, collapses whitespace, and trims by default', () => {
      expect(ListFilter.stripAccents('Crème Brûlée')).toBe('Creme Brulee')
      expect(ListFilter.stripAccents('São Paulo naïve über')).toBe(
        'Sao Paulo naive uber',
      )
      expect(ListFilter.normalizeQuery('  Crème   Brûlée\t\n ')).toBe(
        'creme brulee',
      )
      expect(ListFilter.normalizeQuery('e\u0301clair')).toBe('eclair')
      expect(ListFilter.normalizeQuery('   \t  ')).toBe('')
    })

    it('respects isCaseSensitive, stripDiacritics, collapseWhitespace, and trim options', () => {
      expect(
        ListFilter.normalizeQuery('  Café  Bar ', { isCaseSensitive: true }),
      ).toBe('Cafe Bar')
      expect(
        ListFilter.normalizeQuery('Café', { stripDiacritics: false }),
      ).toBe('café')
      expect(
        ListFilter.normalizeQuery('a   b', { collapseWhitespace: false }),
      ).toBe('a   b')
      expect(
        ListFilter.normalizeQuery('  a  ', {
          trim: false,
          collapseWhitespace: true,
        }),
      ).toBe(' a ')
    })
  })

  describe('matchText and original-coordinate MatchRange extraction', () => {
    it('matches Contains with exact > prefix > word-boundary > substring scoring and accurate ranges across accents and collapsed whitespace', () => {
      const exact = ListFilter.matchText('Apple', 'apple')
      const prefix = ListFilter.matchText('Apple Pie', 'apple')
      const wordBoundary = ListFilter.matchText('Green Apple', 'apple')
      const substring = ListFilter.matchText('Pineapple', 'apple')

      expect(Option.isSome(exact)).toBe(true)
      expect(Option.isSome(prefix)).toBe(true)
      expect(Option.isSome(wordBoundary)).toBe(true)
      expect(Option.isSome(substring)).toBe(true)

      if (
        Option.isSome(exact) &&
        Option.isSome(prefix) &&
        Option.isSome(wordBoundary) &&
        Option.isSome(substring)
      ) {
        expect(exact.value.isExact).toBe(true)
        expect(prefix.value.isExact).toBe(false)
        expect(exact.value.score).toBeGreaterThan(prefix.value.score)
        expect(prefix.value.score).toBeGreaterThan(wordBoundary.value.score)
        expect(wordBoundary.value.score).toBeGreaterThan(substring.value.score)

        expect(sliceRanges('Apple', exact.value.ranges)).toEqual(['Apple'])
        expect(sliceRanges('Apple Pie', prefix.value.ranges)).toEqual(['Apple'])
        expect(sliceRanges('Green Apple', wordBoundary.value.ranges)).toEqual([
          'Apple',
        ])
        expect(sliceRanges('Pineapple', substring.value.ranges)).toEqual([
          'apple',
        ])
      }

      // Accented precomposed + decomposed + collapsed internal whitespace
      const accented = '  Crème   Brûlée  '
      const accentedMatch = ListFilter.matchText(accented, 'creme brulee')
      expect(Option.isSome(accentedMatch)).toBe(true)
      if (Option.isSome(accentedMatch)) {
        expect(accentedMatch.value.isExact).toBe(true)
        expect(sliceRanges(accented, accentedMatch.value.ranges)).toEqual([
          'Crème   Brûlée',
        ])
      }

      const decomposed = 'e\u0301clair'
      const decomposedMatch = ListFilter.matchText(decomposed, 'ec')
      expect(Option.isSome(decomposedMatch)).toBe(true)
      if (Option.isSome(decomposedMatch)) {
        expect(sliceRanges(decomposed, decomposedMatch.value.ranges)).toEqual([
          'e\u0301c',
        ])
      }

      // Emoji / astral surrogate pair preservation
      const emojiLabel = '🍎 Apple'
      const emojiMatch = ListFilter.matchText(emojiLabel, 'apple')
      expect(Option.isSome(emojiMatch)).toBe(true)
      if (Option.isSome(emojiMatch)) {
        expect(sliceRanges(emojiLabel, emojiMatch.value.ranges)).toEqual([
          'Apple',
        ])
      }
    })

    it('matches StartsWith only at the beginning of normalized text', () => {
      expect(
        Option.isSome(
          ListFilter.matchText('Apricot', 'ap', { mode: 'StartsWith' }),
        ),
      ).toBe(true)
      expect(
        Option.isNone(
          ListFilter.matchText('Pineapple', 'apple', { mode: 'StartsWith' }),
        ),
      ).toBe(true)
      const exact = ListFilter.matchText('Café', 'cafe', { mode: 'StartsWith' })
      expect(Option.isSome(exact)).toBe(true)
      if (Option.isSome(exact)) {
        expect(exact.value.isExact).toBe(true)
        expect(sliceRanges('Café', exact.value.ranges)).toEqual(['Café'])
      }
    })

    it('matches Fuzzy across word boundaries and camelCase, preferring stronger alignments and merging consecutive ranges', () => {
      const palette = ListFilter.matchText('Command Palette', 'cp', {
        mode: 'Fuzzy',
      })
      expect(Option.isSome(palette)).toBe(true)
      if (Option.isSome(palette)) {
        expect(palette.value.ranges).toEqual([
          { start: 0, end: 1 },
          { start: 8, end: 9 },
        ])
        expect(sliceRanges('Command Palette', palette.value.ranges)).toEqual([
          'C',
          'P',
        ])
      }

      const camel = ListFilter.matchText('listFilterBlock', 'lfb', {
        mode: 'Fuzzy',
      })
      expect(Option.isSome(camel)).toBe(true)
      if (Option.isSome(camel)) {
        expect(sliceRanges('listFilterBlock', camel.value.ranges)).toEqual([
          'l',
          'F',
          'B',
        ])
      }

      // Contiguous word-boundary match beats scattered fuzzy match
      const wordMatch = ListFilter.matchText('Open Settings', 'set', {
        mode: 'Fuzzy',
      })
      const scattered = ListFilter.matchText('Show Every Tab', 'set', {
        mode: 'Fuzzy',
      })
      expect(Option.isSome(wordMatch)).toBe(true)
      expect(Option.isSome(scattered)).toBe(true)
      if (Option.isSome(wordMatch) && Option.isSome(scattered)) {
        expect(wordMatch.value.score).toBeGreaterThan(scattered.value.score)
        expect(sliceRanges('Open Settings', wordMatch.value.ranges)).toEqual([
          'Set',
        ])
      }

      // Rejects out-of-order characters
      expect(
        Option.isNone(
          ListFilter.matchText('Apple', 'elppa', { mode: 'Fuzzy' }),
        ),
      ).toBe(true)

      // Long target fallback (> 256 chars) still matches cleanly
      const longText = `${'x'.repeat(300)}alpha${'y'.repeat(100)}beta`
      const longMatch = ListFilter.matchText(longText, 'ab', { mode: 'Fuzzy' })
      expect(Option.isSome(longMatch)).toBe(true)
      if (Option.isSome(longMatch)) {
        expect(sliceRanges(longText, longMatch.value.ranges)).toEqual([
          'a',
          'b',
        ])
      }
    })

    it('treats empty or whitespace-only queries as matching everything with score 0 and empty ranges', () => {
      const matched = ListFilter.matchText('Chapter 1', '   ')
      expect(matched).toEqual(
        Option.some({
          mode: 'Contains',
          score: 0,
          ranges: [],
          isExact: false,
        }),
      )
      expect(ListFilter.matchText('', '')).toEqual(
        Option.some({
          mode: 'Contains',
          score: 0,
          ranges: [],
          isExact: true,
        }),
      )
    })
  })

  describe('matchTexts, filterItems, rankItems, findExactMatch, and summaryOf', () => {
    const bookmarks = [
      { id: '1', title: 'Chapter 1: Departure', note: 'Leaving the harbor' },
      { id: '2', title: 'Chapter 2: Harbor Fog', note: 'Salt air at dawn' },
      { id: '3', title: 'Chapter 3: Open Sea', note: 'Calm waters' },
    ]

    it('matches across multiple fields and ranks primary field matches ahead of secondary field matches', () => {
      const ranked = ListFilter.rankItems({
        items: bookmarks,
        query: 'harbor',
        textOf: item => [item.title, item.note],
      })
      expect(Array.map(ranked, entry => entry.item.id)).toEqual(['2', '1'])
      expect(Array.map(ranked, entry => entry.matchedFieldIndex)).toEqual([
        0, 1,
      ])
    })

    it('preserves declaration order in filterItems by default and supports sortByScore and maxResults', () => {
      const fruits = ['Pineapple', 'Apple Pie', 'Banana', 'Apple']

      expect(
        ListFilter.filterItems({
          items: fruits,
          query: 'apple',
          textOf: item => item,
        }),
      ).toEqual(['Pineapple', 'Apple Pie', 'Apple'])

      expect(
        ListFilter.filterItems({
          items: fruits,
          query: 'apple',
          textOf: item => item,
          sortByScore: true,
        }),
      ).toEqual(['Apple', 'Apple Pie', 'Pineapple'])

      expect(
        ListFilter.filterItems({
          items: fruits,
          query: 'apple',
          textOf: item => item,
          sortByScore: true,
          maxResults: 2,
        }),
      ).toEqual(['Apple', 'Apple Pie'])
    })

    it('finds exact normalized matches and produces accurate FilterSummary empty-state readings', () => {
      const items = [
        { value: 'creme', label: 'Crème Brûlée' },
        { value: 'eclair', label: 'Éclair' },
      ]

      const found = ListFilter.findExactMatch({
        items,
        query: '  creme   brulee ',
        textOf: item => item.label,
      })
      expect(found).toEqual(
        Option.some({
          item: { value: 'creme', label: 'Crème Brûlée' },
          index: 0,
        }),
      )
      expect(
        ListFilter.findExactMatch({
          items,
          query: '   ',
          textOf: item => item.label,
        }),
      ).toEqual(Option.none())

      const emptyMatches = ListFilter.rankItems({
        items,
        query: 'tiramisu',
        textOf: item => item.label,
      })
      expect(ListFilter.isEmptyResult(emptyMatches)).toBe(true)
      expect(
        ListFilter.summaryOf({
          totalCount: items.length,
          query: 'tiramisu',
          matches: emptyMatches,
        }),
      ).toEqual({
        totalCount: 2,
        matchedCount: 0,
        isQueryEmpty: false,
        isEmpty: true,
        hasExactMatch: false,
      })

      const exactMatches = ListFilter.rankItems({
        items,
        query: 'eclair',
        textOf: item => item.label,
      })
      expect(
        ListFilter.summaryOf({
          totalCount: items.length,
          query: 'eclair',
          matches: exactMatches,
        }),
      ).toEqual({
        totalCount: 2,
        matchedCount: 1,
        isQueryEmpty: false,
        isEmpty: false,
        hasExactMatch: true,
      })
    })
  })

  describe('stateful ListFilter Block chart, sync, atRest, and Schema round-trip', () => {
    it('passes Block.problemsOf with zero unreachable states or dead transitions', () => {
      expect(Block.problemsOf(ListFilter.block)).toEqual([])
      expect(
        Block.problemsOf({
          name: 'ListFilterFuzzy',
          chart: ListFilter.chartOf(
            ListFilter.initialWith({ query: 'abc', mode: 'Fuzzy' }),
          ),
        }),
      ).toEqual([])
    })

    it('transitions cleanly between Unfiltered and Filtering, switches modes, and rests on Unfiltered', () => {
      expect(ListFilter.isFiltering(ListFilter.initial)).toBe(false)
      expect(ListFilter.queryOf(ListFilter.initial)).toBe('')
      expect(ListFilter.modeOf(ListFilter.initial)).toBe('Contains')

      // Empty query while Unfiltered is explicitly ignored
      expect(
        ListFilter.chart.step(
          ListFilter.initial,
          ListFilter.ChangeFilterQuery({ query: '' }),
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Non-empty query enters Filtering
      const [filtering] = ListFilter.chart.transition(
        ListFilter.initial,
        ListFilter.ChangeFilterQuery({ query: '  Café ' }),
      )
      expect(ListFilter.isFiltering(filtering)).toBe(true)
      expect(ListFilter.queryOf(filtering)).toBe('  Café ')
      expect(ListFilter.normalizedQueryOf(filtering)).toBe('cafe')

      // Switching mode preserves active query
      const [fuzzy] = ListFilter.chart.transition(
        filtering,
        ListFilter.SetFilterMode({ mode: 'Fuzzy' }),
      )
      expect(ListFilter.modeOf(fuzzy)).toBe('Fuzzy')
      expect(ListFilter.queryOf(fuzzy)).toBe('  Café ')

      // atRest clears query while retaining mode
      const rested = ListFilter.atRest(fuzzy)
      expect(ListFilter.isFiltering(rested)).toBe(false)
      expect(ListFilter.modeOf(rested)).toBe('Fuzzy')

      // ClearFilterQuery returns to Unfiltered
      const [cleared] = ListFilter.chart.transition(
        fuzzy,
        ListFilter.ClearFilterQuery(),
      )
      expect(cleared).toEqual(ListFilter.Unfiltered({ mode: 'Fuzzy' }))

      // JSON Schema round-trip
      const encoded = S.encodeSync(ListFilter.State)(fuzzy)
      expect(S.decodeSync(ListFilter.State)(encoded)).toEqual(fuzzy)

      // Sync pace: Pace.Settled(200) on typing, Synced on discrete changes, deviceSync available
      expect(ListFilter.synced.ChangeFilterQuery).toEqual(
        Settled({ afterMs: 200 }),
      )
      expect(ListFilter.synced.ClearFilterQuery).toEqual(Synced())
      expect(ListFilter.synced.SetFilterMode).toEqual(Synced())
      expect(ListFilter.deviceSync('OwnView').ChangeFilterQuery).toEqual(
        Device({ because: 'OwnView' }),
      )
      expect(ListFilter.isMessage(ListFilter.ClearFilterQuery())).toBe(true)
    })
  })
})
