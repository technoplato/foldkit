/**
 * Atomic design primitives as a hyperscript tree (JSX-equivalent without custom factory).
 *
 * Lifted from examples/pis-canvas-lab/react/src/ascii-ui (thinned).
 * Atoms: Text, TextInput, Spacer, Image
 * Layout: VStack/HStack (aliased as Column/Row)
 */
import type {
  ChangeHandler,
  HotspotAction,
  PressHandler,
  UiNode,
} from './types.js'

const node = (
  kind: UiNode['kind'],
  props: Record<string, unknown>,
  children: UiNode[] = [],
): UiNode => ({
  kind,
  props,
  children: children.filter(Boolean),
})

/** Atom: vertical stack */
export const VStack = (
  props: { gap?: number; flex?: number } = {},
  ...children: UiNode[]
): UiNode => node('vstack', props, children)

/** Atom: horizontal stack */
export const HStack = (
  props: { gap?: number; flex?: number } = {},
  ...children: UiNode[]
): UiNode => node('hstack', props, children)

/** Alias: vertical stack (covers / title stacks). */
export const Column = VStack

/** Alias: horizontal stack (cover beside title). */
export const Row = HStack

/** Atom: text run */
export const Text = (
  content: string,
  props: { mono?: boolean; dim?: boolean; width?: number } = {},
): UiNode => node('text', { ...props, content })

/** Atom: fixed blank rows */
export const Spacer = (rows = 1): UiNode => node('spacer', { rows })

/** Atom: raster placeholder. ASCII paint uses alt initials + a + frame; src is for hosts that decode. */
export const Image = (props: {
  src: string
  alt: string
  cols?: number
  rows?: number
}): UiNode =>
  node('image', {
    src: props.src,
    alt: props.alt,
    cols: props.cols ?? 5,
    rows: props.rows ?? 3,
  })

/** Molecule: pressable control */
export const Button = (props: {
  label: string
  onPress: PressHandler
  action?: HotspotAction
  variant?: 'primary' | 'ghost' | 'destructive'
  disabled?: boolean
}): UiNode =>
  node('button', {
    label: props.label,
    onPress: props.onPress,
    action: props.action,
    variant: props.variant ?? 'ghost',
    disabled: props.disabled ?? false,
  })

/** Atom: text field (Model-bound value) */
export const TextInput = (props: {
  value: string
  onChange: ChangeHandler
  placeholder?: string
  focused?: boolean
  width?: number
  actionId?: string
}): UiNode => node('textinput', props)

/** Organism chrome: phone frame around content */
export const Phone = (
  props: { cols?: number; title?: string; time?: string } = {},
  ...children: UiNode[]
): UiNode =>
  node(
    'phone',
    { cols: props.cols ?? 28, title: props.title, time: props.time ?? '9:41' },
    children,
  )

/** Generic padded box */
export const Box = (
  props: { padding?: number } = {},
  ...children: UiNode[]
): UiNode => node('box', props, children)
