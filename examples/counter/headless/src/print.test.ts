import {
  App,
  type AppModel,
  type BoundCounter,
  SyncedCounter,
  type SyncedCounterModel,
} from 'counter-core-example'
import { Array, Duration, Effect, String, pipe } from 'effect'
import { ActionMenu } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  countSnapshotId,
  emptyCountSnapshotFor,
  makeMemorySnapshotLogTransport,
} from '@foldkit/instant'

import {
  actionNameOf,
  formatHeadlessClock,
  formatHeadlessHumanClock,
  formatHeadlessMessage,
  formatHeadlessStatus,
  formatHeadlessVerboseClock,
  formatPrintChanges,
  parseHeadlessTimeFormat,
  startHeadlessPrinter,
} from './print.js'

const settleTimeoutMs = 2_000
const pollMs = 10

const modelAt = (count: number): AppModel => ({ ...App.init()[0], count })

const readyAt = (count: number): SyncedCounterModel =>
  SyncedCounter.Ready(modelAt(count))

const failed = SyncedCounter.Failed({
  error: SyncedCounter.TransportFailed({
    what: 'This Processor could not start.',
    meaning: 'Runtime.start failed before Instant returned a snapshot.',
    fix: 'Check Instant and try again.',
    cause: 'Instant is down.',
  }),
})

const firstLine = (text: string): string =>
  pipe(text, String.split('\n'), Array.headNonEmpty)

const eventually = async (isDone: () => boolean): Promise<void> => {
  const deadline = Date.now() + settleTimeoutMs
  while (!isDone()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the printer.')
    }
    await Effect.runPromise(Effect.sleep(Duration.millis(pollMs)))
  }
}

const isReady = (counter: BoundCounter): boolean =>
  counter.readModel()._tag === 'Ready'

const newYorkAt = (createdAtMs: number) => ({
  format: 'human' as const,
  nowMs: createdAtMs,
  timeZone: 'America/New_York',
})

describe('Counter headless printer', () => {
  it('status text includes the count', () => {
    expect(formatHeadlessStatus(readyAt(3))).toContain('3')
    expect(formatHeadlessStatus(SyncedCounter.Starting())).toContain(
      'Starting Instant Counter',
    )
  })

  it('prints Failed without reading count', () => {
    const text = formatHeadlessStatus(failed)
    expect(text).toContain('Instant is down.')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('TransportFailed')
  })

  it('tails one Message after a Memory transport send', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const printer = startHeadlessPrinter({ time: 'ms', transport })
    await eventually(() => isReady(printer.counter))
    expect(printer.counter.readModel()).toEqual(readyAt(0))
    expect(printer.lines().join('\n')).toContain('count       0')

    expect(printer.counter.press('Increment')).toBe(true)
    await eventually(() => printer.lines().join('\n').includes('count  0 → 1'))

    const text = printer.lines().join('\n')
    expect(text).toContain('count       1')
    expect(text).toContain('Increment')
    await printer.stop()
  })

  it('marks a tag column the Counter cannot read', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const printer = startHeadlessPrinter({ time: 'ms', transport })
    await eventually(() => isReady(printer.counter))
    await Effect.runPromise(
      transport.write({
        message: { createdAtMs: 7, from: 'older', id: 'm1', tag: 'Square' },
        snapshot: emptyCountSnapshotFor(countSnapshotId),
      }),
    )
    await eventually(() => printer.lines().join('\n').includes('Square'))
    expect(printer.lines().join('\n')).toContain(
      'Square                            older         7  (unreadable)',
    )
    await printer.stop()
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

  it('names a payload Message by its tag', () => {
    expect(actionNameOf('Increment')).toBe('Increment')
    expect(actionNameOf('ChoseActionMenuAction:{"tag":"Reset"}')).toBe(
      'ChoseActionMenuAction',
    )
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

  it('prints printChanges for the count and the action menu', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = newYorkAt(createdAtMs)
    expect(
      formatPrintChanges(
        {
          createdAtMs,
          from: 'react-d7e6fa6c',
          id: 'm1',
          tag: 'Increment',
        },
        modelAt(3),
        modelAt(4),
        time,
      ),
    ).toBe(
      [
        'Increment                         react-d7e6fa  1:52:44 PM',
        '  count  3 → 4',
      ].join('\n'),
    )

    const [open] = App.update(modelAt(4), ActionMenu.OpenedActionMenu())
    expect(
      formatPrintChanges(
        {
          createdAtMs: createdAtMs + 1000,
          from: 'expo-ios',
          id: 'm2',
          tag: 'OpenedActionMenu',
        },
        modelAt(4),
        open,
        time,
      ),
    ).toBe(
      [
        'OpenedActionMenu                  expo-ios      1:52:45 PM',
        '  actionMenu  Closed → Open',
        '  focus  · → filter',
      ].join('\n'),
    )

    const [typed] = App.update(
      open,
      ActionMenu.ChangedActionMenuQuery({ query: 'res' }),
    )
    const [onRow] = App.update(
      typed,
      ActionMenu.MovedActionMenuFocus({ move: 'Next' }),
    )
    expect(
      formatPrintChanges(
        {
          createdAtMs: createdAtMs + 2000,
          from: 'cli',
          id: 'm3',
          tag: 'ChangedActionMenuQuery:{"query":"res"}',
        },
        open,
        typed,
        time,
      ),
    ).toBe(
      [
        'ChangedActionMenuQuery            cli           1:52:46 PM',
        '  query  · → res',
      ].join('\n'),
    )
    expect(
      formatPrintChanges(
        {
          createdAtMs: createdAtMs + 3000,
          from: 'cli',
          id: 'm4',
          tag: 'MovedActionMenuFocus:{"move":"Next"}',
        },
        typed,
        onRow,
        time,
      ),
    ).toBe(
      [
        'MovedActionMenuFocus              cli           1:52:47 PM',
        '  focus  filter → Reset',
      ].join('\n'),
    )
  })

  it('aligns count, Increment, and menu rows', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = newYorkAt(createdAtMs)
    const status = formatHeadlessStatus(readyAt(3), time)
    expect(firstLine(status)).toBe(
      'count       3          ·             1:52:44 PM',
    )
    expect(status).toContain('[ + ]')
    expect(status).toContain('[ Reset ]')
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
          tag: 'ChoseActionMenuAction:{"tag":"Decrement"}',
        },
        time,
      ),
    ).toBe('ChoseActionMenuAction             cli           1:52:44 PM')
  })

  it('prints Starting and Failed without reading count', () => {
    const createdAtMs = Date.UTC(2026, 7, 21, 17, 52, 44, 0)
    const time = newYorkAt(createdAtMs)
    expect(formatHeadlessStatus(SyncedCounter.Starting(), time)).toBe(
      'Starting Instant Counter…  1:52:44 PM',
    )
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
