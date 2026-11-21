import {
  Array,
  Match as M,
  Option,
  Order,
  Schema as S,
  String as Str,
  pipe,
} from 'effect'

import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { Block } from './block.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'

// NOTE: this is the reusable framework-free `listFilter` block (Scribe #2658).
// It provides pure query normalization (case folding, accent/diacritic
// stripping, whitespace collapsing), match modes (`Contains` | `StartsWith` |
// `Fuzzy`), relevance scoring, original-text match-range extraction, exact-
// match lookup, item filtering/ranking, empty-state summaries, and a stateful
// `Machine.define` chart for filter state in the Model. Reused by Combobox
// (#17), Books chapters/bookmarks, Command palettes, and TreeView without
// touching the DOM, timers, or any UI framework.

// CONSTANTS

/** Default typing-pause settle window in milliseconds (`200`), taken from `Pace.defaultPace`. */
export const defaultSettleMs: number = defaultPace.typingSettleMs

/** Default match strategy (`'Contains'`). */
export const defaultMatchMode: MatchMode = 'Contains'

const EXACT_MATCH_SCORE = 1000
const PREFIX_MATCH_SCORE = 800
const WORD_BOUNDARY_MATCH_SCORE = 650
const SUBSTRING_MATCH_SCORE = 500
const FUZZY_BASE_SCORE = 100
const FUZZY_START_BONUS = 40
const FUZZY_WORD_BOUNDARY_BONUS = 30
const FUZZY_CONSECUTIVE_BONUS = 25
const FUZZY_GAP_PENALTY = 2
const LENGTH_CLOSENESS_WEIGHT = 100
const POSITION_PENALTY = 1
const SECONDARY_FIELD_PENALTY = 50
const MAX_FUZZY_DP_TARGET_LENGTH = 256
const MAX_FUZZY_DP_QUERY_LENGTH = 64

const COMBINING_MARKS_REGEX = /\p{M}/gu
const ONLY_COMBINING_MARKS_REGEX = /^\p{M}+$/u
const WHITESPACE_CHAR_REGEX = /\s/u
const WORD_BOUNDARY_CHAR_REGEX = /[\s\-_/.:()[\]]/u
const NEGATIVE_INFINITY_SCORE = -1_000_000_000

// SCHEMAS

/** How a query is matched against candidate item text. */
export const MatchMode = S.Literals(['Contains', 'StartsWith', 'Fuzzy'])
/** How a query is matched against candidate item text. */
export type MatchMode = typeof MatchMode.Type

/**
 * Half-open UTF-16 range `[start, end)` inside the original unnormalized text
 * corresponding to a matched character span, suitable for highlight rendering.
 *
 * @example
 * ```typescript
 * const range: MatchRange = { start: 0, end: 4 }
 * 'Café Crème'.slice(range.start, range.end) // 'Café'
 * ```
 */
export const MatchRange = S.Struct({
  start: S.Number,
  end: S.Number,
})
/** Half-open UTF-16 range `[start, end)` inside the original text. */
export type MatchRange = typeof MatchRange.Type

/**
 * Result of matching a query against one candidate text string: the mode that
 * matched, a relevance score (higher is better), merged highlight ranges in
 * original text coordinates, and whether the normalized query equaled the full
 * normalized text.
 */
export const MatchResult = S.Struct({
  mode: MatchMode,
  score: S.Number,
  ranges: S.Array(MatchRange),
  isExact: S.Boolean,
})
/** Result of matching a query against one candidate text string. */
export type MatchResult = typeof MatchResult.Type

/** Options controlling query and candidate text normalization. */
export const NormalizeOptions = S.Struct({
  isCaseSensitive: S.optionalKey(S.Boolean),
  stripDiacritics: S.optionalKey(S.Boolean),
  collapseWhitespace: S.optionalKey(S.Boolean),
  trim: S.optionalKey(S.Boolean),
})
/** Options controlling query and candidate text normalization. */
export type NormalizeOptions = typeof NormalizeOptions.Type

/** Options controlling text matching (`mode` plus normalization). */
export const FilterOptions = S.Struct({
  mode: S.optionalKey(MatchMode),
  isCaseSensitive: S.optionalKey(S.Boolean),
  stripDiacritics: S.optionalKey(S.Boolean),
  collapseWhitespace: S.optionalKey(S.Boolean),
  trim: S.optionalKey(S.Boolean),
})
/** Options controlling text matching. */
export type FilterOptions = typeof FilterOptions.Type

/** High-level summary of a filter pass over a collection. */
export const FilterSummary = S.Struct({
  totalCount: S.Number,
  matchedCount: S.Number,
  isQueryEmpty: S.Boolean,
  isEmpty: S.Boolean,
  hasExactMatch: S.Boolean,
})
/** High-level summary of a filter pass over a collection. */
export type FilterSummary = typeof FilterSummary.Type

/** One item returned by {@link rankItems}, with its original index, best match, and winning field index. */
export type RankedItem<Item> = Readonly<{
  item: Item
  index: number
  match: MatchResult
  matchedFieldIndex: number
}>

// INTERNAL NORMALIZATION & PROJECTION

type ProjectedChar = Readonly<{
  char: string
  origStart: number
  origEnd: number
  isWhitespace: boolean
  origChar: string
}>

