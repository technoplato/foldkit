import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindApp } from '../test/apps/navigableCounter.js'
import { frameOf, sideTagOf, styleTagOf } from './frame.js'
import { Link } from './message.js'
import { Dialog, Drawer } from './structure.js'

describe('frameOf', () => {
  it('paints the pushed page with the menu presented over it', () => {
    const bound = bindApp()
    bound.openUri('/counter/history/menu?menu.q=re', Link())
    const frame = Option.getOrThrow(frameOf(bound))
    expect(frame.uri).toBe('/counter/history/menu?menu.q=re')
    expect([frame.base.key, frame.base.view._tag]).toEqual([
      '/counter/history',
      'Screen',
    ])
    expect(frame.overlays.map(layer => [layer.key, layer.view._tag])).toEqual([
      ['/counter/history/menu', 'Menu'],
    ])
  })

  it('paints Session settings as a Sheet over the page beneath it', () => {
    const bound = bindApp()
    bound.press('OpenSessionSettings')
    const frame = Option.getOrThrow(frameOf(bound))
    expect(frame.base.key).toBe('/counter')
    expect(frame.overlays.map(layer => [layer.key, styleTagOf(layer)])).toEqual(
      [['/counter/session', 'Sheet']],
    )
  })

  it('paints the root alone at the start', () => {
    const frame = Option.getOrThrow(frameOf(bindApp()))
    expect(frame.base.key).toBe('/counter')
    expect(frame.overlays).toEqual([])
  })
})

describe('styleTagOf', () => {
  it('names a presented layer by its style and the bottom one Root', () => {
    expect(styleTagOf({ maybeStyle: Option.some(Dialog()) })).toBe('Dialog')
    expect(styleTagOf({ maybeStyle: Option.none() })).toBe('Root')
  })
})

describe('sideTagOf', () => {
  it('names the edge a drawer comes from, and nothing for any other layer', () => {
    expect(
      sideTagOf({ maybeStyle: Option.some(Drawer({ from: 'Left' })) }),
    ).toEqual(Option.some('Left'))
    expect(
      sideTagOf({ maybeStyle: Option.some(Drawer({ from: 'Right' })) }),
    ).toEqual(Option.some('Right'))
    expect(sideTagOf({ maybeStyle: Option.some(Dialog()) })).toEqual(
      Option.none(),
    )
    expect(sideTagOf({ maybeStyle: Option.none() })).toEqual(Option.none())
  })
})
