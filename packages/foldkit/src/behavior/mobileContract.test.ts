import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { declarationOf } from '../catalog/catalog.js'
import * as Declaration from '../declaration/declaration.js'
import * as ModelPath from '../declaration/modelPath.js'
import { slotAttributesOf } from '../renderers/htmlHost.js'
import * as AngleSlider from './angleSlider.js'
import * as BoundField from './boundField.js'
import * as Carousel from './carousel.js'
import * as ColorPicker from './colorPicker.js'
import * as Combobox from './combobox.js'
import * as Drawer from './drawer.js'
import * as FloatingPanel from './floatingPanel.js'
import * as HoverCard from './hoverCard.js'
import * as ImageCropper from './imageCropper.js'
import * as NumberInput from './numberInput.js'
import * as Part from './part.js'
import * as PinInput from './pinInput.js'
import * as PointerDrag from './pointerDrag.js'
import * as ScrollArea from './scrollArea.js'
import * as SignaturePad from './signaturePad.js'
import * as Slider from './slider.js'
import * as Slot from './slot.js'
import * as Splitter from './splitter.js'
import * as TagsInput from './tagsInput.js'
import * as Tooltip from './tooltip.js'

describe('Core mobile & touch architectural contract', () => {
  it('keeps mobile traits out of Slot.ariaOf while emitting them via slotAttributesOf', () => {
    const numView1 = Part.view(NumberInput.part, NumberInput.initial, {
      id: 'qty',
      min: 0,
      step: 0.5,
    })
    const numView2 = Part.view(NumberInput.part, NumberInput.initial, {
      id: 'qty',
      min: 0,
      step: 0.5,
    })
    expect(numView1.slot('Input')).toBe(numView2.slot('Input'))
    expect(numView1.slot('Scrubber')).toBe(numView2.slot('Scrubber'))

    const aria = Slot.ariaOf(numView1.slot('Input'))
    expect(aria['inputmode']).toBeUndefined()
    expect(aria['enterkeyhint']).toBeUndefined()
    expect(aria['data-slot-drag']).toBeUndefined()

    const attrs = Object.fromEntries(slotAttributesOf(numView1.slot('Input')))
    expect(attrs['inputmode']).toBe('decimal')
    expect(attrs['enterkeyhint']).toBe('done')

    const scrubberAttrs = Object.fromEntries(
      slotAttributesOf(numView1.slot('Scrubber')),
    )
    expect(scrubberAttrs['data-slot-drag']).toBe('horizontal')
  })

  it('derives iOS-safe NumberInput inputMode (falling back to Text when min < 0 or unbounded) and OTP-only PinInput autofill', () => {
    expect(NumberInput.inputModeOf({ min: -10, step: 1 })).toBe('Text')
    expect(NumberInput.inputModeOf({ step: 1 })).toBe('Text')
    expect(NumberInput.inputModeOf({ min: 0, step: 1 })).toBe('Numeric')
    expect(NumberInput.inputModeOf({ min: 0, step: 0.25 })).toBe('Decimal')

    const plainPin = Part.view(PinInput.part, PinInput.initial, { id: 'pin' })
    const otpPin = Part.view(PinInput.part, PinInput.initial, {
      id: 'otp',
      isOtp: true,
    })
    expect(plainPin.slot('Input', '0').inputMode).toBe('Numeric')
    expect(plainPin.slot('Input', '0').autofill).toBeUndefined()
    expect(otpPin.slot('Input', '0').autofill).toBe('OneTimeCode')
    expect(
      Object.fromEntries(slotAttributesOf(otpPin.slot('Input', '0')))[
        'autocomplete'
      ],
    ).toBe('one-time-code')

    const tagsView = Part.view(TagsInput.part, TagsInput.initial, {
      id: 'tags',
    })
    expect(tagsView.slot('Input').inputMode).toBe('Text')
    expect(tagsView.slot('Input').enterKeyHint).toBe('Done')

    const comboView = Part.view(Combobox.part, Combobox.initial, {
      id: 'cb',
      items: [],
    })
    expect(comboView.slot('Input').autofill).toBe('Off')
  })

  it('derives BoundField inputMode and closed autofill through toSlots', () => {
    const FormModel = S.Struct({ email: S.String, otp: S.String })
    const at = ModelPath.of(FormModel)
    const emailField = BoundField.text(at.email, S.String, {
      inputType: 'email',
      enterKeyHint: 'Next',
    })
    const otpField = BoundField.text(at.otp, S.String, {
      inputMode: 'Numeric',
      autofill: 'OneTimeCode',
      enterKeyHint: 'Done',
    })
    const emailSlots = BoundField.toSlots(emailField, BoundField.initial())
    const otpSlots = BoundField.toSlots(otpField, BoundField.initial())

    expect(emailSlots.control.inputMode).toBe('Email')
    expect(emailSlots.control.enterKeyHint).toBe('Next')
    expect(otpSlots.control.inputMode).toBe('Numeric')
    expect(otpSlots.control.autofill).toBe('OneTimeCode')
  })

  it('scopes dragAxis strictly to leaf grip/canvas slots, never Viewport/Content/HeldLong, and guarantees WCAG 2.5.7 non-drag Catalog actions', () => {
    const heldMenuRow = Slot.menuAsk('ShowWordMenu')
    expect(heldMenuRow.dragAxis).toBeUndefined()

    const dragPartChecks: ReadonlyArray<
      Readonly<{
        name: string
        part: Part.AnyPart
        claimed: ReadonlyArray<readonly [string, Slot.DragAxis]>
        unclaimedContainers: ReadonlyArray<string>
      }>
    > = [
      {
        name: 'Slider',
        part: Slider.part,
        claimed: [
          ['Track', 'Horizontal'],
          ['Thumb', 'Horizontal'],
        ],
        unclaimedContainers: ['Root'],
      },
      {
        name: 'Splitter',
        part: Splitter.part,
        claimed: [['ResizeTrigger', 'Horizontal']],
        unclaimedContainers: ['Root', 'Panel'],
      },
      {
        name: 'Drawer',
        part: Drawer.part,
        claimed: [['Grabber', 'Vertical']],
        unclaimedContainers: ['Content', 'Backdrop', 'Trigger'],
      },
      {
        name: 'ScrollArea',
        part: ScrollArea.part,
        claimed: [
          ['Scrollbar', 'Vertical'],
          ['Thumb', 'Vertical'],
        ],
        unclaimedContainers: ['Viewport'],
      },
      {
        name: 'Carousel',
        part: Carousel.part,
        claimed: [['Slide', 'Horizontal']],
        unclaimedContainers: ['Root', 'Viewport'],
      },
      {
        name: 'AngleSlider',
        part: AngleSlider.part,
        claimed: [
          ['Control', 'Plane'],
          ['Thumb', 'Plane'],
        ],
        unclaimedContainers: ['Root'],
      },
      {
        name: 'ColorPicker',
        part: ColorPicker.part,
        claimed: [
          ['Area', 'Plane'],
          ['AreaThumb', 'Plane'],
          ['ChannelSlider', 'Horizontal'],
        ],
        unclaimedContainers: ['Content', 'Trigger'],
      },
      {
        name: 'FloatingPanel',
        part: FloatingPanel.part,
        claimed: [
          ['Header', 'Plane'],
          ['ResizeHandle', 'Plane'],
        ],
        unclaimedContainers: ['Root', 'Body'],
      },
      {
        name: 'ImageCropper',
        part: ImageCropper.part,
        claimed: [
          ['Selection', 'Plane'],
          ['Handle', 'Plane'],
        ],
        unclaimedContainers: ['Root', 'Viewport'],
      },
      {
        name: 'SignaturePad',
        part: SignaturePad.part,
        claimed: [['Root', 'Plane']],
        unclaimedContainers: ['Segment'],
      },
    ]

    const samplePropsByPart: Readonly<Record<string, unknown>> = {
      Slider: { id: 'sl' },
      Splitter: {
        id: 'sp',
        panels: [{ id: 'a' }, { id: 'b' }],
      },
      Drawer: { id: 'dr' },
      ScrollArea: { id: 'sa' },
      Carousel: { id: 'ca', slideCount: 3 },
      AngleSlider: { id: 'as' },
      ColorPicker: { id: 'cp' },
      FloatingPanel: { id: 'fp' },
      ImageCropper: {
        id: 'ic',
        viewportSize: { width: 200, height: 150 },
      },
      SignaturePad: { id: 'sg' },
    }

    for (const entry of dragPartChecks) {
      // WCAG 2.5.7: every drag Part exposes non-drag Catalog actions, and none leak client words
      expect(entry.part.actions.length).toBeGreaterThan(0)
      for (const action of entry.part.actions) {
        const decl = declarationOf(action)
        expect(Declaration.clientWordsOf(decl)).toEqual([])
      }

      const props = samplePropsByPart[entry.name]
      const view = Part.view(entry.part, entry.part.chart.initial, props)
      for (const [slotName, expectedAxis] of entry.claimed) {
        expect(view.slot(slotName).dragAxis).toBe(expectedAxis)
      }
      for (const containerSlot of entry.unclaimedContainers) {
        expect(view.slot(containerSlot).dragAxis).toBeUndefined()
      }
    }
  })

  it('handles both iOS Safari (no tap focus) and Chrome Android (tap focus) sequences without sticking open, while preserving keyboard focus', () => {
    const tipProps: Tooltip.Props = { id: 'tip', showDelayMs: 0 }
    const cardProps: HoverCard.Props = { id: 'hc', openDelayMs: 0 }

    // iOS Safari tap order: pointerdown(touch) -> pointerenter(touch) -> pointerleave(touch) -> click (no focus)
    let tip = Tooltip.initial
    for (const msg of [
      Tooltip.PressTooltipPointer({ pointerType: 'touch' }),
      Tooltip.EnterTooltipTrigger({ pointerType: 'touch' }),
      Tooltip.LeaveTooltipTrigger({ pointerType: 'touch' }),
    ]) {
      ;[tip] = Tooltip.chart.transition(tip, msg, tipProps)
    }
    expect(Tooltip.isOpen(tip)).toBe(false)

    // Chrome Android tap order: pointerdown(touch) -> pointerenter(touch) -> focus -> pointerup
    let androidCard = HoverCard.initial
    for (const msg of [
      HoverCard.PressHoverCardPointer({ pointerType: 'touch' }),
      HoverCard.EnterHoverCardTrigger({ pointerType: 'touch' }),
      HoverCard.FocusHoverCardTrigger(),
    ]) {
      ;[androidCard] = HoverCard.chart.transition(androidCard, msg, cardProps)
    }
    expect(HoverCard.isOpen(androidCard)).toBe(false)

    // Subsequent keyboard focus still opens cleanly after blur
    const [blurred] = HoverCard.chart.transition(
      androidCard,
      HoverCard.BlurHoverCardTrigger(),
      cardProps,
    )
    const [kbOpened] = HoverCard.chart.transition(
      blurred,
      HoverCard.FocusHoverCardTrigger(),
      cardProps,
    )
    expect(HoverCard.isOpen(kbOpened)).toBe(true)

    // Tooltip still declares HeldLong -> ShowTooltip for deliberate touch long-press
    const triggerSlot = Part.view(Tooltip.part, Tooltip.initial, tipProps).slot(
      'Trigger',
    )
    expect(Option.isSome(triggerSlot.maybeHold)).toBe(true)
  })

  it('computes pure LTR and RTL fractions via PointerDrag.sampleInRect', () => {
    expect(
      PointerDrag.sampleInRect(
        { x: 60, y: 25 },
        { x: 10, y: 5, width: 100, height: 80 },
      ),
    ).toEqual({
      localX: 50,
      localY: 20,
      width: 100,
      height: 80,
      ratioX: 0.5,
      ratioY: 0.25,
    })
    expect(
      PointerDrag.sampleInRect(
        { x: 35, y: 25 },
        { x: 10, y: 5, width: 100, height: 80 },
        { direction: 'Rtl' },
      ),
    ).toEqual({
      localX: 25,
      localY: 20,
      width: 100,
      height: 80,
      ratioX: 0.75,
      ratioY: 0.25,
    })
  })
})