type IndexedChar = Readonly<{
  char: string
  origStart: number
  origEnd: number
  isWordStart: boolean
}>

type ProjectedText = Readonly<{
  normalized: string
  chars: ReadonlyArray<IndexedChar>
}>

const isAsciiLower = (ch: string): boolean =>
  ch !== ch.toUpperCase() && ch === ch.toLowerCase()

const isAsciiUpper = (ch: string): boolean =>
  ch !== ch.toLowerCase() && ch === ch.toUpperCase()

const isWordStartAt = (
  chars: ReadonlyArray<ProjectedChar>,
  index: number,
  current: ProjectedChar,
): boolean => {
  if (index === 0) {
    return !current.isWhitespace
  }
  return Option.match(Array.get(chars, index - 1), {
    onNone: () => !current.isWhitespace,
    onSome: previous =>
      !current.isWhitespace &&
      (WORD_BOUNDARY_CHAR_REGEX.test(previous.origChar) ||
        (isAsciiLower(previous.origChar) && isAsciiUpper(current.origChar))),
  })
}

const trimWhitespaceEdges = (
  entries: ReadonlyArray<ProjectedChar>,
): ReadonlyArray<ProjectedChar> => {
  let start = 0
  let end = entries.length
  while (
    start < end &&
    Option.exists(Array.get(entries, start), entry => entry.isWhitespace)
  ) {
    start += 1
  }
  while (
    end > start &&
    Option.exists(Array.get(entries, end - 1), entry => entry.isWhitespace)
  ) {
    end -= 1
  }
  return entries.slice(start, end)
}

const projectText = (
  text: string,
  options: NormalizeOptions = {},
): ProjectedText => {
  const isCaseSensitive = options.isCaseSensitive === true
  const stripDiacritics = options.stripDiacritics ?? true
  const collapseWhitespace = options.collapseWhitespace ?? true
  const trim = options.trim ?? true

  const rawEntries: Array<ProjectedChar> = []
  let maybePendingSpace: Option.Option<
    Readonly<{ start: number; end: number }>
  > = Option.none()

  let offset = 0
  while (offset < text.length) {
    const codePoint = text.codePointAt(offset)
    const step = codePoint !== undefined && codePoint > 0xffff ? 2 : 1
    const rawChar = text.slice(offset, offset + step)

    if (stripDiacritics && ONLY_COMBINING_MARKS_REGEX.test(rawChar)) {
      const maybeLast = Array.last(rawEntries)
      if (Option.isSome(maybeLast)) {
        rawEntries.pop()
        rawEntries.push({
          ...maybeLast.value,
          origEnd: offset + step,
        })
      }
      offset += step
      continue
    }

    if (WHITESPACE_CHAR_REGEX.test(rawChar)) {
      if (collapseWhitespace) {
        maybePendingSpace = Option.match(maybePendingSpace, {
          onNone: () => Option.some({ start: offset, end: offset + step }),
          onSome: existing =>
            Option.some({ start: existing.start, end: offset + step }),
        })
      } else {
        rawEntries.push({
          char: rawChar,
          origStart: offset,
          origEnd: offset + step,
          isWhitespace: true,
          origChar: rawChar,
        })
      }
      offset += step
      continue
    }

    if (collapseWhitespace && Option.isSome(maybePendingSpace)) {
      const ws = maybePendingSpace.value
      if (Array.isReadonlyArrayNonEmpty(rawEntries) || !trim) {
        rawEntries.push({
          char: ' ',
          origStart: ws.start,
          origEnd: ws.end,
          isWhitespace: true,
          origChar: ' ',
        })
      }
      maybePendingSpace = Option.none()
    }

    const stripped = stripDiacritics
      ? rawChar.normalize('NFD').replace(COMBINING_MARKS_REGEX, '')
      : rawChar
    const folded = isCaseSensitive ? stripped : stripped.toLowerCase()

    for (let unitIndex = 0; unitIndex < folded.length; unitIndex += 1) {
      rawEntries.push({
        char: folded.charAt(unitIndex),
        origStart: offset,
        origEnd: offset + step,
        isWhitespace: false,
        origChar: rawChar,
      })
    }

    offset += step
  }

  if (collapseWhitespace && Option.isSome(maybePendingSpace) && !trim) {
    const ws = maybePendingSpace.value
    rawEntries.push({
      char: ' ',
      origStart: ws.start,
      origEnd: ws.end,
      isWhitespace: true,
      origChar: ' ',
    })
  }

  const trimmed =
    !collapseWhitespace && trim ? trimWhitespaceEdges(rawEntries) : rawEntries

  const chars: ReadonlyArray<IndexedChar> = Array.map(
    trimmed,
    (entry, index) => ({
      char: entry.char,
      origStart: entry.origStart,
      origEnd: entry.origEnd,
      isWordStart: isWordStartAt(trimmed, index, entry),
    }),
  )

  const normalized = Array.join(
    Array.map(chars, entry => entry.char),
    '',
  )

  return { normalized, chars }
}

