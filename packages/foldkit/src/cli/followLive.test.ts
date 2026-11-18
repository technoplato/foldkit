import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Cli } from '../processor/host.js'
import { Text } from '../renderers/elements.js'
import { bindCounter } from '../test/apps/catalogCounter.js'
import { bindChapters } from '../test/apps/chapterContents.js'
import { terminalInkOf } from '../theme/terminal.js'
import { followLive, followTopicOf, programFollowings } from './surface.js'

const first = (stream: Stream.Stream<string, unknown>, count = 1) =>
  Effect.runPromise(Stream.runCollect(Stream.take(stream, count)))

const terminal = (columns: number, rows: number) => ({
  'in-place': '1',
  columns: columns.toString(),
  rows: rows.toString(),
})

describe('following a part of any Program’s view, live', () => {
  it('sends a terminal the part fitted to its size, with the commands its Actions offer now under it', async () => {
    const bound = bindCounter()
    const [frame = ''] = await first(
      followTopicOf(
        programFollowings(bound, 'counter'),
        'screen',
        terminal(40, 12),
        Cli(),
      ),
    )
    const lines = frame.split('\n')
    expect(lines.length).toBeLessThanOrEqual(11)
    expect(lines.every(line => line.length <= 40)).toBe(true)
    expect(frame).toContain('[ + ]')
    expect(frame).toMatch(/^ {2}counter increment +Increments the cou…$/m)
    expect(frame).not.toMatch(/counter reset/)
    expect(lines.at(-1)).toMatch(/^ {2}counter help +Lists every command$/)
  })

  it('gives each command one line, however long its sentence, so a line cut to the width leaves nothing behind', async () => {
    const bound = bindChapters()
    const following = followLive(
      bound,
      () => ({ node: Text('made up'), offers: ['NextChapter'] }),
      { name: 'chapters', piped: () => Stream.make('piped') },
    )
    const [frame = ''] = await first(following(terminal(30, 10), Cli()))
    expect(frame.split('\n')).toEqual([
      'made up',
      '  chapters next-chapter  Play…',
      '  chapters help          List…',
    ])
  })

  it('sends the frame again when the Model changes what it shows, and the commands change with it', async () => {
    const bound = bindCounter()
    const heard = first(
      followTopicOf(
        programFollowings(bound, 'counter'),
        'screen',
        terminal(40, 12),
        Cli(),
      ),
      2,
    )
    await new Promise(resolve => setTimeout(resolve, 80))
    bound.press('Increment')
    const [, after = ''] = await heard
    expect(after).toMatch(/counter reset +Sets the count to 0/)
  })

  it('sends a pipe what the topic sent before: the text, each time it differs', async () => {
    const bound = bindCounter()
    const [text = ''] = await first(
      followTopicOf(programFollowings(bound, 'counter'), 'screen', {}, Cli()),
    )
    expect(text).toContain('[ + ]')
    expect(text).not.toMatch(/counter increment/)
  })

  it('inks the frame from the theme for a view whose output takes color', async () => {
    const bound = bindChapters()
    const following = followLive(
      bound,
      () => ({ node: Text('made up'), offers: ['NextChapter'] }),
      {
        name: 'chapters',
        inkOf: () => terminalInkOf({ isTerminal: true, env: {}, mode: 'Dark' }),
        piped: () => Stream.make('piped'),
      },
    )
    const [inked = ''] = await first(
      following({ ...terminal(60, 10), color: '1' }, Cli()),
    )
    expect(inked).toContain('\u001b[2m  chapters next-chapter')
    const [plain = ''] = await first(following(terminal(60, 10), Cli()))
    expect(plain).not.toContain('\u001b[')
    expect(await first(following({}, Cli()))).toEqual(['piped'])
  })

  it('reads the part by the clock, so a part that moves between Messages is sent as it moves', async () => {
    const bound = bindChapters()
    const startedAt = Date.now()
    const following = followLive(
      bound,
      nowMs => ({
        node: Text(`tick ${Math.floor((nowMs - startedAt) / 100).toString()}`),
        isClocked: true,
      }),
      { name: 'chapters', piped: () => Stream.make('piped') },
    )
    const frames = await first(following(terminal(60, 6), Cli()), 3)
    expect(frames.map(frame => frame.split('\n')[0])).toEqual([
      'tick 0',
      'tick 1',
      'tick 2',
    ])
  })
})
