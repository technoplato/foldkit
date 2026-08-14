import { Array, Match as M } from 'effect'

import type { Device } from './device.js'
import { Column } from './elements.js'
import type { HotspotAction, LayoutBox, UiNode } from './types.js'

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

const buttonGlyph = (label: string): string => `[ ${label} ]`

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
        const glyph = buttonGlyph(button.label)
        const w = Math.min(glyph.length, availableW)
        const action: HotspotAction | undefined = button.disabled
          ? undefined
          : { _tag: 'custom', id: button.token ?? button.label }
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
          Column({ gap: 0 }, ...box.children),
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
