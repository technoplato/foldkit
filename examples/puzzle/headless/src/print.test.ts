import { Effect } from 'effect'
import {
  App,
  ResetTape,
  SyncedPuzzle,
  demoModel,
  makeMemorySnapshotLogTransport,
  readyPuzzle,
  waitForSyncedHandle,
  waitForSyncedHandleWrite,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import {
  formatHeadlessClock,
  formatHeadlessHumanClock,
  formatHeadlessMessage,
  formatHeadlessStatus,
  formatHeadlessVerboseClock,
  formatPrintChanges,
  parseHeadlessTimeFormat,
  startHeadlessPrinter,
} from './print.js'

describe('Puzzle headless printer', () => {
  it('status text paints the Program screen tree', () => {
    expect(formatHeadlessStatus(readyPuzzle())).toContain(
      'https://puzzle.knophy.com',
    )
    expect(formatHeadlessStatus(SyncedPuzzle.Starting())).toContain(
      'Starting Instant Puzzle',
    )
  })

  it('paints live Puzzle chrome, not GitHub', () => {
    const text = formatHeadlessStatus(readyPuzzle())
    expect(text).toContain('https://puzzle.knophy.com')
    expect(text).not.toContain('github.com')
  })

  it('prints Failed without reading count', () => {
    const failed = SyncedPuzzle.Failed({
      error: SyncedPuzzle.TransportFailed({
        what: 'This Processor could not start.',
        meaning: 'Runtime.start failed before Instant returned a snapshot.',
        fix: 'Check Instant and try again.',
        cause: 'Instant is down.',
      }),
    })
    const text = formatHeadlessStatus(failed)
    expect(text).toContain('Instant is down.')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('TransportFailed')
  })

  it('tails one Message after a Memory transport send', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const printer = startHeadlessPrinter({ time: 'ms', transport })
    const ready = await waitForSyncedHandle(printer.handle)
    expect(ready._tag).toBe('Ready')
    if (ready._tag === 'Ready') {
      expect(ready.product).toEqual(demoModel())
      expect(ready.actionMenu).toEqual({ _tag: 'Closed' })
    }
    expect(printer.lines().join('\n')).toContain('https://puzzle.knophy.com')

    printer.handle.send(ResetTape())
    await waitForSyncedHandleWrite(printer.handle)
    await Effect.runPromise(Effect.sleep('50 millis'))

    const text = printer.lines().join('\n')
    expect(text).toContain('ResetTape')
    expect(text).toContain('tape  ')
    printer.stop()
  })

  it('prints tag, from, and createdAtMs', () => {
    expect(
      formatHeadlessMessage({
        createdAtMs: 1,
        from: 'headless',
        id: 'm1',
        tag: 'GuessedYes',
      }),
    ).toBe('GuessedYes                        headless      1')
  })

  it('prints a short clock in America/New_York', () => {
    const createdAtMs = Date.UTC(2026, 7, 20, 20, 26, 35, 679)
    expect(formatHeadlessHumanClock(createdAtMs, 'America/New_York')).toBe(
      '4:26:35 PM',
    )
    expect(
      formatHeadlessMessage(
        {
          createdAtMs,
          from: 'tui',
          id: 'm1',
          tag: 'GuessedYes',
        },
        { format: 'human', timeZone: 'America/New_York' },
      ),
    ).toBe('GuessedYes                        tui           4:26:35 PM')
    expect(
      formatHeadlessClock(createdAtMs, {
        format: 'both',
        timeZone: 'America/New_York',
      }),
    ).toBe(`4:26:35 PM  ${createdAtMs.toString()}`)
  })

  it('prints weekday and millis only when verbose', () => {
    const createdAtMs = Date.UTC(2026, 7, 20, 20, 26, 35, 679)
    expect(formatHeadlessVerboseClock(createdAtMs, 'America/New_York')).toBe(
      'Thursday, August 20, 2026, 4:26:35.679 PM',
    )
    expect(
      formatHeadlessClock(createdAtMs, {
        format: 'verbose',
        timeZone: 'America/New_York',
      }),
    ).toBe('Thursday, August 20, 2026, 4:26:35.679 PM')
  })

  it('prints printChanges for composed App fields', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = {
      format: 'human' as const,
      nowMs: createdAtMs,
      timeZone: 'America/New_York',
    }
    const [before] = App.init()
    const [afterReset] = App.update(before, ResetTape())
    const tapeChange = formatPrintChanges(
      {
        createdAtMs,
        from: 'react-d7e6fa6c',
        id: 'm1',
        tag: 'ResetTape',
      },
      before,
      afterReset,
      time,
    )
    expect(tapeChange).toContain('ResetTape')
    expect(tapeChange).toContain('tape  ')
    const [open] = App.update(afterReset, App.ActionMenuCommandTriggered())
    const menuChange = formatPrintChanges(
      {
        createdAtMs: createdAtMs + 1000,
        from: 'expo-ios',
        id: 'm2',
        tag: 'ActionMenuCommandTriggered',
      },
      afterReset,
      open,
      time,
    )
    expect(menuChange).toContain('ActionMenuCommandTriggered')
    expect(menuChange).toContain('actionMenu  Closed → Open')
  })

  it('aligns GuessedYes and menu rows', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = {
      format: 'human' as const,
      nowMs: createdAtMs,
      timeZone: 'America/New_York',
    }
    const ready = formatHeadlessStatus(readyPuzzle(), time)
    expect(ready).toContain('https://puzzle.knophy.com')
    expect(ready).toContain('https://replicate.knophy.com')
    expect(ready).toContain('https://grok.knophy.com')
    expect(ready).toContain('1:52:44 PM')
    expect(ready).not.toContain('Foldkit - Headless Puzzle')
    expect(ready).not.toContain('github.com')
    expect(
      formatHeadlessMessage(
        {
          createdAtMs,
          from: 'react-d7e6fa6c',
          id: 'm1',
          tag: 'GuessedYes',
        },
        time,
      ),
    ).toBe('GuessedYes                        react-d7e6fa  1:52:44 PM')
    expect(
      formatHeadlessMessage(
        {
          createdAtMs,
          from: 'cli',
          id: 'm2',
          tag: 'ActionCommandMenuSelectionMade:yes',
        },
        time,
      ),
    ).toBe('ActionCommandMenuSelectionMade    cli           1:52:44 PM')
  })

  it('prints Starting and Failed without reading count', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = {
      format: 'human' as const,
      nowMs: createdAtMs,
      timeZone: 'America/New_York',
    }
    const starting = formatHeadlessStatus(SyncedPuzzle.Starting(), time)
    expect(starting).toContain('Starting Instant Puzzle…  1:52:44 PM')
    expect(starting).not.toContain('https://puzzle.knophy.com')
    expect(starting).not.toContain('github.com')
    const failed = SyncedPuzzle.Failed({
      error: SyncedPuzzle.TransportFailed({
        what: 'This Processor could not start.',
        meaning: 'Runtime.start failed before Instant returned a snapshot.',
        fix: 'Check Instant and try again.',
        cause: 'Instant is down.',
      }),
    })
    const text = formatHeadlessStatus(failed, time)
    expect(text).toContain('Instant is down.')
    expect(text).toContain('1:52:44 PM')
    expect(text).not.toContain('undefined')
  })

  it('reads PUZZLE_HEADLESS_TIME', () => {
    expect(parseHeadlessTimeFormat(undefined)).toBe('human')
    expect(parseHeadlessTimeFormat('ms')).toBe('ms')
    expect(parseHeadlessTimeFormat('both')).toBe('both')
    expect(parseHeadlessTimeFormat('verbose')).toBe('verbose')
    expect(parseHeadlessTimeFormat('nope')).toBe('human')
  })
})
