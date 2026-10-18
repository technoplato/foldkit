import { Array, Option, Record as Record_ } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { type UiNode, textsOf } from 'foldkit/renderers'
import {
  FailedPlayAudio,
  ReachedEnd,
  ReachedPlace,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { Milliseconds, TitleSlug } from './ids.js'
import {
  CompletedReportStretch,
  FailedReportStretch,
  ReceivedChapters,
  ReceivedShelf,
} from './message.js'
import { titleOf } from './model.js'
import { sampleChapters, sampleShelf } from './sample.js'

const startMs = Date.UTC(2026, 9, 18, 19, 20, 0)

type Sent = Readonly<{ name: string; args: unknown }>

const bindApp = () => {
  let model: AppModel = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf: sampleShelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  const sent: Array<Sent> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        sent.push({ name: command.name, args: command.args })
      })
    },
    stop: () => Promise.resolve(),
  }
  const bound = Interaction.bind(App, handle)
  return { bound, sent, send: handle.send }
}

type Bound = ReturnType<typeof bindApp>['bound']

const lanternKeeper = TitleSlug.make('the-lantern-keeper')
const smallHours = TitleSlug.make('small-hours')

const titleNamed = (bound: Bound, slug: TitleSlug) =>
  Option.getOrThrow(titleOf(bound.readModel(), slug))

const heardSeconds = (
  send: (message: AppMessage) => void,
  fromMs: number,
  seconds: ReadonlyArray<number>,
  speed = 1,
) =>
  Array.forEach(seconds, second => {
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(fromMs + Math.round(second * 1000 * speed)),
        wallClockMs: startMs + second * 1000,
      }),
    )
  })

const reportsOf = (sent: ReadonlyArray<Sent>) =>
  Array.filter(sent, ({ name }) => name === 'ReportStretch')

const eventTagsOf = (sent: ReadonlyArray<Sent>) =>
  Array.map(reportsOf(sent), ({ args }) =>
    Option.getOrElse(
      Option.flatMap(
        Option.liftPredicate(
          args,
          (value): value is { event: { _tag: string } } =>
            typeof value === 'object' && value !== null && 'event' in value,
        ),
        value => Option.some(value.event._tag),
      ),
      () => 'none',
    ),
  )

const lastReport = (sent: ReadonlyArray<Sent>) =>
  Option.map(Array.last(reportsOf(sent)), ({ args }) => args)

const screenOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      frame.base.view._tag === 'Screen'
        ? Option.some(frame.base.view.node)
        : Option.none(),
    ),
  )

const wordsOf = (bound: Bound): ReadonlyArray<string> =>
  Array.map(textsOf(screenOf(bound)), text => text.content)

