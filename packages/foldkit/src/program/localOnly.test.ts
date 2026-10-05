import {
  Array,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../navigation/declaration.js'
import { NavigationStack, stackAtRoot } from '../navigation/structure.js'
import * as Route from '../route/parser.js'
import { startHandle } from '../runtime/handle.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import { ts } from '../schema/index.js'
import * as Session from '../session/session.js'
import { compose as composeProgram } from './compose.js'
import { make } from './program.js'

const NotesModel = S.Struct({ pasted: S.Number, saved: S.Number })
type NotesModel = typeof NotesModel.Type

const Save = Catalog.action('Save', {
  what: 'Saves the note',
  why: 'The person wants it on every device',
  meta: { label: 'Save', keys: [] },
})

const Paste = Catalog.action('Paste', {
  fields: { text: S.String },
  what: 'Takes text pasted into the field',
  why: 'The person copied it from another page',
  meta: { label: 'Paste', keys: [] },
})

const catalog = Catalog.make([Save, Paste])
const NotesMessage = catalog.Message
type NotesMessage = typeof NotesMessage.Type

const Notes = ts('Notes')

const NotesProgram = make({
  id: 'local-only-notes',
  version: 1,
  Model: NotesModel,
  Message: NotesMessage,
  init: () => [NotesModel.make({ pasted: 0, saved: 0 }), []],
  update: (model: NotesModel, message: NotesMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [NotesModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Save: () => [{ ...model, saved: model.saved + 1 }, []],
        Paste: () => [{ ...model, pasted: model.pasted + 1 }, []],
      }),
    ),
  catalog,
  navigation: Declaration.screens({
    slug: 'notes',
    root: Declaration.rootScreen(Notes, Route.here),
  }),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
    isLocalOnly: message => message._tag === 'Paste',
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      pasted: current.pasted,
    }),
  },
})

const App = ActionMenu.compose({ of: Session.compose({ of: NotesProgram }) })

const AppDestination = S.Union([
  Notes,
  Session.SessionSettings,
  Declaration.NotFound,
  ActionMenu.ActionMenu,
])

const AppModel = S.Struct({
  pasted: S.Number,
  saved: S.Number,
  session: Session.SessionState,
  navigation: NavigationStack(AppDestination),
})

const Synced = composeProgram.sync({
  of: App,
  snapshot: S.Struct({ id: S.String }).pipe(
    S.decodeTo(
      AppModel,
      SchemaTransformation.transform({
        decode: (): typeof AppModel.Encoded => ({
          pasted: 0,
          saved: 0,
          session: { mode: 'Mirror', generation: 0 },
          navigation: stackAtRoot(Notes()),
        }),
        encode: () => ({ id: 'notes' }),
      }),
    ),
  ),
  message: S.Struct({ body: S.String }).pipe(
    S.decodeTo(
      S.fromJsonString(App.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ body }),
      }),
    ),
  ),
})

const pollMs = 10
const pollAttempts = 100

const eventually = async (
  isDone: () => boolean,
  attemptsLeft = pollAttempts,
): Promise<void> => {
  if (isDone()) {
    return
  } else if (attemptsLeft === 0) {
    throw new Error('never happened')
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    return eventually(isDone, attemptsLeft - 1)
  }
}

const handles: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

const pastedAddress =
  'https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=made-up-code'

type Handle = ReturnType<typeof startHandle<typeof App>>

const readyModelOf = (handle: Handle) => {
  const model = handle.readModel()
  return model._tag === 'Ready' ? Option.some(model) : Option.none()
}

describe('synchronization.isLocalOnly', () => {
  it('reaches the child through Session and ActionMenu, never for their own Messages', () => {
    const isLocalOnly = App.synchronization?.isLocalOnly
    expect(isLocalOnly?.(Paste({ text: pastedAddress }))).toBe(true)
    expect(isLocalOnly?.(Save())).toBe(false)
    expect(isLocalOnly?.(Session.GoBack())).toBe(false)
    expect(isLocalOnly?.(ActionMenu.OpenedActionMenu())).toBe(false)
  })

  it('applies a local-only Message here and never writes it to the log', async () => {
    const store = makeMemoryStore()
    const here = startHandle({
      program: Synced,
      sync: Memory({ processor: 'notes-here', store }),
    })
    const there = startHandle({
      program: Synced,
      sync: Memory({ processor: 'notes-there', store }),
    })
    handles.push(here, there)
    await eventually(
      () =>
        Option.isSome(readyModelOf(here)) && Option.isSome(readyModelOf(there)),
    )
    here.send(Paste({ text: pastedAddress }))
    here.send(Save())
    await eventually(() =>
      Option.exists(readyModelOf(there), model => model.saved === 1),
    )
    expect(
      Option.map(readyModelOf(here), model => [model.pasted, model.saved]),
    ).toEqual(Option.some([1, 1]))
    expect(
      Option.map(readyModelOf(there), model => [model.pasted, model.saved]),
    ).toEqual(Option.some([0, 1]))
    expect(store.messages).toHaveLength(1)
    expect(
      Array.some(store.messages, row =>
        JSON.stringify(row).includes('made-up-code'),
      ),
    ).toBe(false)
  })

  it('keeps what a local-only Message changed when sync refolds the log', () => {
    const [atStart] = App.init()
    const ready = Synced.Ready({ ...atStart, pasted: 1 })
    const [refolded] = Synced.update(
      ready,
      Synced.LogRefolded({ model: { ...atStart, pasted: 0 } }),
    )
    expect(refolded._tag === 'Ready' ? refolded.pasted : -1).toBe(1)
  })
})
