import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transition, decodeLine } from './event.js'
import { lineSink } from './lineSink.js'
import { TelemetryOrigin, TelemetrySink } from './sink.js'

const transition = (sequence: number, payload: unknown) =>
  Transition.make({
    at: new Date(Date.UTC(2026, 10, 18, 20, 0, sequence)).toISOString(),
    sequence,
    session: 'cafe0001',
    app: 'books',
    surface: 'mobile-ios',
    transition: sequence,
    message: 'Play',
    payload,
    source: { _tag: 'Host' },
    commands: [],
    isModelChanged: true,
    changedPathCount: 1,
    updateDurationMs: 0.1,
  })

const sinkWriting = (
  write: (line: string) => void,
  maximumLineBytes?: number,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        return yield* TelemetrySink
      }).pipe(
        Effect.provide(
          Layer.provide(
            lineSink(
              write,
              maximumLineBytes === undefined ? {} : { maximumLineBytes },
            ),
            Layer.succeed(TelemetryOrigin, {
              app: 'books',
              surface: 'mobile-ios',
              maybeRole: Option.none(),
            }),
          ),
        ),
      ),
    ),
  )

describe('a telemetry sink that hands each event to a writer as one line', () => {
  it('writes every event at once, in order, as a line the reader can decode', async () => {
    const lines: Array<string> = []
    const sink = await sinkWriting(line => lines.push(line))

    sink.offer(transition(1, { placeMs: 10 }))
    sink.offer(transition(2, { placeMs: 20 }))

    expect(lines).toHaveLength(2)
    expect(
      lines.map(line =>
        Option.match(decodeLine(line), {
          onNone: () => 0,
          onSome: event => event.sequence,
        }),
      ),
    ).toEqual([1, 2])
  })

  it('keeps an event whose payload is too long for one line, without the payload', async () => {
    const lines: Array<string> = []
    const sink = await sinkWriting(line => lines.push(line), 400)

    sink.offer(transition(3, { words: 'x'.repeat(2_000) }))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.length).toBeLessThan(400)
    const event = Option.getOrThrow(decodeLine(lines[0] ?? ''))
    expect(event._tag === 'Transition' && event.message).toBe('Play')
    expect(event._tag === 'Transition' && event.payload).toEqual({
      omitted: 'too long for one line',
    })
  })

  it('never lets a writer that throws stop the Program it records', async () => {
    const sink = await sinkWriting(() => {
      throw new Error('the console is gone')
    })
    expect(() => {
      sink.offer(transition(4, {}))
    }).not.toThrow()
  })
})
