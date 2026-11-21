import { Array, Option, Schema as S } from 'effect'

import * as Carousel from '../behavior/carousel.js'
import * as FloatingPanel from '../behavior/floatingPanel.js'
import * as ImageCropper from '../behavior/imageCropper.js'
import * as Marquee from '../behavior/marquee.js'
import * as Part from '../behavior/part.js'
import * as SignaturePad from '../behavior/signaturePad.js'
import * as Tour from '../behavior/tour.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing all 6 Cluster 4 core Parts (Carousel,
// FloatingPanel, ImageCropper, SignaturePad, Tour, Marquee) once, driven by
// the HTML, React, and React Native generic host tests with zero
// widget-specific painter code.

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
  id: 'cluster4-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ title: 'Cluster 4 Parts' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, title: message.title }, []],
  catalog: fixtureCatalog,
})

export const defaultCarouselProps: Carousel.Props = {
  id: 'fixture-carousel',
  slideCount: 3,
  slidesPerPage: 1,
  slidesPerMove: 1,
  loop: false,
  orientation: 'Horizontal',
  autoplayIntervalMs: 4000,
  allowMouseDrag: true,
  swipeThresholdPx: 50,
}

export const defaultFloatingPanelProps: FloatingPanel.Props = {
  id: 'fixture-panel',
  defaultPosition: { x: 100, y: 80 },
  defaultSize: { width: 320, height: 240 },
  minSize: { width: 160, height: 120 },
  maxSize: { width: 640, height: 480 },
  boundaryRect: { x: 0, y: 0, width: 800, height: 600 },
  minimizedHeightPx: 40,
}

export const defaultImageCropperProps: ImageCropper.Props = {
  id: 'fixture-cropper',
  viewportSize: { width: 400, height: 300 },
  minSize: { width: 40, height: 40 },
  maxSize: { width: 320, height: 240 },
  minZoom: 1,
  maxZoom: 4,
  zoomStep: 0.5,
  nudgeStepPx: 2,
  nudgeStepShiftPx: 20,
}

export const defaultSignaturePadProps: SignaturePad.Props = {
  id: 'fixture-signature',
  minPointDistancePx: 4,
  sampleMs: 50,
}

export const defaultTourProps: Tour.Props = {
  id: 'fixture-tour',
  spotlightPaddingPx: 10,
  steps: [
    {
      id: 'intro',
      title: 'Welcome',
      description: 'First highlighted feature.',
      targetRect: { left: 100, top: 80, width: 120, height: 40 },
      preferredSide: 'Below',
      isSkippable: true,
    },
    {
      id: 'settings',
      title: 'Settings',
      description: 'Configure your workspace.',
      targetRect: { left: 300, top: 360, width: 140, height: 36 },
      preferredSide: 'Above',
      isSkippable: false,
    },
    {
      id: 'done',
      title: 'Complete',
      description: 'Ready to begin.',
    },
  ],
}

export const defaultMarqueeProps: Marquee.Props = {
  id: 'fixture-marquee',
  direction: 'Left',
  speedPxPerSec: 50,
  loopCount: 2,
  pauseOnHover: true,
}

export type FixtureProps = Readonly<{
  carousel: Carousel.Props
  floatingPanel: FloatingPanel.Props
  imageCropper: ImageCropper.Props
  signaturePad: SignaturePad.Props
  tour: Tour.Props
  marquee: Marquee.Props
}>

export type FixtureOverrides = Readonly<{
  carousel?: Partial<Carousel.Props>
  floatingPanel?: Partial<FloatingPanel.Props>
  imageCropper?: Partial<ImageCropper.Props>
  signaturePad?: Partial<SignaturePad.Props>
  tour?: Partial<Tour.Props>
  marquee?: Partial<Marquee.Props>
}>

const emptySlot = () => ({ gestures: [], maybeHold: Option.none() })

const noCarouselView: Part.View<Carousel.State> = {
  state: Carousel.initial,
  slot: emptySlot,
}

const noFloatingPanelView: Part.View<FloatingPanel.State> = {
  state: FloatingPanel.initial,
  slot: emptySlot,
}

const noImageCropperView: Part.View<ImageCropper.State> = {
  state: ImageCropper.initial,
  slot: emptySlot,
}

const noSignaturePadView: Part.View<SignaturePad.State> = {
  state: SignaturePad.initial,
  slot: emptySlot,
}

const noTourView: Part.View<Tour.State> = {
  state: Tour.initial,
  slot: emptySlot,
}

const noMarqueeView: Part.View<Marquee.State> = {
  state: Marquee.initial,
  slot: emptySlot,
}

