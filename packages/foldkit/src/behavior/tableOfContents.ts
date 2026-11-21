import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core TableOfContents Part (Widget #39 of 54, Scribe #2678).
// It models document outline tracking and pure scroll-spy active heading
// resolution in one framework-free Machine and Part declaration covering Zag
// toc semantics. Its state (`Active({ maybeActiveId })`) lives in the Model,
// synced by default (`Navigation` category, `Pace.Sampled` on `ObserveScroll`,
// `Pace.Synced()` on discrete heading selection), with `TableOfContents.make`
// and `TableOfContents.deviceOnly()` options. Reference-stable SlotBindings
// (`Root`, `Item` with `isCurrent`) render across HTML, React, and React
// Native generic hosts with zero TableOfContents-specific painter logic.

// SCHEMAS & CONSTANTS

/** Default activation line offset in pixels below `scrollTop` (`0`). */
export const defaultOffsetPx = 0

/** Default scroll observation sampling interval in milliseconds (`50`). */
export const defaultSampleMs: number = defaultPace.dragSampleMs

/** Default accessible label for the TableOfContents landmark region. */
export const defaultLabel = 'Table of contents'

/** One heading entry in a document table of contents, as plain data. */
export const TocHeading = S.Struct({
  id: S.String,
  label: S.String,
  depth: S.Number,
})
/** One heading entry in a document table of contents. */
export type TocHeading = typeof TocHeading.Type

/** Map from heading `id` to its vertical offset in pixels within the scroll container. */
export const HeadingPositions = S.Record(S.String, S.Number)
/** Map from heading `id` to its vertical offset in pixels within the scroll container. */
export type HeadingPositions = typeof HeadingPositions.Type

/**
 * Read-only props supplied to the TableOfContents chart and projection from
 * the Program's Model. The ordered heading list and activation offset stay out
 * of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  headings: S.Array(TocHeading),
  offsetPx: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  sampleMs: S.optionalKey(S.Number),
})
/** Read-only props supplied to the TableOfContents chart and projection. */
export type Props = typeof Props.Type

// STATE

/** Active table-of-contents state tracking the currently highlighted heading id, if any. */
export const Active = ts('Active', {
  maybeActiveId: S.Option(S.String),
})
/** Active table-of-contents state. */
export type Active = typeof Active.Type

/** Where a TableOfContents Part stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Active])
/** Where a TableOfContents Part stands. */
export type State = typeof State.Type

/** Initial TableOfContents state: no active heading selected yet. */
export const initial: State = Active({ maybeActiveId: Option.none() })

/** Creates an initial TableOfContents state with `headingId` marked active. */
export const initialActive = (headingId: string): State =>
  Active({ maybeActiveId: Option.some(headingId) })

// ACTIONS

/** Explicitly selects a heading by `id` in the table of contents. */
export const SelectHeading = Catalog.action('SelectHeading', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'heading',
    prompt: 'Select which heading?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No heading is available',
  },
  what: 'Selects a heading in the table of contents',
  why: 'To jump directly to that section of the document',
  meta: { label: 'Select heading', keys: [] },
})

/** Clears the active heading highlight. */
export const ClearActiveHeading = Catalog.action('ClearActiveHeading', {
  what: 'Clears the active heading highlight',
  why: 'To reset section tracking when leaving the outline',
  meta: { label: 'Clear active heading', keys: [] },
})

/** The Catalog Actions a TableOfContents Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectHeading,
  ClearActiveHeading,
]

// MESSAGES

/**
 * Observes the current scroll position and measured heading offsets, updating
 * the active heading via {@link resolveActiveHeading}. Synced via `Pace.Sampled`.
 */
export const ObserveScroll = m('ObserveScroll', {
  scrollTop: S.Number,
  positions: HeadingPositions,
  offsetPx: S.optionalKey(S.Number),
})

