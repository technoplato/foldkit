import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Lazy } from '../renderers/elements.js'
import { resolveLazyTree } from '../renderers/lazy.js'
import type { ListNode, UiNode } from '../renderers/types.js'
import { m } from '../schema/index.js'
import * as Shelf from '../test/shelf.js'
import * as LongPress from './longPress.js'
import { Device, Step, Synced, defaultPace } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

// Made-up titles: nothing here is a real book.

const listOf = (tree: UiNode): ListNode => {
  if (tree._tag === 'Column') {
    const maybeList = Array.findFirst(
      tree.children,
      (child): child is ListNode => child._tag === 'List',
    )
    if (Option.isSome(maybeList)) {
      return maybeList.value
    }
  }
  throw new Error('the shelf has no list')
}

describe('a part’s declaration', () => {
  it('has no problems when every gesture becomes one of its Actions and every Message says how it syncs', () => {
    expect(Part.problemsOf(Shelf.TitleMenu)).toEqual([])
    expect(Part.problemsOf(Shelf.Pin)).toEqual([])
  })

  it('refuses a gesture that becomes a name it has no Action for', () => {
    expect(() =>
      Part.define({
        ...Shelf.Pin,
        slots: {
          Button: {
            focus: 'None',
            gestures: [{ gesture: 'HeldLong', becomes: 'Unpin' }],
          },
        },
      }),
    ).toThrow(/HeldLong on Button becomes Unpin/u)
  })

  it('refuses a Message that does not say how it syncs', () => {
    expect(Part.problemsOf({ ...Shelf.Pin, sync: {} })).toEqual([
      'Pin: TogglePin does not say how it syncs',
    ])
  })

  it('refuses one state that takes a device Message beside a synced one', () => {
    expect(
      Part.problemsOf({
        ...Shelf.TitleMenu,
        sync: {
          ShowTitleMenu: Synced(),
          CloseTitleMenu: Device({ because: 'OwnView' }),
        },
      }),
    ).toEqual([
      'TitleMenu: one state takes a Message that stays on the device and one that syncs; give each its own state',
    ])
  })

  it('syncs by default at the quick end, and layers a preset and a call over its base', () => {
    const coarse = Step({ size: 10, origin: 0 })
    const withPreset = {
      ...Shelf.Pin,
      configuration: {
        base: { pace: defaultPace },
        presets: { Coarse: { pace: { ...defaultPace, dragGrain: coarse } } },
      },
    }
    expect(Part.configure(Shelf.Pin)()).toEqual({ pace: defaultPace })
    expect(Part.configure(withPreset)('Coarse').pace.dragGrain).toEqual(coarse)
    expect(
      Part.configure(withPreset)('Coarse', {
        pace: { ...defaultPace, dragSampleMs: 250 },
      }).pace,
    ).toEqual({ ...defaultPace, dragSampleMs: 250 })
    expect(() => Part.configure(withPreset)('Unheard')).toThrow(
      /Pin has no preset Unheard/u,
    )
  })
})

describe('a slot’s binding', () => {
  it('prints the press each gesture sends, with the choice, and what a platform with no hold must tell', () => {
    const row = Part.bindingOf(
      Shelf.TitleMenu,
      'Row',
      { isExpanded: false },
      Option.some('salt-road'),
    )
    expect(row.gestures).toEqual([
      { gesture: 'HeldLong', press: 'ShowTitleMenu:salt-road' },
      { gesture: 'PressedSecondary', press: 'ShowTitleMenu:salt-road' },
    ])
    expect(row.maybeHold).toEqual(
      Option.some({
        down: 'fk-hold-down:ShowTitleMenu:salt-road',
        away: 'fk-hold-away',
        up: 'fk-hold-up',
        slackPx: 10,
        pointers: ['Touch', 'Pen'],
      }),
    )
    expect(row.isExpanded).toBe(false)
  })

  it('is the binding a row’s older menuAction means', () => {
    expect(
      Slot.ofItem({
        key: 'salt-road',
        title: 'Salt Road',
        menuAction: 'ShowTitleMenu:salt-road',
      }),
    ).toEqual(Option.some(Slot.menuAsk('ShowTitleMenu:salt-road')))
  })

  it('writes the ARIA from the role and what the projection says', () => {
    expect(
      Slot.ariaOf(Part.bindingOf(Shelf.Pin, 'Button', { isCurrent: true })),
    ).toEqual({ role: 'button', 'aria-current': 'true' })
    expect(
      Slot.ariaOf({
        ...Slot.menuAsk('ShowTitleMenu:salt-road'),
        role: 'Menu',
        activeId: 'title-menu-open',
      }),
    ).toEqual({ role: 'menu', 'aria-activedescendant': 'title-menu-open' })
  })
})

