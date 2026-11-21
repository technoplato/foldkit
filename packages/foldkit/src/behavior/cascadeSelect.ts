import { Array, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import * as Selection from './selection.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core CascadeSelect Part (Widget #35 of 54, Scribe #2674).
// It composes `Placement`, `Layers`, `RovingFocus`, and `Selection` into one
// framework-free Machine and Part declaration covering Zag cascade-select
// semantics: hierarchical `CascadeNode` trees, multi-column expansion via
// `expandedPath` and `columnsOf`, ArrowRight descend / ArrowLeft ascend /
// ArrowUp-Down rove / Enter select leaf (or branch if `allowBranchSelect`),
// `pathLabelsOf` breadcrumb helper, `placeFor`, `Layers` Escape/outside
// dismiss, `atRest`, and reference-stable SlotBindings (`Trigger`, `Content`,
// `Column`, `Option`, `ClearButton`).

// SCHEMAS

/** Whether one node (`Single`) or many nodes (`Multiple`) may be selected at once. */
export const SelectionMode = Selection.SelectionMode
/** Whether one node or many nodes may be selected at once. */
export type SelectionMode = Selection.SelectionMode

/** Optional placement spacing overrides for the CascadeSelect popup panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides for the CascadeSelect popup panel. */
export type PlacementOptions = typeof PlacementOptions.Type

/** One node in a hierarchical cascading option tree, as plain data. */
export interface CascadeNode {
  readonly id: string
  readonly label: string
  readonly isDisabled?: boolean
  readonly children?: ReadonlyArray<CascadeNode>
}

/** Schema for a recursive {@link CascadeNode} tree. */
export const CascadeNode: S.Schema<CascadeNode> = S.suspend(
  (): S.Schema<CascadeNode> =>
    S.Struct({
      id: S.String,
      label: S.String,
      isDisabled: S.optionalKey(S.Boolean),
      children: S.optionalKey(S.Array(CascadeNode)),
    }),
)

/** One visible column of sibling nodes at `depth`, derived by {@link columnsOf}. */
export type CascadeColumn = Readonly<{
  depth: number
  maybeParentId: Option.Option<string>
  nodes: ReadonlyArray<CascadeNode>
}>

/**
 * Read-only props supplied to the CascadeSelect chart and projection from the
 * Program's Model. Tree nodes, selection policy, layer stack, placement, and
 * accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  nodes: S.Array(CascadeNode),
  selectionMode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  allowBranchSelect: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Array(S.String)),
  placeholder: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the CascadeSelect chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The cascade select popup is closed while preserving its `selection`. */
export const Closed = ts('Closed', {
  selection: Selection.State,
})
/** The cascade select popup is closed. */
export type Closed = typeof Closed.Type

/**
 * The cascade select popup is open, tracking its `selection` and the active
 * `expandedPath` of node ids from the root column down to the focused column.
 */
export const Open = ts('Open', {
  selection: Selection.State,
  expandedPath: S.Array(S.String),
})
/** The cascade select popup is open. */
export type Open = typeof Open.Type

/** Where a CascadeSelect Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a CascadeSelect Part stands. */
export type State = typeof State.Type

/** Initial CascadeSelect state: closed with an empty selection. */
export const initial: State = Closed({
  selection: Selection.initial,
})

/** Creates an initial closed CascadeSelect state with `ids` pre-selected. */
export const initialSelected = (ids: ReadonlyArray<string>): State =>
  Closed({
    selection: Selection.initialSelected(ids),
  })

// ACTIONS

/** Opens the cascading options panel. */
export const OpenCascadeSelect = Catalog.action('OpenCascadeSelect', {
  what: 'Opens the cascading options panel',
  why: 'To browse hierarchical levels and choose an entry',
  meta: { label: 'Open cascade select', keys: [] },
})

/** Closes the open cascading options panel unconditionally. */
export const CloseCascadeSelect = Catalog.action('CloseCascadeSelect', {
  what: 'Closes the cascading options panel',
  why: 'To hide the level columns and return to the summary',
  meta: { label: 'Close cascade select', keys: [] },
})

/** Opens the cascading options panel when closed or closes it when open. */
export const ToggleCascadeSelect = Catalog.action('ToggleCascadeSelect', {
  what: 'Opens the cascading panel when closed or hides it when open',
  why: 'To reveal or collapse the hierarchical picker',
  meta: { label: 'Toggle cascade select', keys: [] },
})

/** Dismisses the cascading options panel when it is the topmost dismissable layer. */
export const DismissCascadeSelect = Catalog.action('DismissCascadeSelect', {
  what: 'Dismisses the open cascading panel when topmost on the layer stack',
  why: 'To exit the picker without altering the selection',
  meta: { label: 'Dismiss cascade select', keys: [] },
})

/** Selects a leaf option (or branch when `allowBranchSelect` is enabled), or expands a branch column. */
export const SelectCascadeOption = Catalog.action('SelectCascadeOption', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'option',
    prompt: 'Select which cascading option?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No cascading option is available',
  },
  what: 'Selects a cascading option or opens its child column',
  why: 'To pick a hierarchical value or drill into deeper levels',
  meta: { label: 'Select cascading option', keys: [] },
})

