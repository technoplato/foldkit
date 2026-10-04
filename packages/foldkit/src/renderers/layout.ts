import { Array, Match as M, Option } from 'effect'

import type { Device } from './device.js'
import { Column, Row, Text } from './elements.js'
import { iconGlyphs } from './icons.js'
import type {
  ButtonNode,
  HotspotAction,
  LayoutBox,
  ListItem,
  ProgressNode,
  SeekNode,
  TranscriptNode,
  TranscriptPassage,
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

const itemTitleGlyph = (item: ListItem): string => {
  if (item.focused === true) {
    return `› ${item.title}`
  } else if (item.isCurrent === true) {
    return `• ${item.title}`
  } else {
    return `  ${item.title}`
  }
}

const passageLabelWidth = 8

const wordGlyph = (word: Readonly<{ text: string; isCurrent?: boolean }>) =>
  word.isCurrent === true ? `[${word.text}]` : word.text

const wrappedWords = (
  words: ReadonlyArray<string>,
  width: number,
): ReadonlyArray<string> =>
  Array.reduce(words, Array.empty<string>(), (lines, word) =>
    Array.match(lines, {
      onEmpty: () => [word],
      onNonEmpty: nonEmpty => {
        const last = Array.lastNonEmpty(nonEmpty)
        return `${last} ${word}`.length <= width
          ? [...Array.initNonEmpty(nonEmpty), `${last} ${word}`]
          : [...nonEmpty, word]
      },
    }),
  )

const passageLines = (
  passage: TranscriptPassage,
  availableW: number,
): ReadonlyArray<string> => {
  const marker = passage.isCurrent === true ? '›' : ' '
  const label = `${marker}${passage.label}`.padEnd(passageLabelWidth, ' ')
  const textWidth = Math.max(1, availableW - passageLabelWidth)
  return [
    ...(passage.heading === undefined
      ? []
      : ['', passage.heading.toUpperCase()]),
    ...Array.map(
      wrappedWords(Array.map(passage.words, wordGlyph), textWidth),
      (line, index) =>
        `${index === 0 ? label : ' '.repeat(passageLabelWidth)}${line}`,
    ),
  ]
}

const transcriptLines = (
  transcript: TranscriptNode,
  availableW: number,
): ReadonlyArray<string> =>
  Array.match(transcript.passages, {
    onEmpty: () => [transcript.emptyText],
    onNonEmpty: passages =>
      Array.flatMap(passages, passage => passageLines(passage, availableW)),
  })

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
          ...(action === undefined ? {} : { action }),
          children: [],
        }
      },
      TextInput: input => {
        const width = Math.min(input.width ?? availableW, availableW)
        const body =
          input.value.length > 0 ? input.value : (input.placeholder ?? '')
        const shown = input.focused === true ? `${body}▌` : body
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
          label: 'input',
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
          const title = itemTitleGlyph(item)
          const titleW = measureText(title, availableW)
          const titleBox: LayoutBox = {
            id: ids.next('item'),
            x,
            y: y + index,
            w: titleW,
            h: 1,
            kind: 'Button',
            text: fit(title, titleW),
            label: item.title,
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
          const detail = Array.join(item.lines ?? [], ' · ')
          const rest = layoutNode(
            Row(
              { gap: 2 },
              ...(detail === '' ? [] : [Text(detail, { dim: true })]),
              ...(item.trailing ?? []),
            ),
            x + titleW + 2,
            y + index,
            Math.max(0, availableW - titleW - 2),
            ids,
          )
          return { titleBox, rest }
        })
        return {
          id: ids.next('list'),
          x,
          y,
          w: availableW,
          h: rows.length,
          kind: 'List',
          label: list.label,
          children: Array.flatMap(rows, ({ titleBox, rest }) => [
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
        const lines = transcriptLines(transcript, availableW)
        const children = Array.map(lines, (line, index) => ({
          id: ids.next('text'),
          x,
          y: y + index,
          w: measureText(line, availableW),
          h: 1,
          kind: 'Text' as const,
          text: fit(line, measureText(line, availableW)),
          children: [],
        }))
        return {
          id: ids.next('transcript'),
          x,
          y,
          w: Array.reduce(children, 0, (max, child) => Math.max(max, child.w)),
          h: lines.length,
          kind: 'Transcript',
          label: transcript.label,
          children,
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
