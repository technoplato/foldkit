import { Array, Match as M, Schema as S } from 'effect'
import { type Html, html } from 'foldkit/html'
import type { Message } from 'words-core-example'

/** Every icon web Scribe draws, in the SF Symbols spirit: 24 point, rounded strokes. */
export const IconName = S.Literals([
  'ChevronLeft',
  'ChevronRight',
  'ChevronDown',
  'Share',
  'Link',
  'Copy',
  'Check',
  'Close',
  'Play',
  'Pause',
  'Stop',
  'Record',
  'Microphone',
  'Waveform',
  'Phone',
  'Laptop',
  'Person',
  'People',
  'Globe',
  'Lock',
  'Refresh',
  'External',
  'More',
  'Alert',
  'SignOut',
  'Shield',
  'Sparkle',
  'Clock',
  'Speaker',
  'Offline',
  'Expand',
  'Contract',
  'Search',
  'Playhead',
  'Question',
])
/** Every icon web Scribe draws. */
export type IconName = typeof IconName.Type

type Shape = Readonly<{
  paths: ReadonlyArray<string>
  isFilled: boolean
}>

const stroked = (...paths: ReadonlyArray<string>): Shape => ({
  paths,
  isFilled: false,
})

const filled = (...paths: ReadonlyArray<string>): Shape => ({
  paths,
  isFilled: true,
})

