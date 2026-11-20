import { Array, Match as M, Option } from 'effect'

import type { InkRun } from '../theme/terminal.js'
import type { Role } from '../theme/theme.js'
import type { Device } from './device.js'
import { Column, Row, Text } from './elements.js'
import { iconGlyphs } from './icons.js'
import { resolveLazyNode } from './lazy.js'
import { itemLinesOf } from './listRows.js'
import { bookmarksInPassage } from './transcriptBookmarks.js'
import { transcriptEntriesOf } from './transcriptEntries.js'
import type {
  ButtonNode,
  HotspotAction,
  ItemCheck,
  LayoutBox,
  ListItem,
  ProgressNode,
  SeekNode,
  TranscriptBookmark,
  TranscriptPassage,
  TranscriptWord,
  UiNode,
} from './types.js'

const WATCH_INNER = 16
const PHONE_INNER = 22
const TABLET_INNER = 26
const COMPUTER_INNER = 28
const TV_INNER = 28

type Ids = Readonly<{
  next: (prefix: string) => string
}>

const makeIds = (): Ids => {
  let n = 0
  return {
    next: prefix => {
      n += 1
      return `${prefix}-${n.toString()}`
    },
  }
}

const minInnerWidth = (device: Device): number =>
  M.value(device).pipe(
    M.withReturnType<number>(),
    M.when('watch', () => WATCH_INNER),
    M.when('phone', () => PHONE_INNER),
    M.when('tablet', () => TABLET_INNER),
    M.when('computer', () => COMPUTER_INNER),
    M.when('tv', () => TV_INNER),
    M.exhaustive,
  )

const statusRows = (device: Device): number =>
  M.value(device).pipe(
    M.withReturnType<number>(),
    M.when('tv', () => 0),
    M.orElse(() => 1),
  )

const homeRows = (device: Device): number => (device === 'phone' ? 1 : 0)

const standRows = (device: Device): number => (device === 'computer' ? 1 : 0)

const emptyBoxes: ReadonlyArray<LayoutBox> = []

const measureText = (content: string, maxW: number): number =>
  Math.min(content.length, Math.max(0, maxW))

const fit = (content: string, width: number): string => {
  if (content.length >= width) {
    return content.substring(0, width)
  }
  return content.padEnd(width, ' ')
}

const buttonText = (button: ButtonNode): string => {
  const glyph = button.icon === undefined ? undefined : iconGlyphs[button.icon]
  if (glyph === undefined) {
    return button.label
  } else if (button.isIconOnly === true) {
    return glyph
  } else {
    return `${glyph} ${button.label}`
  }
}

const buttonGlyph = (button: ButtonNode): string => {
  const text = buttonText(button)
  if (button.focused === true) {
    return `[>${text}<]`
  } else if (button.isCurrent === true) {
    return `[*${text}*]`
  } else {
    return `[ ${text} ]`
  }
}

/**
 * The role a button or a row plays where it stands out: the one with the
 * keyboard, and the current one, such as the chapter playing.
 */
const standingInkOf = (
  standing: Readonly<{ focused?: boolean; isCurrent?: boolean }>,
  col: number,
  width: number,
): Readonly<{ inks?: ReadonlyArray<InkRun> }> => {
  if (standing.focused === true) {
    return { inks: [{ col, width, role: 'Focus' }] }
  } else if (standing.isCurrent === true) {
    return { inks: [{ col, width, role: 'Accent' }] }
  } else {
    return {}
  }
}

const seekBarWidth = 40

const seekFilled = '━'

const seekRest = '─'

const seekMarker = '●'

/**
 * A seek bar as one terminal line that fits `availableW`: the bar, the
 * marker at the place, and how the place reads.
 *
 * @example
 * ```typescript
 * seekLineOf(seek, 30) // '━━━━━━━━●──────── 0:30 of 1:00'
 * ```
 */
export const seekLineOf = (seek: SeekNode, availableW: number): string => {
  const barWidth = Math.max(
    0,
    Math.min(seekBarWidth, availableW - seek.valueText.length - 1),
  )
  const min = seek.min ?? 0
  const span = seek.max - min
  const fraction =
    span > 0 ? Math.min(1, Math.max(0, (seek.value - min) / span)) : 0
  const filled = Math.min(
    Math.max(0, barWidth - 1),
    Math.round(fraction * (barWidth - 1)),
  )
  const bar =
    barWidth === 0
      ? ''
      : `${seekFilled.repeat(filled)}${seekMarker}${seekRest.repeat(Math.max(0, barWidth - filled - 1))}`
  return `${bar} ${seek.valueText}`.trimStart()
}