/**
 * Observes a set of currently visible heading ids (for example from an
 * intersection observer), activating the first matching heading in document order.
 */
export const ObserveVisibleHeadings = m('ObserveVisibleHeadings', {
  visibleIds: S.Array(S.String),
})

/** Every Message the TableOfContents chart handles. */
export const Message = S.Union([
  SelectHeading,
  ClearActiveHeading,
  ObserveScroll,
  ObserveVisibleHeadings,
])
/** Every Message the TableOfContents chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the TableOfContents Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the table-of-contents root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one table-of-contents item element id from a base `id` and `headingId`. */
export const itemId = (id: string, headingId: string): string =>
  `${id}-item-${headingId}`

// PURE SCROLL-SPY & READINGS

/** Resolved scroll activation offset in pixels (`0` by default). */
export const offsetPxOf = (props: Pick<Props, 'offsetPx'> = {}): number =>
  props.offsetPx ?? defaultOffsetPx

/** Resolved accessible landmark label (`'Table of contents'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/**
 * Pure scroll-spy resolver: given ordered `headings`, measured vertical
 * `positions` (heading id to top offset in pixels), the viewport's `scrollTop`,
 * and an activation `offsetPx`, returns the id of the last heading in document
 * order whose position is at or above `scrollTop + offsetPx`, or `Option.none()`
 * when no heading has reached that threshold.
 *
 * @example
 * ```typescript
 * const headings = [
 *   { id: 'intro', label: 'Intro', depth: 1 },
 *   { id: 'usage', label: 'Usage', depth: 2 },
 * ]
 * resolveActiveHeading(headings, { intro: 0, usage: 300 }, 250, 0) // Option.some('intro')
 * resolveActiveHeading(headings, { intro: 0, usage: 300 }, 250, 60) // Option.some('usage')
 * ```
 */
export const resolveActiveHeading = (
  headings: ReadonlyArray<TocHeading>,
  positions: HeadingPositions,
  scrollTop: number,
  offsetPx: number = defaultOffsetPx,
): Option.Option<string> => {
  if (Array.isReadonlyArrayEmpty(headings)) {
    return Option.none()
  }
  const threshold = scrollTop + offsetPx
  return Array.reduce(
    headings,
    Option.none<string>(),
    (maybeActive, heading) => {
      const top = positions[heading.id]
      if (top !== undefined && Number.isFinite(top) && top <= threshold) {
        return Option.some(heading.id)
      } else {
        return maybeActive
      }
    },
  )
}

/**
 * Resolves the first heading in document order whose id appears in `visibleIds`,
 * or `Option.none()` when none match.
 */
export const resolveVisibleHeading = (
  headings: ReadonlyArray<TocHeading>,
  visibleIds: ReadonlyArray<string>,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(headings, heading =>
      Array.contains(visibleIds, heading.id),
    ),
    heading => heading.id,
  )

/** Currently active heading id, or `Option.none()`. */
export const activeIdOf = (state: State): Option.Option<string> =>
  state.maybeActiveId

/**
 * Index of the active heading inside `props.headings`, or `Option.none()` when
 * no heading is active or the active id is not present in `props.headings`.
 *
 * @example
 * ```typescript
 * activeIndexOf(initialActive('usage'), props) // Option.some(1)
 * activeIndexOf(initial, props) // Option.none()
 * ```
 */
export const activeIndexOf = (
  state: State,
  props: Pick<Props, 'headings'>,
): Option.Option<number> =>
  Option.flatMap(state.maybeActiveId, activeId =>
    Array.findFirstIndex(props.headings, heading => heading.id === activeId),
  )

/** The active {@link TocHeading} entry in `props.headings`, or `Option.none()`. */
export const activeHeadingOf = (
  state: State,
  props: Pick<Props, 'headings'>,
): Option.Option<TocHeading> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Array.get(props.headings, index),
  )

/** True when `headingId` matches the currently active heading. */
export const isHeadingActive = (state: State, headingId: string): boolean =>
  Option.contains(state.maybeActiveId, headingId)

