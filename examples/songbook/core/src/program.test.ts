import { describe, expect, it } from 'vitest'

import { emptyModel } from './model.js'
import { SongbookProgram, songbookScreen, songbookValid } from './program.js'

describe('SongbookProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const empty = emptyModel()
    expect(SongbookProgram.valid).toBe(songbookValid)
    expect(SongbookProgram.screen).toBe(songbookScreen)
    expect(SongbookProgram.screen(empty)).toEqual(songbookScreen(empty))
  })
})
