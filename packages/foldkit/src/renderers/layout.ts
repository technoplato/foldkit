import { Array, Match as M, Option } from 'effect'

import type { SlotBinding } from '../behavior/slot.js'
import type { InkRun } from '../theme/terminal.js'
import type { Role } from '../theme/theme.js'
import type { Device } from './device.js'
import { Button, Column, Row, Text } from './elements.js'
import { iconGlyphs } from './icons.js'
import { resolveLazyNode } from './lazy.js'
import { itemLinesOf } from './listRows.js'
import { bookmarksInPassage } from './transcriptBookmarks.js'
import { transcriptEntriesOf } from './transcriptEntries.js'
import type {
  BoxLayer,
  ButtonNode,
  HotspotAction,
  ItemCheck,
  LayoutBox,
  LayoutFrame,
  ListItem,
  ProgressNode,
  SeekNode,
  TextInputNode,
  TextNode,
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
 * The role a button or a row plays: focused controls stand out in Focus,
 * disabled controls rest in QuietText, every other pressable control uses
 * Accent (the one pressable color), and a non-pressable current item is
 * bold Text rather than colored.
 */
const standingInkOf = (
  standing: Readonly<{
    focused?: boolean
    isCurrent?: boolean
    isPressable?: boolean
    disabled?: boolean
  }>,
  col: number,
  width: number,
): Readonly<{ inks?: ReadonlyArray<InkRun> }> => {
  if (width <= 0) {
    return {}
  } else if (standing.focused === true) {
    return { inks: [{ col, width, role: 'Focus' }] }
  } else if (standing.disabled === true) {
    return { inks: [{ col, width, role: 'QuietText' }] }
  } else if (standing.isPressable === true) {
    return { inks: [{ col, width, role: 'Accent' }] }
  } else if (standing.isCurrent === true) {
    return { inks: [{ col, width, role: 'Text' }] }
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

const transcriptReadingMeasure = 76

const activeBarGlyph = '▎'

/** Layout options for terminal renderers. */
export type LayoutOptions = Readonly<{
  /** Paint the active transcript paragraph with a left vertical bar in Accent down every wrapped line. */
  activePassageBar?: boolean
}>

const defaultLayoutOptions: LayoutOptions = {}

const labelColumnWidthOf = (
  passages: ReadonlyArray<TranscriptPassage>,
  items: ReadonlyArray<Readonly<{ label: string }>>,
  options: LayoutOptions,
): number => {
  const widestPassage = Array.reduce(passages, 0, (widest, passage) =>
    Math.max(widest, passage.label.length),
  )
  const widestItem = Array.reduce(items, widestPassage, (widest, item) =>
    Math.max(widest, item.label.length),
  )
  const padding = options.activePassageBar === true ? 4 : 3
  return Math.max(passageLabelWidth, widestItem + padding)
}

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
      return 'QuietText'
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
  labelWidth: number,
  options: LayoutOptions,
): ReadonlyArray<TranscriptLine> => {
  const useBar = options.activePassageBar === true
  const isCurrent = passage.isCurrent === true
  const barPrefix = isCurrent ? `${activeBarGlyph} ` : '  '
  const named = useBar
    ? `${barPrefix}${passage.label}`
    : `${isCurrent ? '›' : ' '}${passage.label}`
  const label = named.padEnd(labelWidth, ' ')
  const continuation = useBar
    ? barPrefix.padEnd(labelWidth, ' ')
    : ' '.repeat(labelWidth)
  const barInk: ReadonlyArray<InkRun> =
    useBar && isCurrent ? [{ col: 0, width: 1, role: 'Accent' }] : []
  const labelInk: InkRun = useBar
    ? { col: 2, width: passage.label.length, role: 'QuietText' }
    : { col: 0, width: named.length, role: 'QuietText' }
  const shiftedBy = (run: InkRun): InkRun => ({
    ...run,
    col: run.col + labelWidth,
  })
  const textWidth = Math.min(
    transcriptReadingMeasure,
    Math.max(1, availableW - labelWidth),
  )
  const placed = bookmarksInPassage(passage, bookmarks)
  const bookmarkedTokens = new Set(Array.map(placed, ({ token }) => token))
  const shown = shownWordsOf(passage)
  return [
    ...(passage.heading === undefined
      ? []
      : [
          plainLine(''),
          plainLine(passage.heading.toUpperCase(), [
            { col: 0, width: passage.heading.length, role: 'Text' },
          ]),
        ]),
    ...(passage.speaker === undefined
      ? []
      : [
          plainLine(`${' '.repeat(labelWidth)}${passage.speaker}`, [
            {
              col: labelWidth,
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
        text: `${index === 0 ? label : continuation}${line.text}`,
        isCurrent: line.isCurrent,
        isShown: line.isShown,
        inks: [
          ...barInk,
          ...(index === 0 ? [labelInk] : []),
          ...Array.map(line.inks, shiftedBy),
        ],
      }),
    ),
    ...Array.getSomes(
      Array.map(placed, ({ bookmark }) =>
        Option.map(Option.fromNullishOr(bookmark.note), note =>
          plainLine(`${' '.repeat(labelWidth)}${bookmarkGlyph} ${note}`),
        ),
      ),
    ),
  ]
}

type Timeline = Readonly<{ boxes: ReadonlyArray<LayoutBox>; rows: number }>

const noTimeline: Timeline = { boxes: [], rows: 0 }

type LayoutContext = Readonly<{
  activeId?: string
  skipSlotIds?: ReadonlySet<string>
}>

const emptyLayoutContext: LayoutContext = {}

const slotOf = (node: UiNode): SlotBinding | undefined => {
  if (
    node._tag === 'Button' ||
    node._tag === 'TextInput' ||
    node._tag === 'Row' ||
    node._tag === 'Column' ||
    node._tag === 'Box'
  ) {
    return node.slot
  } else {
    return undefined
  }
}

const isHiddenNode = (node: UiNode, ctx: LayoutContext): boolean => {
  const slot = slotOf(node)
  if (slot === undefined) {
    return false
  } else if (slot.isHidden === true) {
    return true
  } else if (slot.id !== undefined && ctx.skipSlotIds?.has(slot.id) === true) {
    return true
  } else {
    return false
  }
}

const extractNodeText = (node: UiNode): string => {
  if (node._tag === 'Text') {
    return node.content
  } else if (node._tag === 'Button') {
    return buttonText(node)
  } else if (node._tag === 'TextInput') {
    return node.value.length > 0 ? node.value : (node.placeholder ?? '')
  } else if (
    node._tag === 'Box' ||
    node._tag === 'Row' ||
    node._tag === 'Column'
  ) {
    return Array.join(
      Array.filter(
        Array.map(node.children, extractNodeText),
        part => part.length > 0,
      ),
      ' ',
    )
  } else if (node._tag === 'Lazy') {
    return extractNodeText(resolveLazyNode(node))
  } else {
    return ''
  }
}

const findLabelTextById = (
  nodes: ReadonlyArray<UiNode>,
  targetId: string,
): Option.Option<string> =>
  Array.reduce(nodes, Option.none<string>(), (found, child) => {
    if (Option.isSome(found)) {
      return found
    }
    const slot = slotOf(child)
    if (slot?.id === targetId) {
      const text = extractNodeText(child).trim()
      return text.length > 0 ? Option.some(text) : Option.none()
    } else if (
      child._tag === 'Box' ||
      child._tag === 'Row' ||
      child._tag === 'Column'
    ) {
      return findLabelTextById(child.children, targetId)
    } else if (child._tag === 'Lazy') {
      return findLabelTextById([resolveLazyNode(child)], targetId)
    } else {
      return Option.none()
    }
  })

const badgeRoleOf = (text: TextNode): Role | undefined => {
  if (text.parts === undefined || text.parts.length !== 1) {
    return undefined
  }
  const maybePart = Array.head(text.parts)
  if (Option.isNone(maybePart) || maybePart.value._tag !== 'Reference') {
    return undefined
  }
  const kind = maybePart.value.kind
  if (kind === undefined || !kind.startsWith('Badge')) {
    return undefined
  } else if (kind === 'Badge:Positive') {
    return 'Positive'
  } else if (kind === 'Badge:Warning') {
    return 'Warning'
  } else if (kind === 'Badge:Danger') {
    return 'Danger'
  } else if (kind === 'Badge:Muted') {
    return 'QuietText'
  } else {
    return 'Accent'
  }
}

type ButtonPresentation = Readonly<{
  glyph: string
  inks: (col: number, width: number) => ReadonlyArray<InkRun>
}>

const badgeInksOf = (
  col: number,
  width: number,
  prefixLength: number,
  prefixRole: Role,
  isDisabled: boolean,
): ReadonlyArray<InkRun> => {
  if (width <= 0) {
    return []
  }
  const markWidth = Math.min(prefixLength, width)
  const restRuns: ReadonlyArray<InkRun> =
    isDisabled && width > markWidth
      ? [{ col: col + markWidth, width: width - markWidth, role: 'QuietText' }]
      : []
  return [{ col, width: markWidth, role: prefixRole }, ...restRuns]
}

const buttonPresentationOf = (
  button: ButtonNode,
  ctx: LayoutContext,
  isPressable: boolean,
): ButtonPresentation => {
  const slot = button.slot
  const text = buttonText(button)
  const isDisabled = button.disabled === true || slot?.isDisabled === true
  if (slot === undefined) {
    return {
      glyph: buttonGlyph(button),
      inks: (col, width) =>
        standingInkOf(
          { ...button, disabled: isDisabled, isPressable },
          col,
          width,
        ).inks ?? [],
    }
  }
  if (slot.role === 'Switch') {
    const isOn = slot.isChecked === true
    const badge = isOn ? '[● ON]' : '[○ OFF]'
    const glyph = text === '' ? badge : `${badge} ${text}`
    const badgeRole: Role = isDisabled
      ? 'QuietText'
      : isOn
        ? 'Positive'
        : 'QuietText'
    return {
      glyph,
      inks: (col, width) =>
        badgeInksOf(col, width, badge.length, badgeRole, isDisabled),
    }
  } else if (slot.role === 'Checkbox') {
    const mark =
      slot.isChecked === true
        ? '[x]'
        : slot.isChecked === 'mixed'
          ? '[-]'
          : '[ ]'
    const glyph = text === '' ? mark : `${mark} ${text}`
    const markRole: Role = isDisabled
      ? 'QuietText'
      : slot.isChecked === true
        ? 'Positive'
        : slot.isChecked === 'mixed'
          ? 'Warning'
          : 'Accent'
    return {
      glyph,
      inks: (col, width) =>
        badgeInksOf(col, width, mark.length, markRole, isDisabled),
    }
  } else if (slot.role === 'Radio') {
    const isChecked = slot.isChecked === true || slot.isSelected === true
    const mark = isChecked ? '(●)' : '( )'
    const glyph = text === '' ? mark : `${mark} ${text}`
    const markRole: Role = isDisabled
      ? 'QuietText'
      : isChecked
        ? 'Accent'
        : 'QuietText'
    return {
      glyph,
      inks: (col, width) =>
        badgeInksOf(col, width, mark.length, markRole, isDisabled),
    }
  } else if (slot.role === 'Tab') {
    const isSelected = slot.isSelected === true || button.isCurrent === true
    const glyph = isSelected ? `[${text}]` : text
    const role: Role = isDisabled
      ? 'QuietText'
      : isSelected
        ? 'Focus'
        : 'QuietText'
    return {
      glyph,
      inks: (col, width) => (width > 0 ? [{ col, width, role }] : []),
    }
  } else if (slot.role === 'Option' || slot.role === 'MenuItem') {
    const isActive =
      (ctx.activeId !== undefined && slot.id === ctx.activeId) ||
      slot.isCurrent === true ||
      button.focused === true
    const isSelected = slot.isSelected === true
    const prefix =
      isActive && isSelected
        ? '› ● '
        : isSelected
          ? '  ✓ '
          : isActive
            ? '›   '
            : '    '
    const glyph = `${prefix}${text}`
    const role: Role | undefined = isDisabled
      ? 'QuietText'
      : isActive
        ? 'Focus'
        : isSelected
          ? 'Positive'
          : undefined
    return {
      glyph,
      inks: (col, width) =>
        role !== undefined && width > 0 ? [{ col, width, role }] : [],
    }
  } else if (slot.isPressed !== undefined) {
    const glyph =
      slot.isPressed === true
        ? `[● ${text} ]`
        : slot.isPressed === 'mixed'
          ? `[◐ ${text} ]`
          : buttonGlyph(button)
    const role: Role = isDisabled
      ? 'QuietText'
      : slot.isPressed === true
        ? 'Focus'
        : slot.isPressed === 'mixed'
          ? 'Warning'
          : 'Accent'
    return {
      glyph,
      inks: (col, width) => (width > 0 ? [{ col, width, role }] : []),
    }
  } else {
    return {
      glyph: buttonGlyph(button),
      inks: (col, width) =>
        standingInkOf(
          { ...button, disabled: isDisabled, isPressable },
          col,
          width,
        ).inks ?? [],
    }
  }
}

type ContainerFrameSpec = Readonly<{
  frame: LayoutFrame
  skipSlotId?: string
}>

const containerFrameOf = (
  slot: SlotBinding | undefined,
  layer: BoxLayer | undefined,
  children: ReadonlyArray<UiNode>,
): ContainerFrameSpec | undefined => {
  const resolveLabelled = (): Readonly<{
    title?: string
    skipSlotId?: string
  }> => {
    if (slot?.labelledBy !== undefined) {
      const maybeFromChild = findLabelTextById(children, slot.labelledBy)
      if (Option.isSome(maybeFromChild)) {
        return { title: maybeFromChild.value, skipSlotId: slot.labelledBy }
      }
    }
    return slot?.label === undefined ? {} : { title: slot.label }
  }

  if (slot?.role === 'AlertDialog') {
    const resolved = resolveLabelled()
    return {
      frame: {
        style: 'Double',
        title: resolved.title ?? 'Alert',
        role: 'Warning',
      },
      ...(resolved.skipSlotId === undefined
        ? {}
        : { skipSlotId: resolved.skipSlotId }),
    }
  } else if (slot?.role === 'Dialog') {
    const resolved = resolveLabelled()
    return {
      frame: {
        style: 'Rounded',
        title: resolved.title ?? layer?.label ?? 'Dialog',
        role: 'Accent',
      },
      ...(resolved.skipSlotId === undefined
        ? {}
        : { skipSlotId: resolved.skipSlotId }),
    }
  } else if (slot?.role === 'Status') {
    return {
      frame: {
        style: 'Rounded',
        title: slot.label ?? 'Status',
        role: 'Accent',
      },
    }
  } else if (slot?.role === 'Alert') {
    return {
      frame: {
        style: 'Rounded',
        title: slot.label ?? 'Alert',
        role: 'Danger',
      },
    }
  } else if (slot?.role === 'Group') {
    const resolved = resolveLabelled()
    const role: Role =
      slot.isInvalid === true
        ? 'Danger'
        : slot.isDisabled === true
          ? 'QuietText'
          : 'Border'
    return {
      frame: {
        style: 'Square',
        role,
        ...(resolved.title === undefined ? {} : { title: resolved.title }),
      },
      ...(resolved.skipSlotId === undefined
        ? {}
        : { skipSlotId: resolved.skipSlotId }),
    }
  } else if (slot?.role === 'Listbox' || slot?.role === 'Menu') {
    const resolved = resolveLabelled()
    return {
      frame: {
        style: 'Square',
        role: 'Border',
        ...(resolved.title === undefined ? {} : { title: resolved.title }),
      },
      ...(resolved.skipSlotId === undefined
        ? {}
        : { skipSlotId: resolved.skipSlotId }),
    }
  } else if (slot?.role === 'Tooltip') {
    return {
      frame: {
        style: 'Rounded',
        title: slot.label === undefined ? 'ⓘ Hint' : `ⓘ ${slot.label}`,
        role: 'QuietText',
      },
    }
  } else if (layer !== undefined) {
    return {
      frame: {
        style: 'Rounded',
        title: layer.label,
        role: layer.kind === 'Dialog' ? 'Accent' : 'Border',
      },
    }
  } else {
    return undefined
  }
}

const childContextOf = (
  ctx: LayoutContext,
  slot: SlotBinding | undefined,
  skipSlotId?: string,
): LayoutContext => {
  const nextActiveId = slot?.activeId ?? ctx.activeId
  const nextSkipSlotIds =
    skipSlotId === undefined
      ? ctx.skipSlotIds
      : new Set([...(ctx.skipSlotIds ?? []), skipSlotId])
  return {
    ...(nextActiveId === undefined ? {} : { activeId: nextActiveId }),
    ...(nextSkipSlotIds === undefined ? {} : { skipSlotIds: nextSkipSlotIds }),
  }
}

const layoutMultilineTextInput = (
  input: TextInputNode,
  slot: SlotBinding,
  x: number,
  y: number,
  availableW: number,
  ids: Ids,
): LayoutBox => {
  const isDisabled = slot.isDisabled === true
  const isReadOnly = slot.isReadOnly === true
  const isInvalid = slot.isInvalid === true
  const isPlaceholder = input.value.length === 0
  const rawBody = isPlaceholder ? (input.placeholder ?? '') : input.value
  const rawLines = rawBody.split(/\r\n|\r|\n/u)
  const minLines = 2
  const paddedLines: ReadonlyArray<string> =
    rawLines.length < minLines
      ? [...rawLines, ...Array.makeBy(minLines - rawLines.length, () => '')]
      : rawLines
  const widestLine = Array.reduce(paddedLines, 0, (widest, line) =>
    Math.max(widest, line.length),
  )
  const title = isInvalid ? `${input.label ?? 'Input'} !` : undefined
  const titleMinW = title === undefined ? 0 : title.length + 6
  const preferredW = input.width ?? Math.max(widestLine + 4, titleMinW, 20)
  const frameW = Math.max(4, Math.min(preferredW, availableW))
  const innerW = Math.max(1, frameW - 4)
  const lineRole: Role =
    isDisabled || isReadOnly || isPlaceholder ? 'QuietText' : 'Text'
  const lineBoxes: ReadonlyArray<LayoutBox> = Array.map(
    paddedLines,
    (line, index) => {
      const clipped = line.length > innerW ? line.substring(0, innerW) : line
      const w = clipped.length
      return {
        id: ids.next('text'),
        x: x + 2,
        y: y + 1 + index,
        w,
        h: 1,
        kind: 'Text',
        text: clipped,
        ...(w > 0 ? { inks: [{ col: x + 2, width: w, role: lineRole }] } : {}),
        children: emptyBoxes,
      }
    },
  )
  const frameRole: Role = isInvalid
    ? 'Danger'
    : isDisabled
      ? 'QuietText'
      : 'Border'
  const action: HotspotAction | undefined =
    input.token === undefined ? undefined : { _tag: 'custom', id: input.token }
  return {
    id: ids.next('input'),
    x,
    y,
    w: frameW,
    h: paddedLines.length + 2,
    kind: 'TextInput',
    label: input.label ?? 'input',
    frame: {
      style: 'Square',
      role: frameRole,
      ...(title === undefined ? {} : { title }),
    },
    ...(action === undefined ? {} : { action }),
    children: lineBoxes,
  }
}

const layoutSlotTextInput = (
  input: TextInputNode,
  slot: SlotBinding,
  x: number,
  y: number,
  availableW: number,
  ids: Ids,
): LayoutBox => {
  if (slot.isMultiline === true) {
    return layoutMultilineTextInput(input, slot, x, y, availableW, ids)
  }
  const isDisabled = slot.isDisabled === true
  const isReadOnly = slot.isReadOnly === true
  const isInvalid = slot.isInvalid === true
  const isPlaceholder = input.value.length === 0
  const body = isPlaceholder ? (input.placeholder ?? '') : input.value
  const typed = input.focused === true ? `${body}▌` : body
  const suffix = isInvalid ? ' !' : ''
  const shown = `[ ${typed} ]${suffix}`
  const width = Math.min(input.width ?? Math.max(shown.length, 4), availableW)
  const fitted = fit(shown, width)
  const inks: ReadonlyArray<InkRun> = (() => {
    if (width <= 0) {
      return []
    } else if (isDisabled || isReadOnly) {
      return [{ col: x, width, role: 'QuietText' }]
    } else if (isInvalid) {
      return [{ col: x, width, role: 'Danger' }]
    } else if (isPlaceholder) {
      return [{ col: x, width, role: 'QuietText' }]
    } else {
      return [{ col: x, width, role: 'Text' }]
    }
  })()
  const action: HotspotAction | undefined =
    input.token === undefined ? undefined : { _tag: 'custom', id: input.token }
  return {
    id: ids.next('input'),
    x,
    y,
    w: width,
    h: 1,
    kind: 'TextInput',
    text: fitted,
    label: input.label ?? 'input',
    ...(Array.isReadonlyArrayNonEmpty(inks) ? { inks } : {}),
    ...(action === undefined ? {} : { action }),
    children: emptyBoxes,
  }
}

const layoutFramedContainer = (
  kind: 'Box' | 'Row' | 'Column',
  frame: LayoutFrame,
  innerNode: UiNode,
  extraPadding: number,
  x: number,
  y: number,
  availableW: number,
  ids: Ids,
  options: LayoutOptions,
  ctx: LayoutContext,
): LayoutBox => {
  const horizontalInset = 2 + extraPadding
  const verticalInset = 1 + extraPadding
  const innerAvailableW = Math.max(1, availableW - horizontalInset * 2)
  const inner = layoutNode(
    innerNode,
    x + horizontalInset,
    y + verticalInset,
    innerAvailableW,
    ids,
    options,
    ctx,
  )
  const titleMinW = frame.title === undefined ? 0 : frame.title.length + 6
  const frameW = Math.min(
    availableW,
    Math.max(inner.w + horizontalInset * 2, titleMinW, 4),
  )
  const frameH = Math.max(3, inner.h + verticalInset * 2)
  return {
    id: ids.next(kind.toLowerCase()),
    x,
    y,
    w: frameW,
    h: frameH,
    kind,
    frame,
    children: [inner],
  }
}

const layoutNode = (
  node: UiNode,
  x: number,
  y: number,
  availableW: number,
  ids: Ids,
  options: LayoutOptions,
  ctx: LayoutContext = emptyLayoutContext,
): LayoutBox => {
  if (isHiddenNode(node, ctx)) {
    return {
      id: ids.next('hidden'),
      x,
      y,
      w: 0,
      h: 0,
      kind: node._tag,
      children: emptyBoxes,
    }
  }
  return M.value(node).pipe(
    M.withReturnType<LayoutBox>(),
    M.tagsExhaustive({
      Text: text => {
        const w = text.width ?? measureText(text.content, availableW)
        const role: Role | undefined =
          badgeRoleOf(text) ??
          (text.dim === true
            ? 'QuietText'
            : text.emphasis !== undefined
              ? 'Text'
              : undefined)
        return {
          id: ids.next('text'),
          x,
          y,
          w,
          h: 1,
          kind: 'Text',
          text: fit(text.content, w),
          ...(role !== undefined && w > 0
            ? { inks: [{ col: x, width: w, role }] }
            : {}),
          children: [],
        }
      },
      Button: button => {
        const isDisabled =
          button.disabled === true || button.slot?.isDisabled === true
        const action: HotspotAction | undefined = isDisabled
          ? undefined
          : {
              _tag: 'custom',
              id: button.action ?? button.token ?? button.label,
            }
        const presentation = buttonPresentationOf(
          button,
          ctx,
          action !== undefined,
        )
        const w = Math.min(presentation.glyph.length, availableW)
        const inks = presentation.inks(x, w)
        return {
          id: ids.next('button'),
          x,
          y,
          w,
          h: 1,
          kind: 'Button',
          text: presentation.glyph.substring(0, w),
          label: button.label,
          ...(Array.isReadonlyArrayNonEmpty(inks) ? { inks } : {}),
          ...(action === undefined ? {} : { action }),
          children: [],
        }
      },
      TextInput: input => {
        if (input.slot !== undefined) {
          return layoutSlotTextInput(input, input.slot, x, y, availableW, ids)
        }
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
        const frameSpec = containerFrameOf(row.slot, undefined, row.children)
        const innerCtx = childContextOf(ctx, row.slot, frameSpec?.skipSlotId)
        if (frameSpec !== undefined) {
          return layoutFramedContainer(
            'Row',
            frameSpec.frame,
            Row(
              {
                gap: row.gap,
                ...(row.isBoard === undefined ? {} : { isBoard: row.isBoard }),
                ...(row.arrange === undefined ? {} : { arrange: row.arrange }),
              },
              ...row.children,
            ),
            0,
            x,
            y,
            availableW,
            ids,
            options,
            innerCtx,
          )
        }
        if (row.isBoard === true) {
          return layoutNode(
            Column({ gap: row.gap }, ...row.children),
            x,
            y,
            availableW,
            ids,
            options,
            innerCtx,
          )
        }
        if (Array.isReadonlyArrayEmpty(row.children)) {
          return {
            id: ids.next('row'),
            x,
            y,
            w: 0,
            h: 1,
            kind: 'Row',
            children: emptyBoxes,
          }
        }
        const visibleChildren = Array.filter(
          row.children,
          child => !isHiddenNode(child, innerCtx),
        )
        if (Array.isReadonlyArrayEmpty(visibleChildren)) {
          return {
            id: ids.next('row'),
            x,
            y,
            w: 0,
            h: 0,
            kind: 'Row',
            children: emptyBoxes,
          }
        }
        const laid = Array.reduce(
          visibleChildren,
          {
            cursor: x,
            rowY: y,
            rowMaxH: 1,
            widest: 0,
            children: emptyBoxes,
          },
          (state, child) => {
            const remaining = Math.max(0, x + availableW - state.cursor)
            const neededWidth =
              child._tag === 'Button'
                ? buttonPresentationOf(child, innerCtx, child.disabled !== true)
                    .glyph.length
                : 1
            const shouldWrap = state.cursor > x && remaining < neededWidth
            const targetX = shouldWrap ? x : state.cursor
            const targetY = shouldWrap ? state.rowY + state.rowMaxH : state.rowY
            const targetW = shouldWrap ? availableW : remaining
            const box = layoutNode(
              child,
              targetX,
              targetY,
              targetW,
              ids,
              options,
              innerCtx,
            )
            if (box.h === 0 && box.w === 0) {
              return state
            }
            const rowEnd = targetX + box.w - x
            return {
              cursor: targetX + box.w + row.gap,
              rowY: targetY,
              rowMaxH: shouldWrap ? box.h : Math.max(state.rowMaxH, box.h),
              widest: Math.max(state.widest, rowEnd),
              children: [...state.children, box],
            }
          },
        )
        return {
          id: ids.next('row'),
          x,
          y,
          w: Math.min(availableW, laid.widest),
          h: Array.isReadonlyArrayEmpty(laid.children)
            ? 0
            : laid.rowY - y + laid.rowMaxH,
          kind: 'Row',
          children: laid.children,
        }
      },
      Column: column => {
        const frameSpec = containerFrameOf(
          column.slot,
          undefined,
          column.children,
        )
        const innerCtx = childContextOf(ctx, column.slot, frameSpec?.skipSlotId)
        if (frameSpec !== undefined) {
          return layoutFramedContainer(
            'Column',
            frameSpec.frame,
            Column({ gap: column.gap }, ...column.children),
            0,
            x,
            y,
            availableW,
            ids,
            options,
            innerCtx,
          )
        }
        const visibleChildren = Array.filter(
          column.children,
          child => !isHiddenNode(child, innerCtx),
        )
        const laid = Array.reduce(
          visibleChildren,
          { cursor: y, children: emptyBoxes },
          (state, child) => {
            const box = layoutNode(
              child,
              x,
              state.cursor,
              availableW,
              ids,
              options,
              innerCtx,
            )
            if (box.h === 0) {
              return state
            }
            return {
              cursor: state.cursor + box.h + column.gap,
              children: [...state.children, box],
            }
          },
        )
        const used = Array.isReadonlyArrayEmpty(laid.children)
          ? 0
          : laid.cursor - column.gap - y
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
        const frameSpec = containerFrameOf(box.slot, box.layer, box.children)
        const innerCtx = childContextOf(ctx, box.slot, frameSpec?.skipSlotId)
        if (frameSpec !== undefined) {
          return layoutFramedContainer(
            'Box',
            frameSpec.frame,
            Column({ gap: 0 }, ...box.children),
            Math.max(0, box.padding - 1),
            x,
            y,
            availableW,
            ids,
            options,
            innerCtx,
          )
        }
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
          options,
          innerCtx,
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
        const emptyListLayout: Readonly<{
          children: ReadonlyArray<LayoutBox>
          rowOffset: number
          widest: number
        }> = {
          children: [],
          rowOffset: 0,
          widest: 0,
        }
        const laid = Array.reduce(
          list.items,
          emptyListLayout,
          (state, item) => {
            const itemY = y + state.rowOffset
            const checkBoxes: ReadonlyArray<LayoutBox> =
              item.check === undefined
                ? []
                : [
                    {
                      id: ids.next('check'),
                      x,
                      y: itemY,
                      w: checkGlyph(item.check).length,
                      h: 1,
                      kind: 'Button',
                      text: checkGlyph(item.check),
                      label: item.check.label,
                      ...standingInkOf(
                        {
                          ...(item.check.focused === true
                            ? { focused: true }
                            : {}),
                          isPressable: item.check.action !== undefined,
                        },
                        x,
                        checkGlyph(item.check).length,
                      ),
                      ...(item.check.action === undefined
                        ? {}
                        : {
                            action: { _tag: 'custom', id: item.check.action },
                          }),
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
            const isPressableItem =
              item.action !== undefined || item.href !== undefined
            const titleBox: LayoutBox = {
              id: ids.next('item'),
              x: titleX,
              y: itemY,
              w: titleW,
              h: 1,
              kind: 'Button',
              text: fit(title, titleW),
              label: item.title,
              ...(item.isCurrent === true ? { isCurrent: true } : {}),
              ...standingInkOf(
                { ...item, isPressable: isPressableItem },
                titleX,
                titleW,
              ),
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
              itemY,
              Math.max(0, titleAvailableW - titleW - 2),
              ids,
              options,
            )
            const rowWidth =
              rest.w > 0 ? rest.x + rest.w - x : titleBox.x + titleBox.w - x
            if (list.menu !== undefined && list.menu.key === item.key) {
              const menuBox = layoutNode(
                Row(
                  { gap: 1 },
                  ...Array.map(list.menu.items, menuItem =>
                    Button({
                      label: menuItem.label,
                      action: menuItem.action,
                      ...(menuItem.icon === undefined
                        ? {}
                        : { icon: menuItem.icon }),
                    }),
                  ),
                  Button({ label: 'Close', action: list.menu.dismissAction }),
                ),
                x + 2,
                itemY + 1,
                Math.max(0, availableW - 2),
                ids,
                options,
              )
              return {
                children: [
                  ...state.children,
                  ...checkBoxes,
                  titleBox,
                  rest,
                  menuBox,
                ],
                rowOffset: state.rowOffset + 1 + menuBox.h,
                widest: Math.max(state.widest, rowWidth, 2 + menuBox.w),
              }
            } else {
              return {
                children: [...state.children, ...checkBoxes, titleBox, rest],
                rowOffset: state.rowOffset + 1,
                widest: Math.max(state.widest, rowWidth),
              }
            }
          },
        )
        return {
          id: ids.next('list'),
          x,
          y,
          w: Math.min(availableW, laid.widest),
          h: laid.rowOffset,
          kind: 'List',
          label: list.label,
          children: laid.children,
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
        const labelWidth = labelColumnWidthOf(
          transcript.passages,
          transcript.items ?? [],
          options,
        )
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
                labelWidth,
                options,
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
              const named =
                options.activePassageBar === true
                  ? `  ${entry.item.label}`
                  : ` ${entry.item.label}`
              const shown = layoutNode(
                entry.item.node,
                x + labelWidth,
                y + state.rows,
                Math.max(1, availableW - labelWidth),
                ids,
                options,
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
          options,
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
      Lazy: lazy =>
        layoutNode(resolveLazyNode(lazy), x, y, availableW, ids, options, ctx),
    }),
  )
}

/** Lays out a UiNode tree into character-cell boxes. */
export const layoutTree = (
  root: UiNode,
  originX = 0,
  originY = 0,
  availableW = 80,
  options: LayoutOptions = defaultLayoutOptions,
): LayoutBox =>
  layoutNode(root, originX, originY, availableW, makeIds(), options)

/** Fits a string into a character width. */
export const fitText = fit

/** True when this Device paints a status row. */
export const deviceHasStatus = (device: Device): boolean =>
  statusRows(device) > 0

/** True when this Device paints a phone home indicator. */
export const deviceHasHome = (device: Device): boolean => homeRows(device) > 0

/** True when this Device paints a computer stand. */
export const deviceHasStand = (device: Device): boolean => standRows(device) > 0