const shapes: Readonly<Record<IconName, Shape>> = {
  ChevronLeft: stroked('M15 18l-6-6 6-6'),
  ChevronRight: stroked('M9 18l6-6-6-6'),
  ChevronDown: stroked('M6 9l6 6 6-6'),
  Share: stroked(
    'M12 3.5v11',
    'M7.5 8L12 3.5 16.5 8',
    'M6 11.5H5.5A1.5 1.5 0 004 13v6.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V13a1.5 1.5 0 00-1.5-1.5H18',
  ),
  Link: stroked(
    'M10 13.5a4.5 4.5 0 006.4.4l2.8-2.8a4.5 4.5 0 00-6.4-6.4L11.4 6.1',
    'M14 10.5a4.5 4.5 0 00-6.4-.4l-2.8 2.8a4.5 4.5 0 006.4 6.4l1.4-1.4',
  ),
  Copy: stroked(
    'M9 9.5A1.5 1.5 0 0110.5 8h8A1.5 1.5 0 0120 9.5v9a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 019 18.5z',
    'M15 8V5.5A1.5 1.5 0 0013.5 4h-8A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H9',
  ),
  Check: stroked('M5 12.5l4.5 4.5L19 7.5'),
  Close: stroked('M6.5 6.5l11 11', 'M17.5 6.5l-11 11'),
  Play: filled(
    'M8 5.6c0-.8.9-1.3 1.6-.9l9.6 5.9c.7.4.7 1.4 0 1.8l-9.6 5.9c-.7.4-1.6-.1-1.6-.9z',
  ),
  Pause: filled(
    'M7 5h3a1 1 0 011 1v12a1 1 0 01-1 1H7a1 1 0 01-1-1V6a1 1 0 011-1z',
    'M14 5h3a1 1 0 011 1v12a1 1 0 01-1 1h-3a1 1 0 01-1-1V6a1 1 0 011-1z',
  ),
  Stop: filled(
    'M7.5 6h9A1.5 1.5 0 0118 7.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 16.5v-9A1.5 1.5 0 017.5 6z',
  ),
  Record: filled('M12 5a7 7 0 110 14 7 7 0 010-14z'),
  Microphone: stroked(
    'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z',
    'M18.5 11a6.5 6.5 0 01-13 0',
    'M12 17.5V21',
  ),
  Waveform: stroked(
    'M4 10v4',
    'M8 6.5v11',
    'M12 3.5v17',
    'M16 7.5v9',
    'M20 10.5v3',
  ),
  Phone: stroked(
    'M8.5 2.5h7A1.5 1.5 0 0117 4v16a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 20V4a1.5 1.5 0 011.5-1.5z',
    'M11 18.5h2',
  ),
  Laptop: stroked(
    'M5 5.5A1.5 1.5 0 016.5 4h11A1.5 1.5 0 0119 5.5V15H5z',
    'M2.5 18.5h19',
  ),
  Person: stroked(
    'M12 3.5a4 4 0 110 8 4 4 0 010-8z',
    'M4.5 20.5a7.5 7.5 0 0115 0',
  ),
  People: stroked(
    'M9 4.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z',
    'M2.5 20a6.5 6.5 0 0113 0',
    'M16 5a3 3 0 010 6',
    'M18 14.5a5.5 5.5 0 013.5 5.5',
  ),
  Globe: stroked(
    'M12 3a9 9 0 110 18 9 9 0 010-18z',
    'M3 12h18',
    'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  ),
  Lock: stroked(
    'M6.5 11h11a1.5 1.5 0 011.5 1.5v6.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19v-6.5A1.5 1.5 0 016.5 11z',
    'M8 11V7.5a4 4 0 018 0V11',
  ),
  Refresh: stroked('M19.5 12a7.5 7.5 0 11-2.2-5.3', 'M19.5 4.5V9H15'),
  External: stroked(
    'M14 4h6v6',
    'M20 4l-9 9',
    'M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10',
  ),
  Playhead: stroked('M12 8v12.5', 'M8 3.5h8L12 8z'),
  More: filled(
    'M6 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
    'M12 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
    'M18 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  ),
  Alert: stroked(
    'M10.3 4.3a2 2 0 013.4 0l7.2 12.4A2 2 0 0119.2 20H4.8a2 2 0 01-1.7-3.3z',
    'M12 9.5v4',
    'M12 16.8v.2',
  ),
  SignOut: stroked(
    'M9.5 20.5H6A1.5 1.5 0 014.5 19V5A1.5 1.5 0 016 3.5h3.5',
    'M15.5 16.5L20 12l-4.5-4.5',
    'M20 12H9.5',
  ),
  Shield: stroked(
    'M12 3l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z',
    'M8.8 12l2.2 2.2 4.4-4.4',
  ),
  Sparkle: stroked('M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z'),
  Clock: stroked(
    'M12 3.5a8.5 8.5 0 110 17 8.5 8.5 0 010-17z',
    'M12 7.5V12l3 2',
  ),
  Speaker: stroked(
    'M4.5 9.5h3l4.5-4v13l-4.5-4h-3z',
    'M15.5 9a4 4 0 010 6',
    'M18 6.5a7.5 7.5 0 010 11',
  ),
  Offline: stroked(
    'M2.5 8.8a14 14 0 0119 0',
    'M5.8 12.2a9.5 9.5 0 0112.4 0',
    'M9.2 15.6a4.8 4.8 0 015.6 0',
    'M12 19.5h.01',
    'M4 4l16 16',
  ),
  Expand: stroked(
    'M14.5 4H20v5.5',
    'M20 4l-6 6',
    'M9.5 20H4v-5.5',
    'M4 20l6-6',
  ),
  Search: stroked(
    'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13z',
    'M15.5 15.5L20 20',
  ),
  Question: stroked(
    'M12 3.5a8.5 8.5 0 110 17 8.5 8.5 0 010-17z',
    'M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.7',
    'M12 16.6v.4',
  ),
  Contract: stroked(
    'M20 9.5h-5.5V4',
    'M14.5 9.5l6-6',
    'M4 14.5h5.5V20',
    'M9.5 14.5l-6 6',
  ),
}

/** Which way a skip button moves playback. */
export const SkipDirection = S.Literals(['Backward', 'Forward'])
/** Which way a skip button moves playback. */
export type SkipDirection = typeof SkipDirection.Type

const SKIP_NUMERAL_SIZE = '8.4'

/**
 * A skip symbol with its seconds inside the arrow, like SF Symbols'
 * `gobackward.15`: the numeral is part of the drawing, so it scales with the
 * symbol and reads 11 px or more at the 32 px transport size.
 */
export const skipIcon = (
  direction: SkipDirection,
  seconds: number,
  className = 'size-8',
): Html => {
  const h = html<Message>()
  const arcPaths = M.value(direction).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.when('Backward', () => ['M4 12a8 8 0 108-8H9', 'M11.5 1.5L8.5 4l3 2.5']),
    M.when('Forward', () => ['M20 12a8 8 0 11-8-8h3', 'M12.5 1.5l3 2.5-3 2.5']),
    M.exhaustive,
  )
  return h.svg(
    [
      h.ViewBox('0 0 24 24'),
      h.Class(`${className} shrink-0`),
      h.AriaHidden(true),
      h.Fill('none'),
    ],
    [
      ...Array.map(arcPaths, path =>
        h.path(
          [
            h.D(path),
            h.Stroke('currentColor'),
            h.StrokeWidth('1.9'),
            h.StrokeLinecap('round'),
            h.StrokeLinejoin('round'),
          ],
          [],
        ),
      ),
      h.text(
        [
          h.Attribute('x', '12'),
          h.Attribute('y', '12.4'),
          h.TextAnchor('middle'),
          h.DominantBaseline('central'),
          h.FontSize(SKIP_NUMERAL_SIZE),
          h.FontWeight('700'),
          h.Fill('currentColor'),
        ],
        [String(seconds)],
      ),
    ],
  )
}

/** An icon; decorative unless the caller labels its button. */
export const icon = (name: IconName, className = 'size-5'): Html => {
  const h = html<Message>()
  const shape = shapes[name]
  return h.svg(
    [
      h.ViewBox('0 0 24 24'),
      h.Class(`${className} shrink-0`),
      h.AriaHidden(true),
      h.Fill(shape.isFilled ? 'currentColor' : 'none'),
      h.Stroke(shape.isFilled ? 'none' : 'currentColor'),
      h.StrokeWidth('1.9'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
    ],
    Array.map(shape.paths, path => h.path([h.D(path)], [])),
  )
}
