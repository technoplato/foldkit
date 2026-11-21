import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Disclosure from './disclosure.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Presence from './presence.js'
import * as Slot from './slot.js'

const singleProps: Disclosure.Props = {
  id: 'details',
  label: 'More details',
}

const accordionItems: ReadonlyArray<Disclosure.Item> = [
  { value: 'overview', label: 'Overview' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'billing', label: 'Billing', isDisabled: true },
  { value: 'returns', label: 'Returns' },
]

const accordionProps: Disclosure.Props = {
  id: 'faq',
  label: 'Frequently asked questions',
  items: accordionItems,
  defaultOpenValues: ['overview'],
}

const fold = (
  messages: ReadonlyArray<Disclosure.Message>,
  props: Disclosure.Props,
  from: Disclosure.State = Disclosure.initial,
): Disclosure.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Disclosure.chart.transition(state, message, props)[0],
  )

describe('core Disclosure / Accordion Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Disclosure.part)).toEqual([])
      expect(Part.problemsOf(Disclosure.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Disclosure.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Disclosure', chart: Disclosure.chart }),
      ).toEqual([])

      for (const action of Disclosure.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('single collapsible / disclosure mode', () => {
    it('opens, closes, and toggles cleanly and honors defaultOpen and initialOpen', () => {
      expect(Disclosure.isOpen(Disclosure.initial, singleProps)).toBe(false)
      expect(Disclosure.isMounted(Disclosure.initial, singleProps)).toBe(false)
      expect(Disclosure.dataStateOf(Disclosure.initial, singleProps)).toBe(
        'closed',
      )

      const defaultOpenProps: Disclosure.Props = {
        ...singleProps,
        defaultOpen: true,
      }
      expect(Disclosure.isOpen(Disclosure.initial, defaultOpenProps)).toBe(true)
      expect(Disclosure.isOpen(Disclosure.initialOpen, singleProps)).toBe(true)

      const opened = fold([Disclosure.OpenDisclosure()], singleProps)
      expect(Disclosure.isOpen(opened, singleProps)).toBe(true)
      expect(Disclosure.isMounted(opened, singleProps)).toBe(true)
      expect(Disclosure.dataStateOf(opened, singleProps)).toBe('open')

      // Redundant OpenDisclosure is ignored
      expect(
        Disclosure.chart.step(opened, Disclosure.OpenDisclosure(), singleProps)
          ._tag,
      ).toBe('Ignored')

      const closed = fold([Disclosure.CloseDisclosure()], singleProps, opened)
      expect(Disclosure.isOpen(closed, singleProps)).toBe(false)
      expect(Disclosure.isMounted(closed, singleProps)).toBe(false)

      // Redundant CloseDisclosure is ignored
      expect(
        Disclosure.chart.step(closed, Disclosure.CloseDisclosure(), singleProps)
          ._tag,
      ).toBe('Ignored')

      const toggledOpen = fold(
        [Disclosure.ToggleDisclosure()],
        singleProps,
        closed,
      )
      expect(Disclosure.isOpen(toggledOpen, singleProps)).toBe(true)

      const toggledClosed = fold(
        [Disclosure.ToggleDisclosure()],
        singleProps,
        toggledOpen,
      )
      expect(Disclosure.isOpen(toggledClosed, singleProps)).toBe(false)
    })

    it('guards disabled single disclosure and supports Enter/Space key toggles', () => {
      const disabledProps: Disclosure.Props = {
        ...singleProps,
        isDisabled: true,
      }
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.OpenDisclosure(),
          disabledProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.ToggleDisclosure(),
          disabledProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.PressedDisclosureKey({ key: 'Enter' }),
          disabledProps,
        )._tag,
      ).toBe('Ignored')

      // Pure helper shared with @foldkit/ui Disclosure
      expect(
        Disclosure.resolveKeyToggle({ key: 'Enter', isOpen: false }),
      ).toEqual(Option.some(true))
      expect(Disclosure.resolveKeyToggle({ key: ' ', isOpen: true })).toEqual(
        Option.some(false),
      )
      expect(
        Disclosure.resolveKeyToggle({
          key: 'Enter',
          isOpen: false,
          isDisabled: true,
        }),
      ).toEqual(Option.none())
      expect(
        Disclosure.resolveKeyToggle({ key: 'Escape', isOpen: false }),
      ).toEqual(Option.none())

      // Keyboard Enter and Space toggle via chart
      const entered = fold(
        [Disclosure.PressedDisclosureKey({ key: 'Enter' })],
        singleProps,
      )
      expect(Disclosure.isOpen(entered, singleProps)).toBe(true)

      const spaced = fold(
        [Disclosure.PressedDisclosureKey({ key: ' ' })],
        singleProps,
        entered,
      )
      expect(Disclosure.isOpen(spaced, singleProps)).toBe(false)

      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.PressedDisclosureKey({ key: 'Escape' }),
          singleProps,
        )._tag,
      ).toBe('Ignored')
    })

    it('steps through animated Presence phases when isAnimated is true, keeping panel mounted while leaving', () => {
      const animatedProps: Disclosure.Props = {
        ...singleProps,
        isAnimated: true,
      }
      const enterStart = fold([Disclosure.ToggleDisclosure()], animatedProps)
      expect(Disclosure.presenceOf(enterStart, animatedProps)).toEqual(
        Presence.EnterStart(),
      )
      expect(Disclosure.isOpen(enterStart, animatedProps)).toBe(true)
      expect(Disclosure.isMounted(enterStart, animatedProps)).toBe(true)
      expect(Disclosure.isAnimating(enterStart, animatedProps)).toBe(true)
      expect(Disclosure.transitionPhaseOf(enterStart, animatedProps)).toBe(
        'EnterStart',
      )

      const enterAnimating = fold(
        [Disclosure.AdvancedDisclosureFrame({})],
        animatedProps,
        enterStart,
      )
      expect(Disclosure.presenceOf(enterAnimating, animatedProps)).toEqual(
        Presence.EnterAnimating(),
      )

      const open = fold(
        [Disclosure.EndedDisclosureAnimation({})],
        animatedProps,
        enterAnimating,
      )
      expect(Disclosure.presenceOf(open, animatedProps)).toEqual(
        Presence.Open(),
      )
      expect(Disclosure.isAnimating(open, animatedProps)).toBe(false)

      // Leave stays mounted until EndAnimation settles
      const leaveStart = fold(
        [Disclosure.CloseDisclosure()],
        animatedProps,
        open,
      )
      expect(Disclosure.presenceOf(leaveStart, animatedProps)).toEqual(
        Presence.LeaveStart(),
      )
      expect(Disclosure.isOpen(leaveStart, animatedProps)).toBe(false)
      expect(Disclosure.isMounted(leaveStart, animatedProps)).toBe(true)
      expect(Disclosure.dataStateOf(leaveStart, animatedProps)).toBe('closed')

      // Stale EndAnimation before AdvanceFrame is ignored
      expect(
        Disclosure.chart.step(
          leaveStart,
          Disclosure.EndedDisclosureAnimation({}),
          animatedProps,
        )._tag,
      ).toBe('Ignored')

      const leaveAnimating = fold(
        [Disclosure.AdvancedDisclosureFrame({})],
        animatedProps,
        leaveStart,
      )
      expect(Disclosure.isMounted(leaveAnimating, animatedProps)).toBe(true)

      // Interrupting LeaveAnimating with ToggleDisclosure reverses to EnterStart
      const reopened = fold(
        [Disclosure.ToggleDisclosure()],
        animatedProps,
        leaveAnimating,
      )
      expect(Disclosure.presenceOf(reopened, animatedProps)).toEqual(
        Presence.EnterStart(),
      )
      expect(Disclosure.isOpen(reopened, animatedProps)).toBe(true)

      // Finish closing cleanly
      const closed = fold(
        [
          Disclosure.CloseDisclosure(),
          Disclosure.AdvancedDisclosureFrame({}),
          Disclosure.EndedDisclosureAnimation({}),
        ],
        animatedProps,
        reopened,
      )
      expect(Disclosure.presenceOf(closed, animatedProps)).toEqual(
        Presence.Closed(),
      )
      expect(Disclosure.isMounted(closed, animatedProps)).toBe(false)
    })

    it('projects element IDs, ARIA linkage, and reference-stable SlotBindings', () => {
      const part = Disclosure.make({ name: 'StableSingleDisclosure' })
      expect(Disclosure.buttonId('details')).toBe('details-button')
      expect(Disclosure.panelId('details')).toBe('details-panel')

      const v1 = Part.view(part, Disclosure.initial, singleProps)
      const button1 = v1.slot('Button')
      const panel1 = v1.slot('Panel')

      // Unchanged state + cloned props -> identical view and bindings
      const v2 = Part.view(part, Disclosure.initial, { ...singleProps })
      expect(v2).toBe(v1)
      expect(v2.slot('Button')).toBe(button1)
      expect(v2.slot('Panel')).toBe(panel1)

      expect(Slot.ariaOf(button1)).toEqual({
        role: 'button',
        id: 'details-button',
        'aria-expanded': 'false',
        'aria-controls': 'details-panel',
        'aria-label': 'More details',
        tabindex: '0',
      })
      expect(Slot.ariaOf(panel1)).toEqual({
        role: 'region',
        id: 'details-panel',
        'aria-labelledby': 'details-button',
        hidden: '',
      })

      const opened = fold([Disclosure.ToggleDisclosure()], singleProps)
      const v3 = Part.view(part, opened, singleProps)
      expect(Slot.ariaOf(v3.slot('Button'))).toMatchObject({
        'aria-expanded': 'true',
      })
      expect(Slot.ariaOf(v3.slot('Panel'))).toEqual({
        role: 'region',
        id: 'details-panel',
        'aria-labelledby': 'details-button',
      })
    })
  })

  describe('multi-item accordion mode', () => {
    it('enforces single-open and isCollapsible rules', () => {
      // default: isMultiple=false, isCollapsible=false, defaultOpenValues=['overview']
      expect(
        Disclosure.openValuesOf(Disclosure.initial, accordionProps),
      ).toEqual(['overview'])

      // Cannot collapse the open item when isCollapsible is false
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.ToggleDisclosureItem({ value: 'overview' }),
          accordionProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.CloseDisclosureItem({ value: 'overview' }),
          accordionProps,
        )._tag,
      ).toBe('Ignored')

      // Opening 'shipping' closes 'overview'
      const switched = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'shipping' })],
        accordionProps,
      )
      expect(Disclosure.openValuesOf(switched, accordionProps)).toEqual([
        'shipping',
      ])
      expect(Disclosure.isItemOpen(switched, accordionProps, 'overview')).toBe(
        false,
      )
      expect(Disclosure.isItemOpen(switched, accordionProps, 'shipping')).toBe(
        true,
      )

      // With isCollapsible: true, the open item CAN collapse to empty
      const collapsibleProps: Disclosure.Props = {
        ...accordionProps,
        isCollapsible: true,
      }
      const collapsed = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'overview' })],
        collapsibleProps,
      )
      expect(Disclosure.openValuesOf(collapsed, collapsibleProps)).toEqual([])
      expect(
        Disclosure.isItemMounted(collapsed, collapsibleProps, 'overview'),
      ).toBe(false)
    })

    it('supports multiple open sections simultaneously and bounds single-mode defaultOpenValues', () => {
      // Single mode with multiple defaultOpenValues clamps to the first valid value
      const clampedProps: Disclosure.Props = {
        ...accordionProps,
        defaultOpenValues: ['overview', 'shipping'],
      }
      expect(Disclosure.openValuesOf(Disclosure.initial, clampedProps)).toEqual(
        ['overview'],
      )

      // Multiple mode allows many open and always allows collapsing all
      const multiProps: Disclosure.Props = {
        ...accordionProps,
        isMultiple: true,
        defaultOpenValues: ['overview'],
      }
      const bothOpen = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'shipping' })],
        multiProps,
      )
      expect(Disclosure.openValuesOf(bothOpen, multiProps)).toEqual([
        'overview',
        'shipping',
      ])

      const onlyShipping = fold(
        [Disclosure.CloseDisclosureItem({ value: 'overview' })],
        multiProps,
        bothOpen,
      )
      expect(Disclosure.openValuesOf(onlyShipping, multiProps)).toEqual([
        'shipping',
      ])

      const allClosed = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'shipping' })],
        multiProps,
        onlyShipping,
      )
      expect(Disclosure.openValuesOf(allClosed, multiProps)).toEqual([])

      // Pre-opened via initialOpenValues
      const preOpened = Disclosure.initialOpenValues(['overview', 'returns'])
      expect(Disclosure.openValuesOf(preOpened, multiProps)).toEqual([
        'overview',
        'returns',
      ])
    })

    it('guards disabled items and whole-accordion disabled', () => {
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.ToggleDisclosureItem({ value: 'billing' }),
          accordionProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.FocusedDisclosureHeader({ value: 'billing' }),
          accordionProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.ToggleDisclosureItem({ value: 'unknown' }),
          accordionProps,
        )._tag,
      ).toBe('Ignored')

      const allDisabled: Disclosure.Props = {
        ...accordionProps,
        isDisabled: true,
      }
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.ToggleDisclosureItem({ value: 'shipping' }),
          allDisabled,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.PressedDisclosureKey({ key: 'ArrowDown' }),
          allDisabled,
        )._tag,
      ).toBe('Ignored')
      expect(
        Disclosure.focusedIndexOf(Disclosure.initial, allDisabled),
      ).toEqual(Option.none())
    })

    it('roves focus across accordion headers via RovingFocus (Vertical/Horizontal, LTR/RTL, Home/End, loop, disabled skipping)', () => {
      // Default Vertical: ArrowDown moves overview (0) -> shipping (1) -> skips disabled billing (2) -> returns (3) -> wraps to overview (0)
      const f1 = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowDown' })],
        accordionProps,
      )
      expect(Disclosure.focusedValueOf(f1, accordionProps)).toEqual(
        Option.some('shipping'),
      )
      // Roving does NOT expand shipping
      expect(Disclosure.openValuesOf(f1, accordionProps)).toEqual(['overview'])

      const f2 = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowDown' })],
        accordionProps,
        f1,
      )
      expect(Disclosure.focusedValueOf(f2, accordionProps)).toEqual(
        Option.some('returns'),
      )

      const wrapped = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowDown' })],
        accordionProps,
        f2,
      )
      expect(Disclosure.focusedValueOf(wrapped, accordionProps)).toEqual(
        Option.some('overview'),
      )

      const back = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowUp' })],
        accordionProps,
        wrapped,
      )
      expect(Disclosure.focusedValueOf(back, accordionProps)).toEqual(
        Option.some('returns'),
      )

      // Enter toggles focused header ('returns')
      const toggledReturns = fold(
        [Disclosure.PressedDisclosureKey({ key: 'Enter' })],
        accordionProps,
        back,
      )
      expect(Disclosure.openValuesOf(toggledReturns, accordionProps)).toEqual([
        'returns',
      ])

      // Home and End
      const home = fold(
        [Disclosure.PressedDisclosureKey({ key: 'Home' })],
        accordionProps,
        toggledReturns,
      )
      expect(Disclosure.focusedValueOf(home, accordionProps)).toEqual(
        Option.some('overview'),
      )
      const end = fold(
        [Disclosure.PressedDisclosureKey({ key: 'End' })],
        accordionProps,
        home,
      )
      expect(Disclosure.focusedValueOf(end, accordionProps)).toEqual(
        Option.some('returns'),
      )

      // BlurredDisclosure returns to Idle while keeping open state
      const blurred = fold(
        [Disclosure.BlurredDisclosure()],
        accordionProps,
        end,
      )
      expect(Disclosure.isFocused(blurred)).toBe(false)
      expect(Disclosure.openValuesOf(blurred, accordionProps)).toEqual([
        'returns',
      ])

      // Horizontal + RTL: ArrowLeft moves forward, ArrowRight moves backward
      const horizontalRtl: Disclosure.Props = {
        ...accordionProps,
        orientation: 'Horizontal',
        direction: 'Rtl',
      }
      expect(
        Disclosure.chart.step(
          Disclosure.initial,
          Disclosure.PressedDisclosureKey({ key: 'ArrowDown' }),
          horizontalRtl,
        )._tag,
      ).toBe('Ignored')
      const rtlNext = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowLeft' })],
        horizontalRtl,
      )
      expect(Disclosure.focusedValueOf(rtlNext, horizontalRtl)).toEqual(
        Option.some('shipping'),
      )
      const rtlPrev = fold(
        [Disclosure.PressedDisclosureKey({ key: 'ArrowRight' })],
        horizontalRtl,
        rtlNext,
      )
      expect(Disclosure.focusedValueOf(rtlPrev, horizontalRtl)).toEqual(
        Option.some('overview'),
      )

      // loop: false clamps at edges
      const noLoop: Disclosure.Props = { ...accordionProps, loop: false }
      const clampedStart = fold(
        [Disclosure.MovedDisclosureFocus({ move: 'Previous' })],
        noLoop,
      )
      expect(Disclosure.focusedValueOf(clampedStart, noLoop)).toEqual(
        Option.some('overview'),
      )
    })

    it('animates per-section Presence independently when switching in single-open accordion mode', () => {
      const animatedAccordion: Disclosure.Props = {
        ...accordionProps,
        isAnimated: true,
      }
      // Switch from overview -> shipping: overview enters LeaveStart while shipping enters EnterStart
      const switching = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'shipping' })],
        animatedAccordion,
      )
      expect(
        Disclosure.itemPresenceOf(switching, animatedAccordion, 'overview'),
      ).toEqual(Presence.LeaveStart())
      expect(
        Disclosure.itemPresenceOf(switching, animatedAccordion, 'shipping'),
      ).toEqual(Presence.EnterStart())
      expect(Disclosure.openValuesOf(switching, animatedAccordion)).toEqual([
        'shipping',
      ])
      // Both remain mounted while overview plays its exit animation
      expect(Disclosure.mountedValuesOf(switching, animatedAccordion)).toEqual([
        'overview',
        'shipping',
      ])

      // Complete overview exit animation -> overview unmounts while shipping continues entering
      const overviewClosed = fold(
        [
          Disclosure.AdvancedDisclosureFrame({ value: 'overview' }),
          Disclosure.EndedDisclosureAnimation({ value: 'overview' }),
        ],
        animatedAccordion,
        switching,
      )
      expect(
        Disclosure.isItemMounted(overviewClosed, animatedAccordion, 'overview'),
      ).toBe(false)
      expect(
        Disclosure.itemPresenceOf(
          overviewClosed,
          animatedAccordion,
          'shipping',
        ),
      ).toEqual(Presence.EnterStart())

      // Complete shipping enter animation
      const shippingOpen = fold(
        [
          Disclosure.AdvancedDisclosureFrame({ value: 'shipping' }),
          Disclosure.EndedDisclosureAnimation({ value: 'shipping' }),
        ],
        animatedAccordion,
        overviewClosed,
      )
      expect(
        Disclosure.itemPresenceOf(shippingOpen, animatedAccordion, 'shipping'),
      ).toEqual(Presence.Open())
    })

    it('projects full accordion ARIA linkage and keeps untouched SlotBindings reference-identical', () => {
      const part = Disclosure.make({ name: 'StableAccordion' })
      const multiProps: Disclosure.Props = {
        ...accordionProps,
        isMultiple: true,
      }

      const v1 = Part.view(part, Disclosure.initial, multiProps)
      const root1 = v1.slot('Root')
      const overviewPanel1 = v1.slot('Panel', 'overview')
      const returnsTrigger1 = v1.slot('Trigger', 'returns')
      const returnsPanel1 = v1.slot('Panel', 'returns')
      const billingTrigger1 = v1.slot('Trigger', 'billing')

      expect(Slot.ariaOf(root1)).toEqual({
        id: 'faq-root',
        'aria-orientation': 'vertical',
        'aria-label': 'Frequently asked questions',
      })
      expect(Slot.ariaOf(v1.slot('Trigger', 'overview'))).toEqual({
        role: 'button',
        id: 'faq-button-overview',
        'aria-expanded': 'true',
        'aria-controls': 'faq-panel-overview',
        tabindex: '0',
      })
      expect(Slot.ariaOf(overviewPanel1)).toEqual({
        role: 'region',
        id: 'faq-panel-overview',
        'aria-labelledby': 'faq-button-overview',
      })
      expect(Slot.ariaOf(returnsPanel1)).toEqual({
        role: 'region',
        id: 'faq-panel-returns',
        'aria-labelledby': 'faq-button-returns',
        hidden: '',
      })
      expect(Slot.ariaOf(billingTrigger1)).toEqual({
        role: 'button',
        id: 'faq-button-billing',
        'aria-expanded': 'false',
        'aria-controls': 'faq-panel-billing',
        'aria-disabled': 'true',
        tabindex: '-1',
      })

      // Opening 'shipping' keeps Root, overview Panel, returns Trigger & Panel, and billing Trigger reference-identical
      const next = fold(
        [Disclosure.ToggleDisclosureItem({ value: 'shipping' })],
        multiProps,
      )
      const v2 = Part.view(part, next, multiProps)
      expect(v2).not.toBe(v1)
      expect(v2.slot('Root')).toBe(root1)
      expect(v2.slot('Panel', 'overview')).toBe(overviewPanel1)
      expect(v2.slot('Trigger', 'returns')).toBe(returnsTrigger1)
      expect(v2.slot('Panel', 'returns')).toBe(returnsPanel1)
      expect(v2.slot('Trigger', 'billing')).toBe(billingTrigger1)
      expect(Slot.ariaOf(v2.slot('Trigger', 'shipping'))).toMatchObject({
        'aria-expanded': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(v2.slot('Panel', 'shipping'))).toEqual({
        role: 'region',
        id: 'faq-panel-shipping',
        'aria-labelledby': 'faq-button-shipping',
      })
    })
  })

  describe('synchronization: synced by default with a device-only option', () => {
    const DummyModel = S.Struct({ title: S.String })
    const RenameTitle = Catalog.action('RenameTitle', {
      fields: { title: S.String },
      what: 'Changes the page title',
      why: 'To label the current workspace',
      meta: { label: 'Rename', keys: [] },
    })
    const dummyCatalog = Catalog.make([RenameTitle])
    const BaseProgram = makeProgram({
      id: 'disclosure-sync-test',
      version: 1,
      Model: DummyModel,
      Message: dummyCatalog.Message,
      init: () => [{ title: 'Help' }, []],
      update: (model, message) => [{ ...model, title: message.title }, []],
      catalog: dummyCatalog,
    })

    it('syncs Disclosure state and Messages by default (Navigation category) and settles animations in atRest', () => {
      const animatedAccordion: Disclosure.Props = {
        ...accordionProps,
        isAnimated: true,
      }
      const SyncedApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Disclosure.part, () => animatedAccordion)],
      })
      const [model] = SyncedApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(SyncedApp.synchronization),
      )

      expect(sync.messageCategory(Disclosure.ToggleDisclosure())).toBe(
        'Navigation',
      )
      expect(
        sync.messageCategory(
          Disclosure.ToggleDisclosureItem({ value: 'shipping' }),
        ),
      ).toBe('Navigation')
      expect(sync.isLocalOnly?.(Disclosure.ToggleDisclosure())).toBe(false)
      expect(sync.paceOf?.(Disclosure.ToggleDisclosure())).toEqual(Synced())

      const encoded = S.encodeUnknownSync(SyncedApp.Model)(model)
      expect(encoded).toMatchObject({
        title: 'Help',
        parts: { Disclosure: { _tag: 'Idle' } },
      })

      // Mid-animation switch: overview is LeaveStart, shipping is EnterStart; projectLocal settles to Idle with shipping Open and overview pruned
      const [switching] = SyncedApp.update(
        model,
        Disclosure.ToggleDisclosureItem({ value: 'shipping' }),
      )
      const rested = sync.projectLocal?.(switching)
      expect(rested?.parts['Disclosure']).toEqual(
        Disclosure.Idle({
          hasExplicitState: true,
          presences: { shipping: Presence.Open() },
        }),
      )
    })

    it('keeps Disclosure device-only when configured with Disclosure.deviceOnly() or Disclosure.make({ sync: "OwnView" })', () => {
      const LocalDisclosure = Disclosure.deviceOnly({ name: 'LocalDisclosure' })
      const LocalApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(LocalDisclosure, () => singleProps)],
      })
      const [model] = LocalApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(LocalApp.synchronization),
      )

      expect(sync.isLocalOnly?.(Disclosure.ToggleDisclosure())).toBe(true)
      expect(sync.paceOf?.(Disclosure.ToggleDisclosure())).toEqual(
        Device({ because: 'OwnView' }),
      )

      const encoded = S.encodeUnknownSync(LocalApp.Model)(model)
      expect(JSON.stringify(encoded)).not.toContain('LocalDisclosure')

      const [opened] = LocalApp.update(model, Disclosure.ToggleDisclosure())
      const kept = sync.keepOnRefold?.(opened, model)
      expect(kept?.parts['LocalDisclosure']).toEqual(
        opened.parts['LocalDisclosure'],
      )
    })
  })
})