/**
 * Merges adjacent or overlapping {@link MatchRange} spans into sorted,
 * minimal half-open intervals.
 *
 * @example
 * ```typescript
 * mergeRanges([{ start: 0, end: 1 }, { start: 1, end: 3 }, { start: 5, end: 6 }])
 * // [{ start: 0, end: 3 }, { start: 5, end: 6 }]
 * ```
 */
export const mergeRanges = (
  ranges: ReadonlyArray<MatchRange>,
): ReadonlyArray<MatchRange> => {
  const result: Array<MatchRange> = []
  for (const range of ranges) {
    if (range.end <= range.start) {
      continue
    }
    const maybePrev = Array.last(result)
    if (Option.isSome(maybePrev) && range.start <= maybePrev.value.end) {
      result.pop()
      result.push({
        start: maybePrev.value.start,
        end: Math.max(maybePrev.value.end, range.end),
      })
    } else {
      result.push(range)
    }
  }
  return result
}

const rangesForIndices = (
  chars: ReadonlyArray<IndexedChar>,
  indices: ReadonlyArray<number>,
): ReadonlyArray<MatchRange> =>
  mergeRanges(
    Array.getSomes(
      Array.map(indices, index =>
        Option.map(Array.get(chars, index), entry => ({
          start: entry.origStart,
          end: entry.origEnd,
        })),
      ),
    ),
  )

const spanRange = (
  chars: ReadonlyArray<IndexedChar>,
  startIndex: number,
  length: number,
): ReadonlyArray<MatchRange> => {
  if (length <= 0) {
    return []
  }
  return Option.match(
    Option.all([
      Array.get(chars, startIndex),
      Array.get(chars, startIndex + length - 1),
    ]),
    {
      onNone: () => [],
      onSome: ([first, last]) => [
        { start: first.origStart, end: last.origEnd },
      ],
    },
  )
}

// PURE NORMALIZATION

/**
 * Strips Unicode combining diacritical marks from `text` via NFD
 * normalization (`'Café Crème'` -> `'Cafe Creme'`).
 *
 * @example
 * ```typescript
 * stripAccents('Crème Brûlée') // 'Creme Brulee'
 * stripAccents('São Paulo') // 'Sao Paulo'
 * ```
 */
export const stripAccents = (text: string): string =>
  text.normalize('NFD').replace(COMBINING_MARKS_REGEX, '')

/**
 * Normalizes a filter query for consistent matching across all Clients:
 * strips diacritics (`true`), folds case (`isCaseSensitive: false`), collapses
 * internal whitespace runs (`true`), and trims leading/trailing whitespace
 * (`true`).
 *
 * @example
 * ```typescript
 * normalizeQuery('  Crème   Brûlée  ') // 'creme brulee'
 * normalizeQuery('Hello  World', { isCaseSensitive: true }) // 'Hello World'
 * ```
 */
export const normalizeQuery = (
  query: string,
  options: NormalizeOptions = {},
): string => projectText(query, options).normalized

// MATCHING HELPERS

const closenessBonus = (queryLength: number, targetLength: number): number =>
  targetLength <= 0
    ? 0
    : Math.round((queryLength / targetLength) * LENGTH_CLOSENESS_WEIGHT)

const matchStartsWith = (
  projected: ProjectedText,
  normalizedQuery: string,
): Option.Option<MatchResult> => {
  if (!Str.startsWith(normalizedQuery)(projected.normalized)) {
    return Option.none()
  }
  const isExact = projected.normalized.length === normalizedQuery.length
  const score = isExact
    ? EXACT_MATCH_SCORE
    : PREFIX_MATCH_SCORE +
      closenessBonus(normalizedQuery.length, projected.normalized.length)
  return Option.some({
    mode: 'StartsWith',
    score,
    ranges: spanRange(projected.chars, 0, normalizedQuery.length),
    isExact,
  })
}

const bestContainsOccurrence = (
  projected: ProjectedText,
  normalizedQuery: string,
): Option.Option<Readonly<{ index: number; isWordBoundary: boolean }>> => {
  const firstIndex = projected.normalized.indexOf(normalizedQuery)
  if (firstIndex < 0) {
    return Option.none()
  }
  if (firstIndex === 0) {
    return Option.some({ index: 0, isWordBoundary: true })
  }

  let bestIndex = firstIndex
  let bestIsWordBoundary = Option.exists(
    Array.get(projected.chars, firstIndex),
    entry => entry.isWordStart,
  )

  if (!bestIsWordBoundary) {
    let searchFrom = firstIndex + 1
    while (searchFrom <= projected.normalized.length - normalizedQuery.length) {
      const nextIndex = projected.normalized.indexOf(
        normalizedQuery,
        searchFrom,
      )
      if (nextIndex < 0) {
        break
      }
      if (
        Option.exists(
          Array.get(projected.chars, nextIndex),
          entry => entry.isWordStart,
        )
      ) {
        bestIndex = nextIndex
        bestIsWordBoundary = true
        break
      }
      searchFrom = nextIndex + 1
    }
  }

  return Option.some({ index: bestIndex, isWordBoundary: bestIsWordBoundary })
}

