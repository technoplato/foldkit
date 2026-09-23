import { Array, Match as M } from 'effect'

import type { Entry } from '../catalog/catalog.js'
import type {
  BoxNode,
  ButtonNode,
  ColumnNode,
  RowNode,
  SpacerNode,
  TextInputNode,
  TextNode,
  UiNode,
} from './types.js'

/**
 * A text run. Optional `href` is a link the painters may follow. Optional
 * `label` is what a screen reader announces instead of the bare content.
 *
 * @example
 * ```typescript
 * Text('3', { label: 'count 3' })
 * ```
 */
export const Text = (
  content: string,
  props: Readonly<{
    href?: string
    label?: string
    mono?: boolean
    dim?: boolean
    width?: number
  }> = {},
): TextNode => ({
  _tag: 'Text',
  content,
  ...props,
})

/** A pressable control. Hosts map a hit to a cause. */
export const Button = (props: {
  readonly label: string
  readonly token?: string
  readonly action?: string
  readonly because?: string
  readonly variant?: 'Primary' | 'Ghost' | 'Destructive'
  readonly disabled?: boolean
}): ButtonNode => ({
  _tag: 'Button',
  label: props.label,
  ...(props.token === undefined ? {} : { token: props.token }),
  ...(props.action === undefined ? {} : { action: props.action }),
  ...(props.because === undefined ? {} : { because: props.because }),
  ...(props.variant === undefined ? {} : { variant: props.variant }),
  ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
})

/**
 * One Button per Catalog entry, in Catalog order. A Disabled entry paints
 * as a disabled Button carrying its sentence, so every painter shows the
 * same reason.
 *
 * @example
 * ```typescript
 * Row({}, ...actionButtons(Catalog.entries(catalog, model)))
 * // count 0: [+] [-] [Reset (disabled: count is already 0)]
 * ```
 */
export const actionButtons = (
  entries: ReadonlyArray<Entry>,
): ReadonlyArray<ButtonNode> =>
  Array.map(entries, entry =>
    M.value(entry.availability).pipe(
      M.withReturnType<ButtonNode>(),
      M.tagsExhaustive({
        Enabled: () => Button({ label: entry.label, action: entry.tag }),
        Disabled: ({ because }) =>
          Button({
            label: entry.label,
            action: entry.tag,
            because,
            disabled: true,
          }),
      }),
    ),
  )

/** A Model-bound text field. */
export const TextInput = (props: {
  readonly value: string
  readonly placeholder?: string
  readonly focused?: boolean
  readonly width?: number
  readonly token?: string
}): TextInputNode => ({
  _tag: 'TextInput',
  value: props.value,
  ...(props.placeholder === undefined
    ? {}
    : { placeholder: props.placeholder }),
  ...(props.focused === undefined ? {} : { focused: props.focused }),
  ...(props.width === undefined ? {} : { width: props.width }),
  ...(props.token === undefined ? {} : { token: props.token }),
})

/** Fixed blank rows. */
export const Spacer = (rows = 1): SpacerNode => ({
  _tag: 'Spacer',
  rows,
})

/** A horizontal stack. */
export const Row = (
  props: Readonly<{ gap?: number }> = {},
  ...children: ReadonlyArray<UiNode>
): RowNode => ({
  _tag: 'Row',
  gap: props.gap ?? 1,
  children,
})

/** A vertical stack. */
export const Column = (
  props: Readonly<{ gap?: number }> = {},
  ...children: ReadonlyArray<UiNode>
): ColumnNode => ({
  _tag: 'Column',
  gap: props.gap ?? 0,
  children,
})

/** A padded box. */
export const Box = (
  props: Readonly<{ padding?: number }> = {},
  ...children: ReadonlyArray<UiNode>
): BoxNode => ({
  _tag: 'Box',
  padding: props.padding ?? 0,
  children,
})