export const cluster4Screen = (
  _model: FixtureModel,
  views: Part.Views,
  props: FixtureProps,
): UiNode => {
  const carousel = views['Carousel'] ?? noCarouselView
  const floatingPanel = views['FloatingPanel'] ?? noFloatingPanelView
  const imageCropper = views['ImageCropper'] ?? noImageCropperView
  const signaturePad = views['SignaturePad'] ?? noSignaturePadView
  const tour = views['Tour'] ?? noTourView
  const marquee = views['Marquee'] ?? noMarqueeView

  const slideIndices = Array.makeBy(
    Carousel.slideCountOf(props.carousel),
    index => index,
  )
  const pageIndices = Array.makeBy(
    Carousel.pageCountOf(props.carousel),
    index => index,
  )
  const activeStep = Tour.currentStepOf(tour.state, props.tour)

  return Column(
    { gap: 2 },
    // Carousel
    Column(
      { gap: 1, slot: carousel.slot('Root') },
      Row(
        { gap: 1, slot: carousel.slot('Viewport') },
        ...Array.map(slideIndices, index =>
          Box(
            { padding: 1, slot: carousel.slot('Slide', index.toString()) },
            Text(`Slide ${(index + 1).toString()}`),
          ),
        ),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Previous slide',
          action: Carousel.PrevSlide.tag,
          disabled: !Carousel.canPrev(carousel.state, props.carousel),
          slot: carousel.slot('PrevButton'),
        }),
        Button({
          label: 'Next slide',
          action: Carousel.NextSlide.tag,
          disabled: !Carousel.canNext(carousel.state, props.carousel),
          slot: carousel.slot('NextButton'),
        }),
        ...Array.map(pageIndices, page =>
          Button({
            label: `Slide page ${(page + 1).toString()}`,
            action: Part.pressOf(
              Carousel.GoToSlide.tag,
              Option.some(page.toString()),
            ),
            slot: carousel.slot('Indicator', page.toString()),
          }),
        ),
        Button({
          label: 'Toggle autoplay',
          action: Carousel.ToggleCarouselAutoplay.tag,
          slot: carousel.slot('AutoplayTrigger'),
        }),
      ),
    ),
    // FloatingPanel
    Column(
      { gap: 1 },
      Button({
        label: 'Open panel',
        action: FloatingPanel.ToggleFloatingPanel.tag,
      }),
      Box(
        { padding: 1, slot: floatingPanel.slot('Root') },
        Row(
          { gap: 1, slot: floatingPanel.slot('Header') },
          Text('Inspector'),
          Button({
            label: 'Minimize panel',
            action: FloatingPanel.ToggleMinimizeFloatingPanel.tag,
            slot: floatingPanel.slot('MinimizeButton'),
          }),
          Button({
            label: 'Maximize panel',
            action: FloatingPanel.ToggleMaximizeFloatingPanel.tag,
            slot: floatingPanel.slot('MaximizeButton'),
          }),
          Button({
            label: 'Close panel',
            action: FloatingPanel.CloseFloatingPanel.tag,
            slot: floatingPanel.slot('CloseButton'),
          }),
        ),
        Box(
          { padding: 1, slot: floatingPanel.slot('Body') },
          Text('Inspector body'),
        ),
        Box(
          { padding: 0, slot: floatingPanel.slot('ResizeHandle', 'SE') },
          Text('Resize SE'),
        ),
        Box(
          { padding: 0, slot: floatingPanel.slot('ResizeHandle', 'NW') },
          Text('Resize NW'),
        ),
      ),
    ),
    // ImageCropper
    Column(
      { gap: 1, slot: imageCropper.slot('Root') },
      Box(
        { padding: 1, slot: imageCropper.slot('Viewport') },
        Box(
          { padding: 1, slot: imageCropper.slot('Selection') },
          Text('Crop selection'),
        ),
        Button({
          label: 'Resize crop SE',
          slot: imageCropper.slot('Handle', 'SE'),
        }),
        Button({
          label: 'Resize crop NW',
          slot: imageCropper.slot('Handle', 'NW'),
        }),
      ),
      Button({
        label: 'Zoom in crop',
        action: ImageCropper.ZoomInCrop.tag,
        slot: imageCropper.slot('ZoomControl'),
      }),
    ),
    // SignaturePad
    Column(
      { gap: 1, slot: signaturePad.slot('Root') },
      Box(
        { padding: 1, slot: signaturePad.slot('Segment') },
        Text('Signature strokes'),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Undo stroke',
          action: SignaturePad.UndoStroke.tag,
          disabled: !SignaturePad.canUndo(
            signaturePad.state,
            props.signaturePad,
          ),
          slot: signaturePad.slot('UndoButton'),
        }),
        Button({
          label: 'Clear signature',
          action: SignaturePad.ClearSignature.tag,
          disabled: !SignaturePad.canClear(
            signaturePad.state,
            props.signaturePad,
          ),
          slot: signaturePad.slot('ClearButton'),
        }),
      ),
    ),
    // Tour
    Column(
      { gap: 1 },
      Button({
        label: 'Start tour',
        action: Tour.StartTour.tag,
      }),
      Box(
        { padding: 1, ...Tour.boxLayerOf(tour, props.tour) },
        Button({
          label: 'Dismiss tour backdrop',
          action: Tour.DismissTourOutside.tag,
          slot: tour.slot('Backdrop'),
        }),
        Box({ padding: 0, slot: tour.slot('Spotlight') }, Text('Spotlight')),
        Box(
          { padding: 1, slot: tour.slot('Content') },
          Box(
            { padding: 0, slot: tour.slot('Title') },
            Text(
              Option.match(activeStep, {
                onNone: () => '',
                onSome: step => step.title,
              }),
            ),
          ),
          Box(
            { padding: 0, slot: tour.slot('Description') },
            Text(
              Option.match(activeStep, {
                onNone: () => '',
                onSome: step => step.description,
              }),
            ),
          ),
          Row(
            { gap: 1 },
            Button({
              label: 'Previous step',
              action: Tour.PrevStep.tag,
              disabled: !Tour.hasPrevStep(tour.state, props.tour),
              slot: tour.slot('PrevButton'),
            }),
            Button({
              label: 'Next step',
              action: Tour.NextStep.tag,
              disabled: !Tour.isRunning(tour.state),
              slot: tour.slot('NextButton'),
            }),
            Button({
              label: 'Skip tour',
              action: Tour.SkipTour.tag,
              disabled:
                !Tour.isRunning(tour.state) ||
                !Tour.isCurrentStepSkippable(tour.state, props.tour),
              slot: tour.slot('SkipButton'),
            }),
            Button({
              label: 'Close tour',
              action: Tour.DismissTour.tag,
              disabled: !Tour.isRunning(tour.state),
              slot: tour.slot('CloseButton'),
            }),
          ),
        ),
      ),
    ),
    // Marquee
    Column(
      { gap: 1, slot: marquee.slot('Root') },
      Row(
        { gap: 1, slot: marquee.slot('Viewport') },
        Box(
          { padding: 0, slot: marquee.slot('Content', '0') },
          Text('Breaking news'),
        ),
        Box(
          { padding: 0, slot: marquee.slot('Content', '1') },
          Text('Breaking news'),
        ),
      ),
      Button({
        label: 'Toggle marquee',
        action: Marquee.ToggleMarquee.tag,
        disabled:
          Marquee.isDisabledOf(props.marquee) ||
          Marquee.isFinishedOf(marquee.state, props.marquee),
        slot: marquee.slot('ToggleButton'),
      }),
    ),
  )
}

