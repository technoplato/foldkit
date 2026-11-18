import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
  String,
  pipe,
} from 'effect'
import type { ItemImage } from 'foldkit/renderers'

import { ListColor, type SmartList, defaultListColor } from './board.js'
import type { LocalDay } from './calendar.js'

// LOOK

/**
 * The colors a list can take, by name: Reminders V3's five, `#4a99ef`
 * first, and six more from Apple Reminders. A list keeps any other color
 * the Swift app gave it.
 */
export const palette: Array.NonEmptyReadonlyArray<
  Readonly<{ name: string; color: ListColor }>
> = [
  { name: 'blue', color: defaultListColor },
  { name: 'red', color: ListColor.make('#ff3b30') },
  { name: 'orange', color: ListColor.make('#ff9500') },
  { name: 'yellow', color: ListColor.make('#ffcc00') },
  { name: 'green', color: ListColor.make('#34c759') },
  { name: 'teal', color: ListColor.make('#30b0c7') },
  { name: 'indigo', color: ListColor.make('#5856d6') },
  { name: 'purple', color: ListColor.make('#af52de') },
  { name: 'pink', color: ListColor.make('#ff2d55') },
  { name: 'brown', color: ListColor.make('#a2845e') },
  { name: 'gray', color: ListColor.make('#8e8e93') },
]

/** The name of a palette color, `green` for `#34c759`. None for any other color. */
export const colorNameOf = (color: ListColor): Option.Option<string> =>
  Option.map(
    Array.findFirst(palette, entry => entry.color === color),
    entry => entry.name,
  )

/**
 * A palette color as one word, for a press and a CLI command:
 * `RecolorList:green`. Decoding a name the palette lacks fails.
 */
export const ColorName = S.String.pipe(
  S.decodeTo(
    ListColor,
    SchemaTransformation.transformOrFail({
      decode: (name: string) =>
        Option.match(
          Array.findFirst(
            palette,
            entry => entry.name === name.trim().toLowerCase(),
          ),
          {
            onNone: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue(Option.some(name), {
                  message: `Expected a color name like ${Array.join(
                    Array.map(palette, entry => entry.name),
                    ', ',
                  )}`,
                }),
              ),
            onSome: entry => Effect.succeed(entry.color),
          },
        ),
      encode: (color: string) =>
        Effect.succeed(
          Option.getOrElse(
            Option.map(
              Array.findFirst(palette, entry => entry.color === color),
              entry => entry.name,
            ),
            () => color,
          ),
        ),
    }),
  ),
)

const tileSize = 56

const svgOf = (body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize.toString()}" height="${tileSize.toString()}" viewBox="0 0 56 56">${body}</svg>`,
  )}`

const tileOf = (color: string, glyph: string, alt: string): ItemImage => ({
  src: svgOf(`<rect width="56" height="56" rx="14" fill="${color}"/>${glyph}`),
  width: tileSize,
  height: tileSize,
  alt,
})

const stroke =
  'fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"'

const listGlyph = `<g ${stroke}><path d="M24 19h14M24 28h14M24 37h14"/></g><g fill="#fff"><circle cx="17" cy="19" r="2.4"/><circle cx="17" cy="28" r="2.4"/><circle cx="17" cy="37" r="2.4"/></g>`

const calendarGlyph = (label: string): string =>
  `<g ${stroke}><rect x="14" y="16" width="28" height="25" rx="5"/><path d="M14 23h28M21 12v7M35 12v7"/></g><text x="28" y="37.5" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-size="12" font-weight="700" fill="#fff">${label}</text>`

const clockGlyph = `<g ${stroke}><circle cx="28" cy="28" r="13"/><path d="M28 21v7l5 3"/></g>`

const trayGlyph = `<g ${stroke}><path d="M15 31l4-13h18l4 13v7a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z"/><path d="M15 31h8l2 4h6l2-4h8"/></g>`

const flagGlyph = `<g ${stroke}><path d="M19 42V15M19 16h17l-4 6 4 6H19"/></g>`

const checkGlyph = `<g ${stroke}><circle cx="28" cy="28" r="13"/><path d="M22 28.5l4 4 8-8.5"/></g>`

const hashGlyph = `<g ${stroke}><path d="M24 16l-3 24M35 16l-3 24M17 23h23M16 33h23"/></g>`

const smartListColor = (smartList: SmartList): string =>
  M.value(smartList).pipe(
    M.withReturnType<string>(),
    M.when('Today', () => '#007aff'),
    M.when('Scheduled', () => '#ff3b30'),
    M.when('All', () => '#3a3a3c'),
    M.when('Flagged', () => '#ff9500'),
    M.when('Completed', () => '#8e8e93'),
    M.exhaustive,
  )

const dayNumberOf = (day: LocalDay): string =>
  Number.parseInt(day.slice(8, 10), 10).toString()

/**
 * A smart list's tile: Today blue with today's date on a calendar,
 * Scheduled red with a clock, All dark with a tray, Flagged orange with a
 * flag, and Completed gray with a check.
 */
export const smartListTileOf = (
  smartList: SmartList,
  maybeToday: Option.Option<LocalDay>,
): ItemImage =>
  tileOf(
    smartListColor(smartList),
    M.value(smartList).pipe(
      M.withReturnType<string>(),
      M.when('Today', () =>
        calendarGlyph(
          Option.getOrElse(Option.map(maybeToday, dayNumberOf), () => ''),
        ),
      ),
      M.when('Scheduled', () => clockGlyph),
      M.when('All', () => trayGlyph),
      M.when('Flagged', () => flagGlyph),
      M.when('Completed', () => checkGlyph),
      M.exhaustive,
    ),
    `${smartList} icon`,
  )

/** A list's tile, in the list's own color. */
export const listTileOf = (title: string, color: ListColor): ItemImage =>
  tileOf(color, listGlyph, `${title} icon`)

/** A tag's tile, a `#` on slate. */
export const tagTileOf = (title: string): ItemImage =>
  tileOf('#5e6b7d', hashGlyph, `#${title} icon`)

const exclamationGlyph = `<g ${stroke}><path d="M28 15v15"/></g><circle cx="28" cy="39" r="2.6" fill="#fff"/>`

/** The tile beside a reminder's due date: a calendar on red. */
export const dueTile: ItemImage = tileOf('#ff3b30', calendarGlyph(''), 'Due')

/** The tile beside a reminder's priority: an exclamation mark on orange-red. */
export const priorityTile: ItemImage = tileOf(
  '#ff453a',
  exclamationGlyph,
  'Priority',
)

/** The tile beside a reminder's flag: a flag on orange. */
export const flagTile: ItemImage = tileOf('#ff9500', flagGlyph, 'Flag')

const initialsOf = (name: string): string =>
  pipe(
    String.split(name.trim(), /\s+/),
    Array.filter(String.isNonEmpty),
    Array.take(2),
    Array.map(word => word.slice(0, 1).toUpperCase()),
    Array.join(''),
  )

const escapedText = (text: string): string =>
  pipe(
    text,
    String.replace(/&/g, '&amp;'),
    String.replace(/</g, '&lt;'),
    String.replace(/>/g, '&gt;'),
  )

/** A person's tile: their initials, `AQ` for Ada Quill, on indigo. */
export const personTileOf = (name: string): ItemImage =>
  tileOf(
    '#5856d6',
    `<text x="28" y="35" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-size="19" font-weight="700" fill="#fff">${escapedText(initialsOf(name))}</text>`,
    `${name} picture`,
  )
