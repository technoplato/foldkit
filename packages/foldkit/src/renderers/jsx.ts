import { Array, Option, Predicate, Record } from 'effect'

import type { SlotBinding } from '../behavior/slot.js'
import * as Elements from './elements.js'
import type { IconName } from './icons.js'
import type {
  BoxLayer,
  BoxMeasure,
  BoxNode,
  ButtonNode,
  ButtonVariant,
  ColumnNode,
  ItemMenu,
  ListFilter,
  ListItem,
  ListNode,
  ProgressNode,
  RowArrangement,
  RowNode,
  SeekLanding,
  SeekNode,
  SpacerNode,
  TextEmbed,
  TextEmphasis,
  TextImage,
  TextInputNode,
  TextNode,
  TextPart,
  TranscriptBookmark,
  TranscriptClock,
  TranscriptItem,
  TranscriptNode,
  TranscriptPassage,
  TranscriptPassageMenu,
  TranscriptWordMenu,
  UiNode,
} from './types.js'

// NOTE: zero-React JSX-to-UiNode factory (Scribe #2656). Produces plain
// Foldkit UiNode trees directly with zero reconciler or framework runtime so
// static CLIs and cross-platform screens can write JSX that paints through
// HTML, React, React Native, and `renderCli`.

const defaultSeparatorWidth = 40

const fragmentNodes = new WeakSet<UiNode>()

// CHILDREN

/** Any value accepted inside JSX children slots. */
export type Child =
  | UiNode
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<Child>

/** Inline text children accepted by text-only JSX elements. */
export type TextChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<TextChild>

/** A pure JSX function component returning a Foldkit {@link Child}. */
export type FunctionComponent<Props = Readonly<Record<string, never>>> = (
  props: Props,
) => Child

const isUiNode = (value: unknown): value is UiNode =>
  Predicate.isObject(value) &&
  Predicate.hasProperty(value, '_tag') &&
  Predicate.isString(value._tag)

/**
 * Flattens nested JSX children into a flat list of `UiNode`s: skips `null`,
 * `undefined`, and booleans, turns strings/numbers into `Text` nodes, and
 * splices `Fragment` nodes seamlessly into their enclosing container.
 */
export const normalizeChildren = (child?: Child): ReadonlyArray<UiNode> => {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return []
  } else if (typeof child === 'string') {
    return child.length === 0 ? [] : [Elements.Text(child)]
  } else if (typeof child === 'number') {
    return [Elements.Text(child.toString())]
  } else if (isUiNode(child)) {
    if (fragmentNodes.has(child) && child._tag === 'Column') {
      return child.children
    } else {
      return [child]
    }
  } else if (Array.isArray(child)) {
    return Array.flatMap(child, normalizeChildren)
  } else {
    return []
  }
}

const normalizeTextParts = (child?: TextChild): ReadonlyArray<string> => {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return []
  } else if (typeof child === 'string') {
    return [child]
  } else if (typeof child === 'number') {
    return [child.toString()]
  } else if (Array.isArray(child)) {
    return Array.flatMap(child, normalizeTextParts)
  } else {
    return []
  }
}

const textFromChildren = (child?: TextChild): string =>
  Array.join(normalizeTextParts(child), '')

const singleNodeOf = (child?: Child): UiNode => {
  const flat = normalizeChildren(child)
  return Array.match(flat, {
    onEmpty: () => {
      const empty = Elements.Column({ gap: 0 })
      fragmentNodes.add(empty)
      return empty
    },
    onNonEmpty: nodes => {
      if (nodes.length === 1) {
        return Array.headNonEmpty(nodes)
      } else {
        const grouped = Elements.Column({ gap: 0 }, ...nodes)
        fragmentNodes.add(grouped)
        return grouped
      }
    },
  })
}

// PROPS

/** Props for {@link Fragment}. */
export type FragmentProps = Readonly<{
  children?: Child
}>

/** Props for {@link Column}. */
export type ColumnProps = Readonly<{
  gap?: number
  slot?: SlotBinding
  children?: Child
}>

