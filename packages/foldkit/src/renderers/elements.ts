import { Array, Match as M } from 'effect'

import type { Entry } from '../catalog/catalog.js'
import type { IconName } from './icons.js'
import type {
  BoxNode,
  ButtonNode,
  ButtonVariant,
  ColumnNode,
  ListItem,
  ListNode,
  ProgressNode,
  RowNode,
  SeekNode,
  SpacerNode,
  TextEmphasis,
  TextImage,
  TextInputNode,
  TextNode,
  TranscriptNode,
  TranscriptPassage,
  UiNode,
} from './types.js'

/**
 * A text run. Optional `href` is a link the painters may follow. Optional
 * `label` is what a screen reader announces instead of the bare content.
 * `emphasis: 'Display'` marks the screen's headline, such as the count.
 * `copyable` marks text a person copies whole, such as a command: the web
 * selects it in one click and offers a copy button, and React Native makes
 * it selectable.
 *
 * @example
 * ```typescript
 * Text('3', { label: 'count 3', emphasis: 'Display' })
 * Text('pnpm --filter counter-tui-example start', { mono: true, copyable: true })
 * ```
 */
export const Text = (
  content: string,
  props: Readonly<{
    href?: string
    label?: string
    mono?: boolean
    dim?: boolean
    emphasis?: TextEmphasis
    copyable?: boolean
    width?: number
    image?: TextImage
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
  readonly keys?: ReadonlyArray<string>
  readonly because?: string
  readonly variant?: ButtonVariant
  readonly icon?: IconName
  readonly isIconOnly?: boolean
  readonly isCurrent?: boolean
  readonly disabled?: boolean
}): ButtonNode => ({
  _tag: 'Button',
  label: props.label,
  ...(props.token === undefined ? {} : { token: props.token }),
  ...(props.action === undefined ? {} : { action: props.action }),
  ...(props.keys === undefined || props.keys.length === 0
    ? {}
    : { keys: props.keys }),
  ...(props.because === undefined ? {} : { because: props.because }),
  ...(props.variant === undefined ? {} : { variant: props.variant }),
  ...(props.icon === undefined ? {} : { icon: props.icon }),
  ...(props.isIconOnly === undefined ? {} : { isIconOnly: props.isIconOnly }),
  ...(props.isCurrent === undefined ? {} : { isCurrent: props.isCurrent }),
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
        Enabled: () =>
          Button({ label: entry.label, action: entry.tag, keys: entry.keys }),
        Disabled: ({ because }) =>
          Button({
            label: entry.label,
            action: entry.tag,
            keys: entry.keys,
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
  props: Readonly<{ padding?: number; isDock?: boolean }> = {},
  ...children: ReadonlyArray<UiNode>
): BoxNode => ({
  _tag: 'Box',
  padding: props.padding ?? 0,
  ...(props.isDock === undefined ? {} : { isDock: props.isDock }),
  children,
})

/**
 * A bar pinned to the bottom of the screen, such as a now-playing bar
 * above the tabs.
 *
 * @example
 * ```typescript
 * Dock(nowPlaying, Row({}, ...tabs))
 * ```
 */
export const Dock = (...children: ReadonlyArray<UiNode>): BoxNode =>
  Box({ isDock: true }, ...children)

/**
 * A seek bar over a timeline. `step` defaults to 1.
 *
 * @example
 * ```typescript
 * Seek({ value: 723_000, max: 33_181_000, step: 1000, action: 'SeekTo', label: 'Place in the book', valueText: '12:03 of 9:13:01' })
 * ```
 */
export const Seek = (
  props: Readonly<{
    value: number
    min?: number
    max: number
    step?: number
    action: string
    label: string
    valueText: string
    disabled?: boolean
  }>,
): SeekNode => ({
  _tag: 'Seek',
  value: props.value,
  ...(props.min === undefined ? {} : { min: props.min }),
  max: props.max,
  step: props.step ?? 1,
  action: props.action,
  label: props.label,
  valueText: props.valueText,
  ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
})

/**
 * Words to read along with, in passages, each word pressable.
 *
 * @example
 * ```typescript
 * Transcript({
 *   label: 'Transcript',
 *   action: 'SeekToWord',
 *   emptyText: 'No transcript yet',
 *   passages: [{ key: 's1', label: '0:19', words: [{ token: 'w0', text: 'Evocation', isCurrent: true }] }],
 * })
 * ```
 */
export const Transcript = (
  props: Readonly<{
    label: string
    action: string
    emptyText: string
    passages: ReadonlyArray<TranscriptPassage>
  }>,
): TranscriptNode => ({
  _tag: 'Transcript',
  label: props.label,
  action: props.action,
  emptyText: props.emptyText,
  passages: props.passages,
})

/**
 * How far along something is.
 *
 * @example
 * ```typescript
 * Progress({ value: 2_400_000, max: 33_181_000, label: '8 hours 33 minutes left' })
 * ```
 */
export const Progress = (
  props: Readonly<{ value: number; max: number; label: string }>,
): ProgressNode => ({
  _tag: 'Progress',
  value: props.value,
  max: props.max,
  label: props.label,
})

/**
 * Rows a person picks from, each pressable as a whole.
 *
 * @example
 * ```typescript
 * List({
 *   label: 'Your books',
 *   items: [{ key: 'a-new-earth', title: 'A New Earth', lines: ['Eckhart Tolle', '9:09:44 left'], action: 'Open:a-new-earth' }],
 * })
 * ```
 */
export const List = (
  props: Readonly<{ label: string; items: ReadonlyArray<ListItem> }>,
): ListNode => ({
  _tag: 'List',
  label: props.label,
  items: props.items,
})
