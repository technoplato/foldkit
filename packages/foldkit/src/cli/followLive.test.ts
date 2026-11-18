import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Cli } from '../processor/host.js'
import { Text, Transcript } from '../renderers/elements.js'
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
    expect(frame).toContain('  [ + ]')
    expect(lines.slice(-3)).toEqual([
      '',
      '  counter increment',
      '  counter help for more',
    ])
  })

  it('never breaks a command, and leaves commands off the end before it takes a third line', async () => {
    const bound = bindChapters()
    const following = followLive(
      bound,
      () => ({ node: Text('made up'), offers: ['NextChapter'] }),
      {
        name: 'chapters',
        hostOffers: () => [
          { command: 'mark', what: 'Marks this place' },
          { command: 'link', what: 'Shows the link' },
        ],
        piped: () => Stream.make('piped'),
      },
    )
    const [frame = ''] = await first(following(terminal(30, 10), Cli()))
    expect(frame.split('\n')).toEqual([
      '  made up',
      '',
      '  chapters next-chapter',
      '  chapters help for more',
    ])
  })

  it('puts the host’s own commands for the part after the part’s Actions, and names the command that lists all as the host does', async () => {
    const bound = bindChapters()
    const following = followLive(
      bound,
      () => ({ node: Text('made up'), offers: ['NextChapter'] }),
      {
        name: 'chapters',
        hostOffers: () => [{ command: 'mark', what: 'Marks this place' }],
        list: { command: 'actions', what: 'Lists all of it' },
        piped: () => Stream.make('piped'),
      },
    )
    const [frame = ''] = await first(following(terminal(80, 10), Cli()))
    expect(frame.split('\n').slice(1)).toEqual([
      '',
      '  chapters next-chapter   chapters mark   ·   chapters actions for more',
    ])
  })

  it('sends the frame again when the Model changes what it shows, and the commands change with it', async () => {
    const bound = bindCounter()
    const heard = first(
      followTopicOf(
        programFollowings(bound, 'counter'),
        'screen',
        terminal(80, 12),
        Cli(),
      ),
      2,
    )
    await new Promise(resolve => setTimeout(resolve, 80))
    bound.press('Increment')
    const [before = '', after = ''] = await heard
    expect(before).not.toMatch(/counter reset/)
    expect(after).toMatch(
      /counter increment {3}counter reset {3}· {3}counter help for more$/,
    )
  })

  it('sends a pipe what the topic sent before: the text, each time it differs', async () => {
    const bound = bindCounter()
    const [text = ''] = await first(
      followTopicOf(programFollowings(bound, 'counter'), 'screen', {}, Cli()),
    )
    expect(text).toContain('[ + ]')
    expect(text).not.toMatch(/counter increment/)
  })

  it('inks the frame from the theme for a view whose output takes color, and shows the word being read by its role alone', async () => {
    const bound = bindChapters()
    const words = Transcript({
      label: 'Words',
      action: 'SeekToWord',
      emptyText: 'No words yet.',
      passages: [
        {
          key: 'p1',
          label: '0:05',
          isCurrent: true,
          words: [
            { token: 'w1', text: 'He' },
            { token: 'w2', text: 'trimmed', isCurrent: true },
            { token: 'w3', text: 'the' },
          ],
        },
      ],
    })
    const following = followLive(
      bound,
      () => ({ node: words, offers: ['NextChapter'] }),
      {
        name: 'chapters',
        inkOf: () =>
          terminalInkOf({ isTerminal: true, env: {}, ground: 'Dark' }),
        piped: () => Stream.make('piped'),
      },
    )
    const [inked = ''] = await first(
      following({ ...terminal(60, 10), color: '1' }, Cli()),
    )
    expect(inked.split('\n')[0]).toBe(
      '  \u001b[38;2;251;146;60m▎\u001b[39m \u001b[38;2;154;161;170m0:05\u001b[39m  \u001b[1mHe\u001b[22m \u001b[4m\u001b[38;2;157;184;255mtrimmed\u001b[39m\u001b[24m the',
    )
    const [plain = ''] = await first(following(terminal(60, 10), Cli()))
    expect(plain).not.toContain('\u001b[')
    expect(plain.split('\n')[0]).toBe('  ▎ 0:05  He [trimmed] the')
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
      '  tick 0',
      '  tick 1',
      '  tick 2',
    ])
  })
})