const progressBarWidth = 20

/**
 * A progress bar as one terminal line that fits `availableW`, then its
 * label.
 *
 * @example
 * ```typescript
 * progressLineOf(progress, 40) // '█████░░░░░░░░░░░░░░░ 9:09:44 left'
 * ```
 */
export const progressLineOf = (
  progress: ProgressNode,
  availableW: number,
): string => {
  const barWidth = Math.max(
    0,
    Math.min(progressBarWidth, availableW - progress.label.length - 1),
  )
  const fraction =
    progress.max > 0
      ? Math.min(1, Math.max(0, progress.value / progress.max))
      : 0
  const filled = Math.round(fraction * barWidth)
  return `${'█'.repeat(filled)}${'░'.repeat(barWidth - filled)} ${progress.label}`.trimStart()
}

const checkGlyph = (check: ItemCheck): string =>
  `${check.focused === true ? '›' : ' '}[${check.isChecked ? 'x' : ' '}]`

const checkGap = 1

// NOTE: Text has no bold to set words apart with, so a part of a title a
// search found sits in single marks, as a found word does in the words.
const markedTitleOf = (item: ListItem): string =>
  item.titleMark === undefined
    ? item.title
    : `${item.title.slice(0, item.titleMark.start)}‹${item.title.slice(
        item.titleMark.start,
        item.titleMark.end,
      )}›${item.title.slice(item.titleMark.end)}`

const itemTitleGlyph = (item: ListItem): string => {
  const title = markedTitleOf(item)
  if (item.focused === true) {
    return `› ${title}`
  } else if (item.isCurrent === true) {
    return `• ${title}`
  } else {
    return `  ${title}`
  }
}

const passageLabelWidth = 8

const bookmarkGlyph = '*'

// NOTE: In text a word a search found sits in single marks, and the match
// a person is on, or the word whose menu is open, in double marks; the
// word being read keeps its brackets outside them.
const markedWordOf = (word: TranscriptWord): string =>
  word.mark === undefined
    ? word.text
    : word.mark === 'Found'
      ? `‹${word.text}›`
      : `«${word.text}»`

const wordGlyph = (word: TranscriptWord, isBookmarked: boolean): string => {
  const glyph =
    word.isCurrent === true ? `[${markedWordOf(word)}]` : markedWordOf(word)
  return isBookmarked ? `${bookmarkGlyph}${glyph}` : glyph
}

// NOTE: `isShown` marks the line of the word a Transcript says to show,
// such as the match a search is on, while its words do not follow the
// voice. A screen keeps that line in view in place of the one being read.
// `inks` says the role each part of the line plays, by column in `text`,
// for a terminal to ink from the theme.
type TranscriptLine = Readonly<{
  text: string
  isCurrent: boolean
  isShown: boolean
  inks: ReadonlyArray<InkRun>
}>

const plainLine = (
  text: string,
  inks: ReadonlyArray<InkRun> = [],
): TranscriptLine => ({
  text,
  isCurrent: false,
  isShown: false,
  inks,
})

// NOTE: Words side by side in one role are one part, the space between
// them included, so a line of words to come is marked up once.
const withWordInk = (
  inks: ReadonlyArray<InkRun>,
  col: number,
  width: number,
  role: Role,
): ReadonlyArray<InkRun> =>
  Option.match(
    Option.filter(
      Array.last(inks),
      last => last.role === role && last.col + last.width + 1 === col,
    ),
    {
      onNone: () => [...inks, { col, width, role }],
      onSome: last => [
        ...Array.dropRight(inks, 1),
        { ...last, width: last.width + 1 + width },
      ],
    },
  )

/**
 * The role a word of a passage plays in a terminal: the word being
 * spoken, the match a person is on, a word a search found, and otherwise
 * what was spoken, in the paragraph being read up to the word being
 * spoken, or what is to come.
 */