describe('the law of the projection: unchanged state in, identical projection out', () => {
  const closed = Shelf.Closed()

  it('answers the same object, and the same bindings, for the same state and props equal field by field', () => {
    const first = Part.view(Shelf.TitleMenu, closed, undefined)
    const row = first.slot('Row', 'salt-road')
    const second = Part.view(Shelf.TitleMenu, closed, undefined)
    expect(second).toBe(first)
    expect(second.slot('Row', 'salt-road')).toBe(row)
  })

  it('counts props as unchanged when each field is the same, though the object is new', () => {
    const counted: Part.AnyPart = { ...Shelf.Pin }
    const unpinned = Shelf.Unpinned()
    const first = Part.view(counted, unpinned, { rowCount: 2 })
    expect(Part.view(counted, unpinned, { rowCount: 2 })).toBe(first)
    expect(Part.view(counted, unpinned, { rowCount: 3 })).not.toBe(first)
  })

  it('keeps the object of a slot a state change did not touch', () => {
    const before = Part.view(Shelf.TitleMenu, closed, undefined)
    const tinComet = before.slot('Row', 'a-tin-comet')
    const saltRoad = before.slot('Row', 'salt-road')
    const after = Part.view(
      Shelf.TitleMenu,
      Shelf.OpenOn({ key: 'salt-road' }),
      undefined,
    )
    expect(after).not.toBe(before)
    expect(after.slot('Row', 'a-tin-comet')).toBe(tinComet)
    expect(after.slot('Row', 'salt-road')).not.toBe(saltRoad)
    expect(after.slot('Row', 'salt-road').isExpanded).toBe(true)
  })

  it('lets a Lazy node skip building when the projection is the object it was', () => {
    const built: Array<string> = []
    const row = (binding: Slot.SlotBinding): UiNode => {
      built.push(JSON.stringify(binding.gestures))
      return { _tag: 'Text', content: 'Salt Road' }
    }
    const treeOf = (state: Parameters<typeof Shelf.menuOf>[0]['state']) => {
      const binding = Part.view(Shelf.TitleMenu, state, undefined).slot(
        'Row',
        'a-tin-comet',
      )
      return Lazy(row, [binding], { key: 'a-tin-comet' })
    }
    const first = resolveLazyTree(treeOf(closed))
    resolveLazyTree(treeOf(closed), first.cache)
    resolveLazyTree(treeOf(Shelf.OpenOn({ key: 'salt-road' })), first.cache)
    expect(built).toHaveLength(1)
  })
})

