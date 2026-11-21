import { Array, Effect, Option, Stream } from 'effect'

import type { GestureKind, PointerKind } from '../behavior/gesture.js'
import * as Host from '../behavior/host.js'
import * as LongPress from '../behavior/longPress.js'
import * as Slot from '../behavior/slot.js'
import type { MountAction } from '../mount/index.js'

// NOTE: this is the browser's host, the one piece of the HTML painter that
// knows parts exist. It is told what to do only by the attributes a
// binding is written as, and it decides nothing: it turns the browser's
// events into the gestures a binding listens for and sends the press the
// binding gives. What a hold is, how long it takes and what the tap after
// it means are core's (`foldkit/behavior`). The React painter is a browser
// too, and runs this same function.

/**
 * What a browser recognizes itself: a click, the second button, and the
 * raw three of a pointer. It has no hold of its own, so a hold is told to
 * core's rule and core decides.
 */
export const recognizes: ReadonlyArray<GestureKind> = [
  'Pressed',
  'PressedSecondary',
  'PressedDown',
  'MovedPointerAway',
  'ReleasedPointer',
]

const SECONDARY = 'data-slot-secondary'

const HELD = 'data-slot-held'

const HOLD_DOWN = 'data-slot-hold-down'

const HOLD_AWAY = 'data-slot-hold-away'

const HOLD_UP = 'data-slot-hold-up'

const HOLD_SLACK = 'data-slot-slack'

const HOLD_POINTERS = 'data-slot-pointers'

const ITEMS = 'data-slot-items'

const DRAG = 'data-slot-drag'

const INPUT_MODE = 'inputmode'

const ENTER_KEY_HINT = 'enterkeyhint'

const AUTOCOMPLETE = 'autocomplete'

const HOLD_COUNT = 'data-hold-count'

const HOLD_PRESS = 'data-hold-press'

/**
 * A binding as the attributes a browser painter writes on the bound
 * element: the press each gesture a browser can hear sends, what to tell
 * core of a hold, and the ARIA the binding means. With `itemAttribute`
 * the element holds many items, such as a Transcript's words: each press
 * is then joined with the value that attribute has on the item under the
 * pointer, `ShowWordMenu` with `data-token="w4012"` to `ShowWordMenu:w4012`.
 *
 * @example
 * ```typescript
 * slotAttributesOf(Slot.menuAsk('ShowTitleMenu:salt-road'))
 * // [['data-slot-secondary', 'ShowTitleMenu:salt-road'],
 * //  ['data-slot-held', 'ShowTitleMenu:salt-road'],
 * //  ['data-slot-hold-down', 'fk-hold-down:ShowTitleMenu:salt-road'], ...]
 * ```
 */
export const slotAttributesOf = (
  binding: Slot.SlotBinding,
  itemAttribute?: string,
): ReadonlyArray<readonly [name: string, value: string]> => {
  const planned = Host.plan(binding, recognizes)
  const heldPress = Array.findFirst(
    binding.gestures,
    each => each.gesture === 'HeldLong',
  )
  return [
    ...Option.match(planned.maybeSecondary, {
      onNone: () => [],
      onSome: (press): ReadonlyArray<readonly [string, string]> => [
        [SECONDARY, press],
      ],
    }),
    ...Option.match(Option.all([planned.maybeHold, heldPress]), {
      onNone: () => [],
      onSome: ([hold, held]): ReadonlyArray<readonly [string, string]> => [
        [HELD, held.press],
        [HOLD_DOWN, hold.down],
        [HOLD_AWAY, hold.away],
        [HOLD_UP, hold.up],
        [HOLD_SLACK, hold.slackPx.toString()],
        [HOLD_POINTERS, Array.join(hold.pointers, ' ')],
      ],
    }),
    ...(itemAttribute === undefined
      ? []
      : [[ITEMS, itemAttribute] satisfies readonly [string, string]]),
    ...(binding.dragAxis === undefined
      ? []
      : [
          [DRAG, Slot.dragAxisNameOf(binding.dragAxis)] satisfies readonly [
            string,
            string,
          ],
        ]),
    ...(binding.inputMode === undefined
      ? []
      : [
          [
            INPUT_MODE,
            Slot.inputModeNameOf(binding.inputMode),
          ] satisfies readonly [string, string],
        ]),
    ...(binding.enterKeyHint === undefined
      ? []
      : [
          [
            ENTER_KEY_HINT,
            Slot.enterKeyHintNameOf(binding.enterKeyHint),
          ] satisfies readonly [string, string],
        ]),
    ...(binding.autofill === undefined
      ? []
      : [
          [
            AUTOCOMPLETE,
            Slot.autofillNameOf(binding.autofill),
          ] satisfies readonly [string, string],
        ]),
    ...Object.entries(Slot.ariaOf(binding)),
  ]
}

