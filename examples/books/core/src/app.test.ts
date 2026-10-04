import { Array, Option } from 'effect'
import { Catalog, Interaction, Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import {
  FailedPlayAudio,
  ReachedEnd,
  ReachedPlace,
  ReceivedShelf,
} from './message.js'
import { sampleShelf } from './sample.js'

type Written = Readonly<{ name: string; args: string }>

const bindApp = () => {
  let model: AppModel = App.update(
    App.init()[0],
    ReceivedShelf({ shelf: sampleShelf }),
  )[0]
  const written: Array<Written> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        written.push({ name: command.name, args: JSON.stringify(command.args) })
      })
    },
    stop: () => Promise.resolve(),
  }
  const bound = Interaction.bind(App, handle)
  return { bound, written, send: handle.send }
}

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const uriOf = (bound: ReturnType<typeof bindApp>['bound']) =>
  Option.map(bound.navigation(), plan => plan.uri)

const placeOf = (bound: ReturnType<typeof bindApp>['bound']) => {
  const model = bound.readModel()
  return model.listening._tag === 'Loaded' ? model.listening.placeMs : -1
}

const availabilityOf = (
  bound: ReturnType<typeof bindApp>['bound'],
  tag: string,
) =>
  Option.map(
    Array.findFirst(bound.entries(), entry => entry.tag === tag),
    entry => entry.availability._tag,
  )