const wordRoleOf = (
  passage: TranscriptPassage,
): ((word: TranscriptWord, index: number) => Role) => {
  const maybeCurrentIndex = Array.findFirstIndex(
    passage.words,
    word => word.isCurrent === true,
  )
  return (word, index) => {
    if (word.isCurrent === true) {
      return 'ReadingCurrentWord'
    } else if (word.mark === 'Selected') {
      return 'SelectedMark'
    } else if (word.mark === 'Found') {
      return 'Mark'
    } else if (passage.isCurrent !== true) {
      return 'ReadingToCome'
    } else {
      return Option.match(maybeCurrentIndex, {
        onNone: () => 'ReadingSpoken',
        onSome: currentIndex =>
          index < currentIndex ? 'ReadingSpoken' : 'ReadingToCome',
      })
    }
  }
}

type Wrapped = Readonly<{
  lines: ReadonlyArray<TranscriptLine>
  maybeOpen: Option.Option<TranscriptLine>
}>

const nothingWrapped: Wrapped = { lines: [], maybeOpen: Option.none() }

const wrappedWords = (
  words: ReadonlyArray<TranscriptWord>,
  width: number,
  bookmarkedTokens: ReadonlySet<string>,
  maybeShownToken: string | undefined,
  roleOf: (word: TranscriptWord, index: number) => Role,
): ReadonlyArray<TranscriptLine> => {
  const wrapped = Array.reduce(words, nothingWrapped, (state, word, index) => {
    const glyph = wordGlyph(word, bookmarkedTokens.has(word.token))
    const isCurrent = word.isCurrent === true
    const isShown = word.token === maybeShownToken
    const role = roleOf(word, index)
    const opened: TranscriptLine = {
      text: glyph,
      isCurrent,
      isShown,
      inks: [{ col: 0, width: glyph.length, role }],
    }
    return Option.match(state.maybeOpen, {
      onNone: () => ({ lines: state.lines, maybeOpen: Option.some(opened) }),
      onSome: open =>
        open.text.length + 1 + glyph.length <= width
          ? {
              lines: state.lines,
              maybeOpen: Option.some({
                text: `${open.text} ${glyph}`,
                isCurrent: open.isCurrent || isCurrent,
                isShown: open.isShown || isShown,
                inks: withWordInk(
                  open.inks,
                  open.text.length + 1,
                  glyph.length,
                  role,
                ),
              }),
            }
          : {
              lines: Array.append(state.lines, open),
              maybeOpen: Option.some(opened),
            },
    })
  })
  return [...wrapped.lines, ...Option.toArray(wrapped.maybeOpen)]
}

const untimedWordsOf = (text: string): ReadonlyArray<TranscriptWord> =>
  Array.map(
    Array.filter(text.split(' '), piece => piece !== ''),
    piece => ({ token: '', text: piece }),
  )

/**
 * The words a terminal prints for a passage, and the role they play: a
 * sealed passage prints why its words are held back, quietly; a passage
 * with no timed words prints its text; words still being heard are quiet.
 */
const shownWordsOf = (
  passage: TranscriptPassage,
): Readonly<{
  words: ReadonlyArray<TranscriptWord>
  roleOf: (word: TranscriptWord, index: number) => Role
}> => {
  const quiet = (): Role => 'QuietText'
  if (passage.sealed !== undefined) {
    return { words: untimedWordsOf(passage.sealed), roleOf: quiet }
  } else if (
    Array.isReadonlyArrayEmpty(passage.words) &&
    passage.text !== undefined
  ) {
    return {
      words: untimedWordsOf(passage.text),
      roleOf: passage.isTentative === true ? quiet : wordRoleOf(passage),
    }
  } else if (passage.isTentative === true) {
    return { words: passage.words, roleOf: quiet }
  } else {
    return { words: passage.words, roleOf: wordRoleOf(passage) }
  }
}

