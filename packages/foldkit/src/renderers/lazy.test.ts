import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { bind } from '../interaction/bind.js'
import { screenView } from '../navigation/declaration.js'
import { App, Increment, handleOf } from '../test/apps/navigableCounter.js'
import { Column, Lazy, Text } from './elements.js'
import { resolveLazyTree } from './lazy.js'
import { textsOf } from './query.js'
import type { UiNode } from './types.js'

describe('Lazy UiNode resolution', () => {
  it('skips recomputing and returns the exact previous node when fn and args match by Object.is', () => {
    let calls = 0
    const renderSection = (
      title: string,
      items: ReadonlyArray<string>,
    ): UiNode => {
      calls += 1
      return Column({}, Text(title), ...items.map(item => Text(item)))
    }

    const items = ['Chapter 1', 'Chapter 2']
    const firstTree = Column(
      {},
      Text('Tick 1'),
      Lazy(renderSection, ['Contents', items]),
    )
    const first = resolveLazyTree(firstTree)
    expect(calls).toBe(1)

    const secondTree = Column(
      {},
      Text('Tick 2'),
      Lazy(renderSection, ['Contents', items]),
    )
    const second = resolveLazyTree(secondTree, first.cache)
    expect(calls).toBe(1)

    if (first.node._tag !== 'Column' || second.node._tag !== 'Column') {
      throw new Error('Expected Column nodes.')
    }
    expect(second.node.children.at(1)).toBe(first.node.children.at(1))

    const thirdTree = Column(
      {},
      Text('Tick 3'),
      Lazy(renderSection, ['Contents', [...items, 'Chapter 3']]),
    )
    const third = resolveLazyTree(thirdTree, second.cache)
    expect(calls).toBe(2)
    expect(textsOf(third.node).map(text => text.content)).toEqual([
      'Tick 3',
      'Contents',
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
    ])
  })

  it('matches keyed Lazy siblings across insertions without thrashing', () => {
    const calls: Array<string> = []
    const renderRow = (id: string, label: string): UiNode => {
      calls.push(id)
      return Text(`${id}:${label}`)
    }

    const first = resolveLazyTree(
      Column(
        {},
        Lazy(renderRow, ['a', 'Alpha'], { key: 'a' }),
        Lazy(renderRow, ['b', 'Beta'], { key: 'b' }),
      ),
    )
    expect(calls).toEqual(['a', 'b'])

    const second = resolveLazyTree(
      Column(
        {},
        Lazy(renderRow, ['z', 'Zero'], { key: 'z' }),
        Lazy(renderRow, ['a', 'Alpha'], { key: 'a' }),
        Lazy(renderRow, ['b', 'Beta'], { key: 'b' }),
      ),
      first.cache,
    )
    expect(calls).toEqual(['a', 'b', 'z'])
    if (first.node._tag !== 'Column' || second.node._tag !== 'Column') {
      throw new Error('Expected Column nodes.')
    }
    expect(second.node.children.at(1)).toBe(first.node.children.at(0))
    expect(second.node.children.at(2)).toBe(first.node.children.at(1))
  })

  it('isolates Lazy caches per bound Program instance and per navigation entry across Model ticks', () => {
    const shelfA = ['Book 1', 'Book 2']
    const shelfB = ['Other Book']

    let builds = 0
    const renderShelf = (shelf: ReadonlyArray<string>): UiNode => {
      builds += 1
      return Column({}, ...shelf.map(title => Text(title)))
    }

    const baseNavigation = Option.getOrThrow(
      Option.fromNullishOr(App.navigation),
    )

    const makeBound = (shelf: ReadonlyArray<string>) => {
      const program = {
        ...App,
        screen: (model: Parameters<NonNullable<typeof App.screen>>[0]) =>
          Column(
            {},
            Text(`count:${model.count.toString()}`),
            Lazy(renderShelf, [shelf], { key: 'shelf' }),
          ),
        navigation: {
          ...baseNavigation,
          viewOf: (model: Parameters<NonNullable<typeof App.screen>>[0]) =>
            Option.some(
              screenView(
                Column(
                  {},
                  Text(`count:${model.count.toString()}`),
                  Lazy(renderShelf, [shelf], { key: 'shelf' }),
                ),
              ),
            ),
        },
      }
      const handle = handleOf(program)
      return {
        bound: bind(program, handle),
        increment: () => {
          handle.send(Increment())
        },
      }
    }

    const first = makeBound(shelfA)
    const second = makeBound(shelfB)

    const view1 = first.bound.viewAt('/counter')
    const view2 = second.bound.viewAt('/counter')
    expect(builds).toBe(2)

    first.increment()
    const view1AfterTick = first.bound.viewAt('/counter')
    expect(builds).toBe(2)

    if (
      Option.isNone(view1) ||
      Option.isNone(view1AfterTick) ||
      Option.isNone(view2) ||
      view1.value._tag !== 'Screen' ||
      view1AfterTick.value._tag !== 'Screen' ||
      view2.value._tag !== 'Screen' ||
      view1.value.node._tag !== 'Column' ||
      view1AfterTick.value.node._tag !== 'Column' ||
      view2.value.node._tag !== 'Column'
    ) {
      throw new Error('Expected resolved Screen Column views.')
    }

    expect(view1AfterTick.value.node.children.at(1)).toBe(
      view1.value.node.children.at(1),
    )
    expect(view2.value.node.children.at(1)).not.toBe(
      view1.value.node.children.at(1),
    )
  })
})
