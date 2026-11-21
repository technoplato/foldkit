import { Array, Option, Schema as S } from 'effect'

import * as AngleSlider from '../behavior/angleSlider.js'
import * as ColorPicker from '../behavior/colorPicker.js'
import * as Part from '../behavior/part.js'
import * as ScrollArea from '../behavior/scrollArea.js'
import * as Splitter from '../behavior/splitter.js'
import * as Steps from '../behavior/steps.js'
import * as TableOfContents from '../behavior/tableOfContents.js'
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

// NOTE: shared test Program composing all six Cluster 3 core Parts (Steps,
// TableOfContents, ScrollArea, Splitter, AngleSlider, ColorPicker) once,
// driven by the HTML, React, and React Native generic host tests. Every
// painter draws this same screen tree through its own generic host with zero
// widget-specific painter code.

export const FixtureModel = S.Struct({
  title: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameFixture = Catalog.action('RenameFixture', {
  fields: { title: S.String },
  what: 'Updates the cluster 3 fixture title',
  why: 'To label the composed fixture screen',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameFixture])

const BaseProgram = make({
  id: 'cluster3-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ title: 'Cluster 3 Parts' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, title: message.title }, []],
  catalog: fixtureCatalog,
})

export const defaultStepsProps: Steps.Props = {
  id: 'fixture-steps',
  count: 3,
  orientation: 'Horizontal',
  items: [{ label: 'Shipping' }, { label: 'Payment' }, { label: 'Review' }],
}

export const defaultTocHeadings: ReadonlyArray<TableOfContents.TocHeading> = [
  { id: 'intro', label: 'Introduction', depth: 1 },
  { id: 'guide', label: 'Guide', depth: 2 },
  { id: 'api', label: 'API', depth: 1 },
]

export const defaultTocProps: TableOfContents.Props = {
  id: 'fixture-toc',
  headings: defaultTocHeadings,
  offsetPx: 20,
}

export const defaultScrollAreaProps: ScrollArea.Props = {
  id: 'fixture-scroll',
  orientation: 'Vertical',
  scrollbarVisibility: 'Scroll',
  scrollHideDelayMs: 600,
  minThumbPx: 20,
}

export const defaultSplitterProps: Splitter.Props = {
  id: 'fixture-splitter',
  orientation: 'Horizontal',
  keyboardStep: 5,
  largeStep: 15,
  defaultSizes: [30, 70],
  panels: [
    {
      id: 'sidebar',
      minSize: 20,
      maxSize: 60,
      collapsible: true,
      collapsedSize: 0,
    },
    { id: 'main', minSize: 40, maxSize: 100 },
  ],
}

export const defaultAngleSliderProps: AngleSlider.Props = {
  id: 'fixture-angle',
  step: 15,
  largeStep: 45,
  defaultValue: 90,
  label: 'Gradient angle',
}

export const defaultColorPickerProps: ColorPicker.Props = {
  id: 'fixture-color',
  swatches: ['#ff0000', '#00ff00', '#0000ff'],
  label: 'Accent color',
}

export type Cluster3Props = Readonly<{
  steps: Steps.Props
  toc: TableOfContents.Props
  scrollArea: ScrollArea.Props
  splitter: Splitter.Props
  angleSlider: AngleSlider.Props
  colorPicker: ColorPicker.Props
}>

export const defaultProps: Cluster3Props = {
  steps: defaultStepsProps,
  toc: defaultTocProps,
  scrollArea: defaultScrollAreaProps,
  splitter: defaultSplitterProps,
  angleSlider: defaultAngleSliderProps,
  colorPicker: defaultColorPickerProps,
}

const emptyView = <State>(state: State): Part.View<State> => ({
  state,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
})

export const cluster3Screen = (
  _model: FixtureModel,
  views: Readonly<{
    steps: Part.View<Steps.State>
    toc: Part.View<TableOfContents.State>
    scrollArea: Part.View<ScrollArea.State>
    splitter: Part.View<Splitter.State>
    angleSlider: Part.View<AngleSlider.State>
    colorPicker: Part.View<ColorPicker.State>
  }>,
  props: Cluster3Props = defaultProps,
): UiNode => {
  const stepIndices = Array.makeBy(
    Steps.countOf(views.steps.state, props.steps),
    index => index,
  )
  const swatches = props.colorPicker.swatches ?? []

  return Column(
    { gap: 2 },
    Column(
      { gap: 1, slot: views.steps.slot('Root') },
      Row(
        { gap: 1 },
        ...Array.map(stepIndices, index =>
          Button({
            label: Option.getOrElse(
              props.steps.items === undefined
                ? Option.none<string>()
                : Option.flatMap(Array.get(props.steps.items, index), item =>
                    Option.fromNullishOr(item.label),
                  ),
              () => `Step ${(index + 1).toString()}`,
            ),
            action: Part.pressOf(
              Steps.GoToStep.tag,
              Option.some(index.toString()),
            ),
            slot: views.steps.slot('Trigger', index.toString()),
          }),
        ),
      ),
      ...Array.map(stepIndices, index =>
        Box(
          { padding: 0, slot: views.steps.slot('Content', index.toString()) },
          Text(`Step content ${index.toString()}`),
        ),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Previous step',
          action: Steps.PrevStep.tag,
          disabled: !Steps.hasPrevStep(views.steps.state),
          slot: views.steps.slot('PrevButton'),
        }),
        Button({
          label: 'Next step',
          action: Steps.NextStep.tag,
          disabled: !Steps.hasNextStep(views.steps.state, props.steps),
          slot: views.steps.slot('NextButton'),
        }),
      ),
    ),
    Column(
      { gap: 1, slot: views.toc.slot('Root') },
      ...Array.map(props.toc.headings, heading =>
        Button({
          label: heading.label,
          action: Part.pressOf(
            TableOfContents.SelectHeading.tag,
            Option.some(heading.id),
          ),
          slot: views.toc.slot('Item', heading.id),
        }),
      ),
    ),
    Column(
      { gap: 1 },
      Box(
        { padding: 0, slot: views.scrollArea.slot('Viewport') },
        Text('Scrollable feed content'),
      ),
      Row(
        { gap: 1, slot: views.scrollArea.slot('Scrollbar') },
        Button({
          label: 'Scroll thumb',
          action: ScrollArea.ScrollToStart.tag,
          slot: views.scrollArea.slot('Thumb'),
        }),
      ),
    ),
    Row(
      { gap: 1, slot: views.splitter.slot('Root') },
      Box(
        { padding: 0, slot: views.splitter.slot('Panel', 'sidebar') },
        Text('Sidebar panel'),
      ),
      Button({
        label: 'Resize divider',
        action: Part.pressOf(
          Splitter.TogglePanelCollapse.tag,
          Option.some('0'),
        ),
        slot: views.splitter.slot('ResizeTrigger', '0'),
      }),
      Box(
        { padding: 0, slot: views.splitter.slot('Panel', 'main') },
        Text('Main panel'),
      ),
    ),
    Column(
      { gap: 1, slot: views.angleSlider.slot('Root') },
      Box(
        { padding: 0, slot: views.angleSlider.slot('Control') },
        Button({
          label: 'Angle dial',
          action: AngleSlider.ResetAngle.tag,
          disabled: AngleSlider.isDisabledOf(props.angleSlider),
          slot: views.angleSlider.slot('Thumb'),
        }),
      ),
    ),
    Column(
      { gap: 1 },
      Button({
        label: 'Color trigger',
        action: ColorPicker.ToggleColorPicker.tag,
        disabled: ColorPicker.isDisabledOf(props.colorPicker),
        slot: views.colorPicker.slot('Trigger'),
      }),
      Column(
        { gap: 1, slot: views.colorPicker.slot('Content') },
        Box(
          { padding: 0, slot: views.colorPicker.slot('Area') },
          Button({
            label: 'Color area thumb',
            token: 'ColorAreaThumb',
            slot: views.colorPicker.slot('AreaThumb'),
          }),
        ),
        Button({
          label: 'Hue channel',
          token: 'ColorChannelHue',
          slot: views.colorPicker.slot('ChannelSlider', 'Hue'),
        }),
        Button({
          label: 'Alpha channel',
          token: 'ColorChannelAlpha',
          slot: views.colorPicker.slot('ChannelSlider', 'Alpha'),
        }),
        Row(
          { gap: 1 },
          ...Array.map(swatches, swatch =>
            Button({
              label: swatch,
              action: Part.pressOf(
                ColorPicker.SelectSwatch.tag,
                Option.some(swatch),
              ),
              slot: views.colorPicker.slot('Swatch', swatch),
            }),
          ),
        ),
        TextInput({
          value: ColorPicker.inputValueOf(views.colorPicker.state),
          placeholder: '#000000',
          token: 'ChangedColorInput:',
          blurToken: ColorPicker.CommitColorInput.tag,
          slot: views.colorPicker.slot('Input'),
        }),
      ),
    ),
  )
}