describe('Books on Scribe’s timeline', () => {
  it('reports a stretch once it has played 3 s, with the title, and its end when paused', () => {
    const { bound, send, sent } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    heardSeconds(send, 0, [0, 1, 2])
    expect(reportsOf(sent)).toEqual([])
    heardSeconds(send, 0, [3])
    expect(lastReport(sent)).toEqual(
      Option.some({
        title: titleNamed(bound, lanternKeeper),
        event: {
          _tag: 'StretchBegan',
          stretch: {
            mediaStartMs: 0,
            startedAtMs: startMs,
            speed: 1,
            lastPlaceMs: 3_000,
            lastAtMs: startMs + 3_000,
          },
        },
      }),
    )
    heardSeconds(send, 0, [4, 5, 6, 7])
    bound.press('Pause')
    expect(eventTagsOf(sent)).toEqual(['StretchBegan', 'StretchEnded'])
    expect(lastReport(sent)).toEqual(
      Option.some({
        title: titleNamed(bound, lanternKeeper),
        event: {
          _tag: 'StretchEnded',
          stretch: {
            mediaStartMs: 0,
            startedAtMs: startMs,
            speed: 1,
            lastPlaceMs: 7_000,
            lastAtMs: startMs + 7_000,
          },
          end: {
            mediaEndMs: 7_000,
            endedAtMs: startMs + 7_000,
            reason: 'Paused',
          },
        },
      }),
    )
  })

  it('reports nothing for a play under 3 s', () => {
    const { bound, send, sent } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    heardSeconds(send, 0, [0, 1])
    bound.press('Pause')
    expect(reportsOf(sent)).toEqual([])
  })

  it('ends the stretch at a skip, and starts the next where the audio went', () => {
    const { bound, send, sent } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    heardSeconds(send, 0, [0, 1, 2, 3, 4])
    bound.pressKey(Interaction.keyInput(']'))
    expect(lastReport(sent)).toEqual(
      Option.some({
        title: titleNamed(bound, lanternKeeper),
        event: {
          _tag: 'StretchEnded',
          stretch: {
            mediaStartMs: 0,
            startedAtMs: startMs,
            speed: 1,
            lastPlaceMs: 4_000,
            lastAtMs: startMs + 4_000,
          },
          end: {
            mediaEndMs: 4_000,
            endedAtMs: startMs + 4_000,
            reason: 'Seeked',
          },
        },
      }),
    )
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(34_000),
        wallClockMs: startMs + 5_000,
      }),
    )
    const { listening } = bound.readModel()
    expect(
      listening._tag === 'Loaded' ? listening.stretch : 'nothing loaded',
    ).toEqual({
      _tag: 'Starting',
      stretch: {
        mediaStartMs: 34_000,
        startedAtMs: startMs + 5_000,
        speed: 1,
        lastPlaceMs: 34_000,
        lastAtMs: startMs + 5_000,
      },
    })
  })

  it('ends the stretch when another title starts, and when the speed changes', () => {
    const { bound, send, sent } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    heardSeconds(send, 0, [0, 1, 2, 3, 4])
    bound.press('SetSpeed:1.5')
    expect(
      Option.map(lastReport(sent), args =>
        typeof args === 'object' && args !== null && 'event' in args
          ? args.event
          : args,
      ),
    ).toEqual(
      Option.some({
        _tag: 'StretchEnded',
        stretch: {
          mediaStartMs: 0,
          startedAtMs: startMs,
          speed: 1,
          lastPlaceMs: 4_000,
          lastAtMs: startMs + 4_000,
        },
        end: {
          mediaEndMs: 4_000,
          endedAtMs: startMs + 4_000,
          reason: 'SpeedChanged',
        },
      }),
    )
    heardSeconds(send, 4_000, [5, 6, 7, 8, 9], 1.5)
    bound.press(`Listen:${smallHours}`)
    expect(eventTagsOf(sent)).toEqual([
      'StretchBegan',
      'StretchEnded',
      'StretchBegan',
      'StretchEnded',
    ])
    expect(lastReport(sent)).toEqual(
      Option.some({
        title: titleNamed(bound, lanternKeeper),
        event: {
          _tag: 'StretchEnded',
          stretch: {
            mediaStartMs: 4_000 + 7_500,
            startedAtMs: startMs + 5_000,
            speed: 1.5,
            lastPlaceMs: 4_000 + 13_500,
            lastAtMs: startMs + 9_000,
          },
          end: {
            mediaEndMs: 4_000 + 13_500,
            endedAtMs: startMs + 9_000,
            reason: 'TitleChanged',
          },
        },
      }),
    )
  })

  it('ends the stretch when the audio fails, and at the end of the book', () => {
    const failing = bindApp()
    failing.bound.press(`Listen:${lanternKeeper}`)
    heardSeconds(failing.send, 0, [0, 1, 2, 3, 4])
    failing.send(
      FailedPlayAudio({ reason: 'the audio file stopped downloading' }),
    )
    expect(
      Option.map(lastReport(failing.sent), args =>
        typeof args === 'object' && args !== null && 'event' in args
          ? args.event
          : args,
      ),
    ).toEqual(
      Option.some({
        _tag: 'StretchEnded',
        stretch: {
          mediaStartMs: 0,
          startedAtMs: startMs,
          speed: 1,
          lastPlaceMs: 4_000,
          lastAtMs: startMs + 4_000,
        },
        end: {
          mediaEndMs: 4_000,
          endedAtMs: startMs + 4_000,
          reason: 'Interrupted',
        },
      }),
    )
    const ending = bindApp()
    ending.bound.press(`Listen:${lanternKeeper}`)
    ending.bound.press('SeekTo:79m50s')
    heardSeconds(ending.send, 4_790_000, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    ending.send(ReachedEnd())
    expect(eventTagsOf(ending.sent)).toEqual(['StretchBegan', 'StretchEnded'])
    expect(
      Option.map(lastReport(ending.sent), args =>
        typeof args === 'object' && args !== null && 'event' in args
          ? args.event
          : args,
      ),
    ).toEqual(
      Option.some({
        _tag: 'StretchEnded',
        stretch: {
          mediaStartMs: 4_790_000,
          startedAtMs: startMs,
          speed: 1,
          lastPlaceMs: 4_799_000,
          lastAtMs: startMs + 9_000,
        },
        end: {
          mediaEndMs: 4_800_000,
          endedAtMs: startMs + 10_000,
          reason: 'Ended',
        },
      }),
    )
  })

  it('says under the player when Scribe’s timeline refused a stretch, until one lands', () => {
    const { bound, send } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    send(FailedReportStretch({ reason: 'the network is offline' }))
    expect(wordsOf(bound)).toContain(
      'Scribe’s timeline did not get this listen: the network is offline',
    )
    send(CompletedReportStretch({ recordingCount: 1 }))
    expect(
      Array.some(wordsOf(bound), words =>
        words.startsWith('Scribe’s timeline'),
      ),
    ).toBe(false)
  })
})
