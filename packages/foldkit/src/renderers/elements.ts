import { Array, Match as M } from 'effect'

import type { Entry } from '../catalog/catalog.js'
import type { IconName } from './icons.js'
import type {
  BoxLayer,
  BoxNode,
  ButtonNode,
  ButtonVariant,
  ColumnNode,
  ListItem,
  ListNode,
  PlainPart,
  ProgressNode,
  ReferencePart,
  RowNode,
  SeekNode,
  SpacerNode,
  TextEmbed,
  TextEmphasis,
  TextImage,
  TextInputNode,
  TextNode,
  TextPart,
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
 * it selectable. `embed` shows a live view from another site in place of
 * the words, where the host draws one, such as a book's preview.
 *
 * @example
 * ```typescript
 * Text('3', { label: 'count 3', emphasis: 'Display' })
 * Text('pnpm --filter counter-tui-example start', { mono: true, copyable: true })
 * Text('Page 3 in Google Books', {
 *   href: 'https://books.google.com/books?id=l2WMBAAAQBAJ&pg=PA3',
 *   embed: { kind: 'GoogleBooksPreview', params: { volume: 'ISBN:9780544553729', page: '3' }, width: 640, height: 560 },
 * })
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
    embed?: TextEmbed
  }> = {},
): TextNode => ({
  _tag: 'Text',
  content,
  ...props,
})

/**
 * Plain words inside a Text made of parts.
 *
 * @example
 * ```typescript
 * RichText([Plain('Fixed by '), Reference({ label: '#1358', href: '/issues/1358' })])
 * ```
 */
export const Plain = (text: string): PlainPart => ({ _tag: 'Plain', text })

/**
 * A reference to another thing inside a Text: an Issue, a recording's line,
 * a commit. Graphical painters show it as a chip that links to `href`, with
 * `detail` on hover.
 *
 * @example
 * ```typescript
 * Reference({
 *   label: '#1358',
 *   title: 'issues CLI burns CPU',
 *   state: 'PartiallyDone',
 *   kind: 'Issue',
 *   href: '/issues/1358',
 *   detail: ['Filed 2026-10-29'],
 * })
 * ```
 */
export const Reference = (
  props: Readonly<{
    label: string
    title?: string
    state?: string
    kind?: string
    href?: string
    detail?: ReadonlyArray<string>
  }>,
): ReferencePart => ({ _tag: 'Reference', ...props })

/**
 * The words a painter without chips draws for a part: plain words as they
 * are, a reference as its label, title and state, such as
 * `#1358 issues CLI burns CPU [PartiallyDone]`.
 */
export const partWords = (part: TextPart): string =>
  M.value(part).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Plain: ({ text }) => text,
      Reference: reference =>
        Array.join(
          [
            reference.label,
            ...(reference.title === undefined ? [] : [reference.title]),
            ...(reference.state === undefined ? [] : [`[${reference.state}]`]),
          ],
          ' ',
        ),
    }),
  )

/**
 * A Text made of parts: plain words and references. Its content is the parts'
 * words, so a terminal or a screen reader reads the same sentence a chip
 * painter shows.
 *
 * @example
 * ```typescript
 * RichText([
 *   Plain('Fixed by '),
 *   Reference({ label: '#1358', title: 'issues CLI burns CPU', state: 'PartiallyDone', href: '/issues/1358' }),
 * ])
 * // content: 'Fixed by #1358 issues CLI burns CPU [PartiallyDone]'
 * ```
 */
export const RichText = (
  parts: ReadonlyArray<TextPart>,
  props: Readonly<{
    label?: string
    dim?: boolean
    emphasis?: TextEmphasis
    width?: number
  }> = {},
): TextNode => ({
  _tag: 'Text',
  content: Array.join(Array.map(parts, partWords), ''),
  parts,
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

/**
 * A text field. With `action`, submitting it presses the Action with the
 * text as its choice.
 *
 * @example
 * ```typescript
 * TextInput({ value: '', placeholder: 'New reminder', action: 'AddReminder', label: 'New reminder in Groceries' })
 * // Enter after typing `Buy milk` presses `AddReminder:Buy milk`
 * TextInput({ value: notes, placeholder: 'Notes', action: 'SetNotes', clearAction: 'ClearNotes' })
 * ```
 */
export const TextInput = (props: {
  readonly value: string
  readonly placeholder?: string
  readonly focused?: boolean
  readonly width?: number
  readonly token?: string
  readonly action?: string
  readonly clearAction?: string
  readonly label?: string
  readonly focusToken?: string
  readonly blurToken?: string
}): TextInputNode => ({
  _tag: 'TextInput',
  value: props.value,
  ...(props.placeholder === undefined
    ? {}
    : { placeholder: props.placeholder }),
  ...(props.focused === undefined ? {} : { focused: props.focused }),
  ...(props.width === undefined ? {} : { width: props.width }),
  ...(props.token === undefined ? {} : { token: props.token }),
  ...(props.action === undefined ? {} : { action: props.action }),
  ...(props.clearAction === undefined
    ? {}
    : { clearAction: props.clearAction }),
  ...(props.label === undefined ? {} : { label: props.label }),
  ...(props.focusToken === undefined ? {} : { focusToken: props.focusToken }),
  ...(props.blurToken === undefined ? {} : { blurToken: props.blurToken }),
})

/** Fixed blank rows. */
export const Spacer = (rows = 1): SpacerNode => ({
  _tag: 'Spacer',
  rows,
})

/**
 * A horizontal stack. With `isBoard` it is columns a person scrolls sideways.
 *
 * @example
 * ```typescript
 * Row({ isBoard: true }, Column({}, Text('Open'), openIssues), Column({}, Text('Blocked'), blockedIssues))
 * ```
 */
export const Row = (
  props: Readonly<{ gap?: number; isBoard?: boolean }> = {},
  ...children: ReadonlyArray<UiNode>
): RowNode => ({
  _tag: 'Row',
  gap: props.gap ?? 1,
  ...(props.isBoard === undefined ? {} : { isBoard: props.isBoard }),
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

/**
 * A padded box. With `layer` it shows above the page: a Dialog, such as a
 * command palette, or a Panel at the side, such as a peek.
 *
 * @example
 * ```typescript
 * Box(
 *   { layer: { kind: 'Dialog', label: 'Command palette', dismissToken: 'palette-close' } },
 *   TextInput({ value: '', placeholder: 'Type a command or an Issue', focused: true }),
 * )
 * ```
 */
export const Box = (
  props: Readonly<{
    padding?: number
    isDock?: boolean
    layer?: BoxLayer
  }> = {},
  ...children: ReadonlyArray<UiNode>
): BoxNode => ({
  _tag: 'Box',
  padding: props.padding ?? 0,
  ...(props.isDock === undefined ? {} : { isDock: props.isDock }),
  ...(props.layer === undefined ? {} : { layer: props.layer }),
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
  props: Readonly<{
    label: string
    items: ReadonlyArray<ListItem>
    dropAction?: string
  }>,
): ListNode => ({
  _tag: 'List',
  label: props.label,
  items: props.items,
  ...(props.dropAction === undefined ? {} : { dropAction: props.dropAction }),
})