const passageLines = (
  passage: TranscriptPassage,
  availableW: number,
  bookmarks: ReadonlyArray<TranscriptBookmark>,
  maybeShownToken: string | undefined,
): ReadonlyArray<TranscriptLine> => {
  const marker = passage.isCurrent === true ? '›' : ' '
  const named = `${marker}${passage.label}`
  const label = named.padEnd(passageLabelWidth, ' ')
  const labelInk: InkRun = { col: 0, width: named.length, role: 'QuietText' }
  const shiftedBy = (run: InkRun): InkRun => ({
    ...run,
    col: run.col + passageLabelWidth,
  })
  const textWidth = Math.max(1, availableW - passageLabelWidth)
  const placed = bookmarksInPassage(passage, bookmarks)
  const bookmarkedTokens = new Set(Array.map(placed, ({ token }) => token))
  const shown = shownWordsOf(passage)
  return [
    ...(passage.heading === undefined
      ? []
      : [
          plainLine(''),
          plainLine(passage.heading.toUpperCase(), [
            { col: 0, width: passage.heading.length, role: 'ReadingRule' },
          ]),
        ]),
    ...(passage.speaker === undefined
      ? []
      : [
          plainLine(`${' '.repeat(passageLabelWidth)}${passage.speaker}`, [
            {
              col: passageLabelWidth,
              width: passage.speaker.length,
              role: 'QuietText',
            },
          ]),
        ]),
    ...Array.map(
      wrappedWords(
        shown.words,
        textWidth,
        bookmarkedTokens,
        maybeShownToken,
        shown.roleOf,
      ),
      (line, index) => ({
        text: `${index === 0 ? label : ' '.repeat(passageLabelWidth)}${line.text}`,
        isCurrent: line.isCurrent,
        isShown: line.isShown,
        inks: [
          ...(index === 0 ? [labelInk] : []),
          ...Array.map(line.inks, shiftedBy),
        ],
      }),
    ),
    ...Array.getSomes(
      Array.map(placed, ({ bookmark }) =>
        Option.map(Option.fromNullishOr(bookmark.note), note =>
          plainLine(`${' '.repeat(passageLabelWidth)}${bookmarkGlyph} ${note}`),
        ),
      ),
    ),
  ]
}

type Timeline = Readonly<{ boxes: ReadonlyArray<LayoutBox>; rows: number }>

const noTimeline: Timeline = { boxes: [], rows: 0 }

