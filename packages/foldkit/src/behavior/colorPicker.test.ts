import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as ColorPicker from './colorPicker.js'
import * as Layers from './layers.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: ColorPicker.Props = {
  id: 'accent-color',
  swatches: ['#ff0000', '#00ff00', '#0000ff'],
  label: 'Accent color',
}

const step = (
  state: ColorPicker.State,
  message: ColorPicker.Message,
  props: ColorPicker.Props = baseProps,
): ColorPicker.State => ColorPicker.chart.transition(state, message, props)[0]

describe('ColorPicker Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'ColorPicker', chart: ColorPicker.chart }),
    ).toEqual([])
    expect(Part.problemsOf(ColorPicker.part)).toEqual([])
    expect(
      Part.problemsOf(
        ColorPicker.make({
          defaultColor: { h: 210, s: 80, b: 90, a: 1 },
          defaultFormat: 'Hex',
          sampleMs: 80,
        }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(ColorPicker.deviceOnly())).toEqual([])

    ColorPicker.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('performs lossless bidirectional HSBA, RGBA, HSLA, Hex conversions, formatColor, and parseColor', () => {
    expect(ColorPicker.triggerId('accent')).toBe('accent-trigger')
    expect(ColorPicker.contentId('accent')).toBe('accent-content')
    expect(ColorPicker.areaId('accent')).toBe('accent-area')
    expect(ColorPicker.areaThumbId('accent')).toBe('accent-area-thumb')
    expect(ColorPicker.channelSliderId('accent', 'Hue')).toBe(
      'accent-channel-hue',
    )
    expect(ColorPicker.channelSliderId('accent', 'Alpha')).toBe(
      'accent-channel-alpha',
    )
    expect(ColorPicker.swatchId('accent', '#ff0000')).toBe(
      'accent-swatch-ff0000',
    )
    expect(ColorPicker.inputId('accent')).toBe('accent-input')

    // Primary and neutral conversions
    const redHsba: ColorPicker.HsbaColor = { h: 0, s: 100, b: 100, a: 1 }
    const greenHsba: ColorPicker.HsbaColor = { h: 120, s: 100, b: 100, a: 1 }
    const blueHsba: ColorPicker.HsbaColor = { h: 240, s: 100, b: 100, a: 1 }
    expect(ColorPicker.hsbaToRgba(redHsba)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    })
    expect(ColorPicker.hsbaToRgba(greenHsba)).toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: 1,
    })
    expect(ColorPicker.hsbaToRgba(blueHsba)).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 1,
    })

    // Round-trip RGBA -> HSBA -> RGBA on arbitrary color
    const arbitrary: ColorPicker.RgbaColor = { r: 73, g: 149, b: 214, a: 0.75 }
    expect(ColorPicker.hsbaToRgba(ColorPicker.rgbaToHsba(arbitrary))).toEqual(
      arbitrary,
    )

    // Hex conversions (3, 4, 6, 8 digits + invalid)
    expect(ColorPicker.rgbaToHex({ r: 255, g: 0, b: 128, a: 1 })).toBe(
      '#ff0080',
    )
    expect(ColorPicker.rgbaToHex({ r: 255, g: 0, b: 128, a: 0.5 })).toBe(
      '#ff008080',
    )
    expect(ColorPicker.hexToRgba('#f08')).toEqual(
      Option.some({ r: 255, g: 0, b: 136, a: 1 }),
    )
    expect(ColorPicker.hexToRgba('#33669980')).toEqual(
      Option.some({ r: 51, g: 102, b: 153, a: 0.5 }),
    )
    expect(ColorPicker.hexToRgba('not-a-color')).toEqual(Option.none())

    // Format and parse across Hex, Rgb, Hsl, Hsb
    expect(ColorPicker.formatColor(redHsba, 'Hex')).toBe('#ff0000')
    expect(ColorPicker.formatColor(redHsba, 'Rgb')).toBe('rgb(255, 0, 0)')
    expect(ColorPicker.formatColor(redHsba, 'Hsl')).toBe('hsl(0, 100%, 50%)')
    expect(ColorPicker.formatColor(redHsba, 'Hsb')).toBe('hsb(0, 100%, 100%)')

    expect(ColorPicker.parseColor('#ff0000')).toEqual(Option.some(redHsba))
    expect(ColorPicker.parseColor('rgb(0, 255, 0)')).toEqual(
      Option.some(greenHsba),
    )
    expect(ColorPicker.parseColor('hsl(240, 100%, 50%)')).toEqual(
      Option.some(blueHsba),
    )
    expect(ColorPicker.parseColor('hsba(180, 50%, 80%, 0.5)')).toEqual(
      Option.some({ h: 180, s: 50, b: 80, a: 0.5 }),
    )
    expect(ColorPicker.parseColor('invalid')).toEqual(Option.none())

    // Area and channel point mapping
    const rect = { x: 0, y: 0, width: 200, height: 100 }
    expect(ColorPicker.areaFromPoint({ x: 100, y: 25 }, rect)).toEqual({
      saturation: 50,
      brightness: 75,
    })
    expect(
      ColorPicker.channelValueFromPoint('Hue', { x: 100, y: 10 }, rect),
    ).toBe(180)
    expect(
      ColorPicker.channelValueFromPoint('Alpha', { x: 50, y: 10 }, rect),
    ).toBe(0.25)
  })

  it('composes Placement.placeFor and Layers for popup positioning and stack-aware dismissal', () => {
    // Placement below when room fits, flipping above near bottom edge
    const below = ColorPicker.placeFor(
      { placement: { gapPx: 8, edgePx: 8 } },
      {
        anchor: { left: 100, top: 100, width: 40, height: 32 },
        size: { width: 240, height: 280 },
        view: { width: 1000, height: 800 },
      },
    )
    expect(below.side).toBe('Below')
    expect(below.top).toBe(140)

    const above = ColorPicker.placeFor(
      { placement: { gapPx: 8, edgePx: 8 } },
      {
        anchor: { left: 100, top: 700, width: 40, height: 32 },
        size: { width: 240, height: 280 },
        view: { width: 1000, height: 800 },
      },
    )
    expect(above.side).toBe('Above')

    // Open -> blocked when another layer sits on top -> dismissed when topmost
    const opened = step(ColorPicker.initial, ColorPicker.OpenColorPicker())
    expect(ColorPicker.isOpen(opened)).toBe(true)

    const buriedProps: ColorPicker.Props = {
      ...baseProps,
      layers: [Layers.layer('accent-color'), Layers.layer('nested-menu')],
    }
    const stillOpenEscape = step(
      opened,
      ColorPicker.PressedColorPickerKey({ key: 'Escape' }),
      buriedProps,
    )
    expect(ColorPicker.isOpen(stillOpenEscape)).toBe(true)

    const stillOpenInside = step(
      opened,
      ColorPicker.PressedOutsideColorPicker({ insideIds: ['accent-color'] }),
    )
    expect(ColorPicker.isOpen(stillOpenInside)).toBe(true)

    const closedOutside = step(
      opened,
      ColorPicker.PressedOutsideColorPicker({ insideIds: [] }),
    )
    expect(ColorPicker.isClosed(closedOutside)).toBe(true)

    // Modal layer reports outside pointer blocked
    expect(
      ColorPicker.isOutsidePointerBlocked(opened, {
        ...baseProps,
        isModal: true,
      }),
    ).toBe(true)
  })

  it('composes PointerDrag for 2D area drag, Hue/Alpha channel sliders, swatches, and text input', () => {
    const red = ColorPicker.initialColor({ h: 0, s: 100, b: 100, a: 1 })
    const opened = step(red, ColorPicker.OpenColorPicker())

    // 2D Area drag -> Move -> Escape cancels drag without closing popup
    const areaDragging = step(
      opened,
      ColorPicker.BeginAreaDrag({
        pointerId: 1,
        x: 50,
        y: 50,
        saturation: 50,
        brightness: 50,
      }),
    )
    expect(ColorPicker.isDragging(areaDragging)).toBe(true)
    const areaMoved = step(
      areaDragging,
      ColorPicker.MoveAreaDrag({
        pointerId: 1,
        x: 80,
        y: 20,
        saturation: 80,
        brightness: 90,
      }),
    )
    expect(ColorPicker.colorOf(areaMoved)).toEqual({
      h: 0,
      s: 80,
      b: 90,
      a: 1,
    })

    // First Escape cancels active drag and restores origin color while keeping popup Open
    const dragCancelled = step(
      areaMoved,
      ColorPicker.PressedColorPickerKey({ key: 'Escape' }),
    )
    expect(ColorPicker.isOpen(dragCancelled)).toBe(true)
    expect(ColorPicker.isDragging(dragCancelled)).toBe(false)
    expect(ColorPicker.colorOf(dragCancelled)).toEqual({
      h: 0,
      s: 100,
      b: 100,
      a: 1,
    })

    // Hue and Alpha channel slider drags
    const hueDragging = step(
      dragCancelled,
      ColorPicker.BeginChannelDrag({
        channel: 'Hue',
        pointerId: 2,
        x: 120,
        y: 0,
        value: 120,
      }),
    )
    const hueMoved = step(
      hueDragging,
      ColorPicker.MoveChannelDrag({
        channel: 'Hue',
        pointerId: 2,
        x: 240,
        y: 0,
        value: 240,
      }),
    )
    const hueEnded = step(hueMoved, ColorPicker.EndColorDrag({ pointerId: 2 }))
    expect(ColorPicker.colorOf(hueEnded).h).toBe(240)

    const alphaDragging = step(
      hueEnded,
      ColorPicker.BeginChannelDrag({
        channel: 'Alpha',
        pointerId: 3,
        x: 50,
        y: 0,
        value: 0.5,
      }),
    )
    const alphaEnded = step(
      alphaDragging,
      ColorPicker.EndColorDrag({ pointerId: 3 }),
    )
    expect(ColorPicker.colorOf(alphaEnded).a).toBe(0.5)

    // Swatch selection + closeOnSelectSwatch
    const swatched = step(
      alphaEnded,
      ColorPicker.SelectSwatch({ value: '#00ff00' }),
    )
    expect(ColorPicker.isOpen(swatched)).toBe(true)
    expect(ColorPicker.isSwatchSelected(swatched, '#00ff00')).toBe(true)

    const swatchedClosed = step(
      swatched,
      ColorPicker.SelectSwatch({ value: '#0000ff' }),
      { ...baseProps, closeOnSelectSwatch: true },
    )
    expect(ColorPicker.isClosed(swatchedClosed)).toBe(true)
    expect(ColorPicker.formattedValueOf(swatchedClosed)).toBe('#0000ff')

    // Format switch + text input draft validation & commit
    const rgbMode = step(
      swatchedClosed,
      ColorPicker.SetColorFormat({ format: 'Rgb' }),
    )
    expect(ColorPicker.formattedValueOf(rgbMode)).toBe('rgb(0, 0, 255)')

    const badDraft = step(
      rgbMode,
      ColorPicker.ChangedColorInput({ value: 'xyz' }),
    )
    expect(ColorPicker.isInputInvalid(badDraft)).toBe(true)
    const reverted = step(badDraft, ColorPicker.CommitColorInput())
    expect(ColorPicker.isInputInvalid(reverted)).toBe(false)
    expect(ColorPicker.formattedValueOf(reverted)).toBe('rgb(0, 0, 255)')

    const goodDraft = step(
      reverted,
      ColorPicker.ChangedColorInput({ value: '#ff8800' }),
    )
    const committed = step(goodDraft, ColorPicker.CommitColorInput())
    expect(ColorPicker.formattedValueOf(committed)).toBe('rgb(255, 136, 0)')
  })

  it('projects reference-stable SlotBindings for all 7 slots and composes with Sampled sync', () => {
    const opened = step(
      ColorPicker.initialColor({ h: 120, s: 100, b: 100, a: 0.8 }),
      ColorPicker.OpenColorPicker(),
    )
    const view1 = Part.view(ColorPicker.part, opened, baseProps)
    const view2 = Part.view(ColorPicker.part, opened, baseProps)
    expect(view1).toBe(view2)

    const triggerSlot = view1.slot('Trigger')
    const contentSlot = view1.slot('Content')
    const areaSlot = view1.slot('Area')
    const areaThumbSlot = view1.slot('AreaThumb')
    const hueSlot = view1.slot('ChannelSlider', 'Hue')
    const alphaSlot = view1.slot('ChannelSlider', 'Alpha')
    const greenSwatch = view1.slot('Swatch', '#00ff00')
    const redSwatch = view1.slot('Swatch', '#ff0000')
    const inputSlot = view1.slot('Input')

    expect(Slot.ariaOf(triggerSlot)).toMatchObject({
      id: 'accent-color-trigger',
      role: 'button',
      'aria-expanded': 'true',
      'aria-controls': 'accent-color-content',
      'aria-haspopup': 'dialog',
    })
    expect(Slot.ariaOf(contentSlot)['role']).toBe('dialog')
    expect(Slot.ariaOf(contentSlot)['hidden']).toBeUndefined()
    expect(Slot.ariaOf(areaSlot)['role']).toBe('group')
    expect(Slot.ariaOf(areaThumbSlot)).toMatchObject({
      role: 'slider',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '100',
    })
    expect(Slot.ariaOf(hueSlot)).toMatchObject({
      role: 'slider',
      'aria-valuemin': '0',
      'aria-valuemax': '360',
      'aria-valuenow': '120',
      'aria-valuetext': '120°',
    })
    expect(Slot.ariaOf(alphaSlot)).toMatchObject({
      role: 'slider',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '80',
      'aria-valuetext': '80%',
    })
    expect(Slot.ariaOf(redSwatch)['aria-selected']).toBe('false')
    expect(Slot.ariaOf(greenSwatch)['aria-selected']).toBe('false')
    expect(Slot.ariaOf(inputSlot)['role']).toBe('textbox')

    // Changing Hue keeps Area, Alpha slider, and Red swatch reference-stable
    const hueChanged = step(
      opened,
      ColorPicker.SetChannelValue({ channel: 'Hue', value: 240 }),
    )
    const nextView = Part.view(ColorPicker.part, hueChanged, baseProps)
    expect(nextView.slot('Area')).toBe(areaSlot)
    expect(nextView.slot('ChannelSlider', 'Alpha')).toBe(alphaSlot)
    expect(nextView.slot('Swatch', '#ff0000')).toBe(redSwatch)
    expect(nextView.slot('ChannelSlider', 'Hue')).not.toBe(hueSlot)

    // atRest closes popup while preserving color and format
    const resting = ColorPicker.atRest(hueChanged)
    expect(ColorPicker.isClosed(resting)).toBe(true)
    expect(ColorPicker.colorOf(resting).h).toBe(240)

    const Base = make({
      id: 'color-picker-test',
      version: 1,
      Model: S.Struct({ ready: S.Boolean }),
      Message: S.Union([
        Catalog.action('Ping', {
          what: 'Pings',
          why: 'To verify',
          meta: { label: 'Ping', keys: [] },
        }),
      ]),
      init: () => [{ ready: true }, []],
      update: model => [model, []],
    })
    const SyncedApp = Part.compose({
      of: Base,
      parts: [Part.given(ColorPicker.make({ sampleMs: 75 }), () => baseProps)],
    })
    expect(
      SyncedApp.synchronization?.messageCategory(ColorPicker.OpenColorPicker()),
    ).toBe('Domain')
    expect(
      SyncedApp.synchronization?.paceOf?.(
        ColorPicker.MoveAreaDrag({
          pointerId: 1,
          x: 10,
          y: 10,
          saturation: 20,
          brightness: 80,
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(
        ColorPicker.MoveChannelDrag({
          channel: 'Hue',
          pointerId: 1,
          x: 10,
          y: 0,
          value: 180,
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(
        ColorPicker.SelectSwatch({ value: '#ff0000' }),
      ),
    ).toEqual(Pace.Synced())

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(ColorPicker.deviceOnly(), () => baseProps)],
    })
    expect(
      LocalApp.synchronization?.isLocalOnly?.(ColorPicker.OpenColorPicker()),
    ).toBe(true)
  })
})