const headingById = (
  props: Pick<Props, 'headings'>,
  id: string,
): Option.Option<TocHeading> =>
  Array.findFirst(props.headings, heading => heading.id === id)

// CHART

/**
 * Builds the TableOfContents Machine chart starting in `initialState`: handles
 * scroll-spy observations, visible-heading observations, explicit heading
 * selection, and clearing the active heading.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Active: {
        on: {
          SelectHeading: [
            when(
              (_state, message, context) =>
                Option.isSome(headingById(context, message.id)),
              'Active',
              ({ message }) =>
                Active({ maybeActiveId: Option.some(message.id) }),
            ),
            ignore(),
          ],
          ClearActiveHeading: to('Active', () =>
            Active({ maybeActiveId: Option.none() }),
          ),
          ObserveScroll: to('Active', ({ message, context }) =>
            Active({
              maybeActiveId: resolveActiveHeading(
                context.headings,
                message.positions,
                message.scrollTop,
                message.offsetPx ?? offsetPxOf(context),
              ),
            }),
          ),
          ObserveVisibleHeadings: [
            when(
              (_state, message, context) =>
                resolveVisibleHeading(context.headings, message.visibleIds),
              'Active',
              ({ guardValue }) =>
                Active({ maybeActiveId: Option.some(guardValue) }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default TableOfContents Machine chart starting with no active heading. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the TableOfContents sync table using `Pace.Sampled({ everyMs })` on
 * `ObserveScroll` and `Pace.Synced()` on discrete selection and visibility
 * messages.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectHeading: Synced(),
  ClearActiveHeading: Synced(),
  ObserveScroll: Sampled({ everyMs: sampleMs }),
  ObserveVisibleHeadings: Synced(),
})

/** Default synchronization: `ObserveScroll` sampled at 50 ms, discrete messages immediate. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a TableOfContents kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectHeading: Device({ because }),
  ClearActiveHeading: Device({ because }),
  ObserveScroll: Device({ because }),
  ObserveVisibleHeadings: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The two painted slots of a TableOfContents Part:
 * - `Root`: navigation landmark region (`role="region"`, `aria-label`).
 * - `Item`: heading item control (`role="button"`, `aria-current`, `SelectHeading`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectHeading' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label: labelOf(props),
    }
  } else if (slot === 'Item') {
    return Option.match(maybeChoice, {
      onNone: () => ({}),
      onSome: id => {
        const maybeHeading = headingById(props, id)
        return {
          id: itemId(props.id, id),
          isCurrent: isHeadingActive(state, id),
          tabIndex: 0,
          ...Option.match(maybeHeading, {
            onNone: () => ({}),
            onSome: heading => ({ label: heading.label }),
          }),
        }
      },
    })
  } else {
    return {}
  }
}

/**
 * What a restart opens a TableOfContents Part on: preserves the current active
 * heading selection.
 */
export const atRest = (state: State): State =>
  Active({ maybeActiveId: state.maybeActiveId })

// PART FACTORY

/** Options for customizing a TableOfContents Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep TableOfContents device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial active heading id, if any. */
  defaultActiveId?: string
  /** Scroll-observation sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a TableOfContents {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `ObserveScroll` with `Pace.Sampled`, discrete
 * actions with `Pace.Synced()`). Use {@link deviceOnly} for local-only outlines.
 *
 * @example
 * ```typescript
 * const DocToc = TableOfContents.make({ name: 'DocToc', defaultActiveId: 'intro' })
 * const LocalToc = TableOfContents.deviceOnly({ name: 'LocalToc' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const initialState =
    options.defaultActiveId === undefined
      ? initial
      : initialActive(options.defaultActiveId)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'TableOfContents',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
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
 * Shorthand for a TableOfContents Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced TableOfContents Part (`name: 'TableOfContents'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