export type FixtureOverrides = Readonly<{
  steps?: Partial<Steps.Props>
  toc?: Partial<TableOfContents.Props>
  scrollArea?: Partial<ScrollArea.Props>
  splitter?: Partial<Splitter.Props>
  angleSlider?: Partial<AngleSlider.Props>
  colorPicker?: Partial<ColorPicker.Props>
}>

export const makeApp = (overrides: FixtureOverrides = {}) => {
  const resolvedProps: Cluster3Props = {
    steps: { ...defaultStepsProps, ...overrides.steps },
    toc: { ...defaultTocProps, ...overrides.toc },
    scrollArea: { ...defaultScrollAreaProps, ...overrides.scrollArea },
    splitter: { ...defaultSplitterProps, ...overrides.splitter },
    angleSlider: { ...defaultAngleSliderProps, ...overrides.angleSlider },
    colorPicker: { ...defaultColorPickerProps, ...overrides.colorPicker },
  }

  const stepsPart = Steps.make({
    name: 'Steps',
    count: resolvedProps.steps.count ?? 3,
    defaultStep: resolvedProps.steps.defaultStep ?? 0,
  })
  const tocPart = TableOfContents.make({
    name: 'TableOfContents',
    defaultActiveId: 'intro',
  })
  const scrollAreaPart = ScrollArea.make({
    name: 'ScrollArea',
    viewportSize: 200,
    contentSize: 1000,
    scrollOffset: 0,
  })
  const splitterPart = Splitter.make({
    name: 'Splitter',
    defaultSizes: resolvedProps.splitter.defaultSizes ?? [30, 70],
  })
  const angleSliderPart = AngleSlider.make({
    name: 'AngleSlider',
    defaultValue: resolvedProps.angleSlider.defaultValue ?? 90,
    step: resolvedProps.angleSlider.step ?? 15,
  })
  const colorPickerPart = ColorPicker.make({
    name: 'ColorPicker',
    defaultColor: { h: 0, s: 100, b: 100, a: 1 },
    defaultFormat: 'Hex',
  })

  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(stepsPart, () => resolvedProps.steps),
        Part.given(tocPart, () => resolvedProps.toc),
        Part.given(scrollAreaPart, () => resolvedProps.scrollArea),
        Part.given(splitterPart, () => resolvedProps.splitter),
        Part.given(angleSliderPart, () => resolvedProps.angleSlider),
        Part.given(colorPickerPart, () => resolvedProps.colorPicker),
      ],
      screen: (model, views) =>
        cluster3Screen(
          model,
          {
            steps: views['Steps'] ?? emptyView(Steps.initial),
            toc: views['TableOfContents'] ?? emptyView(TableOfContents.initial),
            scrollArea: views['ScrollArea'] ?? emptyView(ScrollArea.initial),
            splitter: views['Splitter'] ?? emptyView(Splitter.initial),
            angleSlider: views['AngleSlider'] ?? emptyView(AngleSlider.initial),
            colorPicker: views['ColorPicker'] ?? emptyView(ColorPicker.initial),
          },
          resolvedProps,
        ),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Cluster3Message =
  | Steps.Message
  | TableOfContents.Message
  | ScrollArea.Message
  | Splitter.Message
  | AngleSlider.Message
  | ColorPicker.Message

export type Running = Readonly<{
  props: Cluster3Props
  model: () => Model
  stepsState: () => Steps.State
  tocState: () => TableOfContents.State
  scrollAreaState: () => ScrollArea.State
  splitterState: () => Splitter.State
  angleSliderState: () => AngleSlider.State
  colorPickerState: () => ColorPicker.State
  lastCommandNames: () => ReadonlyArray<string>
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Cluster3Message) => void
}>

export const start = (overrides: FixtureOverrides = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: { model: Model; commandNames: ReadonlyArray<string> } = {
    model: initialModel,
    commandNames: [],
  }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel, commands] = composed.update(held.model, message)
    held.model = nextModel
    held.commandNames = Array.map(commands, command => command.name)
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    stepsState: () => held.model.parts['Steps'],
    tocState: () => held.model.parts['TableOfContents'],
    scrollAreaState: () => held.model.parts['ScrollArea'],
    splitterState: () => held.model.parts['Splitter'],
    angleSliderState: () => held.model.parts['AngleSlider'],
    colorPickerState: () => held.model.parts['ColorPicker'],
    lastCommandNames: () => held.commandNames,
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
