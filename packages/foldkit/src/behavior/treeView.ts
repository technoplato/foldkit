import { Array, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import * as Selection from './selection.js'
import type { SlotProps } from './slot.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core TreeView Part (Widget #36 of 54, Scribe #2675).
// It composes `Selection`, `RovingFocus`, and `Typeahead` into one
// framework-free Machine and Part declaration covering Zag tree-view and
// WAI-ARIA TreeView APG semantics: recursive `TreeNode` trees, `expandedIds`,
// `visibleNodesOf` flattening visible rows with depth/parent/hasChildren
// metadata, ArrowRight expand or move to first child, ArrowLeft collapse or
// move to parent, ArrowUp/ArrowDown/Home/End/`*` (expand sibling branches),
// typeahead jump with debounced reset Command, Single/Multiple selection,
// `atRest`, and reference-stable SlotBindings (`Tree`, `Item`, `BranchToggle`).

// SCHEMAS

/** Whether one tree item (`Single`) or many items (`Multiple`) may be selected at once. */
export const SelectionMode = Selection.SelectionMode
/** Whether one tree item or many items may be selected at once. */
export type SelectionMode = Selection.SelectionMode

/** One node in a hierarchical tree view, as plain data. */
export interface TreeNode {
  readonly id: string
  readonly label: string
  readonly isDisabled?: boolean
  readonly children?: ReadonlyArray<TreeNode>
}

/** Schema for a recursive {@link TreeNode} tree. */
export const TreeNode: S.Schema<TreeNode> = S.suspend(
  (): S.Schema<TreeNode> =>
    S.Struct({
      id: S.String,
      label: S.String,
      isDisabled: S.optionalKey(S.Boolean),
      children: S.optionalKey(S.Array(TreeNode)),
    }),
)

/** One flattened visible row produced by {@link visibleNodesOf}, carrying hierarchy metadata. */
export type VisibleTreeNode = Readonly<{
  node: TreeNode
  id: string
  label: string
  depth: number
  maybeParentId: Option.Option<string>
  hasChildren: boolean
  isExpanded: boolean
  isDisabled: boolean
  path: ReadonlyArray<string>
}>

/**
 * Read-only props supplied to the TreeView chart and projection from the
 * Program's Model. Tree nodes, selection policy, typeahead config, and
 * accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  nodes: S.Array(TreeNode),
  selectionMode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  expandOnSelect: S.optionalKey(S.Boolean),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  typeahead: S.optionalKey(S.Boolean),
  searchResetMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  defaultSelectedIds: S.optionalKey(S.Array(S.String)),
  defaultExpandedIds: S.optionalKey(S.Array(S.String)),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the TreeView chart and projection. */
export type Props = typeof Props.Type

// STATE

const stateFields = {
  selection: Selection.State,
  expandedIds: S.Array(S.String),
  maybeFocusedId: S.Option(S.String),
  typeahead: Typeahead.State,
}

/** Focus is outside the tree view while preserving selection and expanded branches. */
export const Idle = ts('Idle', stateFields)
/** Focus is outside the tree view. */
export type Idle = typeof Idle.Type

/** Focus is inside the tree view, driving roving keyboard navigation, expansion, selection, and typeahead. */
export const Focused = ts('Focused', stateFields)
/** Focus is inside the tree view. */
export type Focused = typeof Focused.Type

/** Where a TreeView Part stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a TreeView Part stands. */
export type State = typeof State.Type

/** Initial TreeView state: idle, empty selection, no expanded branches, no focused item, idle typeahead. */
export const initial: State = Idle({
  selection: Selection.initial,
  expandedIds: [],
  maybeFocusedId: Option.none(),
  typeahead: Typeahead.initial,
})

/** Creates an initial idle TreeView state with optional pre-selected and pre-expanded ids. */
export const initialWith = (
  options: Readonly<{
    selectedIds?: ReadonlyArray<string>
    expandedIds?: ReadonlyArray<string>
  }> = {},
): State =>
  Idle({
    selection: Selection.initialSelected(options.selectedIds ?? []),
    expandedIds: Array.dedupe(options.expandedIds ?? []),
    maybeFocusedId: Option.none(),
    typeahead: Typeahead.initial,
  })

// ACTIONS

/** Selects or toggles an enabled tree item by its `id` and focuses it. */
export const SelectTreeItem = Catalog.action('SelectTreeItem', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'item',
    prompt: 'Select which tree item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tree item is available',
  },
  what: 'Selects or toggles a tree item',
  why: 'To include or highlight that node in the selection',
  meta: { label: 'Select tree item', keys: [] },
})

/** Toggles whether a branch node is expanded or collapsed. */
export const ToggleTreeBranch = Catalog.action('ToggleTreeBranch', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'branch',
    prompt: 'Toggle which tree branch?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tree branch is available',
  },
  what: 'Toggles a branch node between expanded and collapsed',
  why: 'To reveal or hide nested child nodes',
  meta: { label: 'Toggle branch', keys: [] },
})