const layoutNode = (
  node: UiNode,
  x: number,
  y: number,
  availableW: number,
  ids: Ids,
): LayoutBox =>
  M.value(node).pipe(
    M.withReturnType<LayoutBox>(),
    M.tagsExhaustive({
      Text: text => {
        const w = text.width ?? measureText(text.content, availableW)
        return {
          id: ids.next('text'),
          x,
          y,
          w,
          h: 1,
          kind: 'Text',
          text: fit(text.content, w),
          children: [],
        }
      },
      Button: button => {
        const glyph = buttonGlyph(button)
        const w = Math.min(glyph.length, availableW)
        const action: HotspotAction | undefined = button.disabled
          ? undefined
          : {
              _tag: 'custom',
              id: button.action ?? button.token ?? button.label,
            }
        return {
          id: ids.next('button'),
          x,
          y,
          w,
          h: 1,
          kind: 'Button',
          text: glyph.substring(0, w),
          label: button.label,
          ...standingInkOf(button, x, w),
          ...(action === undefined ? {} : { action }),
          children: [],
        }
      },
      TextInput: input => {
        const width = Math.min(input.width ?? availableW, availableW)
        const body =
          input.value.length > 0 ? input.value : (input.placeholder ?? '')
        const typed = input.focused === true ? `${body}▌` : body
        const shown = input.action === undefined ? typed : `[ ${typed} ]`
        const action: HotspotAction | undefined =
          input.token === undefined
            ? undefined
            : { _tag: 'custom', id: input.token }
        return {
          id: ids.next('input'),
          x,
          y,
          w: width,
          h: 1,
          kind: 'TextInput',
          text: fit(shown, width),
          label: input.label ?? 'input',
          ...(action === undefined ? {} : { action }),
          children: [],
        }
      },
      Spacer: spacer => ({
        id: ids.next('spacer'),
        x,
        y,
        w: availableW,
        h: spacer.rows,
        kind: 'Spacer',
        children: [],
      }),
      Row: row => {
        if (row.isBoard === true) {
          return layoutNode(
            Column({ gap: row.gap }, ...row.children),
            x,
            y,
            availableW,
            ids,
          )
        }
        const laid = Array.reduce(
          row.children,
          {
            cursor: x,
            maxH: 1,
            children: emptyBoxes,
          },
          (state, child) => {
            const remaining = Math.max(0, x + availableW - state.cursor)
            if (remaining <= 0) {
              return state
            }
            const box = layoutNode(child, state.cursor, y, remaining, ids)
            return {
              cursor: state.cursor + box.w + row.gap,
              maxH: Math.max(state.maxH, box.h),
              children: [...state.children, box],
            }
          },
        )
        const used = laid.cursor - row.gap - x
        return {
          id: ids.next('row'),
          x,
          y,
          w: used > 0 ? Math.min(availableW, used) : availableW,
          h: laid.maxH,
          kind: 'Row',
          children: laid.children,
        }
      },
      Column: column => {
        const laid = Array.reduce(
          column.children,
          { cursor: y, children: emptyBoxes },
          (state, child) => {
            const box = layoutNode(child, x, state.cursor, availableW, ids)
            return {
              cursor: state.cursor + box.h + column.gap,
              children: [...state.children, box],
            }
          },
        )
        const used = laid.cursor - column.gap - y
        const width = Array.reduce(laid.children, 0, (max, child) =>
          Math.max(max, child.w),
        )
        return {
          id: ids.next('column'),
          x,
          y,
          w: width === 0 ? availableW : width,
          h: Math.max(0, used),
          kind: 'Column',
          children: laid.children,
        }
      },
      Box: box => {
        const inner = layoutNode(
          Column(
            { gap: 0 },
            ...(box.isDock === true
              ? [Text('─'.repeat(Math.max(0, availableW)), { dim: true })]
              : []),
            ...box.children,
          ),
          x + box.padding,
          y + box.padding,
          Math.max(0, availableW - box.padding * 2),
          ids,
        )
        return {
          id: ids.next('box'),
          x,
          y,
          w: availableW,
          h: inner.h + box.padding * 2,
          kind: 'Box',
          children: [inner],
        }
      },
      Progress: progress => {
        const line = progressLineOf(progress, availableW)
        const w = measureText(line, availableW)
        return {
          id: ids.next('progress'),
          x,
          y,
          w,
          h: 1,
          kind: 'Progress',
          text: fit(line, w),
          label: progress.label,
          children: [],
        }
      },
      List: list => {
        const rows = Array.map(list.items, (item, index) => {
          const checkBoxes: ReadonlyArray<LayoutBox> =
            item.check === undefined
              ? []
              : [
                  {
                    id: ids.next('check'),
                    x,
                    y: y + index,
                    w: checkGlyph(item.check).length,
                    h: 1,
                    kind: 'Button',
                    text: checkGlyph(item.check),
                    label: item.check.label,
                    ...(item.check.action === undefined
                      ? {}
                      : { action: { _tag: 'custom', id: item.check.action } }),
                    children: [],
                  },
                ]
          const titleX = Array.match(checkBoxes, {
            onEmpty: () => x,
            onNonEmpty: ([checkBox]) => checkBox.x + checkBox.w + checkGap,
          })
          const titleAvailableW = Math.max(0, availableW - (titleX - x))
          const title = itemTitleGlyph(item)
          const titleW = measureText(title, titleAvailableW)
          const titleBox: LayoutBox = {
            id: ids.next('item'),
            x: titleX,
            y: y + index,
            w: titleW,
            h: 1,
            kind: 'Button',
            text: fit(title, titleW),
            label: item.title,
            ...(item.isCurrent === true ? { isCurrent: true } : {}),
            ...standingInkOf(item, titleX, titleW),
            ...Option.match(
              Option.orElse(Option.fromNullishOr(item.action), () =>
                Option.fromNullishOr(item.href),
              ),
              {
                onNone: () => ({}),
                onSome: id => ({ action: { _tag: 'custom' as const, id } }),
              },
            ),
            children: [],
          }
          const detail = Array.join(itemLinesOf(item), ' · ')
          const rest = layoutNode(
            Row(
              { gap: 2 },
              ...(detail === '' ? [] : [Text(detail, { dim: true })]),
              ...(item.trailing ?? []),
            ),
            titleX + titleW + 2,
            y + index,
            Math.max(0, titleAvailableW - titleW - 2),
            ids,
          )
          return { checkBoxes, titleBox, rest }
        })
        return {
          id: ids.next('list'),
          x,
          y,
          w: availableW,
          h: rows.length,
          kind: 'List',
          label: list.label,
          children: Array.flatMap(rows, ({ checkBoxes, titleBox, rest }) => [
            ...checkBoxes,
            titleBox,
            rest,
          ]),
        }
      },
      Seek: seek => {
        const line = seekLineOf(seek, availableW)
        const w = measureText(line, availableW)
        return {
          id: ids.next('seek'),
          x,
          y,
          w,
          h: 1,
          kind: 'Seek',
          text: fit(line, w),
          label: seek.label,
          children: [],
        }
      },
      Transcript: transcript => {
        const maybeShownToken =
          transcript.isFollowing === false ? transcript.focusToken : undefined
        const lineBox = (line: TranscriptLine, row: number): LayoutBox => ({
          id: ids.next('text'),
          x,
          y: y + row,
          w: measureText(line.text, availableW),
          h: 1,
          kind: 'Text',
          text: fit(line.text, measureText(line.text, availableW)),
          ...(line.isCurrent ? { isCurrent: true } : {}),
          ...(line.isShown ? { isShown: true } : {}),
          ...(Array.isReadonlyArrayNonEmpty(line.inks)
            ? {
                inks: Array.map(line.inks, run => ({
                  ...run,
                  col: run.col + x,
                })),
              }
            : {}),
          children: [],
        })
        // NOTE: The timeline is laid out top to bottom, an entry at a
        // time: a passage is its lines, and an item is its time in the
        // column the passages keep theirs in, with the screen part it
        // shows laid out beside it, as tall as that part is.
        const timeline = Array.reduce(
          transcriptEntriesOf(transcript),
          Array.isReadonlyArrayNonEmpty(transcript.passages)
            ? noTimeline
            : {
                boxes: [lineBox(plainLine(transcript.emptyText), 0)],
                rows: 1,
              },
          (state: Timeline, entry): Timeline => {
            if (entry._tag === 'PassageEntry') {
              const lines = passageLines(
                entry.passage,
                availableW,
                transcript.bookmarks ?? [],
                maybeShownToken,
              )
              return {
                boxes: [
                  ...state.boxes,
                  ...Array.map(lines, (line, index) =>
                    lineBox(line, state.rows + index),
                  ),
                ],
                rows: state.rows + lines.length,
              }
            } else {
              const named = ` ${entry.item.label}`
              const shown = layoutNode(
                entry.item.node,
                x + passageLabelWidth,
                y + state.rows,
                Math.max(1, availableW - passageLabelWidth),
                ids,
              )
              return {
                boxes: [
                  ...state.boxes,
                  lineBox(
                    plainLine(named, [
                      { col: 0, width: named.length, role: 'QuietText' },
                    ]),
                    state.rows,
                  ),
                  shown,
                ],
                rows: state.rows + Math.max(1, shown.h),
              }
            }
          },
        )
        return {
          id: ids.next('transcript'),
          x,
          y,
          w: Array.reduce(timeline.boxes, 0, (max, child) =>
            Math.max(max, child.x - x + child.w),
          ),
          h: timeline.rows,
          kind: 'Transcript',
          label: transcript.label,
          children: timeline.boxes,
        }
      },
      DeviceShell: shell => {
        const minInner = minInnerWidth(shell.device)
        const statusH = statusRows(shell.device)
        const homeH = homeRows(shell.device)
        const standH = standRows(shell.device)
        const content = layoutNode(
          Column({ gap: 0 }, ...shell.children),
          x + 1,
          y + 1 + statusH,
          Math.max(minInner, availableW - 2),
          ids,
        )
        const innerW = Math.max(minInner, content.w)
        const innerH = statusH + content.h + homeH
        return {
          id: ids.next('device'),
          x,
          y,
          w: innerW + 2,
          h: innerH + 2 + standH,
          kind: 'DeviceShell',
          device: shell.device,
          time: shell.time,
          ...(shell.title === undefined ? {} : { title: shell.title }),
          children: [content],
        }
      },
      Lazy: lazy => layoutNode(resolveLazyNode(lazy), x, y, availableW, ids),
    }),
  )

/** Lays out a UiNode tree into character-cell boxes. */
export const layoutTree = (
  root: UiNode,
  originX = 0,
  originY = 0,
  availableW = 80,
): LayoutBox => layoutNode(root, originX, originY, availableW, makeIds())

/** Fits a string into a character width. */
export const fitText = fit

/** True when this Device paints a status row. */
export const deviceHasStatus = (device: Device): boolean =>
  statusRows(device) > 0

/** True when this Device paints a phone home indicator. */
export const deviceHasHome = (device: Device): boolean => homeRows(device) > 0

/** True when this Device paints a computer stand. */
export const deviceHasStand = (device: Device): boolean => standRows(device) > 0