describe('the composition call', () => {
  const App = Shelf.App
  const synchronization = Option.getOrThrow(
    Option.fromNullishOr(App.synchronization),
  )

  it('adds each part’s state to the Model under its key, with the hold’s', () => {
    const [model] = App.init()
    expect(model.parts).toEqual({
      hold: LongPress.initial,
      TitleMenu: Shelf.Closed(),
      Pin: Shelf.Unpinned(),
    })
    expect(App.partKeys).toEqual(['TitleMenu', 'Pin'])
  })

  it('leaves a device-only state out of the encoded Model, and opens a Model kept before it', () => {
    const [model] = App.init()
    const encoded = S.encodeUnknownSync(App.Model)(model)
    expect(encoded).toMatchObject({
      parts: { TitleMenu: { _tag: 'Closed' }, Pin: { _tag: 'Unpinned' } },
    })
    expect(JSON.stringify(encoded)).not.toContain('hold')
    const kept = { titles: [], opened: [] }
    expect(S.decodeUnknownSync(App.Model)(kept).parts).toEqual(model.parts)
  })

  it('folds a part’s Action through its chart, and the child’s through the child', () => {
    const shelf = Shelf.start()
    shelf.press('ShowTitleMenu:salt-road')
    shelf.press('Open:a-tin-comet')
    expect(shelf.model().parts['TitleMenu']).toEqual(
      Shelf.OpenOn({ key: 'salt-road' }),
    )
    expect(shelf.model().opened).toEqual(['a-tin-comet'])
    expect(shelf.folded()).toEqual(['ShowTitleMenu', 'Open'])
  })

  it('joins each part’s Actions to the Catalog, and lists no fact an agent cannot press', () => {
    const [model] = App.init()
    const catalog = Option.getOrThrow(Option.fromNullishOr(App.catalog))
    expect(Array.map(catalog.actions, action => action.tag)).toEqual([
      'Open',
      'ShowTitleMenu',
      'CloseTitleMenu',
      'TogglePin',
    ])
    const entries = App.interaction?.entries(model) ?? []
    expect(Array.map(entries, entry => entry.tag)).toEqual([
      'Open',
      'ShowTitleMenu',
      'CloseTitleMenu',
      'TogglePin',
    ])
  })

  it('reads a hold’s press as the hold’s Message, which no log ever holds', () => {
    const shelf = Shelf.start()
    shelf.press('fk-hold-down:ShowTitleMenu:salt-road')
    expect(shelf.model().parts.hold).toEqual(
      LongPress.Pressing({ press: 'ShowTitleMenu:salt-road', pressCount: 1 }),
    )
    expect(
      synchronization.isLocalOnly?.(
        LongPress.PressedDown({ press: 'ShowTitleMenu:salt-road' }),
      ),
    ).toBe(true)
    expect(
      synchronization.isLocalOnly?.(Shelf.ShowTitleMenu({ key: 'salt-road' })),
    ).toBe(false)
    expect(
      synchronization.isLocalOnly?.(Shelf.Open({ slug: 'salt-road' })),
    ).toBe(false)
  })

  it('says how each Message reaches the log, for the writer', () => {
    expect(synchronization.paceOf?.(LongPress.ReleasedPointer())).toEqual(
      Device({ because: 'InputInProgress' }),
    )
    expect(synchronization.paceOf?.(Shelf.TogglePin())).toEqual(Synced())
    expect(synchronization.paceOf?.(Shelf.Open({ slug: 'salt-road' }))).toEqual(
      Synced(),
    )
  })

  it('keeps a press in progress across a refold, and rests it for a restart', () => {
    const shelf = Shelf.start()
    shelf.press('fk-hold-down:ShowTitleMenu:salt-road')
    const [refolded] = App.init()
    const kept = synchronization.keepOnRefold?.(shelf.model(), refolded)
    expect(kept?.parts.hold).toEqual(shelf.model().parts.hold)
    expect(kept?.parts['TitleMenu']).toEqual(Shelf.Closed())
    shelf.press('ShowTitleMenu:salt-road')
    const rested = synchronization.projectLocal?.(shelf.model())
    expect(rested?.parts.hold).toEqual(LongPress.Idle({ pressCount: 1 }))
    expect(rested?.parts['TitleMenu']).toEqual(Shelf.Closed())
  })

  it('says a completed hold on the tree, on what a hold can ask of', async () => {
    const shelf = Shelf.start()
    expect(listOf(shelf.tree()).hold).toBeUndefined()
    shelf.press('fk-hold-down:ShowTitleMenu:salt-road')
    expect(listOf(shelf.tree()).hold).toBeUndefined()
    await shelf.elapse(LongPress.holdMs)
    expect(listOf(shelf.tree()).hold).toEqual({
      press: 'ShowTitleMenu:salt-road',
      pressCount: 1,
    })
    shelf.press('fk-hold-up')
    expect(listOf(shelf.tree()).hold).toEqual({ pressCount: 1 })
    await shelf.elapse(LongPress.swallowMs)
    expect(listOf(shelf.tree()).hold).toBeUndefined()
  })
})

