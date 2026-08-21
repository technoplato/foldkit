import { Array, Option } from 'effect'
import { East, North, South, gridCoord, step } from 'foldkit/spatial'
import { PressedDigit } from 'vending-core-example'
import { describe, expect, it } from 'vitest'

import {
  Dismissed,
  GotVendingMessage,
  Moved,
  PressedA,
  Roaming,
  asciiMap,
  facingTarget,
  init,
  overlayOf,
  update,
} from './index.js'

const [initial] = init()

describe('init', () => {
  it('starts roaming in the yard facing south', () => {
    expect(initial._tag).toBe('Roaming')
    if (initial._tag !== 'Roaming') {
      return
    }
    expect(initial.at).toEqual(gridCoord(5, 5))
    expect(initial.facing).toEqual(South())
  })
})

describe('Moved', () => {
  it('steps onto grass and turns toward the move', () => {
    const [next] = update(initial, Moved({ facing: East() }))
    expect(next).toEqual({
      _tag: 'Roaming',
      at: gridCoord(6, 5),
      facing: East(),
    })
  })

  it('turns into a blocked cell and stays put', () => {
    const againstFence = Roaming({
      at: gridCoord(5, 1),
      facing: South(),
    })
    const [next] = update(againstFence, Moved({ facing: North() }))
    expect(next).toEqual({
      _tag: 'Roaming',
      at: gridCoord(5, 1),
      facing: North(),
    })
  })

  it('is a no-op while reading', () => {
    const [reading] = update(
      Roaming({
        at: gridCoord(2, 2),
        facing: North(),
      }),
      PressedA(),
    )
    expect(reading._tag).toBe('Reading')
    const [next] = update(reading, Moved({ facing: East() }))
    expect(next).toBe(reading)
  })
})

describe('PressedA', () => {
  it('is a typed no-op when the faced cell is empty', () => {
    const target = facingTarget(initial.at, initial.facing)
    expect(target._tag).toBe('None')
    const [next] = update(initial, PressedA())
    expect(next).toBe(initial)
  })

  it('opens a sign overlay when facing a sign', () => {
    const [next] = update(
      Roaming({
        at: gridCoord(2, 2),
        facing: North(),
      }),
      PressedA(),
    )
    expect(next._tag).toBe('Reading')
    if (next._tag !== 'Reading') {
      return
    }
    expect(next.sign.id).toBe('welcome')
    expect(next.at).toEqual(gridCoord(2, 2))
    expect(overlayOf(next)._tag).toBe('SignOverlay')
  })

  it('opens the nested vending menu when facing the machine', () => {
    const [next, commands] = update(
      Roaming({
        at: gridCoord(7, 6),
        facing: South(),
      }),
      PressedA(),
    )
    expect(next._tag).toBe('Operating')
    if (next._tag !== 'Operating') {
      return
    }
    expect(next.vending.listPriceDisplay).toBe('14.28')
    expect(Option.isSome(Array.head(commands))).toBe(true)
  })
})

describe('Dismissed', () => {
  it('returns to roaming at the same pose', () => {
    const [reading] = update(
      Roaming({
        at: gridCoord(2, 2),
        facing: North(),
      }),
      PressedA(),
    )
    const [next] = update(reading, Dismissed())
    expect(next).toEqual({
      _tag: 'Roaming',
      at: gridCoord(2, 2),
      facing: North(),
    })
  })

  it('is a no-op while already roaming', () => {
    const [next] = update(initial, Dismissed())
    expect(next).toBe(initial)
  })
})

describe('GotVendingMessage', () => {
  it('forwards keypad digits only while operating', () => {
    const [operating] = update(
      Roaming({
        at: gridCoord(7, 6),
        facing: South(),
      }),
      PressedA(),
    )
    expect(operating._tag).toBe('Operating')
    if (operating._tag !== 'Operating') {
      return
    }
    const [dialed] = update(
      operating,
      GotVendingMessage({ message: PressedDigit.make({ digit: '1' }) }),
    )
    expect(dialed._tag).toBe('Operating')
    if (dialed._tag !== 'Operating') {
      return
    }
    expect(dialed.vending.keypadBuffer).toBe('1')
    const [ignored] = update(
      initial,
      GotVendingMessage({ message: PressedDigit.make({ digit: '1' }) }),
    )
    expect(ignored).toBe(initial)
  })
})

describe('asciiMap', () => {
  it('paints walker, machine, signs, and fence', () => {
    const map = asciiMap(initial)
    expect(map).toContain('@')
    expect(map).toContain('V')
    expect(map).toContain('!')
    expect(map.startsWith('###########')).toBe(true)
  })
})

describe('spatial helpers', () => {
  it('steps south from the spawn toward the machine row', () => {
    expect(step(gridCoord(5, 5), South())).toEqual(gridCoord(5, 6))
    expect(step(gridCoord(7, 6), South())).toEqual(gridCoord(7, 7))
  })
})