const matchContains = (
  projected: ProjectedText,
  normalizedQuery: string,
  reportedMode: MatchMode = 'Contains',
): Option.Option<MatchResult> =>
  Option.map(
    bestContainsOccurrence(projected, normalizedQuery),
    ({ index, isWordBoundary }) => {
      const isExact =
        index === 0 && projected.normalized.length === normalizedQuery.length
      const closeness = closenessBonus(
        normalizedQuery.length,
        projected.normalized.length,
      )
      const score = isExact
        ? EXACT_MATCH_SCORE
        : index === 0
          ? PREFIX_MATCH_SCORE + closeness
          : isWordBoundary
            ? WORD_BOUNDARY_MATCH_SCORE + closeness - index * POSITION_PENALTY
            : SUBSTRING_MATCH_SCORE + closeness - index * POSITION_PENALTY
      return {
        mode: reportedMode,
        score,
        ranges: spanRange(projected.chars, index, normalizedQuery.length),
        isExact,
      }
    },
  )

const greedyFuzzyIndices = (
  normalizedTarget: string,
  normalizedQuery: string,
): Option.Option<ReadonlyArray<number>> => {
  const matched: Array<number> = []
  let queryIndex = 0
  for (
    let targetIndex = 0;
    targetIndex < normalizedTarget.length &&
    queryIndex < normalizedQuery.length;
    targetIndex += 1
  ) {
    if (
      normalizedTarget.charAt(targetIndex) ===
      normalizedQuery.charAt(queryIndex)
    ) {
      matched.push(targetIndex)
      queryIndex += 1
    }
  }
  return queryIndex === normalizedQuery.length
    ? Option.some(matched)
    : Option.none()
}

const scoreFuzzyIndices = (
  chars: ReadonlyArray<IndexedChar>,
  indices: ReadonlyArray<number>,
): number => {
  let score = FUZZY_BASE_SCORE
  let maybePrev: Option.Option<number> = Option.none()
  for (const index of indices) {
    if (index === 0) {
      score += FUZZY_START_BONUS
    }
    if (Option.exists(Array.get(chars, index), entry => entry.isWordStart)) {
      score += FUZZY_WORD_BOUNDARY_BONUS
    }
    if (Option.isSome(maybePrev)) {
      const gap = index - maybePrev.value - 1
      if (gap === 0) {
        score += FUZZY_CONSECUTIVE_BONUS
      } else {
        score -= gap * FUZZY_GAP_PENALTY
      }
    }
    maybePrev = Option.some(index)
  }
  return score + closenessBonus(indices.length, chars.length)
}

const optimalFuzzyMatch = (
  projected: ProjectedText,
  normalizedQuery: string,
): Option.Option<
  Readonly<{ indices: ReadonlyArray<number>; score: number }>
