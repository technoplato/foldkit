import {
  Array,
  Duration,
  Effect,
  Equal,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import { bind } from '../interaction/bind.js'
import { keyInput } from '../interaction/interaction.js'
import { compose as composeProgram } from '../program/compose.js'
import { Text } from '../renderers/elements.js'
import { startHandle } from '../runtime/handle.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import * as Session from '../session/session.js'
import {
  App,
  type AppMessage,
  Counter,
  Increment,
  bindApp,
  handleOf,
  uriOf,
} from '../test/apps/navigableCounter.js'
import { notFoundScreen } from './compose.js'
import * as Declaration from './declaration.js'
import { Launch, Link, NavigatedBack, OpenedUri } from './message.js'
import { NavigationStack, stackAtRoot } from './structure.js'

// APP

describe('a composed App', () => {
  it('starts at the root URI its child declares', () => {
    expect(uriOf(bindApp())).toBe('/counter')
  })

  it('opens and closes the Session page as a pushed entry', () => {
    const bound = bindApp()
    expect(bound.press('OpenSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter/session')
    expect(bound.press('OpenSessionSettings')).toBe(false)
    expect(bound.press('CloseSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter')
  })

  it('goes back one entry on Escape and leaves the root alone', () => {
    const bound = bindApp()
    bound.press('OpenSessionSettings')
    expect(bound.pressKey(keyInput('Escape'))).toBe(true)
    expect(uriOf(bound)).toBe('/counter')
    expect(bound.pressKey(keyInput('Escape'))).toBe(false)
  })

  it('opens a menu URI and settles its highlight against the Catalog', () => {
    const bound = bindApp()
    expect(bound.openUri('/counter/menu?menu.q=re', Link())).toBe(true)
    expect(uriOf(bound)).toBe('/counter/menu?menu.q=re')
    const highlighted = Option.map(bound.menu(), menu =>
      menu.rows.filter(row => row.isHighlighted).map(row => row.entry.tag),
    )
    expect(highlighted).toEqual(Option.some(['Reset']))
  })

  it('prints the menu above the Session page and returns to it on Back', () => {
    const bound = bindApp()
    bound.press('OpenSessionSettings')
    bound.openMenu()
    bound.typeInMenu('in')
    expect(uriOf(bound)).toBe('/counter/session/menu?menu.q=in')
    bound.navigateBack('/counter/session')
    expect(uriOf(bound)).toBe('/counter/session')
    expect(Option.isNone(bound.menu())).toBe(true)
  })

  it('lands an Action chosen from the menu on the entry beneath it', () => {
    const bound = bindApp()
    bound.openMenu()
    expect(bound.chooseFromMenu('OpenSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter/session')
  })

  it('round-trips the Session page pushed above a page no route matched', () => {
    const bound = bindApp()
    bound.openUri('/counter/nope', Link())
    bound.press('OpenSessionSettings')
    expect(uriOf(bound)).toBe('/counter/nope/session')
    bound.openUri('/counter/nope/session', Link())
    expect(uriOf(bound)).toBe('/counter/nope/session')
    expect(Option.map(bound.navigation(), plan => plan.entries.length)).toEqual(
      Option.some(3),
    )
  })

  it('round-trips a child page pushed above the menu', () => {
    const bound = bindApp()
    bound.openMenu()
    bound.press('OpenSessionSettings')
    expect(uriOf(bound)).toBe('/counter/menu/session')
    bound.openUri('/counter/menu/session', Link())
    expect(
      Option.map(bound.navigation(), plan =>
        plan.entries.map(entry => entry.key),
      ),
    ).toEqual(
      Option.some(['/counter', '/counter/menu', '/counter/menu/session']),
    )
  })

  it('opens a long alternating URI quickly, at most 32 segments deep', () => {
    const bound = bindApp()
    const pairs = Array.join(Array.replicate('session/menu', 600), '/')
    const startedAt = performance.now()
    bound.openUri(`/counter/${pairs}/x`, Link())
    bound.openUri(
      `/counter/${Array.join(Array.replicate('session/menu', 15), '/')}/x`,
      Link(),
    )
    expect(performance.now() - startedAt).toBeLessThan(200)
  })

  it('holds the Session page and the menu once each, whatever the URI says', () => {
    const bound = bindApp()
    bound.openUri('/counter/session/menu/session', Link())
    expect(
      Option.map(bound.navigation(), plan =>
        plan.entries.map(entry => entry.key),
      ),
    ).toEqual(
      Option.some([
        '/counter',
        '/counter/session',
        '/counter/session/menu',
        '/counter/session/menu/session',
      ]),
    )
    expect(
      Option.map(bound.navigation(), plan =>
        plan.entries.map(entry => entry.maybeTitle),
      ),
    ).toEqual(
      Option.some([
        Option.some('Counter'),
        Option.some('Session'),
        Option.some('Actions'),
        Option.some('Not found'),
      ]),
    )
  })

  it('returns to a menu beneath a pushed page instead of opening a second', () => {
    const bound = bindApp()
    bound.openMenu()
    bound.press('OpenSessionSettings')
    expect(uriOf(bound)).toBe('/counter/menu/session')
    bound.openMenu()
    expect(uriOf(bound)).toBe('/counter/menu')
  })

  it('keeps an unknown path and paints it as not found', () => {
    const bound = bindApp()
    bound.openUri('/counter/nope', Link())
    expect(uriOf(bound)).toBe('/counter/nope')
    expect(bound.viewAt('/counter/nope')).toEqual(
      Option.some(
        Declaration.screenView(
          notFoundScreen(Declaration.NotFound({ segments: ['nope'] })),
        ),
      ),
    )
  })

  it('paints the root with the Program screen, Session with its page, and the menu as a menu', () => {
    const bound = bindApp()
    bound.press('Increment')
    bound.openUri('/counter/session/menu', Link())
    const tagAt = (key: string) =>
      Option.map(bound.viewAt(key), view => view._tag)
    expect(bound.viewAt('/counter')).toEqual(
      Option.some(Declaration.screenView(Text('1'))),
    )
    expect(tagAt('/counter/session')).toEqual(Option.some('Screen'))
    expect(tagAt('/counter/session/menu')).toEqual(Option.some('Menu'))
    expect(tagAt('/counter/elsewhere')).toEqual(Option.none())
  })

  it('ignores a launch while mirrored and adopts it once navigation is local', () => {
    const bound = bindApp()
    bound.openUri('/counter/session', Launch())
    expect(uriOf(bound)).toBe('/counter')
    bound.press('KeepNavigationLocal')
    bound.openUri('/counter/session', Launch())
    expect(uriOf(bound)).toBe('/counter/session')
  })

  it('classifies carrier facts and page moves as Navigation and mode changes as Domain', () => {
    const categoryOf = (message: AppMessage) =>
      App.synchronization?.messageCategory(message)
    expect(categoryOf(OpenedUri({ uri: '/counter', via: Link() }))).toBe(
      'Navigation',
    )
    expect(categoryOf(NavigatedBack({ uri: '/counter' }))).toBe('Navigation')
    expect(categoryOf(Session.OpenSessionSettings())).toBe('Navigation')
    expect(categoryOf(ActionMenu.OpenedActionMenu())).toBe('Navigation')
    expect(categoryOf(Session.KeepNavigationLocal())).toBe('Domain')
    expect(categoryOf(Increment())).toBe('Domain')
  })
})

// SYNC

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const [initialApp] = App.init()

const AppDestination = S.Union([
  Counter,
  Session.SessionSettings,
  Declaration.NotFound,
  ActionMenu.ActionMenu,
])

const AppModelSchema = S.Struct({
  count: S.Number,
  session: Session.SessionState,
  navigation: NavigationStack(AppDestination),
})

const AppSnapshot = CountRow.pipe(
  S.decodeTo(
    AppModelSchema,
    SchemaTransformation.transform({
      decode: (row): typeof AppModelSchema.Encoded => ({
        count: row.value,
        session: initialApp.session,
        navigation: stackAtRoot<typeof AppDestination.Type>(Counter()),
      }),
      encode: model => ({ id: 'count', value: model.count, asOf: '', at: 0 }),
    }),
  ),
)

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    S.fromJsonString(App.Message),
    SchemaTransformation.transform({
      decode: row => row.body,
      encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
    }),
  ),
)

const Synced = composeProgram.sync({
  of: App,
  snapshot: AppSnapshot,
  message: MessageWire,
})
type SyncedModel = ReturnType<typeof Synced.init>[0]

const settleAttempts = 200

const eventually = async <A>(read: () => A, expected: A): Promise<void> => {
  for (
    let attempt = 0;
    attempt < settleAttempts && !Equal.equals(read(), expected);
    attempt += 1
  ) {
    await Effect.runPromise(Effect.sleep(Duration.millis(1)))
  }
  expect(read()).toEqual(expected)
}

const whenReady = (
  handle: Readonly<{
    readModel: () => SyncedModel
    subscribe: (listener: () => void) => () => void
  }>,
): Promise<void> =>
  new Promise(resolve => {
    const check = (): void => {
      if (handle.readModel()._tag === 'Ready') {
        stop()
        resolve()
      }
    }
    const stop = handle.subscribe(check)
    check()
  })

describe('a synced App', () => {
  it('has no plan and refuses carrier facts until Ready', () => {
    const handle = handleOf(Synced)
    const bound = bind(Synced, handle)
    expect(bound.navigation()).toEqual(Option.none())
    expect(bound.openUri('/counter/session', Link())).toBe(false)
    handle.send(Synced.SnapshotReceived({ model: initialApp }))
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter'),
    )
    expect(bound.openUri('/counter/session', Link())).toBe(true)
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/session'),
    )
  })

  it('mirrors a carrier move, keeps moves local, then brings every Processor back together', async () => {
    const store = makeMemoryStore()
    const laptop = startHandle({
      program: Synced,
      sync: Memory({ processor: 'react-laptop', store }),
    })
    const phone = startHandle({
      program: Synced,
      sync: Memory({ processor: 'expo-phone', store }),
    })
    try {
      await whenReady(laptop)
      await whenReady(phone)
      const laptopBound = bind(Synced, laptop)
      const phoneBound = bind(Synced, phone)
      const uriOn = (bound: typeof laptopBound) => () =>
        Option.map(bound.navigation(), plan => plan.uri)

      laptopBound.openUri('/counter/session', Link())
      await eventually(uriOn(phoneBound), Option.some('/counter/session'))

      laptopBound.press('KeepNavigationLocal')
      await eventually(
        () =>
          phoneBound.entries().find(entry => entry.tag === 'MirrorNavigation')
            ?.availability._tag,
        'Enabled',
      )
      laptopBound.navigateBack('/counter')
      laptopBound.openUri('/counter/menu', Link())
      await eventually(uriOn(laptopBound), Option.some('/counter/menu'))
      await Effect.runPromise(Effect.sleep(Duration.millis(20)))
      expect(uriOn(phoneBound)()).toEqual(Option.some('/counter/session'))

      laptopBound.press('MirrorNavigation')
      await eventually(uriOn(phoneBound), Option.some('/counter'))
      await eventually(uriOn(laptopBound), Option.some('/counter'))
    } finally {
      await laptop.stop()
      await phone.stop()
    }
  })
})