/** Props for {@link Row}. */
export type RowProps = Readonly<{
  gap?: number
  isBoard?: boolean
  arrange?: RowArrangement
  slot?: SlotBinding
  children?: Child
}>

/** Props for {@link Box}. */
export type BoxProps = Readonly<{
  padding?: number
  isDock?: boolean
  layer?: BoxLayer
  measure?: BoxMeasure
  slot?: SlotBinding
  children?: Child
}>

/** Props for {@link Text}. */
export type TextProps = Readonly<{
  content?: string
  children?: TextChild
  href?: string
  label?: string
  mono?: boolean
  dim?: boolean
  emphasis?: TextEmphasis
  copyable?: boolean
  width?: number
  image?: TextImage
  embed?: TextEmbed
}>

/** Props for {@link Heading}. */
export type HeadingProps = Readonly<{
  content?: string
  children?: TextChild
  emphasis?: TextEmphasis
  label?: string
  dim?: boolean
  width?: number
}>

/** Props for {@link Button}. */
export type ButtonProps = Readonly<{
  label?: string
  children?: TextChild
  token?: string
  action?: string
  keys?: ReadonlyArray<string>
  because?: string
  description?: string
  why?: string
  variant?: ButtonVariant
  icon?: IconName
  isIconOnly?: boolean
  isCurrent?: boolean
  disabled?: boolean
  focused?: boolean
  slot?: SlotBinding
}>

/** Props for {@link TextInput}. */
export type TextInputProps = Readonly<{
  value: string
  placeholder?: string
  focused?: boolean
  width?: number
  token?: string
  action?: string
  clearAction?: string
  againAction?: string
  label?: string
  focusToken?: string
  blurToken?: string
  slot?: SlotBinding
}>

/** Props for {@link List}. */
export type ListProps = Readonly<{
  label: string
  items: ReadonlyArray<ListItem>
  dropAction?: string
  columns?: ReadonlyArray<string>
  filter?: ListFilter
  menu?: ItemMenu
}>

/** Props for {@link Spacer}. */
export type SpacerProps = Readonly<{
  rows?: number
}>

/** Props for {@link Dock}. */
export type DockProps = Readonly<{
  slot?: SlotBinding
  children?: Child
}>

/** Semantic tone for {@link Badge}. */
export type BadgeTone =
  | 'Default'
  | 'Accent'
  | 'Positive'
  | 'Warning'
  | 'Danger'
  | 'Muted'

/** Props for {@link Badge}. */
export type BadgeProps = Readonly<{
  text?: string
  children?: TextChild
  label?: string
  tone?: BadgeTone
  dim?: boolean
}>

/** Props for {@link Separator}. */
export type SeparatorProps = Readonly<{
  width?: number
  char?: string
  label?: string
}>

/** Props for {@link Progress}. */
export type ProgressProps = Readonly<{
  value: number
  max: number
  label: string
}>

/** Props for {@link Seek}. */
export type SeekProps = Readonly<{
  value: number
  min?: number
  max: number
  step?: number
  action: string
  label: string
  valueText: string
  disabled?: boolean
  landings?: ReadonlyArray<SeekLanding>
}>

/** Props for {@link Transcript}. */
export type TranscriptProps = Readonly<{
  label: string
  action: string
  emptyText: string
  passages: ReadonlyArray<TranscriptPassage>
  clock?: TranscriptClock
  bookmarks?: ReadonlyArray<TranscriptBookmark>
  isFollowing?: boolean
  leaveAction?: string
  focusToken?: string
  wordMenuAction?: string
  wordMenu?: TranscriptWordMenu
  passageMenu?: TranscriptPassageMenu
  items?: ReadonlyArray<TranscriptItem>
}>

/** Props for {@link Toolbar}. */
export type ToolbarProps = Readonly<{
  start?: Child
  center?: Child
  end?: Child
}>

/** Props for {@link Split}. */
export type SplitProps = Readonly<{
  side: UiNode
  main: UiNode
}>