> => {
  const targetLength = projected.normalized.length
  const queryLength = normalizedQuery.length

  const maybeGreedy = greedyFuzzyIndices(projected.normalized, normalizedQuery)
  if (Option.isNone(maybeGreedy)) {
    return Option.none()
  }

  if (
    targetLength > MAX_FUZZY_DP_TARGET_LENGTH ||
    queryLength > MAX_FUZZY_DP_QUERY_LENGTH
  ) {
    return Option.some({
      indices: maybeGreedy.value,
      score: scoreFuzzyIndices(projected.chars, maybeGreedy.value),
    })
  }

  const charBonus = (targetIndex: number): number =>
    (targetIndex === 0 ? FUZZY_START_BONUS : 0) +
    (Option.exists(
      Array.get(projected.chars, targetIndex),
      entry => entry.isWordStart,
    )
      ? FUZZY_WORD_BOUNDARY_BONUS
      : 0)

  const dpRows: Array<ReadonlyArray<number>> = []
  const prevRows: Array<ReadonlyArray<number>> = []

  const firstQueryChar = normalizedQuery.charAt(0)
  const firstScores: Array<number> = []
  const firstPrevs: Array<number> = []
  for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
    if (projected.normalized.charAt(targetIndex) === firstQueryChar) {
      firstScores.push(FUZZY_BASE_SCORE + charBonus(targetIndex))
    } else {
      firstScores.push(NEGATIVE_INFINITY_SCORE)
    }
    firstPrevs.push(-1)
  }
  dpRows.push(firstScores)
  prevRows.push(firstPrevs)

  for (let queryIndex = 1; queryIndex < queryLength; queryIndex += 1) {
    const queryChar = normalizedQuery.charAt(queryIndex)
    const prevRow = Option.getOrElse(
      Array.get(dpRows, queryIndex - 1),
      () => [],
    )
    const rowScores: Array<number> = []
    const rowPrevs: Array<number> = []

    let bestGapKey = NEGATIVE_INFINITY_SCORE
    let bestGapIndex = -1

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
      if (targetIndex >= 2) {
        const candidatePrevIndex = targetIndex - 2
        const candidatePrevScore = Option.getOrElse(
          Array.get(prevRow, candidatePrevIndex),
          () => NEGATIVE_INFINITY_SCORE,
        )
        if (candidatePrevScore > NEGATIVE_INFINITY_SCORE / 2) {
          const candidateGapKey =
            candidatePrevScore + candidatePrevIndex * FUZZY_GAP_PENALTY
          if (candidateGapKey > bestGapKey) {
            bestGapKey = candidateGapKey
            bestGapIndex = candidatePrevIndex
          }
        }
      }

      if (projected.normalized.charAt(targetIndex) !== queryChar) {
        rowScores.push(NEGATIVE_INFINITY_SCORE)
        rowPrevs.push(-1)
        continue
      }

      const bonus = charBonus(targetIndex)
      const consecutivePrev =
        targetIndex > 0
          ? Option.getOrElse(
              Array.get(prevRow, targetIndex - 1),
              () => NEGATIVE_INFINITY_SCORE,
            )
          : NEGATIVE_INFINITY_SCORE
      const consecutiveScore =
        consecutivePrev > NEGATIVE_INFINITY_SCORE / 2
          ? consecutivePrev + FUZZY_CONSECUTIVE_BONUS + bonus
          : NEGATIVE_INFINITY_SCORE

      const gapScore =
        bestGapIndex >= 0
          ? bestGapKey - (targetIndex - 1) * FUZZY_GAP_PENALTY + bonus
          : NEGATIVE_INFINITY_SCORE

      if (
        consecutiveScore >= gapScore &&
        consecutiveScore > NEGATIVE_INFINITY_SCORE / 2
      ) {
        rowScores.push(consecutiveScore)
        rowPrevs.push(targetIndex - 1)
      } else if (gapScore > NEGATIVE_INFINITY_SCORE / 2) {
        rowScores.push(gapScore)
        rowPrevs.push(bestGapIndex)
      } else {
        rowScores.push(NEGATIVE_INFINITY_SCORE)
        rowPrevs.push(-1)
      }
    }

    dpRows.push(rowScores)
    prevRows.push(rowPrevs)
  }

  const finalRow = Option.getOrElse(Array.last(dpRows), () => [])
  let bestEndScore = NEGATIVE_INFINITY_SCORE
  let bestEndIndex = -1
  for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
    const score = Option.getOrElse(
      Array.get(finalRow, targetIndex),
      () => NEGATIVE_INFINITY_SCORE,
    )
    if (score > bestEndScore) {
      bestEndScore = score
      bestEndIndex = targetIndex
    }
  }

  if (bestEndIndex < 0) {
    return Option.some({
      indices: maybeGreedy.value,
      score: scoreFuzzyIndices(projected.chars, maybeGreedy.value),
    })
  }

  const reversedIndices: Array<number> = []
  let cursor = bestEndIndex
  for (let queryIndex = queryLength - 1; queryIndex >= 0; queryIndex -= 1) {
    reversedIndices.push(cursor)
    const backRow = Option.getOrElse(Array.get(prevRows, queryIndex), () => [])
    cursor = Option.getOrElse(Array.get(backRow, cursor), () => -1)
  }

  const indices = Array.reverse(reversedIndices)
  return Option.some({
    indices,
    score: bestEndScore + closenessBonus(queryLength, targetLength),
  })
}

const matchFuzzy = (
  projected: ProjectedText,
  normalizedQuery: string,
): Option.Option<MatchResult> => {
  const maybeContains = matchContains(projected, normalizedQuery, 'Fuzzy')
  const maybeFuzzy: Option.Option<MatchResult> = Option.map(
    optimalFuzzyMatch(projected, normalizedQuery),
    ({ indices, score }): MatchResult => ({
      mode: 'Fuzzy',
      score,
      ranges: rangesForIndices(projected.chars, indices),
      isExact: projected.normalized === normalizedQuery,
    }),
  )

  return Option.match(maybeContains, {
    onNone: () => maybeFuzzy,
    onSome: contains =>
      Option.match(maybeFuzzy, {
        onNone: () => Option.some(contains),
        onSome: fuzzy =>
          Option.some(contains.score >= fuzzy.score ? contains : fuzzy),
      }),
  })
}

// PURE MATCHING & COLLECTION FILTERING

/**
 * Matches `query` against `text` under `options` (`Contains` by default,
 * case-insensitive and accent-folded). Returns `Some(MatchResult)` with
 * relevance score and highlight ranges in `text`'s original UTF-16 indices,
 * or `None` when `text` does not match.
 *
 * An empty normalized query matches every string with `score: 0` and empty
 * `ranges`.
 *
 * @example
 * ```typescript
 * matchText('Café Crème', 'cafe')
 * // Some({ mode: 'Contains', score: 840, ranges: [{ start: 0, end: 4 }], isExact: false })
 * matchText('Command Palette', 'cp', { mode: 'Fuzzy' })
 * // Some({ mode: 'Fuzzy', score: ..., ranges: [{ start: 0, end: 1 }, { start: 8, end: 9 }], isExact: false })
 * ```
 */
export const matchText = (
  text: string,
  query: string,
  options: FilterOptions = {},
): Option.Option<MatchResult> => {
  const mode = options.mode ?? defaultMatchMode
  const normalizedQuery = normalizeQuery(query, options)
  const projected = projectText(text, options)

  if (Str.isEmpty(normalizedQuery)) {
    return Option.some({
      mode,
      score: 0,
      ranges: [],
      isExact: Str.isEmpty(projected.normalized),
    })
  }

  return M.value(mode).pipe(
    M.withReturnType<Option.Option<MatchResult>>(),
    M.when('StartsWith', () => matchStartsWith(projected, normalizedQuery)),
    M.when('Contains', () => matchContains(projected, normalizedQuery)),
    M.when('Fuzzy', () => matchFuzzy(projected, normalizedQuery)),
    M.exhaustive,
  )
}