describe('a child’s screen under the composition', () => {
  const screen = (model: Shelf.ShelfModel): UiNode => ({
    _tag: 'Text',
    content: model.titles.length.toString(),
  })
  const Plain = Part.compose({ of: { ...Shelf.ShelfProgram, screen } })

  it('is not built again when only a finger went down', () => {
    const [model] = Plain.init()
    const before = Plain.screen?.(model)
    const [pressing] = Plain.update(
      model,
      LongPress.PressedDown({ press: 'ShowTitleMenu:salt-road' }),
    )
    expect(pressing).not.toBe(model)
    expect(Plain.screen?.(pressing)).toBe(before)
  })

  it('is built again when a field it reads changed', () => {
    const [model] = Plain.init()
    const before = Plain.screen?.(model)
    const [opened] = Plain.update(model, Shelf.Open({ slug: 'salt-road' }))
    expect(Plain.screen?.(opened)).not.toBe(before)
  })
})

describe('the answers to sync, derived from what each Message declares', () => {
  type Model = Readonly<{ count: number; isMenuOpen: boolean }>
  const Increment = m('Increment')
  const OpenedMenu = m('OpenedMenu')
  const Pasted = m('Pasted')
  const Message = S.Union([Increment, OpenedMenu, Pasted])
  type Message = typeof Message.Type
  const increment = Increment()
  const openedMenu = OpenedMenu()
  const pasted = Pasted()
  const own = {
    isOwn: (message: Message) => message._tag === 'OpenedMenu',
    syncOf: () => Synced(),
    categoryOf: (): 'Navigation' => 'Navigation',
    maybeKeep: Option.none(),
    atRest: (model: Model): Model => ({ ...model, isMenuOpen: false }),
  }
  const lens = {
    childOf: (model: Model) => model,
    withChild: (_model: Model, childModel: Model) => childModel,
  }

  it('leaves isLocalOnly and keepOnRefold out when neither the child nor the composition has one to give', () => {
    const derived = Part.synchronizationOf<Model, Message, Model, Message>({
      ...lens,
      maybeChild: Option.none(),
      hasDeviceMessages: false,
      own,
    })
    expect(Object.keys(derived).sort()).toEqual([
      'messageCategory',
      'paceOf',
      'projectLocal',
    ])
    expect(derived.messageCategory(openedMenu)).toBe('Navigation')
    expect(derived.messageCategory(increment)).toBe('Domain')
    expect(derived.projectLocal?.({ count: 2, isMenuOpen: true })).toEqual({
      count: 2,
      isMenuOpen: false,
    })
  })

  it('lifts the child’s answers beside its own', () => {
    const derived = Part.synchronizationOf<Model, Message, Model, Message>({
      ...lens,
      maybeChild: Option.some({
        messageCategory: () => 'Domain',
        projectDomain: model => model,
        isLocalOnly: message => message._tag === 'Pasted',
        keepOnRefold: (current, refolded) => ({
          ...refolded,
          count: current.count,
        }),
        projectLocal: model => ({ ...model, count: 0 }),
      }),
      hasDeviceMessages: false,
      own,
    })
    expect(derived.isLocalOnly?.(pasted)).toBe(true)
    expect(derived.isLocalOnly?.(openedMenu)).toBe(false)
    expect(
      derived.keepOnRefold?.(
        { count: 5, isMenuOpen: true },
        { count: 1, isMenuOpen: false },
      ),
    ).toEqual({ count: 5, isMenuOpen: false })
    expect(derived.projectLocal?.({ count: 5, isMenuOpen: true })).toEqual({
      count: 0,
      isMenuOpen: false,
    })
  })

  it('keeps a Message declared for the device off the log', () => {
    const derived = Part.synchronizationOf<Model, Message, Model, Message>({
      ...lens,
      maybeChild: Option.none(),
      hasDeviceMessages: true,
      own: { ...own, syncOf: () => Device({ because: 'OwnView' }) },
    })
    expect(derived.isLocalOnly?.(openedMenu)).toBe(true)
    expect(derived.isLocalOnly?.(increment)).toBe(false)
  })
})
