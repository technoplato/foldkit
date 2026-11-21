import { Option } from 'effect'
import { type Gesture, Host, type Slot } from 'foldkit/behavior'

import { type Paint, pressOf } from './paint.js'

// NOTE: this is the phone painter's host, the one piece of it that knows
// parts exist. React Native recognizes a hold itself, so the host tells
// core nothing about a finger going down: it turns a binding into the
// `onLongPress` the platform calls, and that press is the Action. It holds
// no rule, no timer and no state.

/**
 * What a phone recognizes itself: a tap and a hold. It has no second
 * button, so a binding's `PressedSecondary` is not heard here.
 */
export const recognizes: ReadonlyArray<Gesture.GestureKind> = [
  'Pressed',
  'HeldLong',
]

/** What the host adds to the pressable a painter already draws. */
export type HostProps = Readonly<{
  onLongPress?: () => void
  accessibilityRole?: 'switch' | 'radio' | 'tab' | 'menuitem' | 'button'
  accessibilityState?: Readonly<{
    selected?: boolean
    checked?: boolean | 'mixed'
    expanded?: boolean
    disabled?: boolean
  }>
}>

/** What the host adds to a container View a part bound. */
export type ContainerHostProps = Readonly<{
  nativeID?: string
  accessibilityRole?: 'tablist' | 'menu' | 'radiogroup' | 'alert'
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive'
  accessibilityLabel?: string
  accessibilityElementsHidden?: boolean
  importantForAccessibility?: 'no-hide-descendants'
  accessibilityState?: HostProps['accessibilityState']
}>

/** What the host adds to a text input a part bound. */
export type TextInputHostProps = Readonly<{
  nativeID?: string
  accessibilityLabel?: string
  editable?: boolean
  accessibilityState?: HostProps['accessibilityState']
}>

const stateOf = (
  binding: Slot.SlotBinding,
): Pick<HostProps, 'accessibilityState'> => {
  const selected =
    binding.isSelected ??
    binding.isCurrent ??
    (typeof binding.isPressed === 'boolean' ? binding.isPressed : undefined)
  const checked =
    binding.isChecked ?? (binding.isPressed === 'mixed' ? 'mixed' : undefined)
  const state = {
    ...(selected === undefined ? {} : { selected }),
    ...(checked === undefined ? {} : { checked }),
    ...(binding.isExpanded === undefined
      ? {}
      : { expanded: binding.isExpanded }),
    ...(binding.isDisabled === undefined
      ? {}
      : { disabled: binding.isDisabled }),
  }
  return Object.keys(state).length === 0 ? {} : { accessibilityState: state }
}

const pressableRoleOf = (
  role: Slot.Role | undefined,
): 'switch' | 'radio' | 'tab' | 'menuitem' | 'button' | undefined => {
  if (role === 'Switch') {
    return 'switch'
  } else if (role === 'Radio') {
    return 'radio'
  } else if (role === 'Tab') {
    return 'tab'
  } else if (role === 'MenuItem') {
    return 'menuitem'
  } else if (role === 'Button') {
    return 'button'
  } else {
    return undefined
  }
}

const containerRoleOf = (
  role: Slot.Role | undefined,
): 'tablist' | 'menu' | 'radiogroup' | 'alert' | undefined => {
  if (role === 'TabList') {
    return 'tablist'
  } else if (role === 'Menu') {
    return 'menu'
  } else if (role === 'RadioGroup') {
    return 'radiogroup'
  } else if (role === 'Alert') {
    return 'alert'
  } else {
    return undefined
  }
}

const liveRegionOf = (
  live: Slot.LivePoliteness | undefined,
): 'none' | 'polite' | 'assertive' | undefined => {
  if (live === 'Off') {
    return 'none'
  } else if (live === 'Polite') {
    return 'polite'
  } else if (live === 'Assertive') {
    return 'assertive'
  } else {
    return undefined
  }
}

/**
 * The accessibility props a binding adds to a container `View` (`Row`,
 * `Column`, or `Box`).
 */
export const containerPropsOf = (
  maybeBinding: Option.Option<Slot.SlotBinding>,
): ContainerHostProps =>
  Option.match(maybeBinding, {
    onNone: () => ({}),
    onSome: binding => {
      const role = containerRoleOf(binding.role)
      const liveRegion = liveRegionOf(binding.live)
      return {
        ...(binding.id === undefined ? {} : { nativeID: binding.id }),
        ...(role === undefined ? {} : { accessibilityRole: role }),
        ...(liveRegion === undefined
          ? {}
          : { accessibilityLiveRegion: liveRegion }),
        ...(binding.label === undefined
          ? {}
          : { accessibilityLabel: binding.label }),
        ...(binding.isHidden === true
          ? {
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants',
            }
          : {}),
        ...stateOf(binding),
      }
    },
  })

/**
 * The accessibility and editability props a binding adds to a `TextInput`.
 */
export const textInputPropsOf = (
  maybeBinding: Option.Option<Slot.SlotBinding>,
): TextInputHostProps =>
  Option.match(maybeBinding, {
    onNone: () => ({}),
    onSome: binding => ({
      ...(binding.id === undefined ? {} : { nativeID: binding.id }),
      ...(binding.label === undefined
        ? {}
        : { accessibilityLabel: binding.label }),
      ...(binding.isDisabled === true || binding.isReadOnly === true
        ? { editable: false }
        : {}),
      ...stateOf(binding),
    }),
  })

/**
 * The props a binding adds to a pressable: the hold the platform
 * recognizes, sending the binding's press, and what the part says of the
 * element, for a screen reader. With `token` the element is one of many,
 * such as a Transcript's word, and the press is joined with it:
 * `ShowWordMenu` with `w4012` is `ShowWordMenu:w4012`.
 *
 * @example
 * ```tsx
 * <Pressable {...hostPropsOf(Slot.ofItem(item), paint, item.title)} />
 * ```
 */
export const hostPropsOf = (
  maybeBinding: Option.Option<Slot.SlotBinding>,
  paint: Paint,
  label: string,
  token?: string,
): HostProps =>
  Option.match(maybeBinding, {
    onNone: () => ({}),
    onSome: binding => {
      const role = pressableRoleOf(binding.role)
      return {
        ...(role === undefined ? {} : { accessibilityRole: role }),
        ...stateOf(binding),
        ...Option.match(Host.plan(binding, recognizes).maybeHeld, {
          onNone: () => ({}),
          onSome: press => ({
            onLongPress: () => {
              paint.onPress(
                pressOf(
                  token === undefined ? press : `${press}:${token}`,
                  label,
                ),
              )
            },
          }),
        }),
      }
    },
  })