/** Expands a collapsed branch node by its `id`. */
export const ExpandTreeBranch = Catalog.action('ExpandTreeBranch', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'branch',
    prompt: 'Expand which tree branch?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tree branch is available',
  },
  what: 'Expands a collapsed branch node',
  why: 'To inspect the child entries beneath that folder or group',
  meta: { label: 'Expand branch', keys: [] },
})

/** Collapses an expanded branch node by its `id`. */
export const CollapseTreeBranch = Catalog.action('CollapseTreeBranch', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'branch',
    prompt: 'Collapse which tree branch?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tree branch is available',
  },
  what: 'Collapses an expanded branch node',
  why: 'To hide nested entries and compact the hierarchy',
  meta: { label: 'Collapse branch', keys: [] },
})

/** Expands every enabled branch node in the tree. */
export const ExpandAllTreeBranches = Catalog.action('ExpandAllTreeBranches', {
  what: 'Expands every branch node in the tree',
  why: 'To view the entire hierarchy at once',
  meta: { label: 'Expand all branches', keys: [] },
})

/** Collapses every expanded branch node in the tree. */
export const CollapseAllTreeBranches = Catalog.action(
  'CollapseAllTreeBranches',
  {
    what: 'Collapses every expanded branch in the tree',
    why: 'To return to a compact top-level overview',
    meta: { label: 'Collapse all branches', keys: [] },
  },
)

/** Moves focus onto a visible enabled tree item by its `id`. */
export const FocusTreeItem = Catalog.action('FocusTreeItem', {
  fields: { id: S.String },
  choose: {
    field: 'id',
    noun: 'item',
    prompt: 'Focus which tree item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tree item is available',
  },
  what: 'Moves focus onto a visible tree item',
  why: 'To target that node for keyboard actions',
  meta: { label: 'Focus tree item', keys: [] },
})

/** Clears all selected tree items when deselectable. */
export const ClearTreeSelection = Catalog.action('ClearTreeSelection', {
  what: 'Clears the current tree selection',
  why: 'To leave no hierarchy items chosen',
  meta: { label: 'Clear tree selection', keys: [] },
})

/** The Catalog Actions a TreeView Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectTreeItem,
  ToggleTreeBranch,
  ExpandTreeBranch,
  CollapseTreeBranch,
  ExpandAllTreeBranches,
  CollapseAllTreeBranches,
  FocusTreeItem,
  ClearTreeSelection,
]

// MESSAGE

/** Focus entered the tree container. */
export const FocusTree = m('FocusTree')

/** Focus left the tree container, clearing transient typeahead state. */
export const BlurTree = m('BlurTree')

/** A keyboard key was pressed while interacting with the tree view. */
export const PressedTreeKey = m('PressedTreeKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
})

/** Extends range selection from the active anchor to `id` in `Multiple` mode. */
export const SelectTreeRange = m('SelectTreeRange', {
  id: S.String,
})

/** A printable character was typed for typeahead navigation over visible rows. */
export const SearchedTree = m('SearchedTree', {
  key: S.String,
})

/** The debounced typeahead reset wait finished for `version`. */
export const ClearedTreeSearch = m('ClearedTreeSearch', {
  version: S.Number,
})

/** Restores expanded branches and selection to `props.defaultExpandedIds` / `props.defaultSelectedIds`. */
export const ResetTreeView = m('ResetTreeView')

/** Every Message the TreeView chart handles. */
export const Message = S.Union([
  SelectTreeItem,
  ToggleTreeBranch,
  ExpandTreeBranch,
  CollapseTreeBranch,
  ExpandAllTreeBranches,
  CollapseAllTreeBranches,
  FocusTreeItem,
  ClearTreeSelection,
  FocusTree,
  BlurTree,
  PressedTreeKey,
  SelectTreeRange,
  SearchedTree,
  ClearedTreeSearch,
  ResetTreeView,
])
/** Every Message the TreeView chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the TreeView Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce period and answers `ClearedTreeSearch` for `version`. */
export const WaitToClearTreeSearch = Command.define(
  'WaitToClearTreeSearch',
  { version: S.Number, afterMs: S.Number },
  ClearedTreeSearch,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ClearedTreeSearch({ version })),
)

// ELEMENT IDS

/** Derives the tree container element id from a base `id`. */
export const treeId = (id: string): string => `${id}-tree`

/** Derives one tree item element id from a base `id` and node `nodeId`. */
export const itemId = (id: string, nodeId: string): string =>
  `${id}-item-${nodeId}`

/** Derives one branch toggle button element id from a base `id` and node `nodeId`. */
export const branchToggleId = (id: string, nodeId: string): string =>
  `${id}-toggle-${nodeId}`

