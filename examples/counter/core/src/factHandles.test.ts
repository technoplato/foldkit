import type { Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  counterFactHandles,
  counterSyncedFactHandles,
  factHandleEntries,
} from './factHandles.js'
import { Decrement, Increment, type Message, Reset } from './message.js'
import { Model } from './model.js'
import { SyncedCounter } from './synced.js'

/** The synced handle sender accepts the composed app message union. */
type AppMessage = Program.ActionMenuAppMessage<Message>

const collect = (): {
  sent: Array<AppMessage>
  send: (message: AppMessage) => void
} => {
  const sent: Array<AppMessage> = []
  return {
    sent,
    send: message => {
      sent.push(message)
    },
  }
}

describe('counterFactHandles', () => {
  it('always-valid handles are bare callables that send the wire Message', () => {
    const { sent, send } = collect()
    const handles = counterFactHandles(Model.make({ count: 0 }), send)
    handles.incrementButtonTapped()
    handles.decrementButtonTapped()
    expect(sent).toEqual([Increment(), Decrement()])
  })

  it('reset is Hidden at 0 with the declared sentence', () => {
    const { sent, send } = collect()
    const handles = counterFactHandles(Model.make({ count: 0 }), send)
    const reset = handles.resetButtonTapped
    expect(reset._tag).toBe('Hidden')
    if (reset._tag === 'Hidden') {
      expect(reset.because).toBe('count is already 0')
    }
    expect(sent).toEqual([])
  })

  it('reset is Tappable above 0 and tapping sends Reset', () => {
    const { sent, send } = collect()
    const handles = counterFactHandles(Model.make({ count: 2 }), send)
    const reset = handles.resetButtonTapped
    expect(reset._tag).toBe('Tappable')
    if (reset._tag === 'Tappable') {
      reset.tap()
    }
    expect(sent).toEqual([Reset()])
  })
})

describe('counterSyncedFactHandles', () => {
  it('hides reset before Ready', () => {
    const { send } = collect()
    const starting = counterSyncedFactHandles(SyncedCounter.Starting(), send)
    expect(starting.resetButtonTapped._tag).toBe('Hidden')
    const failed = counterSyncedFactHandles(
      SyncedCounter.Failed({
        error: SyncedCounter.TransportFailed({
          what: 'This Processor could not start.',
          meaning: 'Boot failed in a test.',
          fix: 'Nothing. This is a test.',
          cause: 'test',
        }),
      }),
      send,
    )
    expect(failed.resetButtonTapped._tag).toBe('Hidden')
  })

  it('derives Ready handles from the flattened count', () => {
    const { sent, send } = collect()
    const handles = counterSyncedFactHandles(
      SyncedCounter.Ready({
        product: Model.make({ count: 3 }),
        actionMenu: { _tag: 'Closed' },
      }),
      send,
    )
    handles.incrementButtonTapped()
    const reset = handles.resetButtonTapped
    expect(reset._tag).toBe('Tappable')
    if (reset._tag === 'Tappable') {
      reset.tap()
    }
    expect(sent).toEqual([Increment(), Reset()])
  })
})

describe('factHandleEntries', () => {
  it('pairs every Action with its handle in declaration order', () => {
    const { send } = collect()
    const handles = counterFactHandles(Model.make({ count: 1 }), send)
    const entries = factHandleEntries(handles)
    expect(entries.map(([action]) => action)).toEqual([
      Increment,
      Decrement,
      Reset,
    ])
    expect(entries.map(([, handle]) => handle)).toEqual([
      handles.incrementButtonTapped,
      handles.decrementButtonTapped,
      handles.resetButtonTapped,
    ])
  })
})
