import { Option, Schema as S } from 'effect'
import { ActionMenu, Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { countSnapshotId } from '@foldkit/instant/snapshot-log'

import { App } from './app.js'
import { Increment } from './message.js'
import { Counter } from './navigation.js'
import { CountProjection, MessageWire } from './wire.js'

const row = (tag: string) => ({
  id: 'message-1',
  tag,
  from: 'react-4f2a9c1e',
  createdAtMs: 1,
})

describe('CountProjection', () => {
  it('reads only the count and starts navigation at the Counter page', () => {
    expect(
      S.decodeUnknownSync(CountProjection)({
        id: countSnapshotId,
        value: 7,
        asOf: 'cli-1',
        at: 10,
        device: 'phone',
        path: 'counter.increment',
      }),
    ).toEqual({ count: 7, navigation: Navigation.stackAtRoot(Counter()) })
  })

  it('writes the count to the public row and never the menu', () => {
    const open = App.update(App.init()[0], ActionMenu.OpenedActionMenu())[0]
    expect(S.encodeSync(CountProjection)({ ...open, count: 2 })).toEqual({
      id: countSnapshotId,
      value: 2,
      asOf: '',
      at: 0,
    })
  })
})

describe('MessageWire', () => {
  it('writes Counter Actions as the bare tags counter-swift reads', () => {
    expect(S.encodeSync(MessageWire)(Increment()).tag).toBe('Increment')
  })

  it('writes menu Messages with their fields', () => {
    expect(
      S.encodeSync(MessageWire)(
        ActionMenu.ChangedActionMenuQuery({ query: 'res' }),
      ).tag,
    ).toBe('ChangedActionMenuQuery:{"query":"res"}')
  })

  it('reads what it writes', () => {
    expect(
      S.decodeUnknownSync(MessageWire)(
        row('ChangedActionMenuQuery:{"query":"r"}'),
      ),
    ).toEqual(ActionMenu.ChangedActionMenuQuery({ query: 'r' }))
  })

  it('fails closed on retired and unknown tags', () => {
    expect(
      S.decodeUnknownOption(MessageWire)(row('ActionMenuQueryChanged:res')),
    ).toEqual(Option.none())
    expect(
      S.decodeUnknownOption(MessageWire)(row('SharedNamedCounter')),
    ).toEqual(Option.none())
  })
})
