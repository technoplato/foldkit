import { Array, Option, Schema as S } from 'effect'

import * as Drawer from '../behavior/drawer.js'
import * as HoverCard from '../behavior/hoverCard.js'
import * as Menubar from '../behavior/menubar.js'
import * as Part from '../behavior/part.js'
import * as RatingGroup from '../behavior/ratingGroup.js'
import * as ToggleGroup from '../behavior/toggleGroup.js'
import * as Toolbar from '../behavior/toolbar.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing all 6 Cluster 1 core Parts (Drawer,
// HoverCard, Menubar, Toolbar, ToggleGroup, RatingGroup) once, driven by the
// HTML, React, and React Native generic host tests with zero widget-specific
// painter code.

export const FixtureModel = S.Struct({
  title: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameCluster = Catalog.action('RenameCluster', {
  fields: { title: S.String },
  what: 'Updates the cluster showcase title',
  why: 'To identify the composed view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameCluster])

const BaseProgram = make({
  id: 'cluster1-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ title: 'Cluster 1 Parts' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, title: message.title }, []],
  catalog: fixtureCatalog,
})

export const defaultDrawerProps: Drawer.Props = {
  id: 'fixture-drawer',
  edge: 'Bottom',
  snapPoints: [0.5, 1],
  defaultSnapPoint: 1,
  contentSizePx: 400,
  focusableIds: ['fixture-drawer-close'],
}

export const defaultHoverCardProps: HoverCard.Props = {
  id: 'fixture-hover-card',
  label: 'Author preview',
}

export const defaultMenubarProps: Menubar.Props = {
  id: 'fixture-menubar',
  label: 'Main menu',
  menus: [
    {
      value: 'file',
      label: 'File',
      items: [
        { value: 'new', label: 'New file' },
        { value: 'save', label: 'Save file' },
      ],
    },
    {
      value: 'edit',
      label: 'Edit',
      items: [
        { value: 'undo', label: 'Undo edit' },
        { value: 'redo', label: 'Redo edit' },
      ],
    },
  ],
}

export const defaultToolbarProps: Toolbar.Props = {
  id: 'fixture-toolbar',
  label: 'Editor tools',
  items: [
    { value: 'cut', label: 'Cut' },
    { value: 'copy', label: 'Copy', isDisabled: true },
    { value: 'paste', label: 'Paste' },
  ],
}

export const defaultToggleGroupProps: ToggleGroup.Props = {
  id: 'fixture-toggle-group',
  label: 'Alignment',
  mode: 'Single',
  items: [
    { value: 'left', label: 'Align left' },
    { value: 'center', label: 'Align center' },
    { value: 'right', label: 'Align right' },
  ],
}

export const defaultRatingGroupProps: RatingGroup.Props = {
  id: 'fixture-rating',
  count: 5,
  hasLabel: true,
}

export type FixtureProps = Readonly<{
  drawer: Drawer.Props
  hoverCard: HoverCard.Props
  menubar: Menubar.Props
  toolbar: Toolbar.Props
  toggleGroup: ToggleGroup.Props
  ratingGroup: RatingGroup.Props
}>

export type FixtureOverrides = Readonly<{
  drawer?: Partial<Drawer.Props>
  hoverCard?: Partial<HoverCard.Props>
  menubar?: Partial<Menubar.Props>
  toolbar?: Partial<Toolbar.Props>
  toggleGroup?: Partial<ToggleGroup.Props>
  ratingGroup?: Partial<RatingGroup.Props>
}>

const emptySlot = () => ({ gestures: [], maybeHold: Option.none() })

const noDrawerView: Part.View<Drawer.State> = {
  state: Drawer.initial,
  slot: emptySlot,
}

const noHoverCardView: Part.View<HoverCard.State> = {
  state: HoverCard.initial,
  slot: emptySlot,
}

const noMenubarView: Part.View<Menubar.State> = {
  state: Menubar.initial,
  slot: emptySlot,
}

const noToolbarView: Part.View<Toolbar.State> = {
  state: Toolbar.initial,
  slot: emptySlot,
}

const noToggleGroupView: Part.View<ToggleGroup.State> = {
  state: ToggleGroup.initial,
  slot: emptySlot,
}

const noRatingGroupView: Part.View<RatingGroup.State> = {
  state: RatingGroup.initial,
  slot: emptySlot,
}

export const cluster1Screen = (
  _model: FixtureModel,
  views: Part.Views,
  props: FixtureProps,
): UiNode => {
  const drawer = views['Drawer'] ?? noDrawerView
  const hoverCard = views['HoverCard'] ?? noHoverCardView
  const menubar = views['Menubar'] ?? noMenubarView
  const toolbar = views['Toolbar'] ?? noToolbarView
  const toggleGroup = views['ToggleGroup'] ?? noToggleGroupView
  const ratingGroup = views['RatingGroup'] ?? noRatingGroupView

  return Column(
    { gap: 2 },
    // Drawer
    Column(
      { gap: 1 },
      Button({
        label: 'Open drawer',
        action: Drawer.ToggleDrawer.tag,
        slot: drawer.slot('Trigger'),
      }),
      Box(
        { padding: 1, ...Drawer.boxLayerOf(drawer, props.drawer) },
        Box(
          { padding: 1, slot: drawer.slot('Content') },
          Box({ padding: 0, slot: drawer.slot('Title') }, Text('Filters')),
          Box(
            { padding: 0, slot: drawer.slot('Description') },
            Text('Narrow results'),
          ),
          Box({ padding: 0, slot: drawer.slot('Grabber') }, Text('Grab')),
          Button({
            label: 'Close drawer',
            action: Drawer.CloseDrawer.tag,
            slot: drawer.slot('CloseButton'),
          }),
          Button({
            label: 'Dismiss drawer',
            action: Drawer.DismissDrawer.tag,
            slot: drawer.slot('Backdrop'),
          }),
        ),
      ),
    ),
    // HoverCard
    Column(
      { gap: 1 },
      Button({
        label: 'Author link',
        action: HoverCard.OpenHoverCard.tag,
        disabled: HoverCard.isDisabledOf(props.hoverCard),
        slot: hoverCard.slot('Trigger'),
      }),
      Box(
        { padding: 1, slot: hoverCard.slot('Content') },
        Text('Author bio preview'),
      ),
    ),
    // Menubar
    Column(
      { gap: 1 },
      Row(
        { gap: 1, slot: menubar.slot('Bar') },
        ...Array.map(props.menubar.menus, menu =>
          Button({
            label: menu.label,
            action: Part.pressOf(
              Menubar.ToggleMenubarMenu.tag,
              Option.some(menu.value),
            ),
            disabled:
              props.menubar.isDisabled === true || menu.isDisabled === true,
            slot: menubar.slot('Trigger', menu.value),
          }),
        ),
      ),
      ...Array.map(props.menubar.menus, menu =>
        Column(
          { gap: 1, slot: menubar.slot('Content', menu.value) },
          ...Array.map(menu.items, item =>
            Button({
              label: item.label,
              action: Part.pressOf(
                Menubar.SelectMenubarItem.tag,
                Option.some(item.value),
              ),
              disabled:
                props.menubar.isDisabled === true || item.isDisabled === true,
              slot: menubar.slot('Item', item.value),
            }),
          ),
        ),
      ),
    ),
    // Toolbar
    Row(
      { gap: 1, slot: toolbar.slot('Root') },
      ...Array.map(props.toolbar.items, item =>
        Button({
          label: item.label,
          action: Part.pressOf(
            Toolbar.ActivateToolbarItem.tag,
            Option.some(item.value),
          ),
          disabled:
            props.toolbar.isDisabled === true || item.isDisabled === true,
          slot: toolbar.slot('Item', item.value),
        }),
      ),
    ),
    // ToggleGroup
    Row(
      { gap: 1, slot: toggleGroup.slot('Root') },
      ...Array.map(props.toggleGroup.items, item =>
        Button({
          label: item.label,
          action: Part.pressOf(
            ToggleGroup.ToggleGroupItem.tag,
            Option.some(item.value),
          ),
          disabled:
            props.toggleGroup.isDisabled === true || item.isDisabled === true,
          slot: toggleGroup.slot('Item', item.value),
        }),
      ),
    ),
    // RatingGroup
    Column(
      { gap: 1 },
      Box({ padding: 0, slot: ratingGroup.slot('Label') }, Text('Rating')),
      Row(
        { gap: 1, slot: ratingGroup.slot('Root') },
        ...Array.map(RatingGroup.itemsOf(props.ratingGroup), index =>
          Button({
            label: RatingGroup.ratingValueTextOf(index),
            action: Part.pressOf(
              RatingGroup.SetRating.tag,
              Option.some(index.toString()),
            ),
            disabled: RatingGroup.isDisabledOf(props.ratingGroup),
            slot: ratingGroup.slot('Item', index.toString()),
          }),
        ),
      ),
    ),
  )
}

export const makeApp = (overrides: FixtureOverrides = {}) => {
  const resolvedProps: FixtureProps = {
    drawer: { ...defaultDrawerProps, ...overrides.drawer },
    hoverCard: { ...defaultHoverCardProps, ...overrides.hoverCard },
    menubar: { ...defaultMenubarProps, ...overrides.menubar },
    toolbar: { ...defaultToolbarProps, ...overrides.toolbar },
    toggleGroup: { ...defaultToggleGroupProps, ...overrides.toggleGroup },
    ratingGroup: { ...defaultRatingGroupProps, ...overrides.ratingGroup },
  }

  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(Drawer.make({ name: 'Drawer' }), () => resolvedProps.drawer),
        Part.given(
          HoverCard.make({ name: 'HoverCard' }),
          () => resolvedProps.hoverCard,
        ),
        Part.given(
          Menubar.make({ name: 'Menubar' }),
          () => resolvedProps.menubar,
        ),
        Part.given(
          Toolbar.make({ name: 'Toolbar' }),
          () => resolvedProps.toolbar,
        ),
        Part.given(
          ToggleGroup.make({ name: 'ToggleGroup' }),
          () => resolvedProps.toggleGroup,
        ),
        Part.given(
          RatingGroup.make({ name: 'RatingGroup' }),
          () => resolvedProps.ratingGroup,
        ),
      ],
      screen: (model, views) => cluster1Screen(model, views, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Cluster1Message =
  | Drawer.Message
  | HoverCard.Message
  | Menubar.Message
  | Toolbar.Message
  | ToggleGroup.Message
  | RatingGroup.Message

export type Running = Readonly<{
  props: FixtureProps
  model: () => Model
  drawerState: () => Drawer.State
  hoverCardState: () => HoverCard.State
  menubarState: () => Menubar.State
  toolbarState: () => Toolbar.State
  toggleGroupState: () => ToggleGroup.State
  ratingGroupState: () => RatingGroup.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Cluster1Message) => void
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
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    drawerState: () => held.model.parts['Drawer'],
    hoverCardState: () => held.model.parts['HoverCard'],
    menubarState: () => held.model.parts['Menubar'],
    toolbarState: () => held.model.parts['Toolbar'],
    toggleGroupState: () => held.model.parts['ToggleGroup'],
    ratingGroupState: () => held.model.parts['RatingGroup'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