/**
 * Matches `query` across multiple candidate text fields of one item (such as
 * a bookmark's title and note, or an option's label and keywords). Earlier
 * fields win ties and receive higher priority than secondary fields.
 *
 * @example
 * ```typescript
 * matchTexts(['Chapter 1', 'Arrival at the coast'], 'coast')
 * // Some({ match: { ... }, matchedFieldIndex: 1 })
 * ```
 */
export const matchTexts = (
  texts: ReadonlyArray<string>,
  query: string,
  options: FilterOptions = {},
): Option.Option<
  Readonly<{ match: MatchResult; matchedFieldIndex: number }>
> => {
  const normalizedQuery = normalizeQuery(query, options)
  if (Str.isEmpty(normalizedQuery)) {
    return Option.some({
      match: {
        mode: options.mode ?? defaultMatchMode,
        score: 0,
        ranges: [],
        isExact: Array.some(texts, text =>
          Str.isEmpty(normalizeQuery(text, options)),
        ),
      },
      matchedFieldIndex: 0,
    })
  }

  let maybeBest: Option.Option<
    Readonly<{ match: MatchResult; matchedFieldIndex: number }>
  > = Option.none()

  for (let fieldIndex = 0; fieldIndex < texts.length; fieldIndex += 1) {
    const maybeText = Array.get(texts, fieldIndex)
    if (Option.isNone(maybeText)) {
      continue
    }
    const maybeMatched = matchText(maybeText.value, query, options)
    if (Option.isNone(maybeMatched)) {
      continue
    }
    const adjustedScore =
      maybeMatched.value.score - fieldIndex * SECONDARY_FIELD_PENALTY
    const candidate: Readonly<{
      match: MatchResult
      matchedFieldIndex: number
    }> = {
      match: { ...maybeMatched.value, score: adjustedScore },
      matchedFieldIndex: fieldIndex,
    }
    if (
      Option.isNone(maybeBest) ||
      candidate.match.score > maybeBest.value.match.score
    ) {
      maybeBest = Option.some(candidate)
    }
  }

  return maybeBest
}

const candidateTextsOf = <Item>(
  textOf: (item: Item, index: number) => string | ReadonlyArray<string>,
  item: Item,
  index: number,
): ReadonlyArray<string> => {
  const raw = textOf(item, index)
  return typeof raw === 'string' ? [raw] : raw
}

/** Shared input shape for {@link rankItems} and {@link filterItems}. */
export type FilterItemsInput<Item> = Readonly<{
  items: ReadonlyArray<Item>
  query: string
  textOf: (item: Item, index: number) => string | ReadonlyArray<string>
  mode?: MatchMode
  isCaseSensitive?: boolean
  stripDiacritics?: boolean
  collapseWhitespace?: boolean
  trim?: boolean
  maxResults?: number
}>

const filterOptionsOf = <Item>(
  input: FilterItemsInput<Item>,
): FilterOptions => ({
  ...(input.mode === undefined ? {} : { mode: input.mode }),
  ...(input.isCaseSensitive === undefined
    ? {}
    : { isCaseSensitive: input.isCaseSensitive }),
  ...(input.stripDiacritics === undefined
    ? {}
    : { stripDiacritics: input.stripDiacritics }),
  ...(input.collapseWhitespace === undefined
    ? {}
    : { collapseWhitespace: input.collapseWhitespace }),
  ...(input.trim === undefined ? {} : { trim: input.trim }),
})

const rankedItemOrder: Order.Order<RankedItem<unknown>> = (left, right) => {
  if (left.match.score !== right.match.score) {
    return left.match.score > right.match.score ? -1 : 1
  } else if (left.index !== right.index) {
    return left.index < right.index ? -1 : 1
  } else {
    return 0
  }
}

const collectMatches = <Item>(
  input: FilterItemsInput<Item>,
): ReadonlyArray<RankedItem<Item>> => {
  const options = filterOptionsOf(input)
  return Array.getSomes(
    Array.map(input.items, (item, index) =>
      Option.map(
        matchTexts(
          candidateTextsOf(input.textOf, item, index),
          input.query,
          options,
        ),
        ({ match, matchedFieldIndex }) => ({
          item,
          index,
          match,
          matchedFieldIndex,
        }),
      ),
    ),
  )
}

const applyMaxResults = <A>(
  items: ReadonlyArray<A>,
  maxResults: number | undefined,
): ReadonlyArray<A> =>
  maxResults !== undefined && maxResults >= 0
    ? Array.take(items, maxResults)
    : items

/**
 * Filters `input.items` against `input.query` and ranks matches by descending
 * relevance score, breaking ties by original item index. When `query`
 * normalizes to empty, returns all items in original order with `score: 0`
 * and empty highlight ranges.
 *
 * @example
 * ```typescript
 * rankItems({
 *   items: ['Pineapple', 'Apple Pie', 'Apple'],
 *   query: 'apple',
 *   textOf: item => item,
 * }).map(entry => entry.item)
 * // ['Apple', 'Apple Pie', 'Pineapple']
 * ```
 */