export const makeApp = (overrides: FixtureOverrides = {}) => {
  const resolvedProps: FixtureProps = {
    carousel: { ...defaultCarouselProps, ...overrides.carousel },
    floatingPanel: { ...defaultFloatingPanelProps, ...overrides.floatingPanel },
    imageCropper: { ...defaultImageCropperProps, ...overrides.imageCropper },
    signaturePad: { ...defaultSignaturePadProps, ...overrides.signaturePad },
    tour: { ...defaultTourProps, ...overrides.tour },
    marquee: { ...defaultMarqueeProps, ...overrides.marquee },
  }

  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(
          Carousel.make({ name: 'Carousel' }),
          () => resolvedProps.carousel,
        ),
        Part.given(
          FloatingPanel.make({ name: 'FloatingPanel' }),
          () => resolvedProps.floatingPanel,
        ),
        Part.given(
          ImageCropper.make({ name: 'ImageCropper' }),
          () => resolvedProps.imageCropper,
        ),
        Part.given(
          SignaturePad.make({ name: 'SignaturePad' }),
          () => resolvedProps.signaturePad,
        ),
        Part.given(Tour.make({ name: 'Tour' }), () => resolvedProps.tour),
        Part.given(
          Marquee.make({ name: 'Marquee' }),
          () => resolvedProps.marquee,
        ),
      ],
      screen: (model, views) => cluster4Screen(model, views, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Cluster4Message =
  | Carousel.Message
  | FloatingPanel.Message
  | ImageCropper.Message
  | SignaturePad.Message
  | Tour.Message
  | Marquee.Message

export type Running = Readonly<{
  props: FixtureProps
  model: () => Model
  carouselState: () => Carousel.State
  floatingPanelState: () => FloatingPanel.State
  imageCropperState: () => ImageCropper.State
  signaturePadState: () => SignaturePad.State
  tourState: () => Tour.State
  marqueeState: () => Marquee.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Cluster4Message) => void
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
    carouselState: () => held.model.parts['Carousel'],
    floatingPanelState: () => held.model.parts['FloatingPanel'],
    imageCropperState: () => held.model.parts['ImageCropper'],
    signaturePadState: () => held.model.parts['SignaturePad'],
    tourState: () => held.model.parts['Tour'],
    marqueeState: () => held.model.parts['Marquee'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
