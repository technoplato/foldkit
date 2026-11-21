import { Array, Match as M, Option, Schema as S } from 'effect'

import * as CascadeSelect from '../behavior/cascadeSelect.js'
import * as NumberInput from '../behavior/numberInput.js'
import * as Pagination from '../behavior/pagination.js'
import * as Part from '../behavior/part.js'
import * as PinInput from '../behavior/pinInput.js'
import * as TagsInput from '../behavior/tagsInput.js'
import * as TreeView from '../behavior/treeView.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing all 6 Zag/Radix Cluster 2 core Parts
// (NumberInput, PinInput, TagsInput, CascadeSelect, TreeView, Pagination)
// once, driven by the HTML, React, and React Native generic host tests with
// zero widget-specific painter logic.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the cluster fixture heading',
  why: 'To title the composed parts test surface',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'cluster2-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Cluster 2 Parts' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const cascadeNodes: ReadonlyArray<CascadeSelect.CascadeNode> = [
  {
    id: 'us',
    label: 'United States',
    children: [
      {
        id: 'ca',
        label: 'California',
        children: [
          { id: 'sf', label: 'San Francisco' },
          { id: 'la', label: 'Los Angeles' },
        ],
      },
      { id: 'ny', label: 'New York' },
    ],
  },
  { id: 'jp', label: 'Japan' },
]

export const treeNodes: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'index', label: 'index.ts' },
      { id: 'app', label: 'app.ts' },
    ],
  },
  {
    id: 'docs',
    label: 'docs',
    children: [{ id: 'readme', label: 'README.md' }],
  },
  { id: 'pkg', label: 'package.json' },
]

export type Cluster2Props = Readonly<{
  numberInput: NumberInput.Props
  pinInput: PinInput.Props
  tagsInput: TagsInput.Props
  cascadeSelect: CascadeSelect.Props
  treeView: TreeView.Props
  pagination: Pagination.Props
}>

export const defaultProps: Cluster2Props = {
  numberInput: {
    id: 'c2-number',
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 20,
    hasLabel: true,
  },
  pinInput: {
    id: 'c2-pin',
    length: 4,
    pinType: 'Numeric',
    hasLabel: true,
  },
  tagsInput: {
    id: 'c2-tags',
    maxTags: 4,
    delimiter: ',',
    hasLabel: true,
  },
  cascadeSelect: {
    id: 'c2-cascade',
    nodes: cascadeNodes,
    placeholder: 'Choose location',
    deselectable: true,
    hasLabel: true,
  },
  treeView: {
    id: 'c2-tree',
    nodes: treeNodes,
    hasLabel: true,
  },
  pagination: {
    id: 'c2-pagination',
    count: 100,
    siblingCount: 1,
    boundaryCount: 1,
    label: 'Results pages',
  },
}

const emptyView = <S>(state: S): Part.View<S> => ({
  state,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
})

const pinSlotPrefix = `${PinInput.ChangePinSlot.tag}:`
const numberChangePrefix = `${NumberInput.ChangeNumberInput.tag}:`
const tagChangePrefix = `${TagsInput.ChangeTagInput.tag}:`