export const rankItems = <Item>(
  input: FilterItemsInput<Item>,
): ReadonlyArray<RankedItem<Item>> => {
  const options = filterOptionsOf(input)
  const normalizedQuery = normalizeQuery(input.query, options)
  const matched = collectMatches(input)
  const ordered = Str.isEmpty(normalizedQuery)
    ? matched
    : Array.sort(matched, rankedItemOrder)
  return applyMaxResults(ordered, input.maxResults)
}

/**
 * Filters `input.items` against `input.query`, returning matching items.
 * Preserves original item order by default (pass `sortByScore: true` to order
 * by relevance score).
 *
 * @example
 * ```typescript
 * filterItems({
 *   items: ['Apple', 'Banana', 'Apricot'],
 *   query: 'ap',
 *   textOf: item => item,
 * }) // ['Apple', 'Apricot']
 * ```
 */
export const filterItems = <Item>(
  input: FilterItemsInput<Item> & Readonly<{ sortByScore?: boolean }>,
): ReadonlyArray<Item> => {
  const entries =
    input.sortByScore === true
      ? rankItems(input)
      : applyMaxResults(collectMatches(input), input.maxResults)
  return Array.map(entries, entry => entry.item)
}

/**
 * Finds the first item whose normalized text equals the normalized `query`.
 * Returns `None` when `query` normalizes to empty (unless `allowEmpty: true`)
 * or no item matches exactly.
 *
 * @example
 * ```typescript
 * findExactMatch({
 *   items: [{ value: 'cafe', label: 'Café' }],
 *   query: '  cafe ',
 *   textOf: item => item.label,
 * }) // Some({ item: { value: 'cafe', label: 'Café' }, index: 0 })
 * ```
 */
export const findExactMatch = <Item>(
  input: Readonly<{
    items: ReadonlyArray<Item>
    query: string
    textOf: (item: Item, index: number) => string | ReadonlyArray<string>
    isCaseSensitive?: boolean
    stripDiacritics?: boolean
    collapseWhitespace?: boolean
    trim?: boolean
    allowEmpty?: boolean
  }>,
): Option.Option<Readonly<{ item: Item; index: number }>> => {
  const options: NormalizeOptions = {
    ...(input.isCaseSensitive === undefined
      ? {}
      : { isCaseSensitive: input.isCaseSensitive }),
    ...(input.stripDiacritics === undefined
      ? {}
      : { stripDiacritics: input.stripDiacritics }),
    ...(input.collapseWhitespace === undefined
      ? {}
      : { collapseWhitespace: input.collapseWhitespace }),
    ...(input.trim === undefined ? {} : { trim: input.trim }),
  }
  const normalizedQuery = normalizeQuery(input.query, options)
  if (Str.isEmpty(normalizedQuery) && input.allowEmpty !== true) {
    return Option.none()
  }

  return pipe(
    input.items,
    Array.findFirstIndex((item, index) =>
      Array.some(
        candidateTextsOf(input.textOf, item, index),
        text => normalizeQuery(text, options) === normalizedQuery,
      ),
    ),
    Option.flatMap(index =>
      Option.map(Array.get(input.items, index), item => ({ item, index })),
    ),
  )
}

/** True when a filtered or ranked result list has no matching items. */
export const isEmptyResult = (results: ReadonlyArray<unknown>): boolean =>
  Array.isReadonlyArrayEmpty(results)

/**
 * Derives a {@link FilterSummary} (`totalCount`, `matchedCount`,
 * `isQueryEmpty`, `isEmpty`, `hasExactMatch`) from the results of a filter
 * pass, useful for empty states and live-region announcements.
 */
export const summaryOf = <Item>(
  input: Readonly<{
    totalCount: number
    query: string
    matches: ReadonlyArray<RankedItem<Item>>
    options?: NormalizeOptions
  }>,
): FilterSummary => {
  const isQueryEmpty = Str.isEmpty(
    normalizeQuery(input.query, input.options ?? {}),
  )
  return {
    totalCount: input.totalCount,
    matchedCount: input.matches.length,
    isQueryEmpty,
    isEmpty: Array.isReadonlyArrayEmpty(input.matches),
    hasExactMatch:
      !isQueryEmpty && Array.some(input.matches, entry => entry.match.isExact),
  }
}

// STATEFUL BLOCK (Machine.define + Block)

/** No filter query is active; all items are visible under `mode`. */
export const Unfiltered = ts('Unfiltered', {
  mode: MatchMode,
})
/** No filter query is active. */
export type Unfiltered = typeof Unfiltered.Type

/** A non-empty filter query is actively narrowing the list under `mode`. */
export const Filtering = ts('Filtering', {
  query: S.String,
  mode: MatchMode,
})
/** A non-empty filter query is actively narrowing the list. */
export type Filtering = typeof Filtering.Type

/** Where a ListFilter block stands: `Unfiltered` or `Filtering`. JSON-serializable. */
export const State = S.Union([Unfiltered, Filtering])
/** Where a ListFilter block stands. */
export type State = typeof State.Type

/** Initial ListFilter state: unfiltered in `'Contains'` mode. */
export const initial: State = Unfiltered({ mode: defaultMatchMode })

