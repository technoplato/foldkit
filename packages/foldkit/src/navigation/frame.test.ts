import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindApp } from '../test/apps/navigableCounter.js'
import { frameOf } from './frame.js'
import { Link } from './message.js'

describe('frameOf', () => {
  it('paints the pushed page with the menu presented over it', () => {
    const bound = bindApp()
    bound.openUri('/counter/session/menu?menu.q=re', Link())
    const frame = Option.getOrThrow(frameOf(bound))
    expect(frame.uri).toBe('/counter/session/menu?menu.q=re')
    expect([frame.base.key, frame.base.view._tag]).toEqual([
      '/counter/session',
      'Screen',
    ])
    expect(frame.overlays.map(layer => [layer.key, layer.view._tag])).toEqual([
      ['/counter/session/menu', 'Menu'],
    ])
  })

  it('paints the root alone at the start', () => {
    const frame = Option.getOrThrow(frameOf(bindApp()))
    expect(frame.base.key).toBe('/counter')
    expect(frame.overlays).toEqual([])
  })
})
