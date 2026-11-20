import type { LongPress, Slot } from 'foldkit/behavior'
import {
  bindSlots,
  holdAttributesOf,
  slotAttributesOf,
} from 'foldkit/renderers'
import {
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react'

// NOTE: this is the React painter's host, the one piece of it that knows
// parts exist. React paints in a browser, so the host is the browser's:
// `bindSlots` from Foldkit core's HTML host, run from one effect. This
// file only writes a binding as props and keeps the effect alive. It holds
// no rule: what a hold is, and what each gesture sends, are core's.

/**
 * A binding as the props of the element it is bound on.
 *
 * @example
 * ```tsx
 * <li {...slotPropsOf(binding)}>Salt Road</li>
 * ```
 */
export const slotPropsOf = (
  binding: Slot.SlotBinding,
  itemAttribute?: string,
): Readonly<Record<string, string>> =>
  Object.fromEntries(slotAttributesOf(binding, itemAttribute))

/**
 * A completed hold as the props of the element the host is bound on.
 *
 * @example
 * ```tsx
 * <ul ref={ref} {...holdPropsOf(list.hold)} />
 * ```
 */
export const holdPropsOf = (
  hold: LongPress.Signal | undefined,
): Readonly<Record<string, string>> =>
  Object.fromEntries(holdAttributesOf(hold))

/**
 * Runs the browser's host on the element `root` holds, for every bound
 * element under it, and sends each press through `press`.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLUListElement>(null)
 * useSlotHost(ref, press => onPress(pressOf(press, 'Row')))
 * ```
 */
export const useSlotHost = (
  root: RefObject<HTMLElement | null>,
  press: (press: string) => void,
): void => {
  const live = useRef(press)
  live.current = press
  useEffect(() => {
    const element = root.current
    if (element === null) {
      return
    }
    return bindSlots(element, pressed => {
      live.current(pressed)
    })
  }, [root])
}

/**
 * The host around one bound element that has no element of its own to
 * hold it, such as a Button a part bound. It adds no box to the layout.
 *
 * @example
 * ```tsx
 * <SlotHost hold={button.hold} onPress={press}>
 *   <button {...slotPropsOf(binding)}>Save</button>
 * </SlotHost>
 * ```
 */
export const SlotHost = ({
  hold,
  onPress,
  children,
}: Readonly<{
  hold: LongPress.Signal | undefined
  onPress: (press: string) => void
  children: ReactNode
}>): ReactElement => {
  const ref = useRef<HTMLSpanElement>(null)
  useSlotHost(ref, onPress)
  return (
    <span ref={ref} style={{ display: 'contents' }} {...holdPropsOf(hold)}>
      {children}
    </span>
  )
}