/** Props for {@link ReadingMeasure}. */
export type ReadingMeasureProps = Readonly<{
  children?: Child
}>

/** Props for {@link RichText}. */
export type RichTextProps = Readonly<{
  parts: ReadonlyArray<TextPart>
  label?: string
  dim?: boolean
  emphasis?: TextEmphasis
  width?: number
}>

// COMPONENTS

/**
 * Groups multiple JSX siblings without introducing a visible wrapper when
 * placed inside a `Row`, `Column`, or `Box`, and degrades cleanly to a
 * zero-gap `Column` when rendered standalone.
 */
export const Fragment = (props: FragmentProps = {}): UiNode =>
  singleNodeOf(props.children)

/** Vertical stack producing a plain Foldkit {@link ColumnNode}. */
export const Column = (props: ColumnProps = {}): ColumnNode =>
  Elements.Column(
    {
      ...(props.gap === undefined ? {} : { gap: props.gap }),
      ...(props.slot === undefined ? {} : { slot: props.slot }),
    },
    ...normalizeChildren(props.children),
  )

/** Horizontal stack producing a plain Foldkit {@link RowNode}. */
export const Row = (props: RowProps = {}): RowNode =>
  Elements.Row(
    {
      ...(props.gap === undefined ? {} : { gap: props.gap }),
      ...(props.isBoard === undefined ? {} : { isBoard: props.isBoard }),
      ...(props.arrange === undefined ? {} : { arrange: props.arrange }),
      ...(props.slot === undefined ? {} : { slot: props.slot }),
    },
    ...normalizeChildren(props.children),
  )

/** Padded container producing a plain Foldkit {@link BoxNode}. */
export const Box = (props: BoxProps = {}): BoxNode =>
  Elements.Box(
    {
      ...(props.padding === undefined ? {} : { padding: props.padding }),
      ...(props.isDock === undefined ? {} : { isDock: props.isDock }),
      ...(props.layer === undefined ? {} : { layer: props.layer }),
      ...(props.measure === undefined ? {} : { measure: props.measure }),
      ...(props.slot === undefined ? {} : { slot: props.slot }),
    },
    ...normalizeChildren(props.children),
  )

/** Text run producing a plain Foldkit {@link TextNode}. */
export const Text = (props: TextProps = {}): TextNode => {
  const content = props.content ?? textFromChildren(props.children)
  return Elements.Text(content, {
    ...(props.href === undefined ? {} : { href: props.href }),
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.mono === undefined ? {} : { mono: props.mono }),
    ...(props.dim === undefined ? {} : { dim: props.dim }),
    ...(props.emphasis === undefined ? {} : { emphasis: props.emphasis }),
    ...(props.copyable === undefined ? {} : { copyable: props.copyable }),
    ...(props.width === undefined ? {} : { width: props.width }),
    ...(props.image === undefined ? {} : { image: props.image }),
    ...(props.embed === undefined ? {} : { embed: props.embed }),
  })
}

/** Emphasized heading text (`emphasis: 'Headline'` by default) producing a {@link TextNode}. */
export const Heading = (props: HeadingProps = {}): TextNode => {
  const content = props.content ?? textFromChildren(props.children)
  return Elements.Text(content, {
    emphasis: props.emphasis ?? 'Headline',
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.dim === undefined ? {} : { dim: props.dim }),
    ...(props.width === undefined ? {} : { width: props.width }),
  })
}

/** Pressable control producing a plain Foldkit {@link ButtonNode}. */
export const Button = (props: ButtonProps): ButtonNode => {
  const base = Elements.Button({
    label: props.label ?? textFromChildren(props.children),
    ...(props.token === undefined ? {} : { token: props.token }),
    ...(props.action === undefined ? {} : { action: props.action }),
    ...(props.keys === undefined ? {} : { keys: props.keys }),
    ...(props.because === undefined ? {} : { because: props.because }),
    ...(props.description === undefined
      ? {}
      : { description: props.description }),
    ...(props.why === undefined ? {} : { why: props.why }),
    ...(props.variant === undefined ? {} : { variant: props.variant }),
    ...(props.icon === undefined ? {} : { icon: props.icon }),
    ...(props.isIconOnly === undefined ? {} : { isIconOnly: props.isIconOnly }),
    ...(props.isCurrent === undefined ? {} : { isCurrent: props.isCurrent }),
    ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
    ...(props.slot === undefined ? {} : { slot: props.slot }),
  })
  return props.focused === undefined
    ? base
    : { ...base, focused: props.focused }
}