/**
 * A completed hold as the attributes a browser painter writes on the
 * element its host is mounted on, or none while nothing is held.
 *
 * @example
 * ```typescript
 * holdAttributesOf({ press: 'ShowTitleMenu:salt-road', pressCount: 3 })
 * // [['data-hold-count', '3'], ['data-hold-press', 'ShowTitleMenu:salt-road']]
 * ```
 */
export const holdAttributesOf = (
  hold: LongPress.Signal | undefined,
): ReadonlyArray<readonly [name: string, value: string]> =>
  hold === undefined
    ? []
    : [
        [HOLD_COUNT, hold.pressCount.toString()],
        ...(hold.press === undefined
          ? []
          : [[HOLD_PRESS, hold.press] satisfies readonly [string, string]]),
      ]

const pointerKindOf = (event: PointerEvent): PointerKind => {
  if (event.pointerType === 'touch') {
    return 'Touch'
  } else if (event.pointerType === 'pen') {
    return 'Pen'
  } else {
    return 'Mouse'
  }
}

type Bound = Readonly<{ element: Element; joined: (press: string) => string }>

const boundOf = (
  root: Element,
  target: EventTarget | null,
  attribute: string,
): Option.Option<Bound> => {
  if (!(target instanceof Element)) {
    return Option.none()
  }
  const element = target.closest(`[${attribute}]`)
  if (element === null || !root.contains(element)) {
    return Option.none()
  }
  const itemAttribute = element.getAttribute(ITEMS)
  if (itemAttribute === null) {
    return Option.some({ element, joined: press => press })
  }
  const token = target
    .closest(`[${itemAttribute}]`)
    ?.getAttribute(itemAttribute)
  return token === null || token === undefined
    ? Option.none()
    : Option.some({ element, joined: press => `${press}:${token}` })
}

type Sequence = Readonly<{
  x: number
  y: number
  heldPress: string
  away: string
  up: string
  slackPx: number
  isAway: boolean
}>

/**
 * Binds the browser's events on `root` for every bound element under it,
 * and sends each press through `press`. It answers the function that
 * unbinds them.
 *
 * - The second button on a bound element sends its press, in place of the
 *   browser's own menu.
 * - A finger or a pen going down on an element that listens for a hold
 *   tells core's rule: down, once when it moves off the spot by more than
 *   the binding's slack, and up. It keeps where the finger went down only
 *   until the finger lifts.
 * - When `root` says a hold completed for the press this host told, it
 *   sends that press, once for each count, the way any press is sent.
 * - While `root` says a hold completed, the next click is the hold's own:
 *   it is stopped, and core is told one was.
 *
 * @example
 * ```typescript
 * const unbind = bindSlots(listElement, press => send(toMessage(press)))
 * ```
 */
