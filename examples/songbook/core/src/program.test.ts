import { describe, expect, it } from 'vitest'

import { emptyModel } from './model.js'
import { SongbookProgram, songbookScreen, songbookValid } from './program.js'

describe('SongbookProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const empty = emptyModel()
    const screen = SongbookProgram.screen
    expect(SongbookProgram.valid).toBe(songbookValid)
    expect(screen).toBe(songbookScreen)
    if (screen === undefined) {
      return
    }
    expect(screen(empty)).toEqual(songbookScreen(empty))
  })
})
