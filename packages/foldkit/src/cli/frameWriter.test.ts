import { describe, expect, it } from 'vitest'

import {
  AUTOWRAP_OFF,
  AUTOWRAP_ON,
  CURSOR_HOME,
  ERASE_BELOW,
  ERASE_TO_EOL,
  SYNC_END,
  SYNC_START,
  displayWidth,
  fitDisplayWidth,
  formatTerminalFrame,
} from './frameWriter.js'

describe('displayWidth and fitDisplayWidth', () => {
  it('measures ASCII as 1 cell, CJK and emoji as 2 cells, and ANSI escapes as 0', () => {
    expect(displayWidth('hello')).toBe(5)
    expect(displayWidth('日本語')).toBe(6)
    expect(displayWidth('a😀b')).toBe(4)
    expect(displayWidth('\u001b[1mhello\u001b[22m')).toBe(5)
    expect(displayWidth('\u001b[38;2;234;88;12m▎\u001b[39m 1:23')).toBe(6)
  })

  it('truncates wide characters without overflowing the column limit', () => {
    expect(fitDisplayWidth('日本語', 5)).toEqual({ text: '日本', width: 4 })
    expect(fitDisplayWidth('a😀b', 2)).toEqual({ text: 'a', width: 1 })
    expect(fitDisplayWidth('a😀b', 3)).toEqual({ text: 'a😀', width: 3 })
    expect(fitDisplayWidth('hello', 5)).toEqual({ text: 'hello', width: 5 })
  })

  it('preserves ANSI styling and resets when truncated mid-style', () => {
    const fitted = fitDisplayWidth('\u001b[1m日本語\u001b[22m', 4)
    expect(fitted.width).toBe(4)
    expect(fitted.text).toBe('\u001b[1m日本\u001b[0m')
  })
})

describe('formatTerminalFrame', () => {
  it('writes cursor-home, line erases, and erase-below inside synchronized output with no ESC[2J', () => {
    const frame = formatTerminalFrame('line one\nline two', {
      columns: 20,
      rows: 5,
    })
    expect(frame).not.toContain('\u001b[2J')
    expect(frame).not.toContain(`${CURSOR_HOME}${ERASE_BELOW}`)
    expect(frame.startsWith(`${SYNC_START}${AUTOWRAP_OFF}${CURSOR_HOME}`)).toBe(
      true,
    )
    expect(frame.endsWith(`${AUTOWRAP_ON}${SYNC_END}`)).toBe(true)
    expect(frame).toContain(`line one${ERASE_TO_EOL}\nline two${ERASE_TO_EOL}`)
    expect(frame).toContain(`\n\r${ERASE_BELOW}`)
  })

  it('omits erase-to-EOL on a line that fills the full width so the last cell is preserved', () => {
    const frame = formatTerminalFrame('0123456789\nshort', {
      columns: 10,
      rows: 2,
    })
    expect(frame).toContain(`0123456789\nshort${ERASE_TO_EOL}`)
    expect(frame).not.toContain(`0123456789${ERASE_TO_EOL}`)
    expect(frame).not.toContain(ERASE_BELOW)
  })

  it('caps height to terminal rows so a tall frame never scrolls', () => {
    const frame = formatTerminalFrame('1\n2\n3\n4\n5', {
      columns: 10,
      rows: 3,
    })
    expect(frame).toContain('1')
    expect(frame).toContain('3')
    expect(frame).not.toContain('4')
    expect(frame).not.toContain(ERASE_BELOW)
  })

  it('truncates wide lines by display width so CJK and emoji never wrap', () => {
    const frame = formatTerminalFrame('日本語テスト', {
      columns: 7,
      rows: 2,
    })
    expect(frame).toContain(`日本語${ERASE_TO_EOL}`)
    expect(frame).not.toContain('テ')
  })
})
