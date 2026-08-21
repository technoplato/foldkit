/**
 * Atomic design primitives as a hyperscript tree (JSX-equivalent without custom factory).
 *
 * Atoms: Text, TextInput, Spacer
 * Molecules: Button, Field (label+input via composition)
 * Organisms/templates/screens: built in countersProduct.ts
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

/** Atom: text run */
export const Text = (
  content: string,
  props: { mono?: boolean; dim?: boolean; width?: number } = {},
): UiNode => node('text', { ...props, content })

/** Atom: fixed blank rows */
export const Spacer = (rows = 1): UiNode => node('spacer', { rows })

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