/** Text input control producing a plain Foldkit {@link TextInputNode}. */
export const TextInput = (props: TextInputProps): TextInputNode =>
  Elements.TextInput(props)

/** Selectable row list producing a plain Foldkit {@link ListNode}. */
export const List = (props: ListProps): ListNode => Elements.List(props)

/** Fixed blank rows producing a plain Foldkit {@link SpacerNode}. */
export const Spacer = (props: SpacerProps = {}): SpacerNode =>
  Elements.Spacer(props.rows ?? 1)

/** Bottom-docked bar producing a {@link BoxNode} with `isDock: true`. */
export const Dock = (props: DockProps = {}): BoxNode =>
  Elements.Box(
    {
      isDock: true,
      ...(props.slot === undefined ? {} : { slot: props.slot }),
    },
    ...normalizeChildren(props.children),
  )

/**
 * Compact status or category chip producing a plain Foldkit {@link TextNode}
 * with a `Badge` reference part so HTML/React/RN paint a chip and static CLI
 * renders `[Label]` colored by semantic tone.
 */
export const Badge = (props: BadgeProps = {}): TextNode => {
  const text = props.text ?? textFromChildren(props.children)
  const kind =
    props.tone === undefined || props.tone === 'Default'
      ? 'Badge'
      : `Badge:${props.tone}`
  return {
    _tag: 'Text',
    content: `[${text}]`,
    parts: [Elements.Reference({ label: text, kind })],
    label: props.label ?? text,
    ...(props.dim === undefined ? {} : { dim: props.dim }),
  }
}

/** Horizontal divider rule producing a quiet {@link TextNode}. */
export const Separator = (props: SeparatorProps = {}): TextNode => {
  const char = props.char ?? '─'
  const width = Math.max(1, props.width ?? defaultSeparatorWidth)
  return Elements.Text(char.repeat(width), {
    dim: true,
    ...(props.label === undefined ? {} : { label: props.label }),
  })
}

/** Progress indicator producing a plain Foldkit {@link ProgressNode}. */
export const Progress = (props: ProgressProps): ProgressNode =>
  Elements.Progress(props)

/** Timeline seek bar producing a plain Foldkit {@link SeekNode}. */
export const Seek = (props: SeekProps): SeekNode => Elements.Seek(props)

/** Read-along transcript producing a plain Foldkit {@link TranscriptNode}. */
export const Transcript = (props: TranscriptProps): TranscriptNode =>
  Elements.Transcript(props)

/** Three-part toolbar producing a `Toolbar` {@link RowNode}. */
export const Toolbar = (props: ToolbarProps = {}): RowNode =>
  Elements.Toolbar({
    ...(props.start === undefined
      ? {}
      : { start: normalizeChildren(props.start) }),
    ...(props.center === undefined
      ? {}
      : { center: normalizeChildren(props.center) }),
    ...(props.end === undefined ? {} : { end: normalizeChildren(props.end) }),
  })

/** Two-pane split layout producing a `Split` {@link RowNode}. */
export const Split = (props: SplitProps): RowNode =>
  Elements.Split(props.side, props.main)

/** Reading-measure column producing a `Reading` {@link BoxNode}. */
export const ReadingMeasure = (props: ReadingMeasureProps = {}): BoxNode =>
  Elements.ReadingMeasure(...normalizeChildren(props.children))

/** Rich multi-part text run producing a {@link TextNode}. */
export const RichText = (props: RichTextProps): TextNode =>
  Elements.RichText(props.parts, {
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.dim === undefined ? {} : { dim: props.dim }),
    ...(props.emphasis === undefined ? {} : { emphasis: props.emphasis }),
    ...(props.width === undefined ? {} : { width: props.width }),
  })