/** Clears the selected cascading value when deselectable. */
export const ClearCascadeSelect = Catalog.action('ClearCascadeSelect', {
  what: 'Clears the selected cascading value',
  why: 'To leave no hierarchical entry chosen',
  meta: { label: 'Clear cascade select', keys: [] },
})

/** The Catalog Actions a CascadeSelect Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenCascadeSelect,
  CloseCascadeSelect,
  ToggleCascadeSelect,
  DismissCascadeSelect,
  SelectCascadeOption,
  ClearCascadeSelect,
]

// MESSAGE

/** Highlights the node with `id` and expands its ancestor path while open. */
export const HighlightCascadeOption = m('HighlightCascadeOption', {
  id: S.String,
})

/** A keyboard key was pressed while focus is on the trigger control. */
export const PressedCascadeTriggerKey = m('PressedCascadeTriggerKey', {
  key: S.String,
})

/** A keyboard key was pressed while the cascading panel is open. */
export const PressedCascadeKey = m('PressedCascadeKey', {
  key: S.String,
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideCascadeSelect = m('PressedOutsideCascadeSelect', {
  insideIds: S.Array(S.String),
})

/** Replaces the selection programmatically with `ids`. */
export const ReplaceCascadeSelection = m('ReplaceCascadeSelection', {
  ids: S.Array(S.String),
})

/** Restores the selection to `props.defaultValue` (or empty) and closes the panel. */
export const ResetCascadeSelect = m('ResetCascadeSelect')

/** Every Message the CascadeSelect chart handles. */
export const Message = S.Union([
  OpenCascadeSelect,
  CloseCascadeSelect,
  ToggleCascadeSelect,
  DismissCascadeSelect,
  SelectCascadeOption,
  ClearCascadeSelect,
  HighlightCascadeOption,
  PressedCascadeTriggerKey,
  PressedCascadeKey,
  PressedOutsideCascadeSelect,
  ReplaceCascadeSelection,
  ResetCascadeSelect,
])
/** Every Message the CascadeSelect chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the CascadeSelect Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the trigger combobox element id from a base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the popup listbox container element id from a base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives one cascading column element id from a base `id` and `depth`. */
export const columnId = (id: string, depth: number): string =>
  `${id}-column-${depth.toString()}`

/** Derives one option element id from a base `id` and node `nodeId`. */
export const optionId = (id: string, nodeId: string): string =>
  `${id}-option-${nodeId}`

/** Derives the clear button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

/** Derives the label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

// CONFIG READERS

/** Resolved selection mode (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when multiple values may be selected at once. */
export const isMultipleOf = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Multiple'

/** True when branch nodes with children may be selected directly (`false` by default). */
export const allowBranchSelectOf = (
  props: Pick<Props, 'allowBranchSelect'> = {},
): boolean => props.allowBranchSelect === true

/** True when selecting a leaf closes the popup automatically (`true` in `Single`, `false` in `Multiple` by default). */
export const closeOnSelectOf = (
  props: Pick<Props, 'selectionMode' | 'closeOnSelect'> = {},
): boolean => props.closeOnSelect ?? !isMultipleOf(props)

/** Resolved reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when vertical roving wraps around within a column (`false` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop === true

/** True when the cascade select is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal === true

/** True when Escape may dismiss this popup (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when an outside pointer press may dismiss this popup (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** True when the cascade select is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the cascade select is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the cascade select is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the cascade select is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when user interaction is permitted (neither disabled nor read-only). */
export const canInteract = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** True when the selection may be emptied by user deselection or clearing. */
export const isDeselectableOf = (
  props: Pick<Props, 'selectionMode' | 'deselectable'> = {},
): boolean =>
  Selection.isDeselectableOf({
    mode: selectionModeOf(props),
    ...(props.deselectable === undefined
      ? {}
      : { deselectable: props.deselectable }),
  })

/** Builds the {@link Layers.Layer} entry representing this CascadeSelect popup. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this CascadeSelect popup. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/**
 * Places a CascadeSelect popup panel by its trigger anchor using `Placement.place`,
 * applying any `gapPx` and `edgePx` configured in `props.placement`.
 */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed =>
  Placement.place({
    ...geometry,
    ...(props.placement?.gapPx === undefined
      ? {}
      : { gapPx: props.placement.gapPx }),
    ...(props.placement?.edgePx === undefined
      ? {}
      : { edgePx: props.placement.edgePx }),
  })

// TREE HELPERS & READINGS

/** True when `node` has one or more child nodes. */
export const isBranchNode = (node: CascadeNode): boolean =>
  node.children !== undefined && Array.isReadonlyArrayNonEmpty(node.children)

const flattenSelectableItems = (
  nodes: ReadonlyArray<CascadeNode>,
  allowBranch: boolean,
  ancestorDisabled: boolean = false,
): ReadonlyArray<Selection.Item> =>
  Array.flatMap(nodes, node => {
    const disabled = ancestorDisabled || node.isDisabled === true
    const hasKids = isBranchNode(node)
    const own: ReadonlyArray<Selection.Item> =
      !hasKids || allowBranch
        ? [{ value: node.id, ...(disabled ? { isDisabled: true } : {}) }]
        : []
    const childItems =
      node.children === undefined
        ? []
        : flattenSelectableItems(node.children, allowBranch, disabled)
    return [...own, ...childItems]
  })

/** Projects `CascadeSelect.Props` onto the underlying {@link Selection.Props}. */
export const selectionPropsOf = (props: Props): Selection.Props => ({
  items: flattenSelectableItems(props.nodes, allowBranchSelectOf(props)),
  mode: selectionModeOf(props),
  ...(props.deselectable === undefined
    ? {}
    : { deselectable: props.deselectable }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
})

type LocatedNode = Readonly<{
  node: CascadeNode
  path: ReadonlyArray<string>
  isDisabled: boolean
}>

const locateNodeIn = (
  nodes: ReadonlyArray<CascadeNode>,
  targetId: string,
  prefix: ReadonlyArray<string>,
  ancestorDisabled: boolean,
): Option.Option<LocatedNode> => {
  for (const node of nodes) {
    const nextDisabled = ancestorDisabled || node.isDisabled === true
    const nextPath = [...prefix, node.id]
    if (node.id === targetId) {
      return Option.some({ node, path: nextPath, isDisabled: nextDisabled })
    }
    if (node.children !== undefined) {
      const maybeDescendant = locateNodeIn(
        node.children,
        targetId,
        nextPath,
        nextDisabled,
      )
      if (Option.isSome(maybeDescendant)) {
        return maybeDescendant
      }
    }
  }
  return Option.none()
}

/** Finds a node and its ancestor id path anywhere in `props.nodes`, or none. */
export const findNodeById = (
  id: string,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): Option.Option<LocatedNode> =>
  locateNodeIn(props.nodes, id, [], isDisabledOf(props))

/** Finds the root-to-node id path for `id` in `props.nodes`, or none. */
export const findPathById = (
  id: string,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): Option.Option<ReadonlyArray<string>> =>
  Option.map(findNodeById(id, props), located => located.path)

const resolvePathNodes = (
  path: ReadonlyArray<string>,
  rootNodes: ReadonlyArray<CascadeNode>,
): ReadonlyArray<CascadeNode> => {
  const collected: Array<CascadeNode> = []
  let level = rootNodes
  for (const id of path) {
    const maybeNode = Array.findFirst(level, node => node.id === id)
    if (Option.isNone(maybeNode)) {
      break
    }
    collected.push(maybeNode.value)
    level = maybeNode.value.children ?? []
  }
  return collected
}

/**
 * Resolves human-readable labels for each node id in `path`, forming a
 * breadcrumb trail (`['United States', 'California', 'San Francisco']`).
 */
export const pathLabelsOf = (
  path: ReadonlyArray<string>,
  props: Pick<Props, 'nodes'>,
): ReadonlyArray<string> =>
  Array.map(resolvePathNodes(path, props.nodes), node => node.label)

/** True when the cascading panel is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True when the cascading panel is closed. */
export const isClosed = (state: State): boolean => state._tag === 'Closed'

/** Active expanded node-id path while `Open`, or `[]` while `Closed`. */
export const expandedPathOf = (state: State): ReadonlyArray<string> =>
  state._tag === 'Open' ? state.expandedPath : []

/** Currently active (deepest highlighted) node id while `Open`, or none. */
export const activeNodeIdOf = (state: State): Option.Option<string> =>
  Array.last(expandedPathOf(state))

/** All currently selected node ids in order. */
export const selectedIdsOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** True when no node is currently selected. */
export const isSelectionEmpty = (state: State): boolean =>
  Selection.isEmpty(state.selection)

/** True when `id` is currently selected. */
export const isOptionSelected = (state: State, id: string): boolean =>
  Selection.isSelected(state.selection, id)

/** The root-to-node id path for the first selected node, or `[]` when empty. */
export const selectedPathOf = (
  state: State,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): ReadonlyArray<string> =>
  Option.match(Selection.firstSelectedOf(state.selection), {
    onNone: () => [],
    onSome: selectedId =>
      Option.getOrElse(findPathById(selectedId, props), () => []),
  })

/** Breadcrumb labels for the currently selected path, or `[]` when empty. */
export const selectedPathLabelsOf = (
  state: State,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): ReadonlyArray<string> => pathLabelsOf(selectedPathOf(state, props), props)

/**
 * Formatted breadcrumb string for the current selection joined by `separator`
 * (`' / '` by default), or `props.placeholder ?? ''` when nothing is selected.
 */
export const breadcrumbOf = (
  state: State,
  props: Pick<Props, 'nodes' | 'isDisabled' | 'placeholder'>,
  separator: string = ' / ',
): string => {
  const labels = selectedPathLabelsOf(state, props)
  if (Array.isReadonlyArrayEmpty(labels)) {
    return props.placeholder ?? ''
  } else {
    return Array.join(labels, separator)
  }
}

/**
 * Derives the visible cascading columns at each depth for `state` and `props`.
 * Always starts with depth `0` (`props.nodes`), then appends one child column
 * per branch node along `state.expandedPath` while `Open`.
 */
export const columnsOf = (
  state: State,
  props: Pick<Props, 'nodes'>,
): ReadonlyArray<CascadeColumn> => {
  const columns: Array<CascadeColumn> = [
    {
      depth: 0,
      maybeParentId: Option.none(),
      nodes: props.nodes,
    },
  ]
  if (state._tag === 'Closed') {
    return columns
  }
  let levelNodes = props.nodes
  let depth = 0
  for (const id of state.expandedPath) {
    const maybeNode = Array.findFirst(levelNodes, node => node.id === id)
    if (Option.isNone(maybeNode) || !isBranchNode(maybeNode.value)) {
      break
    }
    const children = maybeNode.value.children ?? []
    depth += 1
    columns.push({
      depth,
      maybeParentId: Option.some(maybeNode.value.id),
      nodes: children,
    })
    levelNodes = children
  }
  return columns
}

// INTERNAL TRANSITION HELPERS

const firstEnabledIdOf = (
  nodes: ReadonlyArray<CascadeNode>,
  globalDisabled: boolean,
): Option.Option<string> =>
  Option.flatMap(
    RovingFocus.firstEnabled(
      nodes.length,
      index =>
        globalDisabled ||
        Option.exists(
          Array.get(nodes, index),
          node => node.isDisabled === true,
        ),
    ),
    index => Option.map(Array.get(nodes, index), node => node.id),
  )

const initialOpenPath = (
  state: Closed,
  props: Props,
): ReadonlyArray<string> => {
  const existingPath = selectedPathOf(state, props)
  if (Array.isReadonlyArrayNonEmpty(existingPath)) {
    return existingPath
  } else {
    return Option.match(firstEnabledIdOf(props.nodes, isDisabledOf(props)), {
      onNone: () => [],
      onSome: firstId => [firstId],
    })
  }
}

const activeColumnNodesOf = (
  expandedPath: ReadonlyArray<string>,
  props: Props,
): Readonly<{
  prefix: ReadonlyArray<string>
  nodes: ReadonlyArray<CascadeNode>
  maybeCurrentIndex: Option.Option<number>
}> => {
  if (Array.isReadonlyArrayEmpty(expandedPath)) {
    return {
      prefix: [],
      nodes: props.nodes,
      maybeCurrentIndex: Option.none(),
    }
  }
  const prefix = Array.dropRight(expandedPath, 1)
  const parentNodes = resolvePathNodes(prefix, props.nodes)
  const siblingNodes = Option.match(Array.last(parentNodes), {
    onNone: () => props.nodes,
    onSome: parent => parent.children ?? [],
  })
  const maybeCurrentId = Array.last(expandedPath)
  const maybeCurrentIndex = Option.flatMap(maybeCurrentId, currentId =>
    Array.findFirstIndex(siblingNodes, node => node.id === currentId),
  )
  return {
    prefix,
    nodes: siblingNodes,
    maybeCurrentIndex,
  }
}

const roveActiveColumn = (
  state: Open,
  move: RovingFocus.Move,
  props: Props,
): Option.Option<Open> => {
  const { prefix, nodes, maybeCurrentIndex } = activeColumnNodesOf(
    state.expandedPath,
    props,
  )
  const maybeNextIndex = RovingFocus.stepEnabled({
    count: nodes.length,
    current: maybeCurrentIndex,
    move,
    isDisabled: index =>
      isDisabledOf(props) ||
      Option.exists(Array.get(nodes, index), node => node.isDisabled === true),
    loop: loopOf(props),
  })
  return Option.flatMap(maybeNextIndex, nextIndex =>
    Option.map(Array.get(nodes, nextIndex), nextNode =>
      Open({
        selection: state.selection,
        expandedPath: [...prefix, nextNode.id],
      }),
    ),
  )
}

const descendActiveBranch = (state: Open, props: Props): Option.Option<Open> =>
  pipe(
    activeNodeIdOf(state),
    Option.flatMap(id => findNodeById(id, props)),
    Option.filter(located => !located.isDisabled && isBranchNode(located.node)),
    Option.flatMap(located =>
      Option.map(
        firstEnabledIdOf(located.node.children ?? [], isDisabledOf(props)),
        firstChildId =>
          Open({
            selection: state.selection,
            expandedPath: [...located.path, firstChildId],
          }),
      ),
    ),
  )

const ascendColumn = (state: Open): Option.Option<Open> => {
  if (state.expandedPath.length <= 1) {
    return Option.none()
  } else {
    return Option.some(
      Open({
        selection: state.selection,
        expandedPath: Array.dropRight(state.expandedPath, 1),
      }),
    )
  }
}

const selectNodeById = (
  state: State,
  nodeId: string,
  props: Props,
): Option.Option<State> => {
  if (!canInteract(props)) {
    return Option.none()
  }
  return Option.flatMap(findNodeById(nodeId, props), located => {
    if (located.isDisabled) {
      return Option.none()
    }
    const isBranch = isBranchNode(located.node)
    if (isBranch && !allowBranchSelectOf(props)) {
      return Option.some(
        Open({
          selection: state.selection,
          expandedPath: located.path,
        }),
      )
    }
    const nextSelection = Selection.toggle(
      state.selection,
      located.node.id,
      selectionPropsOf(props),
    )
    const shouldClose =
      closeOnSelectOf(props) && (!isBranch || !isMultipleOf(props))
    if (shouldClose) {
      return Option.some(Closed({ selection: nextSelection }))
    } else {
      return Option.some(
        Open({
          selection: nextSelection,
          expandedPath: located.path,
        }),
      )
    }
  })
}

const handleOpenKey = (
  state: Open,
  key: string,
  props: Props,
): Option.Option<State> => {
  if (key === 'Escape') {
    return Layers.canDismissOnEscape(layersOf(props), props.id)
      ? Option.some(Closed({ selection: state.selection }))
      : Option.none()
  }

  if (!canInteract(props)) {
    return Option.none()
  }

  const descendKey = directionOf(props) === 'Ltr' ? 'ArrowRight' : 'ArrowLeft'
  const ascendKey = directionOf(props) === 'Ltr' ? 'ArrowLeft' : 'ArrowRight'

  if (key === descendKey) {
    return descendActiveBranch(state, props)
  } else if (key === ascendKey) {
    return ascendColumn(state)
  } else if (key === 'Enter' || key === ' ') {
    return Option.flatMap(activeNodeIdOf(state), activeId =>
      Option.flatMap(findNodeById(activeId, props), located => {
        if (isBranchNode(located.node) && !allowBranchSelectOf(props)) {
          return descendActiveBranch(state, props)
        } else {
          return selectNodeById(state, activeId, props)
        }
      }),
    )
  } else {
    return Option.flatMap(
      RovingFocus.moveOfKey(key, {
        orientation: 'Vertical',
        pageKeys: true,
      }),
      move => roveActiveColumn(state, move, props),
    )
  }
}

const canInteractGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canInteract(context)

const asClosed = (maybeNext: Option.Option<State>): Option.Option<Closed> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'Closed' ? Option.some(next) : Option.none(),
  )

const asOpen = (maybeNext: Option.Option<State>): Option.Option<Open> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'Open' ? Option.some(next) : Option.none(),
  )

// CHART

/**
 * Builds the CascadeSelect Machine chart starting in `initialState`, composing
 * `Placement`, `Layers`, `RovingFocus`, and `Selection`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenCascadeSelect: [
            when(canInteractGuard, 'Open', ({ state, context }) =>
              Open({
                selection: state.selection,
                expandedPath: initialOpenPath(state, context),
              }),
            ),
            ignore(),
          ],
          CloseCascadeSelect: [ignore()],
          ToggleCascadeSelect: [
            when(canInteractGuard, 'Open', ({ state, context }) =>
              Open({
                selection: state.selection,
                expandedPath: initialOpenPath(state, context),
              }),
            ),
            ignore(),
          ],
          DismissCascadeSelect: [ignore()],
          SelectCascadeOption: [
            when(
              (state, message, context) =>
                asClosed(selectNodeById(state, message.id, context)),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                asOpen(selectNodeById(state, message.id, context)),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ClearCascadeSelect: [
            when(
              (state, _message, context) => {
                if (!canInteract(context)) {
                  return Option.none()
                }
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Closed',
              ({ guardValue }) => Closed({ selection: guardValue }),
            ),
            ignore(),
          ],
          HighlightCascadeOption: [ignore()],
          PressedCascadeTriggerKey: [
            when(
              (_state, message, context) =>
                canInteract(context) &&
                (message.key === 'Enter' ||
                  message.key === ' ' ||
                  message.key === 'ArrowDown' ||
                  message.key === 'ArrowUp'),
              'Open',
              ({ state, context }) =>
                Open({
                  selection: state.selection,
                  expandedPath: initialOpenPath(state, context),
                }),
            ),
            ignore(),
          ],
          PressedCascadeKey: [ignore()],
          PressedOutsideCascadeSelect: [ignore()],
          ReplaceCascadeSelection: [
            when(
              (state, message, context) => {
                const next = Selection.replace(
                  state.selection,
                  message.ids,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Closed',
              ({ guardValue }) => Closed({ selection: guardValue }),
            ),
            ignore(),
          ],
          ResetCascadeSelect: to('Closed', ({ state, context }) =>
            Closed({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
            }),
          ),
        },
      },
      Open: {
        on: {
          OpenCascadeSelect: [ignore()],
          CloseCascadeSelect: to('Closed', ({ state }) =>
            Closed({ selection: state.selection }),
          ),
          ToggleCascadeSelect: to('Closed', ({ state }) =>
            Closed({ selection: state.selection }),
          ),
          DismissCascadeSelect: [
            when(
              (_state, _message, context) =>
                Layers.canDismissOnEscape(layersOf(context), context.id),
              'Closed',
              ({ state }) => Closed({ selection: state.selection }),
            ),
            ignore(),
          ],
          SelectCascadeOption: [
            when(
              (state, message, context) =>
                asClosed(selectNodeById(state, message.id, context)),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                asOpen(selectNodeById(state, message.id, context)),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ClearCascadeSelect: [
            when(
              (state, _message, context) => {
                if (!canInteract(context)) {
                  return Option.none()
                }
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Open',
              ({ state, guardValue }) =>
                Open({
                  selection: guardValue,
                  expandedPath: state.expandedPath,
                }),
            ),
            ignore(),
          ],
          HighlightCascadeOption: [
            when(
              (_state, message, context) =>
                canInteract(context)
                  ? Option.filter(
                      findNodeById(message.id, context),
                      located => !located.isDisabled,
                    )
                  : Option.none(),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  selection: state.selection,
                  expandedPath: guardValue.path,
                }),
            ),
            ignore(),
          ],
          PressedCascadeTriggerKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' &&
                Layers.canDismissOnEscape(layersOf(context), context.id),
              'Closed',
              ({ state }) => Closed({ selection: state.selection }),
            ),
            ignore(),
          ],
          PressedCascadeKey: [
            when(
              (state, message, context) =>
                asClosed(handleOpenKey(state, message.key, context)),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                asOpen(handleOpenKey(state, message.key, context)),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressedOutsideCascadeSelect: [
            when(
              (_state, message, context) =>
                Layers.canDismissOnOutsidePress(
                  layersOf(context),
                  context.id,
                  message.insideIds,
                ),
              'Closed',
              ({ state }) => Closed({ selection: state.selection }),
            ),
            ignore(),
          ],
          ReplaceCascadeSelection: [
            when(
              (state, message, context) => {
                const next = Selection.replace(
                  state.selection,
                  message.ids,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Open',
              ({ state, guardValue }) =>
                Open({
                  selection: guardValue,
                  expandedPath: state.expandedPath,
                }),
            ),
            ignore(),
          ],
          ResetCascadeSelect: to('Closed', ({ state, context }) =>
            Closed({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
            }),
          ),
        },
      },
    },
  })

/** The default CascadeSelect Machine chart starting closed with an empty selection. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenCascadeSelect: pace,
  CloseCascadeSelect: pace,
  ToggleCascadeSelect: pace,
  DismissCascadeSelect: pace,
  SelectCascadeOption: pace,
  ClearCascadeSelect: pace,
  HighlightCascadeOption: pace,
  PressedCascadeTriggerKey: pace,
  PressedCascadeKey: pace,
  PressedOutsideCascadeSelect: pace,
  ReplaceCascadeSelection: pace,
  ResetCascadeSelect: pace,
})

/** Default synchronization: every CascadeSelect Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a CascadeSelect kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a CascadeSelect Part:
 * - `Trigger`: combobox button (`role="combobox"`, `aria-expanded`, `aria-controls`, `ToggleCascadeSelect`).
 * - `Content`: popup listbox container (`role="listbox"`, `aria-activedescendant`, `hidden` when closed).
 * - `Column`: one cascading depth column keyed by zero-based depth (`role="group"`).
 * - `Option`: one hierarchical option keyed by node id (`role="option"`, `SelectCascadeOption`).
 * - `ClearButton`: clears the selection when deselectable (`role="button"`, `ClearCascadeSelect`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Combobox',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleCascadeSelect' }],
  },
  Content: {
    role: 'Listbox',
    focus: 'Container',
    gestures: [],
  },
  Column: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Option: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectCascadeOption' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearCascadeSelect' }],
  },
}

const labelSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      hasPopup: 'listbox',
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Content') {
    const maybeActiveId = Option.map(activeNodeIdOf(state), nodeId =>
      optionId(props.id, nodeId),
    )
    return {
      id: contentId(props.id),
      ...labelSlotPropsOf(props),
      ...(isMultipleOf(props) ? { isMultiselectable: true } : {}),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
      ...(isOpen(state) ? { tabIndex: 0 } : { isHidden: true }),
    }
  } else if (slot === 'Column') {
    const depth = Option.match(maybeChoice, {
      onNone: () => 0,
      onSome: raw => {
        const parsed = Number(raw)
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
      },
    })
    const visibleColumns = columnsOf(state, props)
    const isHidden = !isOpen(state) || depth >= visibleColumns.length
    return {
      id: columnId(props.id, depth),
      label: `Level ${(depth + 1).toString()}`,
      ...(isHidden ? { isHidden: true } : {}),
    }
  } else if (slot === 'Option') {
    return Option.match(
      Option.flatMap(maybeChoice, nodeId => findNodeById(nodeId, props)),
      {
        onNone: () => ({}),
        onSome: located => {
          const isBranch = isBranchNode(located.node)
          const path = expandedPathOf(state)
          const isInExpandedPath = Array.contains(path, located.node.id)
          const isCurrent = Option.contains(
            activeNodeIdOf(state),
            located.node.id,
          )
          return {
            id: optionId(props.id, located.node.id),
            label: located.node.label,
            isSelected: isOptionSelected(state, located.node.id),
            isCurrent,
            ...(isBranch
              ? { isExpanded: isOpen(state) && isInExpandedPath }
              : {}),
            ...(located.isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'ClearButton') {
    const isHidden =
      isSelectionEmpty(state) || !canInteract(props) || !isDeselectableOf(props)
    return {
      id: clearButtonId(props.id),
      controls: triggerId(props.id),
      label: 'Clear cascade select',
      tabIndex: 0,
      ...(isHidden ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a CascadeSelect on: closes the popup while preserving
 * the resting selection.
 */
export const atRest = (state: State): State =>
  Closed({
    selection: Selection.atRest(state.selection),
  })

// PART FACTORY

/** Options for customizing a CascadeSelect Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  defaultValue?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a CascadeSelect {@link Part.Part}. Synced by default (`category: 'Domain'`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'CascadeSelect',
    State,
    Message,
    chart:
      options.defaultValue === undefined
        ? chart
        : chartOf(initialSelected(options.defaultValue)),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/** Shorthand for a CascadeSelect Part whose state stays on the device. */
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

/** The default synced CascadeSelect Part (`name: 'CascadeSelect'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