/** Derives the tree label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

// CONFIG READERS

/** Resolved selection mode (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when multiple tree items may be selected at once. */
export const isMultipleOf = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Multiple'

/** True when selecting a branch item also toggles its expanded state (`false` by default). */
export const expandOnSelectOf = (
  props: Pick<Props, 'expandOnSelect'> = {},
): boolean => props.expandOnSelect === true

/** Resolved reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when vertical roving wraps around at top/bottom (`false` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop === true

/** True when typeahead search is enabled (`true` by default). */
export const typeaheadEnabledOf = (
  props: Pick<Props, 'typeahead'> = {},
): boolean => props.typeahead ?? true

/** True when the entire tree view is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

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

// TREE TRAVERSAL & READINGS

/** True when `node` has one or more child nodes. */
export const isBranchNode = (node: TreeNode): boolean =>
  node.children !== undefined && Array.isReadonlyArrayNonEmpty(node.children)

const flattenVisible = (
  nodes: ReadonlyArray<TreeNode>,
  expandedIds: ReadonlyArray<string>,
  depth: number,
  maybeParentId: Option.Option<string>,
  prefix: ReadonlyArray<string>,
  ancestorDisabled: boolean,
): ReadonlyArray<VisibleTreeNode> =>
  Array.flatMap(nodes, node => {
    const isDisabled = ancestorDisabled || node.isDisabled === true
    const hasChildren = isBranchNode(node)
    const isExpanded = hasChildren && Array.contains(expandedIds, node.id)
    const path = [...prefix, node.id]
    const row: VisibleTreeNode = {
      node,
      id: node.id,
      label: node.label,
      depth,
      maybeParentId,
      hasChildren,
      isExpanded,
      isDisabled,
      path,
    }
    if (isExpanded && node.children !== undefined) {
      return [
        row,
        ...flattenVisible(
          node.children,
          expandedIds,
          depth + 1,
          Option.some(node.id),
          path,
          isDisabled,
        ),
      ]
    } else {
      return [row]
    }
  })

/**
 * Flattens all currently visible tree rows in pre-order traversal, attaching
 * `depth`, `maybeParentId`, `hasChildren`, `isExpanded`, `isDisabled`, and `path`.
 */
export const visibleNodesOf = (
  state: Pick<State, 'expandedIds'>,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): ReadonlyArray<VisibleTreeNode> =>
  flattenVisible(
    props.nodes,
    state.expandedIds,
    0,
    Option.none(),
    [],
    isDisabledOf(props),
  )

const flattenAllBranchIds = (
  nodes: ReadonlyArray<TreeNode>,
  ancestorDisabled: boolean,
): ReadonlyArray<string> =>
  Array.flatMap(nodes, node => {
    const isDisabled = ancestorDisabled || node.isDisabled === true
    const own = !isDisabled && isBranchNode(node) ? [node.id] : []
    const nested =
      node.children === undefined
        ? []
        : flattenAllBranchIds(node.children, isDisabled)
    return [...own, ...nested]
  })