/**
 * Creates a `ListFilter.State` from an optional starting `query` and `mode`.
 * Returns `Unfiltered` when `query` is omitted or empty (`''`).
 *
 * @example
 * ```typescript
 * initialWith({ query: 'ch', mode: 'Fuzzy' }) // Filtering({ query: 'ch', mode: 'Fuzzy' })
 * initialWith({ query: '' }) // Unfiltered({ mode: 'Contains' })
 * ```
 */
export const initialWith = (
  options: Readonly<{ query?: string; mode?: MatchMode }> = {},
): State => {
  const mode = options.mode ?? defaultMatchMode
  const query = options.query ?? ''
  return Str.isEmpty(query) ? Unfiltered({ mode }) : Filtering({ query, mode })
}

// MESSAGE

/** Updates the active filter query; empty string returns to `Unfiltered`. */
export const ChangeFilterQuery = m('ChangeFilterQuery', { query: S.String })

/** Clears the active filter query back to `Unfiltered`. */
export const ClearFilterQuery = m('ClearFilterQuery')

/** Switches the active matching strategy (`Contains` | `StartsWith` | `Fuzzy`). */
export const SetFilterMode = m('SetFilterMode', { mode: MatchMode })

/** Every Message the ListFilter block handles. */
export const Message = S.Union([
  ChangeFilterQuery,
  ClearFilterQuery,
  SetFilterMode,
])
/** Every Message the ListFilter block handles. */
export type Message = typeof Message.Type

/** True for a Message of the ListFilter block. */
export const isMessage = S.is(Message)

// READINGS

/** The current raw filter query (`''` while `Unfiltered`). */
export const queryOf = (state: State): string =>
  M.value(state).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Unfiltered: () => '',
      Filtering: ({ query }) => query,
    }),
  )

/** The normalized current filter query (`''` while `Unfiltered` or whitespace-only). */
export const normalizedQueryOf = (
  state: State,
  options: NormalizeOptions = {},
): string => normalizeQuery(queryOf(state), options)

/** The active matching strategy (`Contains` | `StartsWith` | `Fuzzy`). */
export const modeOf = (state: State): MatchMode => state.mode

/** True while `state` is `Filtering`. */
export const isFiltering = (state: State): boolean => state._tag === 'Filtering'

// CHART

/**
 * Builds the ListFilter Machine chart starting in `initialState`:
 * `Unfiltered` <-> `Filtering` on query changes, immediate clearing back to
 * `Unfiltered`, and mode switching across `Contains`, `StartsWith`, and
 * `Fuzzy`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message })({
    initial: initialState,
    states: {
      Unfiltered: {
        on: {
          ChangeFilterQuery: [
            when(
              (_state, message) => Str.isNonEmpty(message.query),
              'Filtering',
              ({ state, message }) =>
                Filtering({ query: message.query, mode: state.mode }),
            ),
            ignore(),
          ],
          ClearFilterQuery: [ignore()],
          SetFilterMode: [
            when(
              (state, message) => message.mode !== state.mode,
              'Unfiltered',
              ({ message }) => Unfiltered({ mode: message.mode }),
            ),
            ignore(),
          ],
        },
      },
      Filtering: {
        on: {
          ChangeFilterQuery: [
            when(
              (_state, message) => Str.isEmpty(message.query),
              'Unfiltered',
              ({ state }) => Unfiltered({ mode: state.mode }),
            ),
            when(
              (state, message) => message.query !== state.query,
              'Filtering',
              ({ state, message }) =>
                Filtering({ query: message.query, mode: state.mode }),
            ),
            ignore(),
          ],
          ClearFilterQuery: to('Unfiltered', ({ state }) =>
            Unfiltered({ mode: state.mode }),
          ),
          SetFilterMode: [
            when(
              (state, message) => message.mode !== state.mode,
              'Filtering',
              ({ state, message }) =>
                Filtering({ query: state.query, mode: message.mode }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default ListFilter Machine chart starting in `Unfiltered({ mode: 'Contains' })`. */
export const chart = chartOf(initial)

// SYNC, REST & BLOCK

/**
 * Builds the ListFilter sync table using `Pace.Settled({ afterMs })` on
 * `ChangeFilterQuery` and `Pace.Synced()` on discrete filter changes.
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeFilterQuery: Settled({ afterMs: settleMs }),
  ClearFilterQuery: Synced(),
  SetFilterMode: Synced(),
})

/** Default ListFilter sync table (`ChangeFilterQuery` at `Settled({ afterMs: 200 })`). */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only sync table for a list filter kept local to one device (`'OwnView'` by default). */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeFilterQuery: Device({ because }),
  ClearFilterQuery: Device({ because }),
  SetFilterMode: Device({ because }),
})

/** Default sync table when used as a standalone block. */
export const sync: Readonly<Record<Message['_tag'], Sync>> = synced

/** What a restart opens ListFilter on: `Unfiltered`, keeping the configured `mode`. */
export const atRest = (state: State): State => Unfiltered({ mode: state.mode })

/**
 * ListFilter as a reusable {@link Block}: state, Messages, chart, sync, and
 * resting state.
 */
export const block: Block<State, Message> = {
  name: 'ListFilter',
  State,
  Message,
  chart,
  sync,
  atRest,
}
