import type { HotspotAction, LayoutBox, UiNode } from './types.js'

let idSeq = 0
const nextId = (prefix: string) => `${prefix}-${++idSeq}`

const measureText = (s: string, maxW: number) =>
  Math.min(s.length, Math.max(0, maxW))

const prop = <T>(props: Record<string, unknown>, key: string, fallback: T): T =>
  (props[key] as T | undefined) ?? fallback

/**
 * ASCII cover glyph: + frame with first letters of `alt`.
 * Does not decode JPEG/PNG; `src` is ignored here.
 */
const imageGlyph = (alt: string, cols: number, rows: number): string[] => {
  const letters =
    alt
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word[0]!.toUpperCase())
      .join('') || '+'
  if (rows < 2 || cols < 2) {
    const line = letters.padEnd(cols).slice(0, cols)
    return Array.from({ length: Math.max(1, rows) }, (_, i) =>
      i === 0 ? line : ' '.repeat(cols),
    )
  }
  const innerW = cols - 2
  const innerH = rows - 2
  const edge = `+${'-'.repeat(innerW)}+`
  const mid: string[] = []
  for (let r = 0; r < innerH; r++) {
    const slice = letters.slice(r * innerW, r * innerW + innerW)
    mid.push(`|${slice.padEnd(innerW).slice(0, innerW)}|`)
  }
  return [edge, ...mid, edge]
}

/** Layout UiNode tree into character-cell boxes. */
export function layoutTree(
  root: UiNode,
  originX = 0,
  originY = 0,
  availableW = 80,
): LayoutBox {
  idSeq = 0
  return layoutNode(root, originX, originY, availableW)
}

