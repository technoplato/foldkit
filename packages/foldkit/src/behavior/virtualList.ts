import { Number as EffectNumber, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'
import * as VirtualWindow from './virtualWindow.js'

// NOTE: this is the core VirtualList Part (Widget #24 of 54, Scribe #2663).
// It composes `VirtualWindow` in one framework-free Machine and Part
// declaration covering packages/ui VirtualList and Zag async-list windowing.
// Its state (`Unmeasured` | `Measured` with scroll offset and
// monotonic-versioned `pendingScroll`) lives in the Model, synced by default
// (`Navigation` category, `Pace.Synced`) with a device-only option, and
// projects reference-stable SlotBindings (`Viewport`, `Content`, `Item`)
// rendered by HTML, React, and React Native generic hosts with zero
// VirtualList-specific painter logic.

// CONSTANTS

/** Default overscan buffer in rows (`5`, inherited from `VirtualWindow`). */
export const defaultOverscan: number = VirtualWindow.defaultOverscan

// SCHEMAS

/** Programmatic scroll alignment (`Start`, `Center`, `End`, or `Auto`). */
export const ScrollAlignment = VirtualWindow.ScrollAlignment
/** Programmatic scroll alignment. */
export type ScrollAlignment = VirtualWindow.ScrollAlignment

/** No programmatic scroll is currently in flight. */
export const Idle = ts('Idle')
/** No programmatic scroll is currently in flight. */
export type Idle = typeof Idle.Type

/** A programmatic scroll to `index` (`targetScrollTop`) at monotonic `version` is pending. */
export const ScrollingToIndex = ts('ScrollingToIndex', {
  index: S.Number,
  targetScrollTop: S.Number,
  align: ScrollAlignment,
  version: S.Number,
})
/** A programmatic scroll is currently pending. */
export type ScrollingToIndex = typeof ScrollingToIndex.Type

/** State of any in-flight programmatic scroll (`Idle` or `ScrollingToIndex`). */
export const PendingScroll = S.Union([Idle, ScrollingToIndex])
/** State of any in-flight programmatic scroll. */
export type PendingScroll = typeof PendingScroll.Type

/**
 * Read-only configuration supplied to the VirtualList chart and projection from
 * the Program's Model. Provide `itemHeights` for variable-height rows or rely
 * on uniform `rowHeightPx`.
 */
export const Props = S.Struct({
  id: S.String,
  itemCount: S.Number,
  rowHeightPx: S.Number,
  itemHeights: S.optionalKey(S.Array(S.Number)),
  overscan: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the VirtualList chart and projection. */
export type Props = typeof Props.Type

// STATE

const sharedFields = {
  scrollTop: S.Number,
  pendingScroll: PendingScroll,
  pendingScrollVersion: S.Number,
}

/** The scrollable viewport has not been measured yet; no visible slice can be computed. */
export const Unmeasured = ts('Unmeasured', sharedFields)
/** The scrollable viewport has not been measured yet. */
export type Unmeasured = typeof Unmeasured.Type

/** The scrollable viewport has been measured at `containerHeight` pixels. */
export const Measured = ts('Measured', {
  ...sharedFields,
  containerHeight: S.Number,
})
/** The scrollable viewport has been measured. */
export type Measured = typeof Measured.Type

/** Where a VirtualList Part stands: `Unmeasured` or `Measured`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Unmeasured, Measured])
/** Where a VirtualList Part stands. */
export type State = typeof State.Type

/** Initial VirtualList state: unmeasured at `scrollTop: 0` with `pendingScroll: Idle()`. */
export const initial: State = Unmeasured({
  scrollTop: 0,
  pendingScroll: Idle(),
  pendingScrollVersion: 0,
})

/** Creates an initial `Unmeasured` VirtualList state starting at `initialScrollTop`. */
export const initialAt = (initialScrollTop: number): State =>
  Unmeasured({
    scrollTop: Math.max(0, initialScrollTop),
    pendingScroll: Idle(),
    pendingScrollVersion: 0,
  })

/** Creates an initial `Measured` VirtualList state with `containerHeight` and optional `initialScrollTop`. */
export const initialMeasured = (
  containerHeight: number,
  initialScrollTop: number = 0,
): State =>
  Measured({
    containerHeight: Math.max(0, containerHeight),
    scrollTop: Math.max(0, initialScrollTop),
    pendingScroll: Idle(),
    pendingScrollVersion: 0,
  })

// ACTIONS

/** Programmatically scrolls the virtualized list so `index` is brought into view. */
export const ScrollToIndex = Catalog.action('ScrollToIndex', {
  fields: {
    index: S.Number,
    align: S.optionalKey(ScrollAlignment),
  },
  what: 'Scrolls the virtualized list to bring the chosen row into view',
  why: 'To jump directly to a specific row in a large dataset',
  meta: { label: 'Scroll to row', keys: [] },
})

/** Scrolls the virtualized list back to the very top. */
export const ScrollToTop = Catalog.action('ScrollToTop', {
  what: 'Scrolls the virtualized list to the beginning',
  why: 'To return to the first entries immediately',
  meta: { label: 'Scroll to top', keys: ['Home'] },
})

/** Scrolls the virtualized list to its final rows. */
export const ScrollToBottom = Catalog.action('ScrollToBottom', {
  what: 'Scrolls the virtualized list to the final entries',
  why: 'To jump straight to the end of the dataset',
  meta: { label: 'Scroll to bottom', keys: ['End'] },
})

/** The Catalog Actions a VirtualList Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ScrollToIndex,
  ScrollToTop,
  ScrollToBottom,
]

// MESSAGES

/** The painter reported a new viewport scroll offset in pixels. */
export const ScrolledViewport = m('ScrolledViewport', {
  scrollTop: S.Number,
})

/** The painter reported the viewport's measured height in pixels. */
export const MeasuredViewport = m('MeasuredViewport', {
  containerHeight: S.Number,
})

/** The viewport unmounted or cleared its measurement, returning to `Unmeasured`. */
export const UnmeasuredViewport = m('UnmeasuredViewport')

/** The painter finished applying a programmatic scroll issued at `version`. */
export const CompletedApplyScroll = m('CompletedApplyScroll', {
  version: S.Number,
})

/** Every Message the VirtualList chart handles. */
export const Message = S.Union([
  ScrollToIndex,
  ScrollToTop,
  ScrollToBottom,
  ScrolledViewport,
  MeasuredViewport,
  UnmeasuredViewport,
  CompletedApplyScroll,
])
/** Every Message the VirtualList chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the VirtualList Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the scrollable viewport element id from a base `id`. */
export const viewportId = (id: string): string => `${id}-viewport`

/** Derives the virtualized list content container element id from a base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives a virtualized item element id from a base `id` and logical `index`. */
export const itemId = (id: string, index: number | string): string =>
  `${id}-item-${String(index)}`

// CONFIGURATION & READINGS

/** Resolved item count (`props.itemHeights.length` when variable heights are given, else `props.itemCount`). */
export const itemCountOf = (
  props: Pick<Props, 'itemCount' | 'itemHeights'>,
): number =>
  props.itemHeights !== undefined
    ? props.itemHeights.length
    : Math.max(0, Math.floor(props.itemCount))

/** Resolved overscan buffer in rows (`5` by default). */
export const overscanOf = (props: Pick<Props, 'overscan'> = {}): number =>
  Math.max(0, Math.floor(props.overscan ?? defaultOverscan))

/** Prefix-sum offsets when `props.itemHeights` is provided, else `Option.none()`. */
export const offsetsOf = (
  props: Pick<Props, 'itemHeights'>,
): Option.Option<ReadonlyArray<number>> =>
  props.itemHeights === undefined
    ? Option.none()
    : Option.some(VirtualWindow.prefixOffsets(props.itemHeights))

/** Total scrollable content height in pixels. */
export const totalHeightOf = (
  props: Pick<Props, 'itemCount' | 'rowHeightPx' | 'itemHeights'>,
): number =>
  Option.match(offsetsOf(props), {
    onNone: () => itemCountOf(props) * Math.max(0, props.rowHeightPx),
    onSome: VirtualWindow.totalHeightOf,
  })

/** True when the viewport has been measured. */
export const isMeasured = (state: State): boolean => state._tag === 'Measured'

/** True when the viewport has not yet been measured. */
export const isUnmeasured = (state: State): boolean =>
  state._tag === 'Unmeasured'

/** Measured viewport height in pixels, or `Option.none()` while `Unmeasured`. */
export const containerHeightOf = (state: State): Option.Option<number> =>
  state._tag === 'Measured' ? Option.some(state.containerHeight) : Option.none()

/** Current vertical scroll offset in pixels. */
export const scrollTopOf = (state: State): number => state.scrollTop

/** Current pending programmatic scroll state (`Idle` or `ScrollingToIndex`). */
export const pendingScrollOf = (state: State): PendingScroll =>
  state.pendingScroll

/** True while a programmatic scroll to an index is still pending application. */
export const isScrollingToIndex = (state: State): boolean =>
  state.pendingScroll._tag === 'ScrollingToIndex'

/** Current monotonic programmatic scroll version counter. */
export const pendingScrollVersionOf = (state: State): number =>
  state.pendingScrollVersion

/**
 * Computes the visible {@link VirtualWindow.Window} slice for `state` and
 * `props`, returning `Option.none()` while `Unmeasured`. Uses variable-height
 * binary-search windowing when `props.itemHeights` is provided, and uniform
 * fixed-height windowing otherwise.
 */
export const visibleWindowOf = (
  state: State,
  props: Props,
): Option.Option<VirtualWindow.Window> => {
  if (state._tag === 'Unmeasured') {
    return Option.none()
  }
  const overscan = overscanOf(props)
  return Option.match(offsetsOf(props), {
    onNone: () =>
      Option.some(
        VirtualWindow.computeFixedWindow({
          itemCount: itemCountOf(props),
          rowHeightPx: props.rowHeightPx,
          scrollTop: state.scrollTop,
          containerHeight: state.containerHeight,
          overscan,
        }),
      ),
    onSome: offsets =>
      Option.some(
        VirtualWindow.computeVariableWindow({
          offsets,
          scrollTop: state.scrollTop,
          containerHeight: state.containerHeight,
          overscan,
        }),
      ),
  })
}

// INTERNAL TRANSITION HELPERS

const resolvedIndexAndScrollTop = (
  state: State,
  props: Props,
  requestedIndex: number,
  align: ScrollAlignment,
): Readonly<{ index: number; targetScrollTop: number }> => {
  const count = itemCountOf(props)
  if (count === 0) {
    return { index: 0, targetScrollTop: 0 }
  }
  const clampedIndex = VirtualWindow.clampIndex(
    Math.floor(requestedIndex),
    count - 1,
  )
  const containerHeight = state._tag === 'Measured' ? state.containerHeight : 0
  const targetScrollTop = Option.match(offsetsOf(props), {
    onNone: () =>
      VirtualWindow.scrollOffsetForIndex({
        index: clampedIndex,
        itemCount: count,
        rowHeightPx: props.rowHeightPx,
        containerHeight,
        currentScrollTop: state.scrollTop,
        align,
      }),
    onSome: offsets =>
      VirtualWindow.scrollOffsetForIndex({
        index: clampedIndex,
        offsets,
        containerHeight,
        currentScrollTop: state.scrollTop,
        align,
      }),
  })
  return { index: clampedIndex, targetScrollTop }
}

const estimatedIndexAtScrollTop = (scrollTop: number, props: Props): number =>
  Option.match(offsetsOf(props), {
    onNone: () =>
      props.rowHeightPx <= 0 ? 0 : Math.floor(scrollTop / props.rowHeightPx),
    onSome: offsets => VirtualWindow.findFirstVisibleIndex(offsets, scrollTop),
  })

const applyProgrammaticScroll = <S extends State>(
  state: S,
  props: Props,
  requestedIndex: number,
  align: ScrollAlignment,
): Readonly<{
  scrollTop: number
  pendingScroll: PendingScroll
  pendingScrollVersion: number
}> => {
  const nextVersion = EffectNumber.increment(state.pendingScrollVersion)
  const { index, targetScrollTop } = resolvedIndexAndScrollTop(
    state,
    props,
    requestedIndex,
    align,
  )
  return {
    scrollTop: targetScrollTop,
    pendingScrollVersion: nextVersion,
    pendingScroll: ScrollingToIndex({
      index,
      targetScrollTop,
      align,
      version: nextVersion,
    }),
  }
}

// CHART

/**
 * Builds the VirtualList Machine chart starting in `initialState`: tracks
 * viewport measurement (`Unmeasured` <-> `Measured`), scroll offset updates,
 * programmatic scroll-to-index/top/bottom with monotonic version cancellation,
 * and initial scroll restoration on first measurement.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Unmeasured: {
        on: {
          ScrolledViewport: to('Unmeasured', ({ state, message }) =>
            Unmeasured({
              scrollTop: Math.max(0, message.scrollTop),
              pendingScroll: state.pendingScroll,
              pendingScrollVersion: state.pendingScrollVersion,
            }),
          ),
          MeasuredViewport: to('Measured', ({ state, message, context }) => {
            const containerHeight = Math.max(0, message.containerHeight)
            const needsInitialRestore =
              state.scrollTop > 0 && state.pendingScroll._tag === 'Idle'
            if (needsInitialRestore) {
              const nextVersion = EffectNumber.increment(
                state.pendingScrollVersion,
              )
              return Measured({
                containerHeight,
                scrollTop: state.scrollTop,
                pendingScrollVersion: nextVersion,
                pendingScroll: ScrollingToIndex({
                  index: estimatedIndexAtScrollTop(state.scrollTop, context),
                  targetScrollTop: state.scrollTop,
                  align: 'Start',
                  version: nextVersion,
                }),
              })
            } else {
              return Measured({
                containerHeight,
                scrollTop: state.scrollTop,
                pendingScroll: state.pendingScroll,
                pendingScrollVersion: state.pendingScrollVersion,
              })
            }
          }),
          UnmeasuredViewport: [ignore()],
          ScrollToIndex: to('Unmeasured', ({ state, message, context }) =>
            Unmeasured(
              applyProgrammaticScroll(
                state,
                context,
                message.index,
                message.align ?? 'Start',
              ),
            ),
          ),
          ScrollToTop: to('Unmeasured', ({ state, context }) =>
            Unmeasured(applyProgrammaticScroll(state, context, 0, 'Start')),
          ),
          ScrollToBottom: to('Unmeasured', ({ state, context }) =>
            Unmeasured(
              applyProgrammaticScroll(
                state,
                context,
                Math.max(0, itemCountOf(context) - 1),
                'End',
              ),
            ),
          ),
          CompletedApplyScroll: [
            when(
              (state, message) =>
                state.pendingScroll._tag === 'ScrollingToIndex' &&
                message.version === state.pendingScrollVersion,
              'Unmeasured',
              ({ state }) =>
                Unmeasured({
                  scrollTop: state.scrollTop,
                  pendingScroll: Idle(),
                  pendingScrollVersion: state.pendingScrollVersion,
                }),
            ),
            ignore(),
          ],
        },
      },
      Measured: {
        on: {
          ScrolledViewport: to('Measured', ({ state, message }) =>
            Measured({
              containerHeight: state.containerHeight,
              scrollTop: Math.max(0, message.scrollTop),
              pendingScroll: state.pendingScroll,
              pendingScrollVersion: state.pendingScrollVersion,
            }),
          ),
          MeasuredViewport: to('Measured', ({ state, message }) =>
            Measured({
              containerHeight: Math.max(0, message.containerHeight),
              scrollTop: state.scrollTop,
              pendingScroll: state.pendingScroll,
              pendingScrollVersion: state.pendingScrollVersion,
            }),
          ),
          UnmeasuredViewport: to('Unmeasured', ({ state }) =>
            Unmeasured({
              scrollTop: state.scrollTop,
              pendingScroll: state.pendingScroll,
              pendingScrollVersion: state.pendingScrollVersion,
            }),
          ),
          ScrollToIndex: to('Measured', ({ state, message, context }) =>
            Measured({
              containerHeight: state.containerHeight,
              ...applyProgrammaticScroll(
                state,
                context,
                message.index,
                message.align ?? 'Start',
              ),
            }),
          ),
          ScrollToTop: to('Measured', ({ state, context }) =>
            Measured({
              containerHeight: state.containerHeight,
              ...applyProgrammaticScroll(state, context, 0, 'Start'),
            }),
          ),
          ScrollToBottom: to('Measured', ({ state, context }) =>
            Measured({
              containerHeight: state.containerHeight,
              ...applyProgrammaticScroll(
                state,
                context,
                Math.max(0, itemCountOf(context) - 1),
                'End',
              ),
            }),
          ),
          CompletedApplyScroll: [
            when(
              (state, message) =>
                state.pendingScroll._tag === 'ScrollingToIndex' &&
                message.version === state.pendingScrollVersion,
              'Measured',
              ({ state }) =>
                Measured({
                  containerHeight: state.containerHeight,
                  scrollTop: state.scrollTop,
                  pendingScroll: Idle(),
                  pendingScrollVersion: state.pendingScrollVersion,
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default VirtualList Machine chart starting in `Unmeasured`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ScrollToIndex: pace,
  ScrollToTop: pace,
  ScrollToBottom: pace,
  ScrolledViewport: pace,
  MeasuredViewport: pace,
  UnmeasuredViewport: pace,
  CompletedApplyScroll: pace,
})

/** Default synchronization: every VirtualList Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a VirtualList kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The three painted slots of a VirtualList Part:
 * - `Viewport`: the scrollable region (`role="region"`, scroll position value bounds).
 * - `Content`: the list container (`role="listbox"`, `hidden` while `Unmeasured`).
 * - `Item`: one visible virtualized row (`role="option"`, `aria-current` when targeted by an active scroll).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Viewport: {
    role: 'Region',
    focus: 'Container',
    gestures: [],
  },
  Content: {
    role: 'Listbox',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Option',
    focus: 'None',
    gestures: [],
  },
}

const isTargetedItem = (state: State, choice: string): boolean =>
  state.pendingScroll._tag === 'ScrollingToIndex' &&
  String(state.pendingScroll.index) === choice

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Viewport') {
    return {
      id: viewportId(props.id),
      tabIndex: 0,
      valueMin: 0,
      valueMax: totalHeightOf(props),
      valueNow: state.scrollTop,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
    }
  } else if (slot === 'Content') {
    return {
      id: contentId(props.id),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(isMeasured(state) ? {} : { isHidden: true }),
    }
  } else if (slot === 'Item') {
    const choice = Option.getOrElse(maybeChoice, () => '0')
    return {
      id: itemId(props.id, choice),
      isCurrent: isTargetedItem(state, choice),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens VirtualList on: clears any in-flight `pendingScroll`
 * back to `Idle` while preserving `scrollTop`, `containerHeight`, and
 * `pendingScrollVersion`.
 */
export const atRest = (state: State): State =>
  state._tag === 'Measured'
    ? Measured({
        containerHeight: state.containerHeight,
        scrollTop: state.scrollTop,
        pendingScroll: Idle(),
        pendingScrollVersion: state.pendingScrollVersion,
      })
    : Unmeasured({
        scrollTop: state.scrollTop,
        pendingScroll: Idle(),
        pendingScrollVersion: state.pendingScrollVersion,
      })

// PART FACTORY

/** Options for customizing a VirtualList Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this VirtualList device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial vertical scroll offset in pixels (`0` by default). */
  initialScrollTop?: number
  /** Optional initial measured height in pixels (starts `Unmeasured` when omitted). */
  initialContainerHeight?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a VirtualList {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's VirtualList local to one device.
 *
 * @example
 * ```typescript
 * const RowsList = VirtualList.make({ name: 'RowsList' })
 * const LocalList = VirtualList.deviceOnly({ name: 'LocalList' })
 * ```
 */
const initialStateOf = (options: MakeOptions): State => {
  if (options.initialContainerHeight !== undefined) {
    return initialMeasured(
      options.initialContainerHeight,
      options.initialScrollTop ?? 0,
    )
  } else if (options.initialScrollTop !== undefined) {
    return initialAt(options.initialScrollTop)
  } else {
    return initial
  }
}

export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState = initialStateOf(options)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'VirtualList',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })
}

/**
 * Shorthand for a VirtualList Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.initialScrollTop === undefined
      ? {}
      : { initialScrollTop: options.initialScrollTop }),
    ...(options.initialContainerHeight === undefined
      ? {}
      : { initialContainerHeight: options.initialContainerHeight }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced VirtualList Part (`name: 'VirtualList'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
