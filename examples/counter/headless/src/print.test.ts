import {
  App,
  Increment,
  SyncedCounter,
  makeMemorySnapshotLogTransport,
  readyCounter,
  waitForSyncedHandle,
  waitForSyncedHandleWrite,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Program } from 'foldkit'
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

describe('Counter headless printer', () => {
  it('status text includes the count', () => {
    expect(formatHeadlessStatus(readyCounter(3))).toContain('3')
    expect(formatHeadlessStatus(SyncedCounter.Starting())).toContain(
      'Starting Instant Counter',
    )
  })

  it('prints Failed without reading count', () => {
    const failed = SyncedCounter.Failed({
      error: SyncedCounter.TransportFailed({
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
    expect(ready).toEqual({
      _tag: 'Ready',
      product: { count: 0 },
      actionMenu: { _tag: 'Closed' },
    })
    expect(printer.lines().join('\n')).toContain('count       0')

    printer.handle.send(Increment())
    await waitForSyncedHandleWrite(printer.handle)
    await Effect.runPromise(Effect.sleep('50 millis'))

    const text = printer.lines().join('\n')
    expect(text).toContain('count       1')
    expect(text).toContain('Increment')
    expect(text).toContain('count  0 → 1')
    printer.stop()
  })

  it('prints tag, from, and createdAtMs', () => {
    expect(
      formatHeadlessMessage({
        createdAtMs: 1,
        from: 'headless',
        id: 'm1',
        tag: 'Increment',
      }),
    ).toBe('Increment                         headless      1')
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
          tag: 'Increment',
        },
        { format: 'human', timeZone: 'America/New_York' },
      ),
    ).toBe('Increment                         tui           4:26:35 PM')
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
    const [afterInc] = App.update(before, Increment())
    expect(
      formatPrintChanges(
        {
          createdAtMs,
          from: 'react-d7e6fa6c',
          id: 'm1',
          tag: 'Increment',
        },
        { product: { count: 3 }, actionMenu: Program.Closed() },
        { product: { count: 4 }, actionMenu: Program.Closed() },
        time,
      ),
    ).toBe(
      [
        'Increment                         react-d7e6fa  1:52:44 PM',
        '  count  3 → 4',
      ].join('\n'),
    )
    const [open] = App.update(afterInc, App.ActionMenuCommandTriggered())
    expect(
      formatPrintChanges(
        {
          createdAtMs: createdAtMs + 1000,
          from: 'expo-ios',
          id: 'm2',
          tag: 'ActionMenuCommandTriggered',
        },
        afterInc,
        open,
        time,
      ),
    ).toBe(
      [
        'ActionMenuCommandTriggered        expo-ios      1:52:45 PM',
        '  actionMenu  Closed → Open',
      ].join('\n'),
    )
  })

  it('aligns count, Increment, and menu rows', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = {
      format: 'human' as const,
      nowMs: createdAtMs,
      timeZone: 'America/New_York',
    }
    const status = formatHeadlessStatus(readyCounter(3), time)
    expect(status.split('\n')[0]).toBe(
      'count       3          ·             1:52:44 PM',
    )
    expect(status).toContain('[ + ]')
    expect(status).toContain('[ reset ]')
    expect(
      formatHeadlessMessage(
        {
          createdAtMs,
          from: 'react-d7e6fa6c',
          id: 'm1',
          tag: 'Increment',
        },
        time,
      ),
    ).toBe('Increment                         react-d7e6fa  1:52:44 PM')
    expect(
      formatHeadlessMessage(
        {
          createdAtMs,
          from: 'cli',
          id: 'm2',
          tag: 'ActionCommandMenuSelectionMade:decrement',
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
    expect(formatHeadlessStatus(SyncedCounter.Starting(), time)).toBe(
      'Starting Instant Counter…  1:52:44 PM',
    )
    const failed = SyncedCounter.Failed({
      error: SyncedCounter.TransportFailed({
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

  it('reads COUNTER_HEADLESS_TIME', () => {
    expect(parseHeadlessTimeFormat(undefined)).toBe('human')
    expect(parseHeadlessTimeFormat('ms')).toBe('ms')
    expect(parseHeadlessTimeFormat('both')).toBe('both')
    expect(parseHeadlessTimeFormat('verbose')).toBe('verbose')
    expect(parseHeadlessTimeFormat('nope')).toBe('human')
  })
})
