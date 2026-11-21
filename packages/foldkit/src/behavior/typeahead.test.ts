import { Array, Duration, Effect, Fiber, Option, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import {
  Cleared,
  ElapsedReset,
  Idle,
  type Message,
  Searching,
  type State,
  Typed,
  atRest,
  block,
  chart,
  fromFields,
  initial,
  isPrintableKey,
  isSearchKey,
  isSearching,
  match,
  queryOf,
  resetMs,
  versionOf,
} from './typeahead.js'

describe('typeahead', () => {
  describe('match', () => {
    const items: ReadonlyArray<string> = [
      'Edit',
      'Duplicate',
      'Archive',
      'Move',
      'Delete',
    ]
    const identity = (item: string) => item

    it('matches case-insensitively and starts at 0 with no active item', () => {
      expect(
        match({
          items,
          query: 'a',
          maybeActiveIndex: Option.none(),
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.some(2))
      expect(
        match({
          items,
          query: 'E',
          maybeActiveIndex: Option.none(),
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.some(0))
    })

    it('starts after the active item on a fresh search and wraps around', () => {
      expect(
        match({
          items,
          query: 'd',
          maybeActiveIndex: Option.some(1),
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.some(4))
      expect(
        match({
          items,
          query: 'e',
          maybeActiveIndex: Option.some(3),
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.some(0))
    })

    it('includes the active item on a refinement and advances when it stops matching', () => {
      expect(
        match({
          items,
          query: 'del',
          maybeActiveIndex: Option.some(4),
          textOf: identity,
          isRefinement: true,
        }),
      ).toEqual(Option.some(4))
      expect(
        match({
          items,
          query: 'du',
          maybeActiveIndex: Option.some(4),
          textOf: identity,
          isRefinement: true,
        }),
      ).toEqual(Option.some(1))
    })

    it('skips disabled items and supports spaces in multi-word queries', () => {
      const multiWord = ['Edit', 'Danger Zone', 'Dark Mode', 'Delete All']
      expect(
        match({
          items: multiWord,
          query: 'danger z',
          maybeActiveIndex: Option.none(),
          textOf: identity,
          isRefinement: true,
        }),
      ).toEqual(Option.some(1))
      expect(
        match({
          items: multiWord,
          query: 'd',
          maybeActiveIndex: Option.none(),
          isDisabled: index => index === 1 || index === 2,
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.some(3))
      expect(
        match({
          items,
          query: '',
          maybeActiveIndex: Option.none(),
          textOf: identity,
          isRefinement: false,
        }),
      ).toEqual(Option.none())
    })
  })

  describe('key classification', () => {
    it('recognizes printable characters and treats Space as search only while searching', () => {
      expect(isPrintableKey('a')).toBe(true)
      expect(isPrintableKey(' ')).toBe(true)
      expect(isPrintableKey('ArrowDown')).toBe(false)
      expect(isSearchKey('d', false)).toBe(true)
      expect(isSearchKey(' ', false)).toBe(false)
      expect(isSearchKey(' ', true)).toBe(true)
      expect(isSearchKey('Escape', true)).toBe(false)
    })
  })

  describe('chart and debounced reset Command', () => {
    it('accumulates characters, bumps version, and emits WaitToClearSearch', () => {
      const [first, firstCommands] = chart.transition(
        initial,
        Typed({ key: 'd' }),
      )
      expect(first).toEqual(Searching({ query: 'd', version: 1 }))
      expect(Array.map(firstCommands, c => c.name)).toEqual([
        'WaitToClearSearch',
      ])
      expect(queryOf(first)).toBe('d')
      expect(isSearching(first)).toBe(true)
      expect(versionOf(first)).toBe(1)

      const [second, secondCommands] = chart.transition(
        first,
        Typed({ key: 'e' }),
      )
      expect(second).toEqual(Searching({ query: 'de', version: 2 }))
      expect(secondCommands[0]?.args).toEqual({ version: 2, afterMs: resetMs })
    })

    it('ignores stale ElapsedReset versions and resets on matching version', () => {
      const [first] = chart.transition(initial, Typed({ key: 'd' }))
      const [second] = chart.transition(first, Typed({ key: 'e' }))

      const stale = chart.step(second, ElapsedReset({ version: 1 }))
      expect(stale._tag === 'Ignored' ? stale.reason : stale._tag).toBe(
        'ExplicitlyIgnored',
      )

      const [cleared, commands] = chart.transition(
        second,
        ElapsedReset({ version: 2 }),
      )
      expect(cleared).toEqual(Idle({ version: 2 }))
      expect(commands).toEqual([])
      expect(queryOf(cleared)).toBe('')
      expect(isSearching(cleared)).toBe(false)
    })

    it('clears immediately on Cleared while keeping monotonic version so pending waits stay stale', () => {
      const [first] = chart.transition(initial, Typed({ key: 'd' }))
      const [cleared] = chart.transition(first, Cleared())
      expect(cleared).toEqual(Idle({ version: 1 }))
      const [again] = chart.transition(cleared, Typed({ key: 'a' }))
      expect(again).toEqual(Searching({ query: 'a', version: 2 }))
      expect(chart.transition(again, ElapsedReset({ version: 1 }))[0]).toEqual(
        again,
      )
    })

    it('waits resetMs via Command.answerAfter on the Effect TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [, commands] = chart.transition(initial, Typed({ key: 'd' }))
          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(resetMs - 1))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          expect(yield* Fiber.join(fiber)).toEqual(ElapsedReset({ version: 1 }))
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('passes Block.problemsOf with zero unreachable states or dead transitions', () => {
      expect(Block.problemsOf(block)).toEqual([])
      expect(atRest(Searching({ query: 'del', version: 3 }))).toEqual(
        Idle({ version: 3 }),
      )
      const roundTripped: State = fromFields('del', 3)
      expect(roundTripped).toEqual(Searching({ query: 'del', version: 3 }))
      expect(fromFields('', 3)).toEqual(Idle({ version: 3 }))
    })
  })
})
