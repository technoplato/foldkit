import { Array, String, pipe } from 'effect'

const markPattern = /\p{Mark}/gu

const notWordPattern = /[^\p{Letter}\p{Number}]+/u

/**
 * What a person typed, or a name, as the words that are compared: lower
 * case, each letter with a mark read as the plain letter, and anything
 * that is not a letter or a number read as a gap, so `"Café: Book One"`
 * is `cafe`, `book`, `one`.
 *
 * @example
 * ```typescript
 * typedWordsOf('The Lantern-Keeper, Book 1') // ['the', 'lantern', 'keeper', 'book', '1']
 * ```
 */
export const typedWordsOf = (text: string): ReadonlyArray<string> =>
  pipe(
    String.toLowerCase(text.normalize('NFD').replace(markPattern, '')).split(
      notWordPattern,
    ),
    Array.filter(String.isNonEmpty),
  )

const readOf = (text: string): string => Array.join(typedWordsOf(text), ' ')

/**
 * Whether a name holds what a person typed: every word typed is in it, in
 * any order, whatever the case, the marks on letters, or the punctuation.
 * A word typed in part counts, so `lant keep` holds for `The Lantern
 * Keeper`. Nothing typed holds for nothing.
 *
 * @example
 * ```typescript
 * holdsTyped('The Lantern Keeper: Book One', 'keeper lantern') // true
 * holdsTyped('The Lantern Keeper: Book One', 'lantern tide') // false
 * ```
 */
export const holdsTyped = (name: string, typed: string): boolean => {
  const read = readOf(name)
  return Array.match(typedWordsOf(typed), {
    onEmpty: () => false,
    onNonEmpty: words =>
      Array.every(words, word => String.includes(word)(read)),
  })
}

/**
 * The things a person named by what they typed, from the names each goes
 * by, such as a title and its slug: the ones a name of which is exactly
 * what was typed, when there are any, so `Dune` finds `Dune` and not
 * `Dune Messiah`; otherwise every one a name of which holds what was
 * typed. They keep their order. One is the thing meant; several ask for
 * more of the name; none means nothing goes by that.
 *
 * @example
 * ```typescript
 * namedByTyped(titles, 'lantern keeper', title => [title.name, title.slug])
 * // [{ name: 'The Lantern Keeper: Book One', slug: 'the-lantern-keeper' }]
 * ```
 */
export const namedByTyped = <Thing>(
  things: ReadonlyArray<Thing>,
  typed: string,
  namesOf: (thing: Thing) => ReadonlyArray<string>,
): ReadonlyArray<Thing> => {
  const read = readOf(typed)
  const exact = Array.filter(things, thing =>
    Array.some(namesOf(thing), name => read !== '' && readOf(name) === read),
  )
  return Array.match(exact, {
    onEmpty: () =>
      Array.filter(things, thing =>
        Array.some(namesOf(thing), name => holdsTyped(name, typed)),
      ),
    onNonEmpty: named => named,
  })
}
