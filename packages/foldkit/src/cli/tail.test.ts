import { Effect, Fiber, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Memory } from '../runtime/syncEngine.js'
import { followProgramTail, formatTailRow } from './tail.js'

const Increment = S.TaggedStruct('Increment', {})
const GotCounterMessage = S.TaggedStruct('GotCounterMessage', {
  counterId: S.Number,
  message: Increment,
})

const rowOf = (fields: Readonly<Record<string, unknown>>) => ({
  id: 'm1',
  from: 'react-ad55df2e',
  createdAtMs: 0,
  ...fields,
})

describe('formatTailRow', () => {
  it('names the app and instance and reads a nested Message as words', () => {
    const text = formatTailRow(
      GotCounterMessage,
      rowOf({
        _tag: 'GotCounterMessage',
        counterId: 2,
        message: { _tag: 'Increment' },
      }),
    )
      .map(line => line.trim())
      .join(' ')
    expect(text).toContain('React')
    expect(text).toContain('ad55df2e')
    expect(text).toContain('Got counter message counterId 2 message Increment')
  })

  it('names the client a Message was sent for, beside the Processor that wrote it', () => {
    const [line] = formatTailRow(
      Increment,
      rowOf({ _tag: 'Increment', from: 'cli-fdb5a3a8', client: 'tui' }),
    )
    expect(line?.slice(10, 24).trim()).toBe('TUI')
    expect(line).toContain('fdb5a3a8')
  })

  it('names the Processor’s own Host when no client is named', () => {
    const [line] = formatTailRow(
      Increment,
      rowOf({ _tag: 'Increment', from: 'cli-fdb5a3a8' }),
    )
    expect(line?.slice(10, 24).trim()).toBe('CLI')
  })

  it('shows the raw tag of a row the Program cannot read', () => {
    const [line] = formatTailRow(GotCounterMessage, rowOf({ tag: 'Square' }))
    expect(line).toContain('Square')
  })
})

describe('followProgramTail', () => {
  it('starts with the rows the engine held before the view followed, then each new one', async () => {
    const engine = Memory({ processor: 'cli-fdb5a3a8' })
    engine.injectMessage(
      rowOf({ id: 'm1', _tag: 'Increment', from: 'cli-fdb5a3a8' }),
    )
    engine.injectMessage(
      rowOf({
        id: 'm2',
        _tag: 'Increment',
        from: 'cli-fdb5a3a8',
        client: 'tui',
        createdAtMs: 1,
      }),
    )
    const lines = await Effect.runPromise(
      Effect.gen(function* () {
        const following = yield* Effect.forkChild(
          Stream.runCollect(
            Stream.take(followProgramTail(engine, Increment), 3),
          ),
        )
        yield* Effect.sleep('600 millis')
        engine.injectMessage(
          rowOf({
            id: 'm3',
            _tag: 'Increment',
            from: 'react-ad55df2e',
            createdAtMs: 2,
          }),
        )
        return yield* Fiber.join(following)
      }),
    )
    expect(Array.from(lines, line => line.slice(10, 34).trim())).toStrictEqual([
      'CLI           fdb5a3a8',
      'TUI           fdb5a3a8',
      'React         ad55df2e',
    ])
  })

  it('does not drop live rows with no id when a starting row also had no id', async () => {
    const engine = Memory({ processor: 'cli-fdb5a3a8' })
    engine.injectMessage({
      _tag: 'Increment',
      from: 'cli-fdb5a3a8',
      createdAtMs: 0,
    })
    const lines = await Effect.runPromise(
      Effect.gen(function* () {
        const following = yield* Effect.forkChild(
          Stream.runCollect(
            Stream.take(followProgramTail(engine, Increment), 3),
          ),
        )
        yield* Effect.sleep('600 millis')
        engine.injectMessage({
          _tag: 'Increment',
          from: 'cli-fdb5a3a8',
          client: 'tui',
          createdAtMs: 1,
        })
        engine.injectMessage({
          _tag: 'Increment',
          from: 'react-ad55df2e',
          createdAtMs: 2,
        })
        return yield* Fiber.join(following)
      }),
    )
    expect(Array.from(lines, line => line.slice(10, 34).trim())).toStrictEqual([
      'CLI           fdb5a3a8',
      'TUI           fdb5a3a8',
      'React         ad55df2e',
    ])
  })
})