describe('Books', () => {
  it('plays a title from the library and shows the player', () => {
    const { bound } = bindApp()
    bound.press(`Play:${lanternKeeper}`)
    expect(uriOf(bound)).toEqual(Option.some('/books/listen'))
    expect(bound.readModel().listening._tag).toBe('Loaded')
    expect(availabilityOf(bound, 'Pause')).toEqual(Option.some('Enabled'))
  })

  it('opens a title, then plays it above its page', () => {
    const { bound } = bindApp()
    bound.press(`Open:${lanternKeeper}`)
    expect(uriOf(bound)).toEqual(Option.some('/books/the-lantern-keeper'))
    bound.pressKey(Interaction.keyInput('p'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen'),
    )
  })

  it('saves the place on pause, every 30 seconds, and the finish', () => {
    const { bound, written, send } = bindApp()
    bound.press(`Play:${lanternKeeper}`)
    send(ReachedPlace({ placeMs: Milliseconds.make(10_000) }))
    expect(written).toEqual([])
    send(ReachedPlace({ placeMs: Milliseconds.make(31_000) }))
    send(ReachedPlace({ placeMs: Milliseconds.make(40_000) }))
    bound.press('Pause')
    send(ReachedEnd())
    expect(Array.map(written, ({ args }) => args)).toEqual(
      Array.map(
        [
          { _tag: 'SavePlace', slug: lanternKeeper, placeMs: 31_000 },
          { _tag: 'SavePlace', slug: lanternKeeper, placeMs: 40_000 },
          { _tag: 'FinishTitle', slug: lanternKeeper },
        ],
        write => JSON.stringify({ write }),
      ),
    )
  })

  it('skips 30 seconds and never past either end', () => {
    const { bound } = bindApp()
    bound.press(`Play:${lanternKeeper}`)
    bound.pressKey(Interaction.keyInput('['))
    expect(placeOf(bound)).toBe(0)
    bound.pressKey(Interaction.keyInput(']'))
    expect(placeOf(bound)).toBe(30_000)
  })

  it('jumps to a chapter from the contents, which close', () => {
    const { bound } = bindApp()
    bound.press(`Open:${lanternKeeper}`)
    bound.pressKey(Interaction.keyInput('c'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/contents'),
    )
    bound.press('JumpToChapter:3')
    expect(placeOf(bound)).toBe(2_400_000)
    expect(uriOf(bound)).toEqual(Option.some('/books/the-lantern-keeper'))
    expect(Catalog.commandOf('JumpToChapter:3')).toBe('jump-to-chapter 3')
  })

  it('opens a deep link to a chapter, a section someone can share', () => {
    const { bound } = bindApp()
    bound.openUri('/books/the-lantern-keeper/chapter/2', Navigation.Link())
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/chapter/2'),
    )
    expect(
      Option.map(Navigation.frameOf(bound), frame =>
        JSON.stringify(frame.base.view),
      ),
    ).toEqual(Option.some(expect.stringContaining('The Light')))
  })

  it('refuses stacks the screens never allow', () => {
    const { bound } = bindApp()
    bound.openUri('/books/listen/contents/speed', Navigation.Link())
    expect(uriOf(bound)).toEqual(Option.some('/books/listen/contents'))
    bound.openUri(
      '/books/the-lantern-keeper/chapter/2/listen',
      Navigation.Link(),
    )
    expect(
      Option.map(bound.navigation(), plan =>
        Array.map(plan.entries, entry =>
          Navigation.isNotFound(entry.destination) ? 'NotFound' : 'Screen',
        ),
      ),
    ).toEqual(Option.some(['Screen', 'Screen', 'Screen', 'NotFound']))
  })

  it('asks before deleting a bookmark, and nothing else runs meanwhile', () => {
    const { bound, send, written } = bindApp()
    send(
      ReceivedShelf({
        shelf: {
          ...sampleShelf,
          bookmarks: [
            {
              bookmarkId: BookmarkId.make('bookmark-1'),
              slug: lanternKeeper,
              atMs: Milliseconds.make(723_000),
              createdAtMs: 0,
            },
          ],
        },
      }),
    )
    bound.press(`Open:${lanternKeeper}`)
    bound.press('DeleteBookmark:bookmark-1')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/delete-bookmark/bookmark-1'),
    )
    expect(availabilityOf(bound, 'Play')).toEqual(Option.some('Disabled'))
    bound.pressKey(Interaction.keyInput('y'))
    expect(uriOf(bound)).toEqual(Option.some('/books/the-lantern-keeper'))
    expect(Array.map(written, ({ name }) => name)).toEqual(['WriteLibrary'])
  })

  it('will not play a title whose audio is not in the library yet', () => {
    const { bound, send, written } = bindApp()
    send(
      ReceivedShelf({
        shelf: {
          ...sampleShelf,
          titles: Array.map(sampleShelf.titles, title => ({
            ...title,
            maybeAudioUrl: Option.none(),
          })),
        },
      }),
    )
    bound.press(`Open:${lanternKeeper}`)
    expect(availabilityOf(bound, 'Play')).toEqual(Option.some('Disabled'))
    bound.pressKey(Interaction.keyInput('p'))
    bound.press('JumpToChapter:2')
    expect(bound.readModel().listening._tag).toBe('Idle')
    expect(uriOf(bound)).toEqual(Option.some('/books/the-lantern-keeper'))
    expect(written).toEqual([])
  })

  it('stops and says why when the audio will not play, and Play tries again', () => {
    const { bound, send, written } = bindApp()
    bound.press(`Play:${lanternKeeper}`)
    send(ReachedPlace({ placeMs: Milliseconds.make(12_000) }))
    send(FailedPlayAudio({ reason: 'the audio file stopped downloading' }))
    const transportOf = () => {
      const { listening } = bound.readModel()
      return listening._tag === 'Loaded' ? listening.transport._tag : 'Idle'
    }
    expect(transportOf()).toBe('Unplayable')
    expect(availabilityOf(bound, 'Pause')).toEqual(Option.some('Disabled'))
    expect(written).toEqual([
      {
        name: 'WriteLibrary',
        args: JSON.stringify({
          write: { _tag: 'SavePlace', slug: lanternKeeper, placeMs: 12_000 },
        }),
      },
    ])
    bound.pressKey(Interaction.keyInput('p'))
    expect(transportOf()).toBe('Playing')
    expect(placeOf(bound)).toBe(12_000)
  })

  it('sets the speed from its sheet on the player', () => {
    const { bound } = bindApp()
    bound.press(`Play:${lanternKeeper}`)
    bound.pressKey(Interaction.keyInput('x'))
    expect(uriOf(bound)).toEqual(Option.some('/books/listen/speed'))
    bound.press('SetSpeed:1.5')
    expect(bound.readModel().speed).toBe(1.5)
    expect(uriOf(bound)).toEqual(Option.some('/books/listen'))
  })
})