// INTRINSICS

/** Lowercase intrinsic JSX element map supported by `foldkit/jsx-runtime`. */
export type FoldkitIntrinsicElements = Readonly<{
  column: ColumnProps
  row: RowProps
  box: BoxProps
  text: TextProps
  heading: HeadingProps
  button: ButtonProps
  input: TextInputProps
  list: ListProps
  spacer: SpacerProps
  dock: DockProps
  badge: BadgeProps
  separator: SeparatorProps
  progress: ProgressProps
  seek: SeekProps
  transcript: TranscriptProps
  toolbar: ToolbarProps
  split: SplitProps
  'reading-measure': ReadingMeasureProps
  'rich-text': RichTextProps
}>

const intrinsics: Readonly<
  Record<keyof FoldkitIntrinsicElements, (props: any) => UiNode>
> = {
  column: Column,
  row: Row,
  box: Box,
  text: Text,
  heading: Heading,
  button: Button,
  input: TextInput,
  list: List,
  spacer: Spacer,
  dock: Dock,
  badge: Badge,
  separator: Separator,
  progress: Progress,
  seek: Seek,
  transcript: Transcript,
  toolbar: Toolbar,
  split: Split,
  'reading-measure': ReadingMeasure,
  'rich-text': RichText,
}

// RUNTIME

/**
 * Automatic JSX factory (`react-jsx` single-child emission) producing a plain
 * Foldkit {@link UiNode} with zero React reconciler overhead.
 *
 * @example
 * ```typescript
 * jsx(Column, { gap: 1, children: [jsx(Heading, { children: 'Status' }), jsx(Badge, { tone: 'Positive', children: 'OK' })] })
 * ```
 */
export function jsx<K extends keyof FoldkitIntrinsicElements>(
  type: K,
  props: FoldkitIntrinsicElements[K],
  key?: string | number,
): UiNode
export function jsx<Props>(
  type: FunctionComponent<Props>,
  props: Props,
  key?: string | number,
): UiNode
export function jsx(
  type: keyof FoldkitIntrinsicElements | ((props: any) => Child),
  props: any,
  _key?: string | number,
): UiNode {
  if (typeof type === 'function') {
    const result = type(props ?? {})
    return isUiNode(result) ? result : singleNodeOf(result)
  } else {
    return Option.match(Record.get(intrinsics, type), {
      onNone: () => {
        throw new Error(`Unknown Foldkit JSX intrinsic element: "${type}"`)
      },
      onSome: build => build(props ?? {}),
    })
  }
}

/** Automatic JSX factory for static multi-child elements (`jsxs`). */
export const jsxs: typeof jsx = jsx

/** Development automatic JSX factory (`react-jsxdev`). */
export function jsxDEV<K extends keyof FoldkitIntrinsicElements>(
  type: K,
  props: FoldkitIntrinsicElements[K],
  key?: string | number,
  isStaticChildren?: boolean,
  source?: unknown,
  self?: unknown,
): UiNode
export function jsxDEV<Props>(
  type: FunctionComponent<Props>,
  props: Props,
  key?: string | number,
  isStaticChildren?: boolean,
  source?: unknown,
  self?: unknown,
): UiNode
export function jsxDEV(
  type: keyof FoldkitIntrinsicElements | ((props: any) => Child),
  props: any,
  key?: string | number,
  _isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown,
): UiNode {
  return typeof type === 'function'
    ? jsx(type, props, key)
    : jsx(type, props, key)
}

/** TypeScript JSX namespace for `"jsxImportSource": "foldkit"`. */
export namespace JSX {
  export type Element = UiNode
  export type ElementType =
    | keyof FoldkitIntrinsicElements
    | ((props: any) => Child)
  export interface ElementChildrenAttribute {
    children: {}
  }
  export interface IntrinsicAttributes {
    key?: string | number
  }
  export type IntrinsicElements = FoldkitIntrinsicElements
}