function layoutNode(
  n: UiNode,
  x: number,
  y: number,
  availableW: number,
): LayoutBox {
  switch (n.kind) {
    case 'text': {
      const content = String(prop(n.props, 'content', ''))
      const widthProp = prop<number | undefined>(n.props, 'width', undefined)
      const w = widthProp ?? measureText(content, availableW)
      const text =
        content.length > w ? content.slice(0, Math.max(0, w)) : content
      return {
        id: nextId('text'),
        x,
        y,
        w,
        h: 1,
        kind: 'text',
        text: text.padEnd(w).slice(0, w),
        children: [],
      }
    }
    case 'spacer': {
      const rows = Number(prop(n.props, 'rows', 1))
      return {
        id: nextId('spacer'),
        x,
        y,
        w: availableW,
        h: rows,
        kind: 'spacer',
        children: [],
      }
    }
    case 'button': {
      const label = String(prop(n.props, 'label', ''))
      const disabled = Boolean(prop(n.props, 'disabled', false))
      const glyph = `[ ${label} ]`
      const w = Math.min(glyph.length, availableW)
      const action = disabled
        ? undefined
        : (prop<HotspotAction | undefined>(n.props, 'action', undefined) ?? {
            _tag: 'custom' as const,
            id: label,
          })
      const box: LayoutBox = {
        id: nextId('btn'),
        x,
        y,
        w,
        h: 1,
        kind: 'button',
        text: glyph.slice(0, w),
        label,
        children: [],
      }
      if (action) box.action = action
      return box
    }
    case 'textinput': {
      const value = String(prop(n.props, 'value', ''))
      const placeholder = String(prop(n.props, 'placeholder', ''))
      const focused = Boolean(prop(n.props, 'focused', false))
      const width = Math.min(
        Number(prop(n.props, 'width', availableW)),
        availableW,
      )
      const body = value.length > 0 ? value : placeholder
      const shown = (focused ? body + '▌' : body).padEnd(width).slice(0, width)
      const actionId = prop<string | undefined>(n.props, 'actionId', undefined)
      const box: LayoutBox = {
        id: nextId('input'),
        x,
        y,
        w: width,
        h: 1,
        kind: 'textinput',
        text: shown,
        label: 'input',
        children: [],
      }
      if (actionId) box.action = { _tag: 'custom', id: actionId }
      return box
    }
    case 'image': {
      const alt = String(prop(n.props, 'alt', ''))
      const cols = Number(prop(n.props, 'cols', 5))
      const rows = Number(prop(n.props, 'rows', 3))
      const w = Math.min(Math.max(1, cols), Math.max(0, availableW))
      const h = Math.max(1, rows)
      return {
        id: nextId('image'),
        x,
        y,
        w,
        h,
        kind: 'image',
        lines: imageGlyph(alt, w, h),
        children: [],
      }
    }
    case 'hstack': {
      // flex is accepted on HStack/Row props but unused. Leftover-cell grow is a
      // rabbit hole (the first child currently sees remaining width). Image uses
      // explicit cols/rows, so Row(Image, Column(title, author)) is enough.
      const gap = Number(prop(n.props, 'gap', 1))
      let cx = x
      let maxH = 1
      const children: LayoutBox[] = []
      for (const child of n.children) {
        const remaining = Math.max(0, x + availableW - cx)
        if (remaining <= 0) break
        const box = layoutNode(child, cx, y, remaining)
        children.push(box)
        cx += box.w + gap
        maxH = Math.max(maxH, box.h)
      }
      const w = Math.min(availableW, Math.max(0, cx - gap - x))
      return {
        id: nextId('hstack'),
        x,
        y,
        w: w > 0 ? w : availableW,
        h: maxH,
        kind: 'hstack',
        children,
      }
    }
    case 'vstack': {
      // flex unused — see hstack comment.
      const gap = Number(prop(n.props, 'gap', 0))
      let cy = y
      const children: LayoutBox[] = []
      for (const child of n.children) {
        const box = layoutNode(child, x, cy, availableW)
        children.push(box)
        cy += box.h + gap
      }
      return {
        id: nextId('vstack'),
        x,
        y,
        w: availableW,
        h: Math.max(0, cy - gap - y),
        kind: 'vstack',
        children,
      }
    }
    case 'box': {
      const pad = Number(prop(n.props, 'padding', 0))
      const inner = layoutNode(
        { kind: 'vstack', props: { gap: 0 }, children: n.children },
        x + pad,
        y + pad,
        Math.max(0, availableW - pad * 2),
      )
      return {
        id: nextId('box'),
        x,
        y,
        w: availableW,
        h: inner.h + pad * 2,
        kind: 'box',
        children: [inner],
      }
    }
    case 'phone': {
      const cols = Number(prop(n.props, 'cols', 28))
      const time = String(prop(n.props, 'time', '9:41'))
      const title = prop<string | undefined>(n.props, 'title', undefined)
      // ASCII-only status (no emoji / box drawing — keeps 1 cell = 1 glyph)
      const status = ` .  .  .          ${time} * `
      const statusBox: LayoutBox = {
        id: nextId('status'),
        x: x + 1,
        y: y + 1,
        w: cols,
        h: 1,
        kind: 'text',
        text: status.padEnd(cols).slice(0, cols),
        children: [],
      }
      let bodyY = y + 2
      const bodyChildren: LayoutBox[] = [statusBox]
      if (title) {
        bodyChildren.push({
          id: nextId('title'),
          x: x + 1,
          y: bodyY,
          w: cols,
          h: 1,
          kind: 'text',
          text: ` ${title}`.padEnd(cols).slice(0, cols),
          children: [],
        })
        bodyY += 1
      }
      const content = layoutNode(
        { kind: 'vstack', props: { gap: 0 }, children: n.children },
        x + 1,
        bodyY,
        cols,
      )
      bodyChildren.push(content)
      const innerH = content.y + content.h - (y + 1)
      const h = innerH + 2
      return {
        id: nextId('phone'),
        x,
        y,
        w: cols + 2,
        h,
        kind: 'phone',
        children: bodyChildren,
      }
    }
    default:
      return {
        id: nextId('empty'),
        x,
        y,
        w: availableW,
        h: 0,
        kind: 'box',
        children: [],
      }
  }
}
