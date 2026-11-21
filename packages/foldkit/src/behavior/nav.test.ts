import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Nav from './nav.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseItems: ReadonlyArray<Nav.Item> = [
  { value: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { value: 'products', label: 'Products', hasSubmenu: true },
  { value: 'disabled', label: 'Disabled', hasSubmenu: true, isDisabled: true },
  { value: 'resources', label: 'Resources', hasSubmenu: true },
  { value: 'pricing', label: 'Pricing', href: '/pricing' },
]

const baseProps: Nav.Props = {
  id: 'primary',
  label: 'Primary navigation',
  items: baseItems,
  currentValue: 'dashboard',
}

const fold = (
  messages: ReadonlyArray<Nav.Message>,
  props: Nav.Props = baseProps,
  from: Nav.State = Nav.initial,
): Nav.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Nav.chart.transition(state, message, props)[0],
  )

describe('core Nav Part', () => {
  describe('declaration, chart integrity, IDs, and schema serialization', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Nav.part)).toEqual([])
      expect(Part.problemsOf(Nav.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Nav.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(Nav.make({ defaultOpenValue: 'products' })),
      ).toEqual([])
      expect(Block.problemsOf({ name: 'Nav', chart: Nav.chart })).toEqual([])
      expect(
        Block.problemsOf({
          name: 'NavOpen',
          chart: Nav.chartOf(Nav.initialOpen('products')),
        }),
      ).toEqual([])

      for (const action of Nav.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, ariaCurrentPage, and current-item helpers', () => {
      expect(Nav.ariaCurrentPage).toBe('page')
      expect(Nav.navId('primary')).toBe('primary-nav')
      expect(Nav.triggerId('primary', 'products')).toBe(
        'primary-trigger-products',
      )
      expect(Nav.linkId('primary', 'dashboard')).toBe('primary-link-dashboard')
      expect(Nav.contentId('primary', 'products')).toBe(
        'primary-content-products',
      )
      expect(Nav.isCurrentItem('dashboard', 'dashboard')).toBe(true)
      expect(Nav.isCurrentItem('pricing', 'dashboard')).toBe(false)
      expect(Nav.isCurrentItem('dashboard', undefined)).toBe(false)
      expect(Nav.ariaCurrentOf(true)).toEqual(Option.some('page'))
      expect(Nav.ariaCurrentOf(false)).toEqual(Option.none())
    })

    it('round-trips Closed and Open states through Effect Schema JSON encoding', () => {
      const opening = fold([Nav.EnterNavTrigger({ value: 'products' })])
      const open = fold([
        Nav.OpenNavItem({ value: 'products' }),
        Nav.OpenNavItem({ value: 'resources' }),
      ])
      for (const state of [Nav.initial, opening, open]) {
        const encoded = S.encodeUnknownSync(Nav.State)(state)
        const decoded = S.decodeUnknownSync(Nav.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('roving focus, orientation, LTR/RTL, and keyboard navigation', () => {
    it('roves horizontally in LTR and RTL while skipping disabled items', () => {
      expect(Nav.focusedValueOf(Nav.initial, baseProps)).toEqual(
        Option.some('dashboard'),
      )

      const rightOnce = fold([Nav.PressedNavKey({ key: 'ArrowRight' })])
      expect(Nav.focusedValueOf(rightOnce, baseProps)).toEqual(
        Option.some('products'),
      )

      const skipDisabled = fold(
        [Nav.PressedNavKey({ key: 'ArrowRight' })],
        baseProps,
        rightOnce,
      )
      expect(Nav.focusedValueOf(skipDisabled, baseProps)).toEqual(
        Option.some('resources'),
      )

      const rtlProps: Nav.Props = { ...baseProps, direction: 'Rtl' }
      const rtlForward = fold(
        [Nav.PressedNavKey({ key: 'ArrowLeft' })],
        rtlProps,
      )
      expect(Nav.focusedValueOf(rtlForward, rtlProps)).toEqual(
        Option.some('products'),
      )

      const endKey = fold([Nav.PressedNavKey({ key: 'End' })])
      expect(Nav.focusedValueOf(endKey, baseProps)).toEqual(
        Option.some('pricing'),
      )

      const homeKey = fold(
        [Nav.PressedNavKey({ key: 'Home' })],
        baseProps,
        endKey,
      )
      expect(Nav.focusedValueOf(homeKey, baseProps)).toEqual(
        Option.some('dashboard'),
      )
    })

    it('opens submenus with orientation-aware entry key, toggles with Enter/Space, and closes on Escape', () => {
      const focusedProducts = fold([Nav.FocusNavItem({ value: 'products' })])
      const openedViaDown = fold(
        [Nav.PressedNavKey({ key: 'ArrowDown' })],
        baseProps,
        focusedProducts,
      )
      expect(Nav.isOpen(openedViaDown)).toBe(true)
      expect(Nav.openValueOf(openedViaDown)).toEqual(Option.some('products'))
      expect(Nav.isItemOpen(openedViaDown, 'products')).toBe(true)
      expect(Nav.dataStateOf(openedViaDown)).toBe('open')
      expect(Nav.itemDataStateOf(openedViaDown, 'products')).toBe('open')
      expect(Nav.itemDataStateOf(openedViaDown, 'resources')).toBe('closed')

      const closedViaEscape = fold(
        [Nav.PressedNavKey({ key: 'Escape' })],
        baseProps,
        openedViaDown,
      )
      expect(Nav.isOpen(closedViaEscape)).toBe(false)
      expect(Nav.dataStateOf(closedViaEscape)).toBe('closed')

      const verticalRtl: Nav.Props = {
        ...baseProps,
        orientation: 'Vertical',
        direction: 'Rtl',
      }
      expect(Nav.entryKeyOf(baseProps)).toBe('ArrowDown')
      expect(
        Nav.entryKeyOf({ orientation: 'Vertical', direction: 'Ltr' }),
      ).toBe('ArrowRight')
      expect(Nav.entryKeyOf(verticalRtl)).toBe('ArrowLeft')

      const openedVerticalRtl = fold(
        [
          Nav.FocusNavItem({ value: 'products' }),
          Nav.PressedNavKey({ key: 'ArrowLeft' }),
        ],
        verticalRtl,
      )
      expect(Nav.openValueOf(openedVerticalRtl)).toEqual(
        Option.some('products'),
      )

      const toggledClosed = fold(
        [Nav.PressedNavKey({ key: 'Enter' })],
        verticalRtl,
        openedVerticalRtl,
      )
      expect(Nav.isOpen(toggledClosed)).toBe(false)
    })

    it('blocks disabled items and globally disabled nav bars', () => {
      const triedDisabled = fold([Nav.OpenNavItem({ value: 'disabled' })])
      expect(Nav.isOpen(triedDisabled)).toBe(false)

      const triedPlainLink = fold([Nav.OpenNavItem({ value: 'dashboard' })])
      expect(Nav.isOpen(triedPlainLink)).toBe(false)

      const disabledBar: Nav.Props = { ...baseProps, isDisabled: true }
      const triedOnDisabledBar = fold(
        [Nav.OpenNavItem({ value: 'products' })],
        disabledBar,
      )
      expect(Nav.isOpen(triedOnDisabledBar)).toBe(false)
      expect(Nav.focusedIndexOf(triedOnDisabledBar, disabledBar)).toEqual(
        Option.none(),
      )
    })
  })

  describe('hover intent: delayed open, sibling skip-delay, grace close, and stale version guards', () => {
    it('schedules WaitForNavOpen on hover, opens on matching version, switches sibling triggers immediately, and closes after grace period', () => {
      const [opening, openCommands] = Nav.chart.transition(
        Nav.initial,
        Nav.EnterNavTrigger({ value: 'products' }),
        baseProps,
      )
      expect(Nav.isOpen(opening)).toBe(false)
      expect(Nav.isOpening(opening)).toBe(true)
      expect(Nav.pendingValueOf(opening)).toEqual(Option.some('products'))
      expect(openCommands).toHaveLength(1)
      expect(openCommands[0]?.name).toBe(Nav.WaitForNavOpen.name)

      const staleOpen = fold(
        [Nav.ElapsedNavOpen({ value: 'products', version: 999 })],
        baseProps,
        opening,
      )
      expect(Nav.isOpen(staleOpen)).toBe(false)

      const [opened] = Nav.chart.transition(
        opening,
        Nav.ElapsedNavOpen({
          value: 'products',
          version: opening.intent.openVersion,
        }),
        baseProps,
      )
      expect(Nav.openValueOf(opened)).toEqual(Option.some('products'))

      // Hovering a sibling submenu trigger while already open skips openDelayMs immediately
      const [switched, switchCommands] = Nav.chart.transition(
        opened,
        Nav.EnterNavTrigger({ value: 'resources' }),
        baseProps,
      )
      expect(Nav.openValueOf(switched)).toEqual(Option.some('resources'))
      expect(Nav.previousValueOf(switched)).toEqual(Option.some('products'))
      expect(switchCommands).toHaveLength(0)

      // Leaving trigger starts close grace countdown; entering content cancels it
      const [closing, closeCommands] = Nav.chart.transition(
        switched,
        Nav.LeaveNavTrigger({ value: 'resources' }),
        baseProps,
      )
      expect(Nav.isOpen(closing)).toBe(true)
      expect(Nav.isClosing(closing)).toBe(true)
      expect(closeCommands).toHaveLength(1)
      expect(closeCommands[0]?.name).toBe(Nav.WaitForNavClose.name)

      const [reengaged] = Nav.chart.transition(
        closing,
        Nav.EnterNavContent(),
        baseProps,
      )
      expect(Nav.isClosing(reengaged)).toBe(false)

      // Stale close timer from before entering content is ignored
      const [afterStaleClose] = Nav.chart.transition(
        reengaged,
        Nav.ElapsedNavClose({ version: closing.intent.closeVersion }),
        baseProps,
      )
      expect(Nav.isOpen(afterStaleClose)).toBe(true)

      // Leaving content and letting the fresh timer elapse closes the submenu
      const [closingAgain, secondCloseCommands] = Nav.chart.transition(
        afterStaleClose,
        Nav.LeaveNavContent(),
        baseProps,
      )
      expect(secondCloseCommands).toHaveLength(1)
      const [closed] = Nav.chart.transition(
        closingAgain,
        Nav.ElapsedNavClose({ version: closingAgain.intent.closeVersion }),
        baseProps,
      )
      expect(Nav.isOpen(closed)).toBe(false)
    })

    it('opens and closes immediately when openDelayMs and closeDelayMs are 0', () => {
      const instantProps: Nav.Props = {
        ...baseProps,
        openDelayMs: 0,
        closeDelayMs: 0,
      }
      const [opened, openCommands] = Nav.chart.transition(
        Nav.initial,
        Nav.EnterNavTrigger({ value: 'products' }),
        instantProps,
      )
      expect(Nav.openValueOf(opened)).toEqual(Option.some('products'))
      expect(openCommands).toHaveLength(0)

      const [closed, closeCommands] = Nav.chart.transition(
        opened,
        Nav.LeaveNavTrigger({ value: 'products' }),
        instantProps,
      )
      expect(Nav.isOpen(closed)).toBe(false)
      expect(closeCommands).toHaveLength(0)
    })
  })

  describe('slots, reference stability, sync, rest, and Part.compose', () => {
    it('projects reference-stable SlotBindings for Nav, Trigger, Link, and Content', () => {
      const firstView = Part.view(Nav.part, Nav.initial, baseProps)
      const sameView = Part.view(Nav.part, Nav.initial, { ...baseProps })
      expect(sameView).toBe(firstView)

      const navAria = Slot.ariaOf(firstView.slot('Nav'))
      expect(navAria['role']).toBe('region')
      expect(navAria['id']).toBe('primary-nav')
      expect(navAria['aria-orientation']).toBe('horizontal')
      expect(navAria['aria-label']).toBe('Primary navigation')

      const dashboardAria = Slot.ariaOf(firstView.slot('Link', 'dashboard'))
      expect(dashboardAria['role']).toBe('menuitem')
      expect(dashboardAria['aria-current']).toBe('true')
      expect(dashboardAria['tabindex']).toBe('0')

      const pricingSlotBefore = firstView.slot('Link', 'pricing')
      expect(Slot.ariaOf(pricingSlotBefore)['aria-current']).toBe('false')
      expect(Slot.ariaOf(pricingSlotBefore)['tabindex']).toBe('-1')

      const productsTriggerBefore = firstView.slot('Trigger', 'products')
      expect(Slot.ariaOf(productsTriggerBefore)['aria-expanded']).toBe('false')
      expect(Slot.ariaOf(productsTriggerBefore)['aria-controls']).toBe(
        'primary-content-products',
      )
      expect(Slot.ariaOf(productsTriggerBefore)['aria-haspopup']).toBe('menu')

      const productsContentBefore = firstView.slot('Content', 'products')
      expect(Slot.ariaOf(productsContentBefore)['hidden']).toBe('')

      const opened = fold([Nav.OpenNavItem({ value: 'products' })])
      const openView = Part.view(Nav.part, opened, baseProps)
      expect(
        Slot.ariaOf(openView.slot('Trigger', 'products'))['aria-expanded'],
      ).toBe('true')
      expect(
        Slot.ariaOf(openView.slot('Content', 'products'))['hidden'],
      ).toBeUndefined()
      expect(openView.slot('Link', 'pricing')).toBe(pricingSlotBefore)
    })

    it('settles to Closed in atRest and composes cleanly in synced and deviceOnly modes', () => {
      const opened = fold([Nav.OpenNavItem({ value: 'products' })])
      const rested = Nav.atRest(opened)
      expect(Nav.isOpen(rested)).toBe(false)
      expect(rested.intent.openVersion).toBe(opened.intent.openVersion)

      expect(Nav.synced.OpenNavItem).toEqual(Synced())
      expect(Nav.deviceSync('OwnView').OpenNavItem).toEqual(
        Device({ because: 'OwnView' }),
      )

      const KeepRoute = Catalog.action('KeepRoute', {
        what: 'Keeps the active route unchanged',
        why: 'To verify local part composition in a minimal Program',
        meta: { label: 'Keep route', keys: [] },
      })
      const Base = makeProgram({
        id: 'nav-compose-test',
        version: 1,
        Model: S.Struct({ route: S.String }),
        Message: Catalog.make([KeepRoute]).Message,
        init: () => [{ route: 'dashboard' }, []],
        update: (model: Readonly<{ route: string }>) => [model, []],
      })
      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Nav.deviceOnly(), () => baseProps)],
      })
      const [localModel] = LocalApp.init()
      const encoded = S.encodeUnknownSync(LocalApp.Model)(localModel)
      expect(encoded).toEqual({ route: 'dashboard' })
    })
  })
})
