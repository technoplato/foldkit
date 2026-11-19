import { describe, expect, it, vi } from 'vitest'

import { keyboardRoomOf } from './keyboard.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)

describe('the room a screen leaves for the keyboard', () => {
  it('lifts the whole frame, with its docks, by the keyboard’s height', () => {
    expect(
      keyboardRoomOf({ keyboardHeight: 336, bottomInset: 34 }).frameLift,
    ).toBe(336)
  })

  it('drops the dock’s own room for the home bar while the keyboard covers it', () => {
    expect(
      keyboardRoomOf({ keyboardHeight: 336, bottomInset: 34 }).dockInset,
    ).toBe(0)
  })

  it('leaves the frame down and the home bar’s room in place with no keyboard', () => {
    expect(keyboardRoomOf({ keyboardHeight: 0, bottomInset: 34 })).toEqual({
      frameLift: 0,
      dockInset: 34,
    })
  })
})