export const bindSlots = (
  root: Element,
  press: (press: string) => void,
): (() => void) => {
  const held: { maybeSequence: Option.Option<Sequence>; sentCount: string } = {
    maybeSequence: Option.none(),
    sentCount: '',
  }
  const onDown = (event: Event) => {
    if (!(event instanceof PointerEvent)) {
      return
    }
    const maybeBound = boundOf(root, event.target, HOLD_DOWN)
    if (Option.isNone(maybeBound)) {
      return
    }
    const { element, joined } = maybeBound.value
    const pointers = (element.getAttribute(HOLD_POINTERS) ?? '').split(' ')
    const down = element.getAttribute(HOLD_DOWN)
    if (!pointers.includes(pointerKindOf(event)) || down === null) {
      return
    }
    held.maybeSequence = Option.some({
      x: event.clientX,
      y: event.clientY,
      heldPress: joined(element.getAttribute(HELD) ?? ''),
      away: element.getAttribute(HOLD_AWAY) ?? '',
      up: element.getAttribute(HOLD_UP) ?? '',
      slackPx: Number(element.getAttribute(HOLD_SLACK) ?? '0'),
      isAway: false,
    })
    press(joined(down))
  }
  const onMove = (event: Event) => {
    if (Option.isSome(held.maybeSequence) && event instanceof PointerEvent) {
      const sequence = held.maybeSequence.value
      const movedPx = Math.hypot(
        event.clientX - sequence.x,
        event.clientY - sequence.y,
      )
      if (!sequence.isAway && movedPx > sequence.slackPx) {
        held.maybeSequence = Option.some({ ...sequence, isAway: true })
        press(sequence.away)
      }
    }
  }
  const onUp = () => {
    if (Option.isSome(held.maybeSequence)) {
      const { up } = held.maybeSequence.value
      held.maybeSequence = Option.none()
      press(up)
    }
  }
  const onHeld = () => {
    const count = root.getAttribute(HOLD_COUNT)
    const heldPress = root.getAttribute(HOLD_PRESS)
    if (
      count !== null &&
      heldPress !== null &&
      count !== held.sentCount &&
      Option.exists(
        held.maybeSequence,
        sequence => sequence.heldPress === heldPress,
      )
    ) {
      held.sentCount = count
      press(heldPress)
    }
  }
  const onClick = (event: Event) => {
    if (root.hasAttribute(HOLD_COUNT)) {
      event.stopPropagation()
      event.preventDefault()
      press(LongPress.swallowedPress)
    }
  }
  const onContextMenu = (event: Event) => {
    const maybeBound = boundOf(root, event.target, SECONDARY)
    if (Option.isSome(maybeBound)) {
      const { element, joined } = maybeBound.value
      const secondary = element.getAttribute(SECONDARY)
      if (secondary !== null) {
        event.preventDefault()
        press(joined(secondary))
      }
    }
  }
  const told = new MutationObserver(onHeld)
  told.observe(root, {
    attributes: true,
    attributeFilter: [HOLD_COUNT, HOLD_PRESS],
  })
  root.addEventListener('pointerdown', onDown)
  root.addEventListener('pointermove', onMove)
  root.addEventListener('pointerup', onUp)
  root.addEventListener('pointercancel', onUp)
  root.addEventListener('click', onClick, true)
  root.addEventListener('contextmenu', onContextMenu)
  onHeld()
  return () => {
    onUp()
    told.disconnect()
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerup', onUp)
    root.removeEventListener('pointercancel', onUp)
    root.removeEventListener('click', onClick, true)
    root.removeEventListener('contextmenu', onContextMenu)
  }
}

/**
 * The event the host sends the element it is mounted on for each press,
 * carrying the press in `detail`: `ShowTitleMenu:salt-road` for the second
 * button on a row, `fk-hold-down:ShowTitleMenu:salt-road` for a finger
 * going down on it. The view tells the Program through its own, current
 * handler.
 */
export const slotPressEventName = 'fk-slot-press'

/** The name of the mount a painted element with bound slots carries. */
export const slotHostMountName = 'FoldkitSlotHost'

/**
 * The mount a painted element carries when anything under it is bound to
 * a part: the browser's host. It sends the element `slotPressEventName`
 * for each press and sends the Program nothing itself, so any Program's
 * page can carry it.
 *
 * @example
 * ```typescript
 * h.ul([h.Class('fk-list'), h.OnMount(slotHostMount())], rows)
 * ```
 */
export const slotHostMount = <Message>(): MountAction<Message> => ({
  name: slotHostMountName,
  f: root =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() =>
          bindSlots(root, press => {
            root.dispatchEvent(
              new CustomEvent(slotPressEventName, { detail: press }),
            )
          }),
        ),
        unbind => Effect.sync(unbind),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})