const selectionPropsForVisible = (
  visible: ReadonlyArray<VisibleTreeNode>,
  props: Props,
): Selection.Props => ({
  items: Array.map(visible, row => ({
    value: row.id,
    ...(row.isDisabled ? { isDisabled: true } : {}),
  })),
  mode: selectionModeOf(props),
  ...(props.deselectable === undefined
    ? {}
    : { deselectable: props.deselectable }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
})

const findVisibleRow = (
  visible: ReadonlyArray<VisibleTreeNode>,
  id: string,
): Option.Option<VisibleTreeNode> =>
  Array.findFirst(visible, row => row.id === id)

const findVisibleIndex = (
  visible: ReadonlyArray<VisibleTreeNode>,
  id: string,
): Option.Option<number> => Array.findFirstIndex(visible, row => row.id === id)

const isRowDisabledAt =
  (visible: ReadonlyArray<VisibleTreeNode>) =>
  (index: number): boolean =>
    Option.exists(Array.get(visible, index), row => row.isDisabled)

/** True when keyboard focus is tracked inside the tree view. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** All currently expanded branch node ids. */
export const expandedIdsOf = (state: State): ReadonlyArray<string> =>
  state.expandedIds

/** True when the branch with `id` is currently expanded. */
export const isExpanded = (state: State, id: string): boolean =>
  Array.contains(state.expandedIds, id)

/** All currently selected node ids in order. */
export const selectedIdsOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** True when the node with `id` is currently selected. */
export const isSelected = (state: State, id: string): boolean =>
  Selection.isSelected(state.selection, id)

/** Currently focused visible enabled node id, or none. */
export const focusedIdOf = (
  state: State,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): Option.Option<string> => {
  const visible = visibleNodesOf(state, props)
  return Option.filter(state.maybeFocusedId, id =>
    Option.exists(findVisibleRow(visible, id), row => !row.isDisabled),
  )
}

/** Visible node id that holds roving `tabIndex={0}` (focused node, else first selected visible, else first enabled visible). */
export const tabbableIdOf = (
  state: State,
  props: Pick<Props, 'nodes' | 'isDisabled'>,
): Option.Option<string> => {
  const visible = visibleNodesOf(state, props)
  return Option.orElse(focusedIdOf(state, props), () =>
    Option.orElse(
      Option.map(
        Array.findFirst(
          visible,
          row => !row.isDisabled && isSelected(state, row.id),
        ),
        row => row.id,
      ),
      () =>
        Option.flatMap(
          RovingFocus.firstEnabled(visible.length, isRowDisabledAt(visible)),
          index => Option.map(Array.get(visible, index), row => row.id),
        ),
    ),
  )
}

/** Current accumulated typeahead query string, or `''` while idle. */
export const searchQueryOf = (state: State): string =>
  Typeahead.queryOf(state.typeahead)

// INTERNAL TRANSITION HELPERS

type StateUpdates = Partial<
  Readonly<{
    selection: Selection.State
    expandedIds: ReadonlyArray<string>
    maybeFocusedId: Option.Option<string>
    typeahead: Typeahead.State
  }>
>

const focusedFrom = (state: State, updates: StateUpdates = {}): Focused =>
  Focused({
    selection: updates.selection ?? state.selection,
    expandedIds: updates.expandedIds ?? state.expandedIds,
    maybeFocusedId: updates.maybeFocusedId ?? state.maybeFocusedId,
    typeahead: updates.typeahead ?? state.typeahead,
  })

const idleFrom = (state: State, updates: StateUpdates = {}): Idle =>
  Idle({
    selection: updates.selection ?? state.selection,
    expandedIds: updates.expandedIds ?? state.expandedIds,
    maybeFocusedId: updates.maybeFocusedId ?? state.maybeFocusedId,
    typeahead: updates.typeahead ?? state.typeahead,
  })

const addExpandedId = (
  expandedIds: ReadonlyArray<string>,
  id: string,
): ReadonlyArray<string> =>
  Array.contains(expandedIds, id) ? expandedIds : [...expandedIds, id]

const removeExpandedId = (
  expandedIds: ReadonlyArray<string>,
  id: string,
): ReadonlyArray<string> => Array.filter(expandedIds, each => each !== id)

const toggleExpandedId = (
  expandedIds: ReadonlyArray<string>,
  id: string,
): ReadonlyArray<string> =>
  Array.contains(expandedIds, id)
    ? removeExpandedId(expandedIds, id)
    : [...expandedIds, id]

const findNodeRecursive = (
  nodes: ReadonlyArray<TreeNode>,
  id: string,
  ancestorDisabled: boolean,
): Option.Option<Readonly<{ node: TreeNode; isDisabled: boolean }>> => {
  for (const node of nodes) {
    const isDisabled = ancestorDisabled || node.isDisabled === true
    if (node.id === id) {
      return Option.some({ node, isDisabled })
    }
    if (node.children !== undefined) {
      const found = findNodeRecursive(node.children, id, isDisabled)
      if (Option.isSome(found)) {
        return found
      }
    }
  }
  return Option.none()
}

const isEnabledBranch = (id: string, props: Props): boolean =>
  Option.exists(
    findNodeRecursive(props.nodes, id, isDisabledOf(props)),
    found => !found.isDisabled && isBranchNode(found.node),
  )

const isSelectAllKey = (message: typeof PressedTreeKey.Type): boolean =>
  (message.key === 'a' || message.key === 'A') &&
  (message.isMeta === true || message.isControl === true)

const isActivationKey = (state: State, key: string): boolean =>
  key === 'Enter' || (key === ' ' && !Typeahead.isSearching(state.typeahead))

const runTypeahead = (state: State, props: Props, key: string) => {
  const visible = visibleNodesOf(state, props)
  const currentIndex = Option.flatMap(focusedIdOf(state, props), id =>
    findVisibleIndex(visible, id),
  )
  const isRefinement = Typeahead.isSearching(state.typeahead)
  const [nextTypeahead] = Typeahead.chart.transition(
    state.typeahead,
    Typeahead.Typed({
      key,
      ...(props.searchResetMs === undefined
        ? {}
        : { afterMs: props.searchResetMs }),
    }),
  )
  const maybeMatched = Typeahead.match({
    items: visible,
    query: Typeahead.queryOf(nextTypeahead),
    maybeActiveIndex: currentIndex,
    isDisabled: isRowDisabledAt(visible),
    textOf: row => row.label,
    isRefinement,
  })
  const maybeMatchedId = Option.flatMap(maybeMatched, index =>
    Option.map(Array.get(visible, index), row => row.id),
  )
  return {
    model: focusedFrom(state, {
      typeahead: nextTypeahead,
      maybeFocusedId: Option.orElse(maybeMatchedId, () => state.maybeFocusedId),
    }),
    commands: [
      WaitToClearTreeSearch({
        version: Typeahead.versionOf(nextTypeahead),
        afterMs: props.searchResetMs ?? Typeahead.resetMs,
      }),
    ],
  }
}

const expandSiblingsOf = (state: State, props: Props): Focused => {
  const visible = visibleNodesOf(state, props)
  const maybeFocusedRow = Option.flatMap(focusedIdOf(state, props), id =>
    findVisibleRow(visible, id),
  )
  const maybeParent = Option.flatMap(maybeFocusedRow, row => row.maybeParentId)
  const siblingBranchIds = pipe(
    visible,
    Array.filter(
      row =>
        !row.isDisabled &&
        row.hasChildren &&
        Option.getOrUndefined(row.maybeParentId) ===
          Option.getOrUndefined(maybeParent),
    ),
    Array.map(row => row.id),
  )
  const nextExpanded = Array.dedupe([...state.expandedIds, ...siblingBranchIds])
  return focusedFrom(state, { expandedIds: nextExpanded })
}

const handleArrowRight = (
  state: State,
  props: Props,
): Option.Option<Focused> => {
  const visible = visibleNodesOf(state, props)
  return Option.flatMap(focusedIdOf(state, props), focusedId =>
    Option.flatMap(findVisibleRow(visible, focusedId), row => {
      if (row.isDisabled || !row.hasChildren) {
        return Option.none()
      } else if (!row.isExpanded) {
        return Option.some(
          focusedFrom(state, {
            expandedIds: addExpandedId(state.expandedIds, row.id),
          }),
        )
      } else {
        const maybeFirstChild = Array.findFirst(
          visible,
          candidate =>
            !candidate.isDisabled &&
            Option.contains(candidate.maybeParentId, row.id),
        )
        return Option.map(maybeFirstChild, child =>
          focusedFrom(state, { maybeFocusedId: Option.some(child.id) }),
        )
      }
    }),
  )
}

const handleArrowLeft = (
  state: State,
  props: Props,
): Option.Option<Focused> => {
  const visible = visibleNodesOf(state, props)
  return Option.flatMap(focusedIdOf(state, props), focusedId =>
    Option.flatMap(findVisibleRow(visible, focusedId), row => {
      if (row.isDisabled) {
        return Option.none()
      } else if (row.hasChildren && row.isExpanded) {
        return Option.some(
          focusedFrom(state, {
            expandedIds: removeExpandedId(state.expandedIds, row.id),
          }),
        )
      } else {
        return Option.flatMap(row.maybeParentId, parentId =>
          Option.map(
            Option.filter(
              findVisibleRow(visible, parentId),
              parent => !parent.isDisabled,
            ),
            parent =>
              focusedFrom(state, { maybeFocusedId: Option.some(parent.id) }),
          ),
        )
      }
    }),
  )
}

const handleVerticalMove = (
  state: State,
  move: RovingFocus.Move,
  isShift: boolean,
  props: Props,
): Option.Option<Focused> => {
  const visible = visibleNodesOf(state, props)
  const currentIndex = Option.flatMap(focusedIdOf(state, props), id =>
    findVisibleIndex(visible, id),
  )
  return Option.flatMap(
    RovingFocus.stepEnabled({
      count: visible.length,
      current: currentIndex,
      move,
      isDisabled: isRowDisabledAt(visible),
      loop: loopOf(props),
    }),
    nextIndex =>
      Option.map(Array.get(visible, nextIndex), nextRow => {
        const nextSelection =
          isShift && isMultipleOf(props)
            ? Selection.selectRange(
                state.selection,
                nextRow.id,
                selectionPropsForVisible(visible, props),
                focusedIdOf(state, props),
              )
            : state.selection
        return focusedFrom(state, {
          selection: nextSelection,
          maybeFocusedId: Option.some(nextRow.id),
        })
      }),
  )
}

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedTreeKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      const expandKey =
        directionOf(context) === 'Ltr' ? 'ArrowRight' : 'ArrowLeft'
      return message.key === expandKey
        ? handleArrowRight(state, context)
        : Option.none()
    },
    'Focused',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      const collapseKey =
        directionOf(context) === 'Ltr' ? 'ArrowLeft' : 'ArrowRight'
      return message.key === collapseKey
        ? handleArrowLeft(state, context)
        : Option.none()
    },
    'Focused',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      return Option.flatMap(
        RovingFocus.moveOfKey(message.key, {
          orientation: 'Vertical',
          pageKeys: false,
        }),
        move =>
          handleVerticalMove(state, move, message.isShift === true, context),
      )
    },
    'Focused',
    ({ guardValue }) => guardValue,
  ),
  when(
    (_state: S, message: typeof PressedTreeKey.Type, context: Props) =>
      !isDisabledOf(context) && message.key === '*',
    'Focused',
    ({ state, context }) => expandSiblingsOf(state, context),
  ),
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) => {
      if (isDisabledOf(context) || !isSelectAllKey(message)) {
        return Option.none()
      }
      const visible = visibleNodesOf(state, context)
      const next = Selection.selectAll(
        state.selection,
        selectionPropsForVisible(visible, context),
      )
      return next === state.selection ? Option.none() : Option.some(next)
    },
    'Focused',
    ({ state, guardValue }) => focusedFrom(state, { selection: guardValue }),
  ),
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) => {
      if (isDisabledOf(context) || !isActivationKey(state, message.key)) {
        return Option.none()
      }
      return focusedIdOf(state, context)
    },
    'Focused',
    ({ state, guardValue, context }) => {
      const visible = visibleNodesOf(state, context)
      const selProps = selectionPropsForVisible(visible, context)
      const nextSelection = Selection.toggle(
        state.selection,
        guardValue,
        selProps,
      )
      return focusedFrom(state, { selection: nextSelection })
    },
  ),
  when(
    (state: S, message: typeof PressedTreeKey.Type, context: Props) =>
      !isDisabledOf(context) &&
      typeaheadEnabledOf(context) &&
      message.isMeta !== true &&
      message.isControl !== true &&
      Typeahead.isSearchKey(
        message.key,
        Typeahead.isSearching(state.typeahead),
      ),
    'Focused',
    ({ state, message, context }) => runTypeahead(state, context, message.key),
  ),
  ignore(),
]

const selectItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectTreeItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof SelectTreeItem.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      const visible = visibleNodesOf(state, context)
      return Option.filter(
        findVisibleRow(visible, message.id),
        row => !row.isDisabled,
      )
    },
    'Focused',
    ({ state, guardValue, context }) => {
      const visible = visibleNodesOf(state, context)
      const nextSelection = Selection.toggle(
        state.selection,
        guardValue.id,
        selectionPropsForVisible(visible, context),
      )
      const nextExpanded =
        expandOnSelectOf(context) && guardValue.hasChildren
          ? toggleExpandedId(state.expandedIds, guardValue.id)
          : state.expandedIds
      return focusedFrom(state, {
        selection: nextSelection,
        expandedIds: nextExpanded,
        maybeFocusedId: Option.some(guardValue.id),
      })
    },
  ),
  ignore(),
]

const focusItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusTreeItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof FocusTreeItem.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      const visible = visibleNodesOf(state, context)
      return Option.filter(
        findVisibleRow(visible, message.id),
        row => !row.isDisabled,
      )
    },
    'Focused',
    ({ state, guardValue }) =>
      focusedFrom(state, { maybeFocusedId: Option.some(guardValue.id) }),
  ),
  ignore(),
]

const selectRangeEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectTreeRange.Type, never, Props>
> => [
  when(
    (state: S, message: typeof SelectTreeRange.Type, context: Props) => {
      if (isDisabledOf(context)) {
        return Option.none()
      }
      const visible = visibleNodesOf(state, context)
      return Option.filter(
        findVisibleRow(visible, message.id),
        row => !row.isDisabled,
      )
    },
    'Focused',
    ({ state, guardValue, context }) => {
      const visible = visibleNodesOf(state, context)
      return focusedFrom(state, {
        selection: Selection.selectRange(
          state.selection,
          guardValue.id,
          selectionPropsForVisible(visible, context),
          focusedIdOf(state, context),
        ),
        maybeFocusedId: Option.some(guardValue.id),
      })
    },
  ),
  ignore(),
]

