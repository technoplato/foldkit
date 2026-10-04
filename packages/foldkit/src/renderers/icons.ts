import { Schema as S } from 'effect'

// ICON

/**
 * The icons a Button can show, beside its label or instead of it. Every
 * painter draws them: an SVG on the web, a glyph in a terminal.
 */
export const IconName = S.Literals([
  'Play',
  'Pause',
  'Back30',
  'Forward30',
  'PreviousChapter',
  'NextChapter',
  'Chapters',
  'Speed',
  'Bookmark',
  'Share',
  'Expand',
  'Collapse',
  'Close',
  'Back',
  'Library',
  'Profile',
  'Settings',
  'More',
])
/** One icon a Button can show. */
export type IconName = typeof IconName.Type

/**
 * How one icon draws on a 24 by 24 grid: lines stroked in the text color,
 * shapes filled with it, and a small figure in its middle, such as the
 * `30` of a skip.
 */
export type IconDrawing = Readonly<{
  strokes: ReadonlyArray<string>
  fills: ReadonlyArray<string>
  figure?: string
}>

const stroked = (...strokes: ReadonlyArray<string>): IconDrawing => ({
  strokes,
  fills: [],
})

const filled = (...fills: ReadonlyArray<string>): IconDrawing => ({
  strokes: [],
  fills,
})

/**
 * Every icon's drawing, the same in React, Svelte, and Foldkit HTML.
 *
 * @example
 * ```typescript
 * iconDrawings.Play // { strokes: [], fills: ['M8 5v14l11-7z'] }
 * ```
 */
export const iconDrawings: Readonly<Record<IconName, IconDrawing>> = {
  Play: filled('M8 5v14l11-7z'),
  Pause: filled('M7 5h3.5v14H7z', 'M13.5 5H17v14h-3.5z'),
  Back30: {
    strokes: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M6.7 3.4v3.3H10'],
    fills: [],
    figure: '30',
  },
  Forward30: {
    strokes: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M17.3 3.4v3.3H14'],
    fills: [],
    figure: '30',
  },
  PreviousChapter: {
    strokes: ['M6 5v14'],
    fills: ['M18 5v14L8.5 12z'],
  },
  NextChapter: {
    strokes: ['M18 5v14'],
    fills: ['M6 5v14l9.5-7z'],
  },
  Chapters: stroked(
    'M9 6h11',
    'M9 12h11',
    'M9 18h11',
    'M4.5 6h.01',
    'M4.5 12h.01',
    'M4.5 18h.01',
  ),
  Speed: stroked('M12 14l3.5-4.5', 'M4.2 18.5a9 9 0 1 1 15.6 0'),
  Bookmark: stroked('M18 21l-6-4.5L6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z'),
  Share: stroked(
    'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
    'M16 7l-4-4-4 4',
    'M12 3v12',
  ),
  Expand: stroked('M6 15l6-6 6 6'),
  Collapse: stroked('M6 9l6 6 6-6'),
  Close: stroked('M18 6L6 18', 'M6 6l12 12'),
  Back: stroked('M15 18l-6-6 6-6'),
  Library: stroked('M5 4v16', 'M10 4v16', 'M14.5 5.5l4.5 14'),
  Profile: stroked(
    'M19 20v-1.5a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20',
    'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ),
  Settings: stroked(
    'M4 21v-7',
    'M4 10V3',
    'M12 21v-9',
    'M12 8V3',
    'M20 21v-5',
    'M20 12V3',
    'M1.5 14h5',
    'M9.5 8h5',
    'M17.5 16h5',
  ),
  More: stroked('M5 12h.01', 'M12 12h.01', 'M19 12h.01'),
}

/**
 * Every icon as a terminal draws it, one or two characters.
 *
 * @example
 * ```typescript
 * iconGlyphs.Play // '▶'
 * ```
 */
export const iconGlyphs: Readonly<Record<IconName, string>> = {
  Play: '▶',
  Pause: '❚❚',
  Back30: '↺30',
  Forward30: '30↻',
  PreviousChapter: '⏮',
  NextChapter: '⏭',
  Chapters: '☰',
  Speed: '⏱',
  Bookmark: '⚑',
  Share: '↗',
  Expand: '▴',
  Collapse: '▾',
  Close: '✕',
  Back: '‹',
  Library: '▤',
  Profile: '◉',
  Settings: '⚙',
  More: '…',
}
