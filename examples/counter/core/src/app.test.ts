import { Option } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { actionMenuMessageFromKey } from './actionMenuKeys.js'
import { App } from './app.js'
import { filterListedActions, listActions } from './listActions.js'
import { Increment } from './message.js'
import { Model } from './model.js'
import { CounterProgram } from './program.js'
import {
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from './startSynced.js'
import { SyncedCounter, countOfReady, readyCounter } from './synced.js'

describe('App Action menu', () => {
  it('opens, focuses, and selects Increment', () => {
    const [model] = App.init()
    expect(model.actionMenu._tag).toBe('Closed')

    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    expect(open.actionMenu).toEqual({
      _tag: 'Open',
      focus: 0,
      maybeQuery: Option.none(),
    })

    const [down] = App.update(
      open,
      App.ActionMenuFocusMoved({ direction: 'Down' }),
    )
    expect(down.actionMenu._tag).toBe('Open')
    if (down.actionMenu._tag === 'Open') {
      expect(down.actionMenu.focus).toBe(1)
    }

    const [after] = App.update(
      open,
      App.ActionCommandMenuSelectionMade({ token: 'increment' }),
    )
    expect(after.product.count).toBe(1)
    expect(after.actionMenu._tag).toBe('Closed')
  })

  it('lists reset Hidden at 0 and Tappable after Increment', () => {
    const atZero = listActions(CounterProgram, Model.make({ count: 0 }))
    const resetAtZero = atZero.find(row => row.token === 'reset')
    expect(resetAtZero).toEqual({
      token: 'reset',
      keys: ['r'],
      valid: false,
      disabled: true,
      hiddenBecause: 'count is already 0',
      payload: {},
    })

    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [ignored] = App.update(
      open,
      App.ActionCommandMenuSelectionMade({ token: 'reset' }),
    )
    expect(ignored.product.count).toBe(0)
    expect(ignored.actionMenu._tag).toBe('Open')

    const [afterInc] = App.update(ignored, Increment())
    expect(afterInc.actionMenu._tag).toBe('Closed')
    const atOne = listActions(CounterProgram, afterInc.product)
    const resetAtOne = atOne.find(row => row.token === 'reset')
    expect(resetAtOne?.valid).toBe(true)
    expect(resetAtOne?.disabled).toBe(false)
    expect(resetAtOne?.hiddenBecause).toBeUndefined()
  })

  it('dismisses on a product Action key while Open', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [after] = App.update(open, Increment())
    expect(after.product.count).toBe(1)
    expect(after.actionMenu._tag).toBe('Closed')
  })

  it('does not close when hidden r is a no-op', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const rows = listActions(CounterProgram, open.product)
    expect(
      actionMenuMessageFromKey(
        { key: 'r', metaKey: false, ctrlKey: false },
        open.actionMenu,
        rows,
        open.product,
      ),
    ).toBeUndefined()
    expect(open.actionMenu._tag).toBe('Open')
    expect(open.product.count).toBe(0)
  })

  it('keeps focus on a remaining row when the filter drops the focused row', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [onDecrement] = App.update(
      open,
      App.ActionMenuFocusMoved({ direction: 'Down' }),
    )
    expect(onDecrement.actionMenu._tag).toBe('Open')
    if (onDecrement.actionMenu._tag === 'Open') {
      expect(onDecrement.actionMenu.focus).toBe(1)
    }
    const [filtered] = App.update(
      onDecrement,
      App.ActionMenuQueryChanged({ query: 'inc' }),
    )
    expect(filtered.actionMenu._tag).toBe('Open')
    if (filtered.actionMenu._tag === 'Open') {
      const visible = filterListedActions(
        listActions(CounterProgram, filtered.product),
        filtered.actionMenu.maybeQuery,
      )
      expect(visible._tag).toBe('Matches')
      if (visible._tag === 'Matches') {
        expect(visible.rows.map(row => row.token)).toEqual(['increment'])
        expect(filtered.actionMenu.focus).toBe(0)
        expect(filtered.actionMenu.focus).toBeLessThan(visible.rows.length)
      }
    }
  })

  it('toggles Closed and Open on ActionMenuCommandTriggered', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    expect(open.actionMenu._tag).toBe('Open')
    const [closed] = App.update(open, App.ActionMenuCommandTriggered())
    expect(closed.actionMenu._tag).toBe('Closed')
  })

  it('closes on dismiss', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [closed] = App.update(open, App.ActionMenuDismissed())
    expect(closed.actionMenu._tag).toBe('Closed')
  })
})

describe('App Action menu Instant', () => {
  it('shares Open and Closed across two Processors', async () => {
    const store = Runtime.makeMemoryStore()
    const left = startSyncedCounterHandle(
      Runtime.Memory({ processor: Processor.Host.Cli(), store }),
    )
    const right = startSyncedCounterHandle(
      Runtime.Memory({ processor: Processor.Host.React(), store }),
    )
    const leftReady = await waitForSyncedHandle(left)
    const rightReady = await waitForSyncedHandle(right)
    expect(leftReady).toEqual(SyncedCounter.Ready(App.init()[0]))
    expect(rightReady).toEqual(SyncedCounter.Ready(App.init()[0]))

    left.send(App.ActionMenuCommandTriggered())
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = right.readModel()
        if (model._tag === 'Ready' && model.actionMenu._tag === 'Open') {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for Open on the other Processor.'))
      }, 2000)
      const stop = right.subscribe(finish)
      finish()
    })
    const leftOpen = left.readModel()
    const rightOpen = right.readModel()
    expect(leftOpen._tag).toBe('Ready')
    expect(rightOpen._tag).toBe('Ready')
    if (leftOpen._tag === 'Ready' && rightOpen._tag === 'Ready') {
      expect(leftOpen.actionMenu._tag).toBe('Open')
      expect(rightOpen.actionMenu._tag).toBe('Open')
    }

    left.send(App.ActionMenuDismissed())
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = right.readModel()
        if (model._tag === 'Ready' && model.actionMenu._tag === 'Closed') {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(
          new Error('Timed out waiting for Closed on the other Processor.'),
        )
      }, 2000)
      const stop = right.subscribe(finish)
      finish()
    })
    left.stop()
    right.stop()
  })

  it('still boots Memory to Ready on an isolated engine', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Cli()),
    )
    const ready = await waitForSyncedHandle(handle)
    expect(ready._tag).toBe('Ready')
    if (ready._tag === 'Ready') {
      expect(ready.product.count).toBe(0)
      expect(ready.actionMenu._tag).toBe('Closed')
    }
    handle.stop()
  })

  it('reads count from product after compose.actionMenu', () => {
    expect(countOfReady(readyCounter(4))).toBe(4)
    expect(countOfReady(SyncedCounter.Starting())).toBeUndefined()
    expect(
      countOfReady(
        SyncedCounter.Failed({
          error: SyncedCounter.TransportFailed({
            what: 'Instant did not return a snapshot.',
            meaning: 'This Processor could not start from Instant.',
            fix: 'Check Instant and try again.',
            cause: 'Instant is down.',
          }),
        }),
      ),
    ).toBeUndefined()
  })
})