type StateVariant<Tag extends State['_tag']> = Extract<
  State,
  Readonly<{ _tag: Tag }>
>

const branchToggleEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ToggleTreeBranch.Type,
    never,
    Props
  >
> => [
  when(
    (
      _state: StateVariant<Target>,
      message: typeof ToggleTreeBranch.Type,
      context: Props,
    ) => isEnabledBranch(message.id, context),
    target,
    ({ state, message }) =>
      build(state, {
        expandedIds: toggleExpandedId(state.expandedIds, message.id),
      }),
  ),
  ignore(),
]

const branchExpandEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ExpandTreeBranch.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      message: typeof ExpandTreeBranch.Type,
      context: Props,
    ) =>
      isEnabledBranch(message.id, context) &&
      !Array.contains(state.expandedIds, message.id),
    target,
    ({ state, message }) =>
      build(state, {
        expandedIds: addExpandedId(state.expandedIds, message.id),
      }),
  ),
  ignore(),
]

const branchCollapseEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof CollapseTreeBranch.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      message: typeof CollapseTreeBranch.Type,
      context: Props,
    ) =>
      !isDisabledOf(context) && Array.contains(state.expandedIds, message.id),
    target,
    ({ state, message }) =>
      build(state, {
        expandedIds: removeExpandedId(state.expandedIds, message.id),
      }),
  ),
  ignore(),
]

const clearSelectionEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ClearTreeSelection.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof ClearTreeSelection.Type,
      context: Props,
    ) => {
      const visible = visibleNodesOf(state, context)
      const next = Selection.clear(
        state.selection,
        selectionPropsForVisible(visible, context),
      )
      return next === state.selection ? Option.none() : Option.some(next)
    },
    target,
    ({ state, guardValue }) => build(state, { selection: guardValue }),
  ),
  ignore(),
]

const resetToIdle = (state: State, context: Props): Idle =>
  Idle({
    selection: Selection.initialSelected(context.defaultSelectedIds ?? []),
    expandedIds: Array.dedupe(context.defaultExpandedIds ?? []),
    maybeFocusedId: Option.none(),
    typeahead: Typeahead.atRest(state.typeahead),
  })

// CHART

/**
 * Builds the TreeView Machine chart starting in `initialState`, composing
 * `Selection`, `RovingFocus`, and `Typeahead`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SelectTreeItem: selectItemEdges<Idle>(),
          ToggleTreeBranch: branchToggleEdges('Idle', idleFrom),
          ExpandTreeBranch: branchExpandEdges('Idle', idleFrom),
          CollapseTreeBranch: branchCollapseEdges('Idle', idleFrom),
          ExpandAllTreeBranches: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, context }) =>
                idleFrom(state, {
                  expandedIds: flattenAllBranchIds(context.nodes, false),
                }),
            ),
            ignore(),
          ],
          CollapseAllTreeBranches: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                Array.isReadonlyArrayNonEmpty(state.expandedIds),
              'Idle',
              ({ state }) => idleFrom(state, { expandedIds: [] }),
            ),
            ignore(),
          ],
          FocusTreeItem: focusItemEdges<Idle>(),
          ClearTreeSelection: clearSelectionEdges('Idle', idleFrom),
          FocusTree: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, context }) =>
                focusedFrom(state, {
                  maybeFocusedId: tabbableIdOf(state, context),
                }),
            ),
            ignore(),
          ],
          BlurTree: [ignore()],
          PressedTreeKey: pressedKeyEdges<Idle>(),
          SelectTreeRange: selectRangeEdges<Idle>(),
          SearchedTree: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                typeaheadEnabledOf(context) &&
                Typeahead.isSearchKey(
                  message.key,
                  Typeahead.isSearching(state.typeahead),
                ),
              'Focused',
              ({ state, message, context }) =>
                runTypeahead(state, context, message.key),
            ),
            ignore(),
          ],
          ClearedTreeSearch: [
            when(
              (state, message) =>
                Typeahead.isSearching(state.typeahead) &&
                Typeahead.versionOf(state.typeahead) === message.version,
              'Idle',
              ({ state }) =>
                idleFrom(state, {
                  typeahead: Typeahead.atRest(state.typeahead),
                }),
            ),
            ignore(),
          ],
          ResetTreeView: to('Idle', ({ state, context }) =>
            resetToIdle(state, context),
          ),
        },
      },
      Focused: {
        on: {
          SelectTreeItem: selectItemEdges<Focused>(),
          ToggleTreeBranch: branchToggleEdges('Focused', focusedFrom),
          ExpandTreeBranch: branchExpandEdges('Focused', focusedFrom),
          CollapseTreeBranch: branchCollapseEdges('Focused', focusedFrom),
          ExpandAllTreeBranches: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, context }) =>
                focusedFrom(state, {
                  expandedIds: flattenAllBranchIds(context.nodes, false),
                }),
            ),
            ignore(),
          ],
          CollapseAllTreeBranches: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                Array.isReadonlyArrayNonEmpty(state.expandedIds),
              'Focused',
              ({ state }) => focusedFrom(state, { expandedIds: [] }),
            ),
            ignore(),
          ],
          FocusTreeItem: focusItemEdges<Focused>(),
          ClearTreeSelection: clearSelectionEdges('Focused', focusedFrom),
          FocusTree: [ignore()],
          BlurTree: to('Idle', ({ state }) =>
            idleFrom(state, { typeahead: Typeahead.atRest(state.typeahead) }),
          ),
          PressedTreeKey: pressedKeyEdges<Focused>(),
          SelectTreeRange: selectRangeEdges<Focused>(),
          SearchedTree: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                typeaheadEnabledOf(context) &&
                Typeahead.isSearchKey(
                  message.key,
                  Typeahead.isSearching(state.typeahead),
                ),
              'Focused',
              ({ state, message, context }) =>
                runTypeahead(state, context, message.key),
            ),
            ignore(),
          ],
          ClearedTreeSearch: [
            when(
              (state, message) =>
                Typeahead.isSearching(state.typeahead) &&
                Typeahead.versionOf(state.typeahead) === message.version,
              'Focused',
              ({ state }) =>
                focusedFrom(state, {
                  typeahead: Typeahead.atRest(state.typeahead),
                }),
            ),
            ignore(),
          ],
          ResetTreeView: to('Idle', ({ state, context }) =>
            resetToIdle(state, context),
          ),
        },
      },
    },
  })

/** The default TreeView Machine chart starting idle with no selection or expanded branches. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectTreeItem: pace,
  ToggleTreeBranch: pace,
  ExpandTreeBranch: pace,
  CollapseTreeBranch: pace,
  ExpandAllTreeBranches: pace,
  CollapseAllTreeBranches: pace,
  FocusTreeItem: pace,
  ClearTreeSelection: pace,
  FocusTree: pace,
  BlurTree: pace,
  PressedTreeKey: pace,
  SelectTreeRange: pace,
  SearchedTree: pace,
  ClearedTreeSearch: pace,
  ResetTreeView: pace,
})

/** Default synchronization: every TreeView Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a TreeView kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The three painted slots of a TreeView Part:
 * - `Tree`: container listbox (`role="listbox"`, `aria-multiselectable`, `aria-activedescendant`).
 * - `Item`: one visible tree row keyed by node id (`role="option"`, `isExpanded`, `isSelected`, `isCurrent`, `tabIndex`, `SelectTreeItem`).
 * - `BranchToggle`: expand/collapse button for a branch node keyed by node id (`role="button"`, `isExpanded`, `ToggleTreeBranch`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Tree: {
    role: 'Listbox',
    focus: 'Container',
    gestures: [],
  },
  Item: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectTreeItem' }],
  },
  BranchToggle: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleTreeBranch' }],
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
  if (slot === 'Tree') {
    const maybeActiveId = Option.map(focusedIdOf(state, props), id =>
      itemId(props.id, id),
    )
    return {
      id: treeId(props.id),
      orientation: 'Vertical',
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isMultipleOf(props) ? { isMultiselectable: true } : {}),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Item') {
    const visible = visibleNodesOf(state, props)
    const maybeTabbable = tabbableIdOf(state, props)
    const maybeFocused = focusedIdOf(state, props)
    return Option.match(
      Option.flatMap(maybeChoice, nodeId => findVisibleRow(visible, nodeId)),
      {
        onNone: () => ({}),
        onSome: row => {
          const isTabbable =
            !row.isDisabled && Option.contains(maybeTabbable, row.id)
          return {
            id: itemId(props.id, row.id),
            label: row.label,
            isSelected: isSelected(state, row.id),
            isCurrent: Option.contains(maybeFocused, row.id),
            tabIndex: isTabbable ? 0 : -1,
            ...(row.hasChildren ? { isExpanded: row.isExpanded } : {}),
            ...(row.isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'BranchToggle') {
    const visible = visibleNodesOf(state, props)
    return Option.match(
      Option.flatMap(maybeChoice, nodeId => findVisibleRow(visible, nodeId)),
      {
        onNone: () => ({}),
        onSome: row => ({
          id: branchToggleId(props.id, row.id),
          controls: itemId(props.id, row.id),
          label: row.isExpanded
            ? `Collapse ${row.label}`
            : `Expand ${row.label}`,
          isExpanded: row.isExpanded,
          tabIndex: -1,
          ...(!row.hasChildren ? { isHidden: true } : {}),
          ...(row.isDisabled ? { isDisabled: true } : {}),
        }),
      },
    )
  } else {
    return {}
  }
}

/**
 * What a restart opens a TreeView on: settles to `Idle` while preserving
 * selection, expanded branches, focused node, and typeahead version counter.
 */
export const atRest = (state: State): State =>
  Idle({
    selection: Selection.atRest(state.selection),
    expandedIds: state.expandedIds,
    maybeFocusedId: state.maybeFocusedId,
    typeahead: Typeahead.atRest(state.typeahead),
  })

// PART FACTORY

/** Options for customizing a TreeView Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  defaultSelectedIds?: ReadonlyArray<string>
  defaultExpandedIds?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a TreeView {@link Part.Part}. Synced by default (`category: 'Domain'`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState: State =
    options.defaultSelectedIds === undefined &&
    options.defaultExpandedIds === undefined
      ? initial
      : initialWith({
          ...(options.defaultSelectedIds === undefined
            ? {}
            : { selectedIds: options.defaultSelectedIds }),
          ...(options.defaultExpandedIds === undefined
            ? {}
            : { expandedIds: options.defaultExpandedIds }),
        })
  return Part.define<State, Message, Props>({
    name: options.name ?? 'TreeView',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
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
}

/** Shorthand for a TreeView Part whose state stays on the device. */
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

/** The default synced TreeView Part (`name: 'TreeView'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
