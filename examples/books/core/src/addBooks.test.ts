import { Array, Match as M, Option, Redacted } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type ListItem,
  type UiNode,
  buttonsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import * as Audible from './audible/index.js'
import { ReceivedShelf } from './message.js'
import { sampleShelf } from './sample.js'

const bindApp = (shelf = sampleShelf) => {
  let model: AppModel = App.update(App.init()[0], ReceivedShelf({ shelf }))[0]
  const commands: Array<string> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, sent] = App.update(model, message)
      model = next
      Array.forEach(sent, command => {
        commands.push(command.name)
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), send: handle.send, commands }
}

type Bound = ReturnType<typeof bindApp>['bound']

const emptyShelf = { ...sampleShelf, titles: [], progress: [], bookmarks: [] }

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const nodeOf = (layer: Navigation.FrameLayer): Option.Option<UiNode> =>
  layer.view._tag === 'Screen' ? Option.some(layer.view.node) : Option.none()

const baseOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame => nodeOf(frame.base)),
  )

const sheetOf = (bound: Bound): Option.Option<UiNode> =>
  Option.flatMap(Navigation.frameOf(bound), frame =>
    Option.flatMap(Array.last(frame.overlays), nodeOf),
  )

const itemsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tag('List', list => list.items),
    M.tag('Row', 'Column', 'Box', 'DeviceShell', parent =>
      Array.flatMap(parent.children, itemsOf),
    ),
    M.orElse(() => []),
  )

const wordsOf = (node: UiNode): ReadonlyArray<string> => [
  ...Array.map(textsOf(node), text => text.content),
  ...Array.flatMap(itemsOf(node), item => [item.title, ...(item.lines ?? [])]),
]

const buttonLabelsOf = (node: UiNode): ReadonlyArray<string> =>
  Array.map(buttonsOf(node), button => button.label)

const landing =
  'https://www.amazon.com/ap/maplanding?openid.mode=id_res&openid.oa2.authorization_code=ANfakeCode'

describe('Import from Audible in Books', () => {
  it('offers the import on an empty library, at its own address, and Back returns', () => {
    const { bound, send } = bindApp(emptyShelf)
    expect(wordsOf(baseOf(bound))).toEqual(
      expect.arrayContaining([
        'Your library is empty',
        'Bring in the audiobooks you already own.',
      ]),
    )
    expect(buttonLabelsOf(baseOf(bound))).toContain('Import from Audible')
    bound.press('ImportFromAudible')
    expect(uriOf(bound)).toEqual(Option.some('/books/audible'))
    send(Audible.FailedReadAudibleLibrary({ problem: Audible.NotConnected() }))
    expect(uriOf(bound)).toEqual(Option.some('/books/audible/connect'))
    bound.navigateBack('/books')
    expect(uriOf(bound)).toEqual(Option.some('/books'))
  })

  it('lists where more books can come from in a Sheet that a tap outside dismisses', () => {
    const { bound } = bindApp()
    expect(wordsOf(baseOf(bound))).toEqual(
      expect.arrayContaining([
        'Add more of your books',
        'Import the books you own on Audible',
      ]),
    )
    bound.press('ShowAddBooks')
    expect(uriOf(bound)).toEqual(Option.some('/books/add'))
    expect(Option.map(sheetOf(bound), wordsOf)).toEqual(
      Option.some(
        expect.arrayContaining([
          'Add your books',
          'Audible',
          'Import the books you own',
        ]),
      ),
    )
    bound.navigateBack('/books')
    expect(uriOf(bound)).toEqual(Option.some('/books'))
    bound.press('ShowAddBooks')
    bound.press('ImportFromAudible')
    expect(uriOf(bound)).toEqual(Option.some('/books/audible'))
    expect(sheetOf(bound)).toEqual(Option.none())
  })

  it('offers the import on the profile, above it', () => {
    const { bound } = bindApp()
    bound.press('ShowProfile')
    expect(uriOf(bound)).toEqual(Option.some('/books/profile'))
    expect(wordsOf(baseOf(bound))).toContain('Import from Audible')
    bound.press('ImportFromAudible')
    expect(uriOf(bound)).toEqual(Option.some('/books/profile/audible'))
  })

  it('opens each step from its address, and shows the titles once connected', () => {
    const { bound, send } = bindApp()
    bound.openUri('/books/audible/connect', Navigation.Link())
    expect(uriOf(bound)).toEqual(Option.some('/books/audible/connect'))
    send(
      Audible.StartedAudibleSignIn({
        loginUrl: 'https://www.amazon.com/ap/signin',
      }),
    )
    expect(
      Array.map(itemsOf(baseOf(bound)), item => [item.title, item.href]),
    ).toContainEqual([
      'Open Amazon sign-in',
      'https://www.amazon.com/ap/signin',
    ])
    bound.press(`ConnectAudible:${landing}`)
    expect(bound.readModel().audible.signIn._tag).toBe('SignInConnecting')
    send(Audible.ConnectedAudible())
    expect(uriOf(bound)).toEqual(Option.some('/books/audible'))
    bound.navigateBack('/books')
    expect(uriOf(bound)).toEqual(Option.some('/books'))
  })

  it('keeps every Audible import Message, the pasted address among them, off the shared log', () => {
    const isLocalOnly = Option.getOrThrow(
      Option.fromNullishOr(App.synchronization?.isLocalOnly),
    )
    expect(
      isLocalOnly(Audible.ConnectAudible({ address: Redacted.make(landing) })),
    ).toBe(true)
    expect(isLocalOnly(Audible.ConnectedAudible())).toBe(true)
    expect(isLocalOnly(Audible.ImportAudibleTitles())).toBe(true)
    expect(isLocalOnly(ReceivedShelf({ shelf: sampleShelf }))).toBe(false)
  })
})
