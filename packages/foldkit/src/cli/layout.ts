import { Array, String, pipe } from 'effect'

/** The width every terminal paint fits: a standard terminal's columns. */
export const terminalWidth = 80

const minimumWrapWidth = 20

/**
 * Splits text into lines no wider than `width`, breaking between words.
 * A word longer than the width stays whole on its own line.
 *
 * @example
 * ```typescript
 * wrapWords('Shows the same screen on every device', 20)
 * // ['Shows the same', 'screen on every', 'device']
 * ```
 */
export const wrapWords = (
  text: string,
  width: number,
): ReadonlyArray<string> => {
  const fit = Math.max(width, minimumWrapWidth)
  return pipe(
    text,
    String.split(' '),
    Array.filter(String.isNonEmpty),
    Array.reduce(Array.empty<string>(), (lines, word) =>
      Array.match(lines, {
        onEmpty: () => [word],
        onNonEmpty: nonEmpty => {
          const last = Array.lastNonEmpty(nonEmpty)
          return last.length + 1 + word.length <= fit
            ? Array.append(Array.initNonEmpty(nonEmpty), `${last} ${word}`)
            : Array.append(nonEmpty, word)
        },
      }),
    ),
  )
}

/**
 * Lays out one row of columns: the leading cells padded to their widths,
 * then the last cell wrapped to the rest of the terminal, its continuation
 * lines indented under itself.
 *
 * @example
 * ```typescript
 * columnRow(['  ', 'reset', 'r'], [2, 24, 5], 'Sets the count to 0')
 * // ['  reset                   r    Sets the count to 0']
 * ```
 */
export const columnRow = (
  cells: ReadonlyArray<string>,
  widths: ReadonlyArray<number>,
  text: string,
): ReadonlyArray<string> => {
  const lead = Array.join(
    Array.zipWith(cells, widths, (cell, width) => cell.padEnd(width)),
    '',
  )
  const indent = ' '.repeat(lead.length)
  return Array.match(wrapWords(text, terminalWidth - lead.length), {
    onEmpty: () => [lead.trimEnd()],
    onNonEmpty: lines => [
      `${lead}${Array.headNonEmpty(lines)}`,
      ...Array.map(Array.tailNonEmpty(lines), line => `${indent}${line}`),
    ],
  })
}

/**
 * Lines that sit under a column, indented to it and wrapped to the
 * terminal, such as an Action's example under its description.
 *
 * @example
 * ```typescript
 * underColumn(31, '$ counter reset') // ['                               $ counter reset']
 * ```
 */
export const underColumn = (
  column: number,
  text: string,
): ReadonlyArray<string> =>
  Array.map(
    wrapWords(text, terminalWidth - column),
    line => `${' '.repeat(column)}${line}`,
  )