export const cluster2Screen = (
  _model: FixtureModel,
  views: Part.Views,
  props: Cluster2Props = defaultProps,
): UiNode => {
  const numView: Part.View<NumberInput.State> =
    views['NumberInput'] ?? emptyView(NumberInput.initial)
  const pinView: Part.View<PinInput.State> =
    views['PinInput'] ?? emptyView(PinInput.initial)
  const tagsView: Part.View<TagsInput.State> =
    views['TagsInput'] ?? emptyView(TagsInput.initial)
  const cascadeView: Part.View<CascadeSelect.State> =
    views['CascadeSelect'] ?? emptyView(CascadeSelect.initial)
  const treeView: Part.View<TreeView.State> =
    views['TreeView'] ?? emptyView(TreeView.initial)
  const pageView: Part.View<Pagination.State> =
    views['Pagination'] ?? emptyView(Pagination.initial)

  const pinSlotIndices = Array.makeBy(
    PinInput.lengthOf(props.pinInput),
    index => index,
  )

  const tags = TagsInput.tagsOf(tagsView.state)
  const cascadeColumns = CascadeSelect.columnsOf(
    cascadeView.state,
    props.cascadeSelect,
  )
  const visibleTreeRows = TreeView.visibleNodesOf(
    treeView.state,
    props.treeView,
  )
  const pageItems = Pagination.pageRangeOf(pageView.state, props.pagination)

  return Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Quantity',
        action: NumberInput.BeginNumberEdit.tag,
        slot: numView.slot('Label'),
      }),
      Button({
        label: 'Decrement',
        action: NumberInput.DecrementNumber.tag,
        disabled: !NumberInput.canDecrement(numView.state, props.numberInput),
        slot: numView.slot('DecrementButton'),
      }),
      TextInput({
        value: NumberInput.textOf(numView.state),
        placeholder: '0',
        token: numberChangePrefix,
        focusToken: NumberInput.BeginNumberEdit.tag,
        blurToken: NumberInput.CommitNumberInput.tag,
        slot: numView.slot('Input'),
      }),
      Button({
        label: 'Increment',
        action: NumberInput.IncrementNumber.tag,
        disabled: !NumberInput.canIncrement(numView.state, props.numberInput),
        slot: numView.slot('IncrementButton'),
      }),
      Box({ padding: 0, slot: numView.slot('Scrubber') }, Text('Scrub')),
    ),
    Column(
      { gap: 1, slot: pinView.slot('Root') },
      Button({
        label: 'Security PIN',
        action: PinInput.BeginPinEdit.tag,
        slot: pinView.slot('Label'),
      }),
      Row(
        { gap: 1 },
        ...Array.map(pinSlotIndices, index =>
          TextInput({
            value: PinInput.slotValueAt(pinView.state, index, props.pinInput),
            token: `${pinSlotPrefix}${index.toString()}:`,
            focusToken: Part.pressOf(
              PinInput.FocusPinSlot.tag,
              Option.some(index.toString()),
            ),
            slot: pinView.slot('Input', index.toString()),
          }),
        ),
      ),
    ),
    Column(
      { gap: 1, slot: tagsView.slot('Root') },
      Button({
        label: 'Tags',
        action: TagsInput.BeginTagInput.tag,
        slot: tagsView.slot('Label'),
      }),
      Row(
        { gap: 1 },
        ...Array.flatMap(tags, (tag, index) => [
          Button({
            label: `Tag ${tag}`,
            action: Part.pressOf(
              TagsInput.HighlightTag.tag,
              Option.some(index.toString()),
            ),
            slot: tagsView.slot('Tag', index.toString()),
          }),
          Button({
            label: `Delete ${tag}`,
            action: Part.pressOf(
              TagsInput.RemoveTag.tag,
              Option.some(index.toString()),
            ),
            slot: tagsView.slot('TagDeleteButton', index.toString()),
          }),
        ]),
      ),
      Row(
        { gap: 1 },
        TextInput({
          value: TagsInput.inputDraftOf(tagsView.state),
          placeholder: 'Add tag',
          token: tagChangePrefix,
          slot: tagsView.slot('Input'),
        }),
        Button({
          label: 'Clear tags',
          action: TagsInput.ClearTags.tag,
          slot: tagsView.slot('ClearButton'),
        }),
      ),
    ),
    Column(
      { gap: 1 },
      Row(
        { gap: 1 },
        Button({
          label: CascadeSelect.breadcrumbOf(
            cascadeView.state,
            props.cascadeSelect,
          ),
          action: CascadeSelect.ToggleCascadeSelect.tag,
          slot: cascadeView.slot('Trigger'),
        }),
        Button({
          label: 'Clear location',
          action: CascadeSelect.ClearCascadeSelect.tag,
          slot: cascadeView.slot('ClearButton'),
        }),
      ),
      Row(
        { gap: 1, slot: cascadeView.slot('Content') },
        ...Array.map(cascadeColumns, column =>
          Column(
            {
              gap: 0,
              slot: cascadeView.slot('Column', column.depth.toString()),
            },
            ...Array.map(column.nodes, node =>
              Button({
                label: node.label,
                action: Part.pressOf(
                  CascadeSelect.SelectCascadeOption.tag,
                  Option.some(node.id),
                ),
                disabled: node.isDisabled === true,
                slot: cascadeView.slot('Option', node.id),
              }),
            ),
          ),
        ),
      ),
    ),
    Column(
      { gap: 0, slot: treeView.slot('Tree') },
      ...Array.map(visibleTreeRows, row =>
        Row(
          { gap: 1 },
          ...(row.hasChildren
            ? [
                Button({
                  label: row.isExpanded
                    ? `Collapse ${row.label}`
                    : `Expand ${row.label}`,
                  action: Part.pressOf(
                    TreeView.ToggleTreeBranch.tag,
                    Option.some(row.id),
                  ),
                  disabled: row.isDisabled,
                  slot: treeView.slot('BranchToggle', row.id),
                }),
              ]
            : []),
          Button({
            label: `Tree ${row.label}`,
            action: Part.pressOf(
              TreeView.SelectTreeItem.tag,
              Option.some(row.id),
            ),
            disabled: row.isDisabled,
            slot: treeView.slot('Item', row.id),
          }),
        ),
      ),
    ),
    Row(
      { gap: 1, slot: pageView.slot('Root') },
      Button({
        label: 'Previous page',
        action: Pagination.PrevPage.tag,
        disabled: !Pagination.canGoPrev(pageView.state, props.pagination),
        slot: pageView.slot('PrevButton'),
      }),
      ...Array.map(pageItems, item =>
        M.value(item).pipe(
          M.withReturnType<UiNode>(),
          M.tagsExhaustive({
            Page: ({ value }) =>
              Button({
                label: `Page ${value.toString()}`,
                action: Part.pressOf(
                  Pagination.GoToPage.tag,
                  Option.some(value.toString()),
                ),
                slot: pageView.slot('PageButton', value.toString()),
              }),
            Ellipsis: ({ key }) =>
              Box(
                { padding: 0, slot: pageView.slot('Ellipsis', key) },
                Text('...'),
              ),
          }),
        ),
      ),
      Button({
        label: 'Next page',
        action: Pagination.NextPage.tag,
        disabled: !Pagination.canGoNext(pageView.state, props.pagination),
        slot: pageView.slot('NextButton'),
      }),
    ),
  )
}

