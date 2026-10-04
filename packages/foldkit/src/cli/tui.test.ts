import { Array, Effect, Option, Queue, Terminal } from 'effect'
import { describe, expect, it } from 'vitest'

import { Link } from '../navigation/message.js'
import { bindCounter } from '../test/apps/catalogCounter.js'
import { Ticked, bindChapters } from '../test/apps/chapterContents.js'
import { runProgramTui } from './tui.js'

const keyEvent = (
  name: string,
  typed: Option.Option<string> = Option.some(name),
  modifiers: Partial<Terminal.UserInput['key']> = {},
): Terminal.UserInput => ({
  input: typed,
  key: { name, ctrl: false, meta: false, shift: false, ...modifiers },
})

const readlineEscape = keyEvent('escape', Option.none(), { meta: true })

const scriptedTerminal = (
  events: ReadonlyArray<Terminal.UserInput>,
  frames: Array<string>,
  beforeKeys: () => void = () => {},
) =>
  Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.gen(function* () {
      const queue = yield* Queue.unbounded<Terminal.UserInput, never>()
      beforeKeys()
      yield* Queue.offerAll(queue, events)
      return queue
    }),
    readLine: Effect.succeed(''),
    display: text =>
      Effect.sync(() => {
        frames.push(text)
      }),
  })

const clearScreen = '\u001b[H\u001b[2J'

const linesOfFrame = (frame: string): ReadonlyArray<string> =>
  Option.match(Array.last(frame.split(clearScreen)), {
    onNone: () => [],
    onSome: screen => screen.split('\n'),
  })

describe('runProgramTui', () => {
  it('routes keys through the interaction and repaints every change', async () => {
    const bound = bindCounter()
    const frames: Array<string> = []
    await Effect.runPromise(
      runProgramTui(bound, 'counter').pipe(
        Effect.provideService(
          Terminal.Terminal,
          scriptedTerminal(
            [
              keyEvent('+'),
              keyEvent('+'),
              keyEvent('?'),
              keyEvent('r'),
              keyEvent('return', Option.none()),
              keyEvent('q'),
            ],
            frames,
          ),
        ),
      ),
    )
    expect(bound.readModel().count).toBe(0)
    expect(frames.some(frame => frame.includes('Search actions'))).toBe(true)
    expect(Option.getOrThrow(Array.head(frames))).toContain('[?] actions')
  })

  it('goes back on Escape, which readline reports with Meta held', async () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const frames: Array<string> = []
    await Effect.runPromise(
      runProgramTui(bound, 'chapters').pipe(
        Effect.provideService(
          Terminal.Terminal,
          scriptedTerminal([readlineEscape, keyEvent('q')], frames),
        ),
      ),
    )
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/chapters'),
    )
  })

  it('paints exactly as tall as the terminal, with the key hints last', async () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const frames: Array<string> = []
    await Effect.runPromise(
      runProgramTui(bound, 'chapters').pipe(
        Effect.provideService(
          Terminal.Terminal,
          scriptedTerminal(
            [
              ...Array.makeBy(30, () => keyEvent('down', Option.none())),
              keyEvent('q'),
            ],
            frames,
          ),
        ),
      ),
    )
    const painted = Array.filter(frames, frame => frame.includes(clearScreen))
    const last = linesOfFrame(Option.getOrThrow(Array.last(painted)))
    expect(Array.last(frames)).toEqual(Option.some('\u001b[?25h\u001b[?1049l'))
    expect(last).toHaveLength(24)
    expect(Array.last(last)).toEqual(
      Option.some('[↑↓←→] move  [↵] press  [?] actions  [q] quit'),
    )
    expect(last.some(line => line.startsWith('› Chapter 32'))).toBe(true)
  })

  it('folds a burst of Model changes into a few paints', async () => {
    const bound = bindChapters()
    const frames: Array<string> = []
    const burst = 500
    await Effect.runPromise(
      runProgramTui(bound, 'chapters').pipe(
        Effect.provideService(
          Terminal.Terminal,
          scriptedTerminal([keyEvent('q')], frames, () => {
            Array.forEach(Array.range(1, burst), () => {
              bound.send(Ticked())
            })
          }),
        ),
      ),
    )
    expect(bound.readModel()).toMatchObject({ ticks: burst })
    expect(frames.length).toBeLessThan(5)
  })
})
