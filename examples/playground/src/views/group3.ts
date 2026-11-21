import { Array, Option } from 'effect'
import {
  AngleSlider,
  Avatar,
  Carousel,
  Clipboard,
  ColorPicker,
  FloatingPanel,
  ImageCropper,
  Marquee,
  Pagination,
  Part,
  Progress,
  QrCode,
  ScrollArea,
  SignaturePad,
  Splitter,
  Steps,
  TableOfContents,
  Timer,
  Tour,
} from 'foldkit/behavior'
import type { Html } from 'foldkit/html'
import { surfaceDragMount } from 'foldkit/renderers'

import { H, dispatchPart, slotAttrs } from '../messages'
import { playgroundProps } from '../partsProps'
import type { PlaygroundModel } from '../state'

const { div, button, input, span, svg, path, img } = H

const splitterDragMount = surfaceDragMount({
  name: 'PlaygroundSplitterDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'splitter',
        Splitter.BeginResize({
          handleIndex: 0,
          pointerId: sample.pointerId,
          x: sample.localX,
          y: sample.localY,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'splitter',
        Splitter.MoveResize({
          pointerId: sample.pointerId,
          x: sample.localX,
          y: sample.localY,
          containerSizePx: sample.width,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'splitter',
        Splitter.EndResize({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'splitter',
        Splitter.CancelResize({ pointerId: sample.pointerId }),
      ),
    ),
})

const angleDialDragMount = surfaceDragMount({
  name: 'PlaygroundAngleDialDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'angleSlider',
        AngleSlider.BeginAngleDrag({
          pointerId: sample.pointerId,
          centerX: sample.width / 2,
          centerY: sample.height / 2,
          pointX: sample.localX,
          pointY: sample.localY,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'angleSlider',
        AngleSlider.MoveAngleDrag({
          pointerId: sample.pointerId,
          centerX: sample.width / 2,
          centerY: sample.height / 2,
          pointX: sample.localX,
          pointY: sample.localY,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'angleSlider',
        AngleSlider.EndAngleDrag({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'angleSlider',
        AngleSlider.CancelAngleDrag({ pointerId: sample.pointerId }),
      ),
    ),
})

const colorAreaDragMount = surfaceDragMount({
  name: 'PlaygroundColorAreaDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'colorPicker',
        ColorPicker.BeginAreaDrag({
          pointerId: sample.pointerId,
          x: sample.localX,
          y: sample.localY,
          saturation: Math.round(sample.ratioX * 100),
          brightness: Math.round((1 - sample.ratioY) * 100),
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'colorPicker',
        ColorPicker.MoveAreaDrag({
          pointerId: sample.pointerId,
          x: sample.localX,
          y: sample.localY,
          saturation: Math.round(sample.ratioX * 100),
          brightness: Math.round((1 - sample.ratioY) * 100),
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'colorPicker',
        ColorPicker.EndColorDrag({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'colorPicker',
        ColorPicker.CancelColorDrag({ pointerId: sample.pointerId }),
      ),
    ),
})

const carouselSwipeMount = surfaceDragMount({
  name: 'PlaygroundCarouselSwipe',
  isPreventingDefaultOnDown: false,
  thresholdPx: 8,
  onStart: sample =>
    Option.some(
      dispatchPart(
        'carousel',
        Carousel.BeginCarouselDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
          pointerType: sample.pointerType,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'carousel',
        Carousel.MoveCarouselDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'carousel',
        Carousel.ReleaseCarouselDrag({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'carousel',
        Carousel.CancelCarouselDrag({ pointerId: sample.pointerId }),
      ),
    ),
})

const floatingPanelDragMount = surfaceDragMount({
  name: 'PlaygroundFloatingPanelDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'floatingPanel',
        FloatingPanel.BeginFloatingPanelDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'floatingPanel',
        FloatingPanel.MoveFloatingPanelDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'floatingPanel',
        FloatingPanel.EndFloatingPanelDrag({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'floatingPanel',
        FloatingPanel.CancelFloatingPanelDrag({ pointerId: sample.pointerId }),
      ),
    ),
})

const cropBoxDragMount = surfaceDragMount({
  name: 'PlaygroundCropBoxDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'imageCropper',
        ImageCropper.BeginCropDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'imageCropper',
        ImageCropper.MoveCropDrag({
          pointerId: sample.pointerId,
          x: sample.clientX,
          y: sample.clientY,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'imageCropper',
        ImageCropper.EndCropDrag({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'imageCropper',
        ImageCropper.CancelCropDrag({ pointerId: sample.pointerId }),
      ),
    ),
})

const signatureSvgWidth = 260
const signatureSvgHeight = 104

const signatureDragMount = surfaceDragMount({
  name: 'PlaygroundSignatureDrag',
  onStart: sample =>
    Option.some(
      dispatchPart(
        'signaturePad',
        SignaturePad.BeginSignatureStroke({
          pointerId: sample.pointerId,
          x: Math.round(sample.ratioX * signatureSvgWidth * 10) / 10,
          y: Math.round(sample.ratioY * signatureSvgHeight * 10) / 10,
        }),
      ),
    ),
  onMove: sample =>
    Option.some(
      dispatchPart(
        'signaturePad',
        SignaturePad.MoveSignatureStroke({
          pointerId: sample.pointerId,
          x: Math.round(sample.ratioX * signatureSvgWidth * 10) / 10,
          y: Math.round(sample.ratioY * signatureSvgHeight * 10) / 10,
        }),
      ),
    ),
  onEnd: sample =>
    Option.some(
      dispatchPart(
        'signaturePad',
        SignaturePad.EndSignatureStroke({ pointerId: sample.pointerId }),
      ),
    ),
  onCancel: sample =>
    Option.some(
      dispatchPart(
        'signaturePad',
        SignaturePad.CancelSignatureStroke({ pointerId: sample.pointerId }),
      ),
    ),
})

export const renderGroup3 = (
  model: PlaygroundModel,
): Readonly<Record<string, Html>> => {
  const { parts } = model

  // 37. Pagination
  const pgPage = Pagination.currentPageOf(
    parts.pagination,
    playgroundProps.pagination,
  )
  const pgTotal = Pagination.totalPagesOf(
    parts.pagination,
    playgroundProps.pagination,
  )
  const pgItems = Pagination.pageRangeOf(
    parts.pagination,
    playgroundProps.pagination,
  )
  const paginationView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.Disabled(pgPage <= 1),
              H.OnClick(dispatchPart('pagination', Pagination.PrevPage())),
            ],
            ['‹'],
          ),
          ...Array.map(pgItems, item =>
            item._tag === 'Ellipsis'
              ? span([H.Class('pg-muted')], ['…'])
              : button(
                  [
                    H.Class(
                      item.value === pgPage
                        ? 'pg-btn pg-btn-sm pg-btn-primary'
                        : 'pg-btn pg-btn-sm',
                    ),
                    H.OnClick(
                      dispatchPart(
                        'pagination',
                        Pagination.GoToPage({ page: item.value }),
                      ),
                    ),
                  ],
                  [String(item.value)],
                ),
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.Disabled(pgPage >= pgTotal),
              H.OnClick(dispatchPart('pagination', Pagination.NextPage())),
            ],
            ['›'],
          ),
        ],
      ),
      span([H.Class('pg-muted')], [`Page ${pgPage} of ${pgTotal} (140 items)`]),
    ],
  )

  // 38. Steps
  const stepIdx = Steps.stepOf(parts.steps)
  const stepPct = Steps.percentOf(parts.steps, playgroundProps.steps)
  const stepItems = playgroundProps.steps.items ?? []
  const stepsView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        Array.map(stepItems, (item, index) => {
          const status = Steps.stepStatusOf(parts.steps, index)
          return button(
            [
              H.Class(
                status === 'Current'
                  ? 'pg-btn pg-btn-sm pg-btn-primary'
                  : status === 'Complete'
                    ? 'pg-btn pg-btn-sm pg-btn-active'
                    : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(dispatchPart('steps', Steps.GoToStep({ step: index }))),
            ],
            [
              `${status === 'Complete' ? '✓ ' : `${index + 1}. `}${item.label ?? ''}`,
            ],
          )
        }),
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('steps', Steps.PrevStep())),
            ],
            ['Back'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('steps', Steps.NextStep())),
            ],
            ['Next'],
          ),
          span(
            [H.Class('pg-muted mono')],
            [`Step ${stepIdx + 1}/4 (${stepPct}%)`],
          ),
        ],
      ),
    ],
  )

  // 39. TableOfContents
  const tocActive = parts.tableOfContents.maybeActiveId
  const tocView = div(
    [H.Class('pg-col')],
    Array.map(playgroundProps.tableOfContents.headings, heading =>
      button(
        [
          H.Class(
            Option.contains(tocActive, heading.id)
              ? 'pg-menu-item pg-menu-item-active'
              : 'pg-menu-item',
          ),
          H.Style({ paddingLeft: `${8 + (heading.depth - 1) * 14}px` }),
          H.OnClick(
            dispatchPart(
              'tableOfContents',
              TableOfContents.SelectHeading({ id: heading.id }),
            ),
          ),
        ],
        [heading.label],
      ),
    ),
  )

  // 40. ScrollArea
  const thumbGeo = ScrollArea.thumbGeometryOf(parts.scrollArea)
  const scrollAreaView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('scrollArea', ScrollArea.ScrollToStart())),
            ],
            ['Top'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('scrollArea', ScrollArea.ScrollBy({ delta: 90 })),
              ),
            ],
            ['+90px'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('scrollArea', ScrollArea.ScrollToEnd())),
            ],
            ['Bottom'],
          ),
        ],
      ),
      div(
        [H.Class('pg-bar-track')],
        [
          div(
            [
              H.Class('pg-bar-fill'),
              H.Style({
                width: `${Math.round(thumbGeo.thumbLengthRatio * 100)}%`,
                marginLeft: `${Math.round(thumbGeo.thumbOffsetRatio * 100)}%`,
              }),
            ],
            [],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted mono')],
        [
          `offset: ${Math.round(parts.scrollArea.scrollOffset)}px · thumb: ${Math.round(thumbGeo.thumbLengthPx)}px`,
        ],
      ),
    ],
  )

  // 41. Splitter (real finger drag + buttons)
  const splitSizes = Splitter.sizesOf(parts.splitter)
  const splitterPartView = Part.view(
    Splitter.part,
    parts.splitter,
    playgroundProps.splitter,
  )
  const leftPct = Math.round(
    Option.getOrElse(Array.get(splitSizes, 0), () => 40),
  )
  const rightPct = Math.round(
    Option.getOrElse(Array.get(splitSizes, 1), () => 60),
  )
  const splitterView = div(
    [H.Class('pg-col')],
    [
      div(
        [
          H.Class('pg-split-wrap'),
          ...slotAttrs(splitterPartView.slot('ResizeTrigger', '0')),
          H.OnMount(splitterDragMount),
        ],
        [
          div(
            [H.Class('pg-split-pane mono'), H.Style({ width: `${leftPct}%` })],
            [`${leftPct}%`],
          ),
          div([H.Class('pg-split-handle')], ['⋮']),
          div(
            [H.Class('pg-split-pane mono'), H.Style({ width: `${rightPct}%` })],
            [`${rightPct}%`],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'splitter',
                  Splitter.ResizeHandle({ handleIndex: 0, deltaPercent: -10 }),
                ),
              ),
            ],
            ['← 10%'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'splitter',
                  Splitter.ResizeHandle({ handleIndex: 0, deltaPercent: 10 }),
                ),
              ),
            ],
            ['10% →'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('splitter', Splitter.ResetSizes())),
            ],
            ['Reset'],
          ),
        ],
      ),
    ],
  )

  // 42. AngleSlider (real finger rotation on dial + buttons)
  const angleDeg = AngleSlider.angleOf(parts.angleSlider)
  const anglePartView = Part.view(
    AngleSlider.part,
    parts.angleSlider,
    playgroundProps.angleSlider,
  )
  const angleSliderView = div(
    [H.Class('pg-row')],
    [
      div(
        [
          H.Class('pg-dial'),
          ...slotAttrs(anglePartView.slot('Control')),
          H.Attribute('role', 'slider'),
          H.Attribute('aria-valuenow', String(angleDeg)),
          H.OnMount(angleDialDragMount),
        ],
        [
          div(
            [
              H.Class('pg-dial-needle'),
              H.Style({
                transform: `translate(-50%, -100%) rotate(${angleDeg}deg)`,
              }),
            ],
            [],
          ),
        ],
      ),
      div(
        [H.Class('pg-col')],
        [
          span([H.Class('pg-pill pg-pill-accent mono')], [`${angleDeg}°`]),
          div(
            [H.Class('pg-row')],
            [
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart(
                      'angleSlider',
                      AngleSlider.StepAngle({ delta: -15 }),
                    ),
                  ),
                ],
                ['−15°'],
              ),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart(
                      'angleSlider',
                      AngleSlider.StepAngle({ delta: 15 }),
                    ),
                  ),
                ],
                ['+15°'],
              ),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart('angleSlider', AngleSlider.ResetAngle()),
                  ),
                ],
                ['Reset'],
              ),
            ],
          ),
        ],
      ),
    ],
  )

  // 43. ColorPicker (live 2D touch area + swatches)
  const cpColor = ColorPicker.colorOf(parts.colorPicker)
  const cpHex = ColorPicker.formatColor(cpColor, 'Hex')
  const cpRgb = ColorPicker.formatColor(cpColor, 'Rgb')
  const colorPartView = Part.view(
    ColorPicker.part,
    parts.colorPicker,
    playgroundProps.colorPicker,
  )
  const swatches = playgroundProps.colorPicker.swatches ?? []
  const colorPickerView = div(
    [H.Class('pg-col')],
    [
      div(
        [
          H.Class('pg-color-area'),
          ...slotAttrs(colorPartView.slot('Area')),
          H.Style({
            background: `linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), hsl(${Math.round(cpColor.h)} 100% 50%))`,
          }),
          H.OnMount(colorAreaDragMount),
        ],
        [
          div(
            [
              H.Class('pg-color-thumb'),
              H.Style({
                left: `${cpColor.s}%`,
                top: `${100 - cpColor.b}%`,
                background: cpHex,
              }),
            ],
            [],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          span([H.Class('mono')], [cpHex]),
          span([H.Class('pg-faint mono')], [cpRgb]),
        ],
      ),
      div(
        [H.Class('pg-row')],
        Array.map(swatches, swatch =>
          button(
            [
              H.Class('pg-swatch-btn'),
              H.Style({ background: swatch }),
              H.Attribute('aria-label', swatch),
              H.OnClick(
                dispatchPart(
                  'colorPicker',
                  ColorPicker.SelectSwatch({ value: swatch }),
                ),
              ),
            ],
            [],
          ),
        ),
      ),
    ],
  )

  // 44. Carousel (real horizontal swipe + controls)
  const carPage = Carousel.pageOf(parts.carousel, playgroundProps.carousel)
  const carPlaying = Carousel.isAutoplaying(parts.carousel)
  const carouselPartView = Part.view(
    Carousel.part,
    parts.carousel,
    playgroundProps.carousel,
  )
  const slideTitles = [
    '1 · Pure Machine State (swipe ←/→)',
    '2 · Reference-Stable Slots (swipe ←/→)',
    '3 · Pace.Settled & Sampled (swipe ←/→)',
    '4 · HTML · React · RN · CLI (swipe ←/→)',
  ]
  const carouselView = div(
    [H.Class('pg-col')],
    [
      div(
        [
          H.Class('pg-carousel-viewport'),
          ...slotAttrs(carouselPartView.slot('Slide', String(carPage))),
          H.OnMount(carouselSwipeMount),
        ],
        [
          span(
            [H.Class('mono')],
            [
              Option.getOrElse(
                Array.get(slideTitles, carPage),
                () => `Slide ${carPage + 1}`,
              ),
            ],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('carousel', Carousel.PrevSlide())),
            ],
            ['‹ Prev'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('carousel', Carousel.NextSlide())),
            ],
            ['Next ›'],
          ),
          button(
            [
              H.Class(
                carPlaying
                  ? 'pg-btn pg-btn-sm pg-btn-primary'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart('carousel', Carousel.ToggleCarouselAutoplay()),
              ),
            ],
            [carPlaying ? '❚❚ Autoplay' : '▶ Autoplay'],
          ),
        ],
      ),
    ],
  )

  // 45. FloatingPanel (real finger drag inside stage + min/max/restore)
  const fpOpen = FloatingPanel.isOpen(parts.floatingPanel)
  const fpStage = FloatingPanel.stageOf(parts.floatingPanel)
  const floatingPartView = Part.view(
    FloatingPanel.part,
    parts.floatingPanel,
    playgroundProps.floatingPanel,
  )
  const fpRect = Option.getOrElse(
    FloatingPanel.rectOf(parts.floatingPanel),
    () => ({
      x: 16,
      y: 12,
      width: 170,
      height: 86,
    }),
  )
  const floatingPanelView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-stage')],
        [
          fpOpen
            ? div(
                [
                  H.Class('pg-floating-box'),
                  ...slotAttrs(floatingPartView.slot('Header')),
                  H.Style({
                    left: `${Math.min(120, Math.max(4, fpRect.x))}px`,
                    top: `${Math.min(58, Math.max(4, fpRect.y))}px`,
                    width: `${Math.min(248, fpRect.width)}px`,
                    height: `${Math.min(108, fpRect.height)}px`,
                  }),
                  H.OnMount(floatingPanelDragMount),
                ],
                [
                  div(
                    [H.Class('pg-row')],
                    [span([H.Class('mono')], [`Drag me (${fpStage})`])],
                  ),
                  span(
                    [H.Class('pg-faint mono')],
                    [
                      `${Math.round(fpRect.width)}×${Math.round(fpRect.height)} @ ${Math.round(fpRect.x)},${Math.round(fpRect.y)}`,
                    ],
                  ),
                ],
              )
            : div(
                [H.Class('pg-muted'), H.Style({ padding: '12px' })],
                ['Panel closed'],
              ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'floatingPanel',
                  fpOpen
                    ? FloatingPanel.CloseFloatingPanel()
                    : FloatingPanel.OpenFloatingPanel(),
                ),
              ),
            ],
            [fpOpen ? 'Close' : 'Open'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'floatingPanel',
                  FloatingPanel.MinimizeFloatingPanel(),
                ),
              ),
            ],
            ['Min'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'floatingPanel',
                  FloatingPanel.MaximizeFloatingPanel(),
                ),
              ),
            ],
            ['Max'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'floatingPanel',
                  FloatingPanel.RestoreFloatingPanel(),
                ),
              ),
            ],
            ['Restore'],
          ),
        ],
      ),
    ],
  )

  // 46. ImageCropper (real finger pan drag + zoom/rotate)
  const cropRect = ImageCropper.cropRectOf(parts.imageCropper)
  const cropZoom = ImageCropper.zoomOf(parts.imageCropper)
  const cropRot = ImageCropper.rotationOf(parts.imageCropper)
  const cropPartView = Part.view(
    ImageCropper.part,
    parts.imageCropper,
    playgroundProps.imageCropper,
  )
  const imageCropperView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-stage')],
        [
          div(
            [
              H.Class('pg-crop-box'),
              ...slotAttrs(cropPartView.slot('Selection')),
              H.Style({
                left: `${Math.round(cropRect.x)}px`,
                top: `${Math.round(cropRect.y)}px`,
                width: `${Math.round(cropRect.width)}px`,
                height: `${Math.round(cropRect.height)}px`,
                transform: `rotate(${cropRot}deg)`,
              }),
              H.OnMount(cropBoxDragMount),
            ],
            ['Drag crop'],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('imageCropper', ImageCropper.ZoomInCrop()),
              ),
            ],
            ['Zoom +'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'imageCropper',
                  ImageCropper.SetCropRotation({
                    rotation: (cropRot + 90) % 360,
                  }),
                ),
              ),
            ],
            ['Rotate 90°'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('imageCropper', ImageCropper.ResetCrop())),
            ],
            ['Reset'],
          ),
          span(
            [H.Class('pg-faint mono')],
            [`${cropZoom.toFixed(1)}× · ${cropRot}°`],
          ),
        ],
      ),
    ],
  )

  // 47. SignaturePad (accurate finger-to-SVG coordinate capture + undo/clear)
  const sigPaths = SignaturePad.allPathsOf(parts.signaturePad)
  const sigCount = SignaturePad.strokeCountOf(parts.signaturePad)
  const signaturePartView = Part.view(
    SignaturePad.part,
    parts.signaturePad,
    playgroundProps.signaturePad,
  )
  const signaturePadView = div(
    [H.Class('pg-col')],
    [
      svg(
        [
          H.Class('pg-sig-box'),
          ...slotAttrs(signaturePartView.slot('Root')),
          H.ViewBox(`0 0 ${signatureSvgWidth} ${signatureSvgHeight}`),
          H.OnMount(signatureDragMount),
        ],
        Array.map(sigPaths, d =>
          path(
            [
              H.D(d),
              H.Fill('none'),
              H.Stroke('var(--fk-accent)'),
              H.StrokeWidth('2.5'),
            ],
            [],
          ),
        ),
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('signaturePad', SignaturePad.UndoStroke()),
              ),
            ],
            ['Undo'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('signaturePad', SignaturePad.ClearSignature()),
              ),
            ],
            ['Clear'],
          ),
          span(
            [H.Class('pg-muted mono')],
            [`${sigCount} stroke(s) — draw with finger`],
          ),
        ],
      ),
    ],
  )

  // 48. Tour
  const tourRunning = Tour.isRunning(parts.tour)
  const tourStep = Tour.currentStepOf(parts.tour, playgroundProps.tour)
  const tourIdx = Option.getOrElse(
    Tour.stepIndexOf(parts.tour, playgroundProps.tour),
    () => 0,
  )
  const tourView = div(
    [H.Class('pg-col')],
    [
      tourRunning
        ? Option.match(tourStep, {
            onNone: () => H.empty,
            onSome: step =>
              div(
                [H.Class('pg-popup')],
                [
                  span(
                    [H.Class('mono')],
                    [`Step ${tourIdx + 1}/3 · ${step.title}`],
                  ),
                  span([H.Class('pg-muted')], [step.description]),
                  div(
                    [H.Class('pg-row')],
                    [
                      button(
                        [
                          H.Class('pg-btn pg-btn-sm'),
                          H.OnClick(dispatchPart('tour', Tour.PrevStep())),
                        ],
                        ['Prev'],
                      ),
                      button(
                        [
                          H.Class('pg-btn pg-btn-sm pg-btn-primary'),
                          H.OnClick(dispatchPart('tour', Tour.NextStep())),
                        ],
                        ['Next'],
                      ),
                      button(
                        [
                          H.Class('pg-btn pg-btn-sm'),
                          H.OnClick(dispatchPart('tour', Tour.SkipTour())),
                        ],
                        ['Skip'],
                      ),
                    ],
                  ),
                ],
              ),
          })
        : button(
            [
              H.Class('pg-btn pg-btn-primary'),
              H.OnClick(dispatchPart('tour', Tour.StartTour())),
            ],
            ['Start 3-Step Guided Tour'],
          ),
    ],
  )

  // 49. Marquee
  const marqueeRunning = Marquee.isRunning(parts.marquee)
  const marqueeView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-marquee-track')],
        [
          div(
            [
              H.Class(
                marqueeRunning
                  ? 'pg-marquee-inner'
                  : 'pg-marquee-inner pg-marquee-paused',
              ),
            ],
            [
              span(
                [],
                ['FOLDKIT CORE · 54 PARTS · ZERO PAINTER RULES · EFFECT-TS ·'],
              ),
              span(
                [],
                ['FOLDKIT CORE · 54 PARTS · ZERO PAINTER RULES · EFFECT-TS ·'],
              ),
            ],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('marquee', Marquee.ToggleMarquee())),
            ],
            [marqueeRunning ? '❚❚ Pause' : '▶ Resume'],
          ),
          span([H.Class('pg-muted')], [`State: ${parts.marquee._tag}`]),
        ],
      ),
    ],
  )

  // 50. Timer
  const timerMs = Timer.currentMsOf(parts.timer, playgroundProps.timer)
  const timerRunning = Timer.isRunning(parts.timer)
  const timerPaused = Timer.isPaused(parts.timer)
  const timerLaps = Timer.lapsOf(parts.timer)
  const timerView = div(
    [H.Class('pg-col')],
    [
      span(
        [H.Class('mono'), H.Style({ fontSize: '20px', fontWeight: '700' })],
        [Timer.clockTextOf(timerMs)],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm pg-btn-primary'),
              H.OnClick(
                dispatchPart(
                  'timer',
                  timerRunning
                    ? Timer.PauseTimer()
                    : timerPaused
                      ? Timer.ResumeTimer()
                      : Timer.StartTimer(),
                ),
              ),
            ],
            [timerRunning ? 'Pause' : timerPaused ? 'Resume' : 'Start'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('timer', Timer.LapTimer())),
            ],
            [`Lap (${timerLaps.length})`],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('timer', Timer.ResetTimer())),
            ],
            ['Reset'],
          ),
        ],
      ),
    ],
  )

  // 51. Progress & Meter
  const progPct = Option.getOrElse(Progress.percentOf(parts.progress), () => 0)
  const progZone = Progress.meterZoneOf(
    parts.progress,
    playgroundProps.progress,
  )
  const fillClass =
    progZone === 'Optimal'
      ? 'pg-bar-fill pg-bar-fill-positive'
      : progZone === 'Suboptimal'
        ? 'pg-bar-fill pg-bar-fill-warning'
        : 'pg-bar-fill pg-bar-fill-danger'
  const progressView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-bar-track')],
        [
          div(
            [H.Class(fillClass), H.Style({ width: `${Math.round(progPct)}%` })],
            [],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'progress',
                  Progress.SetProgressValue({ value: 22 }),
                ),
              ),
            ],
            ['22% Critical'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'progress',
                  Progress.SetProgressValue({ value: 58 }),
                ),
              ),
            ],
            ['58% Subopt'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'progress',
                  Progress.SetProgressValue({ value: 88 }),
                ),
              ),
            ],
            ['88% Optimal'],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted mono')],
        [`Meter zone: ${progZone} (${Math.round(progPct)}%)`],
      ),
    ],
  )

  // 52. Avatar
  const showAvatarImg = Avatar.showImage(parts.avatar)
  const avatarInitials = Avatar.initialsOf('Michael Foldkit')
  const avatarView = div(
    [H.Class('pg-row')],
    [
      div(
        [H.Class('pg-avatar-circle')],
        [
          showAvatarImg
            ? img([
                H.Src(
                  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%233b82f6"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="26" font-family="sans-serif" font-weight="bold">MF</text></svg>',
                ),
                H.Alt('Avatar'),
              ])
            : span([], [avatarInitials]),
        ],
      ),
      div(
        [H.Class('pg-col')],
        [
          span([H.Class('pg-pill')], [`State: ${parts.avatar._tag}`]),
          div(
            [H.Class('pg-row')],
            [
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(dispatchPart('avatar', Avatar.LoadedAvatarImage())),
                ],
                ['Simulate Load'],
              ),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(dispatchPart('avatar', Avatar.FailedAvatarImage())),
                ],
                ['Simulate Error'],
              ),
            ],
          ),
        ],
      ),
    ],
  )

  // 53. Clipboard (no <16px inline font override so iOS never zooms on focus!)
  const clipCopied = Clipboard.copiedOf(parts.clipboard)
  const clipText = Clipboard.valueOf(parts.clipboard, playgroundProps.clipboard)
  const clipboardView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          input([
            H.Class('pg-input pg-input-compact mono'),
            H.Style({ flex: '1' }),
            H.Value(clipText),
            H.OnInput(value =>
              dispatchPart('clipboard', Clipboard.SetClipboardValue({ value })),
            ),
          ]),
          button(
            [
              H.Class(
                clipCopied
                  ? 'pg-btn pg-btn-primary pg-btn-sm'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(dispatchPart('clipboard', Clipboard.CopyClipboard())),
            ],
            [clipCopied ? '✓ Copied!' : 'Copy'],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        [
          clipCopied
            ? 'TimedHint active — resets automatically'
            : 'Device-only clipboard effect',
        ],
      ),
    ],
  )

  // 54. QrCode (no <16px inline font override so iOS never zooms on focus!)
  const qrValue = QrCode.valueOf(parts.qrCode)
  const qrSvgPath =
    parts.qrCode._tag === 'Ready'
      ? Option.some({
          d: QrCode.svgPathOf(parts.qrCode.matrix),
          vb: QrCode.viewBoxOf(parts.qrCode.matrix),
          version: parts.qrCode.matrix.version,
          size: parts.qrCode.matrix.size,
        })
      : Option.none()
  const qrCodeView = div(
    [H.Class('pg-row')],
    [
      Option.match(qrSvgPath, {
        onNone: () => div([H.Class('pg-surface-box pg-muted')], ['Empty QR']),
        onSome: ({ d, vb }) =>
          svg(
            [H.Class('pg-qr-svg'), H.ViewBox(vb)],
            [path([H.D(d), H.Fill('var(--fk-text)')], [])],
          ),
      }),
      div(
        [H.Class('pg-col'), H.Style({ flex: '1', minWidth: '140px' })],
        [
          input([
            H.Class('pg-input pg-input-compact mono'),
            H.Value(qrValue),
            H.Placeholder('Any URL or text…'),
            H.OnInput(value =>
              dispatchPart('qrCode', QrCode.SetQrCodeValue({ value })),
            ),
          ]),
          Option.match(qrSvgPath, {
            onNone: () => H.empty,
            onSome: ({ version, size }) =>
              span(
                [H.Class('pg-faint mono')],
                [`ISO 18004 v${version} (${size}×${size}) · pure TS`],
              ),
          }),
        ],
      ),
    ],
  )

  return {
    pagination: paginationView,
    steps: stepsView,
    tableOfContents: tocView,
    scrollArea: scrollAreaView,
    splitter: splitterView,
    angleSlider: angleSliderView,
    colorPicker: colorPickerView,
    carousel: carouselView,
    floatingPanel: floatingPanelView,
    imageCropper: imageCropperView,
    signaturePad: signaturePadView,
    tour: tourView,
    marquee: marqueeView,
    timer: timerView,
    progress: progressView,
    avatar: avatarView,
    clipboard: clipboardView,
    qrCode: qrCodeView,
  }
}