export type FixtureOverrides = Partial<
  Readonly<{
    numberInput: Partial<NumberInput.Props>
    pinInput: Partial<PinInput.Props>
    tagsInput: Partial<TagsInput.Props>
    cascadeSelect: Partial<CascadeSelect.Props>
    treeView: Partial<TreeView.Props>
    pagination: Partial<Pagination.Props>
    defaultTags: ReadonlyArray<string>
    isPinSecret: boolean
  }>
>

export const makeApp = (overrides: FixtureOverrides = {}) => {
  const resolvedProps: Cluster2Props = {
    numberInput: { ...defaultProps.numberInput, ...overrides.numberInput },
    pinInput: { ...defaultProps.pinInput, ...overrides.pinInput },
    tagsInput: { ...defaultProps.tagsInput, ...overrides.tagsInput },
    cascadeSelect: {
      ...defaultProps.cascadeSelect,
      ...overrides.cascadeSelect,
    },
    treeView: { ...defaultProps.treeView, ...overrides.treeView },
    pagination: { ...defaultProps.pagination, ...overrides.pagination },
  }

  const numberPart = NumberInput.make({
    name: 'NumberInput',
    ...(resolvedProps.numberInput.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.numberInput.defaultValue }),
    ...(resolvedProps.numberInput.step === undefined
      ? {}
      : { step: resolvedProps.numberInput.step }),
  })
  const pinOptions: Omit<PinInput.MakeOptions, 'sync'> = {
    name: 'PinInput',
    length: PinInput.lengthOf(resolvedProps.pinInput),
    ...(resolvedProps.pinInput.pinType === undefined
      ? {}
      : { pinType: resolvedProps.pinInput.pinType }),
  }
  const pinPart =
    overrides.isPinSecret === true
      ? PinInput.secret(pinOptions)
      : PinInput.make(pinOptions)
  const tagsPart = TagsInput.make({
    name: 'TagsInput',
    defaultTags: overrides.defaultTags ?? ['foldkit'],
  })
  const cascadePart = CascadeSelect.make({ name: 'CascadeSelect' })
  const treePart = TreeView.make({ name: 'TreeView' })
  const paginationPart = Pagination.make({ name: 'Pagination' })

  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(numberPart, () => resolvedProps.numberInput),
        Part.given(pinPart, () => resolvedProps.pinInput),
        Part.given(tagsPart, () => resolvedProps.tagsInput),
        Part.given(cascadePart, () => resolvedProps.cascadeSelect),
        Part.given(treePart, () => resolvedProps.treeView),
        Part.given(paginationPart, () => resolvedProps.pagination),
      ],
      screen: (model, views) => cluster2Screen(model, views, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Cluster2Props
  model: () => Model
  numberState: () => NumberInput.State
  pinState: () => PinInput.State
  tagsState: () => TagsInput.State
  cascadeState: () => CascadeSelect.State
  treeState: () => TreeView.State
  paginationState: () => Pagination.State
  tree: () => UiNode
  press: (tag: string) => void
  type: (token: string, value: string) => void
  send: (
    message:
      | NumberInput.Message
      | PinInput.Message
      | TagsInput.Message
      | CascadeSelect.Message
      | TreeView.Message
      | Pagination.Message,
  ) => void
}>

export const start = (overrides: FixtureOverrides = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    if (tag === numberChangePrefix) {
      sendMessage(NumberInput.ChangeNumberInput({ value: '' }))
      return
    }
    if (tag === tagChangePrefix) {
      sendMessage(TagsInput.ChangeTagInput({ value: '' }))
      return
    }
    if (tag.startsWith(pinSlotPrefix)) {
      const rest = tag.slice(pinSlotPrefix.length)
      const colonIndex = rest.indexOf(':')
      if (colonIndex >= 0) {
        const index = Number(rest.slice(0, colonIndex))
        const value = rest.slice(colonIndex + 1)
        if (Number.isInteger(index)) {
          sendMessage(PinInput.ChangePinSlot({ index, value }))
          return
        }
      }
    }
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const type = (token: string, value: string): void => {
    press(`${token}${value}`)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    numberState: () => held.model.parts['NumberInput'],
    pinState: () => held.model.parts['PinInput'],
    tagsState: () => held.model.parts['TagsInput'],
    cascadeState: () => held.model.parts['CascadeSelect'],
    treeState: () => held.model.parts['TreeView'],
    paginationState: () => held.model.parts['Pagination'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    type,
    send: sendMessage,
  }
}
