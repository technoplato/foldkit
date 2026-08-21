import {
  type AppMessage,
  type AppModel,
  type CounterFactHandles,
  CounterProgram,
  type FactCallable,
  type ListedAction,
  Model,
  type SyncedCounterHandle,
  type TapHandle,
  actionByToken,
  actionMenuMessageFromKey,
  actionMenuRowLabel,
  chosenMenuTokenOf,
  counterScreen,
  factHandleEntries,
  filterListedActions,
  initialCount,
  isActionMenuEnterKey,
  listActions,
  surfaceFor,
  tokenOf,
} from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import { Program } from 'foldkit'
import { type UiNode } from 'foldkit/renderers'

import {
  type CliRenderer,
  type Renderable,
  TextRenderable,
  bold,
  dim,
  t,
} from '@opentui/core'

import { type PaintOpenTuiMenu, paintOpenTuiFrame } from './paintOpenTui.js'

const quitHint = '[q] quit'
const paintedTreeIndex = 0

const startingScreen = counterScreen(Model.make({ count: initialCount }))

const productScreenOf = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
): UiNode => {
  if (snapshot._tag === 'Ready') {
    return counterScreen(snapshot.product)
  }
  return startingScreen
}

const visibleMenuRows = (
  product: Model,
  maybeQuery: Option.Option<string>,
): ReadonlyArray<ListedAction> => {
  const filtered = filterListedActions(
    listActions(CounterProgram, product),
    maybeQuery,
  )
  if (filtered._tag === 'Empty') {
    return []
  }
  return filtered.rows
}

const overlayMenuOf = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
  handle: SyncedCounterHandle,
  maybeChosen: Option.Option<string> = Option.none(),
): PaintOpenTuiMenu | undefined => {
  if (snapshot._tag !== 'Ready') {
    return undefined
  }
  if (snapshot.actionMenu._tag === 'Closed') {
    return undefined
  }
  const open = snapshot.actionMenu
  const filtered = filterListedActions(
    listActions(CounterProgram, snapshot.product),
    open.maybeQuery,
  )
  const maybeHighlight = Program.highlightIndex(open, filtered)
  return {
    focus: Option.getOrElse(maybeHighlight, () => open.focus),
    rows: Array.map(
      visibleMenuRows(snapshot.product, open.maybeQuery),
      row => ({
        token: row.token,
        disabled: row.disabled,
        label: actionMenuRowLabel(row),
      }),
    ),
    maybeChosen,
    onDismiss: () => {
      handle.send(Program.ActionMenuDismissed())
    },
    onSelect: token => {
      handle.send(Program.ActionCommandMenuSelectionMade({ token }))
    },
  }
}

/** Key hints for one Button token, from the Action `keys` metadata. */
export const counterKeysForToken = (token: string): ReadonlyArray<string> => {
  const action = actionByToken(token)
  if (action === undefined) {
    return []
  }
  return action.keys ?? []
}

const tapFactHandle = (factHandle: FactCallable | TapHandle): void => {
  if (typeof factHandle === 'function') {
    factHandle()
    return
  }
  M.value(factHandle).pipe(
    M.tagsExhaustive({
      Tappable: ({ tap }) => {
        tap()
      },
      Hidden: () => undefined,
    }),
  )
}

/**
 * Taps the fact behind one screen Button token. A gated handle only
 * taps when Tappable; Hidden has no way to send.
 */
export const tapForToken = (
  token: string,
  handles: CounterFactHandles,
): void => {
  if (
    token === Program.actionMenuDismissToken ||
    token.startsWith(Program.actionMenuSelectPrefix)
  ) {
    return
  }
  const maybeHandle = Option.map(
    Array.findFirst(
      factHandleEntries(handles),
      ([action]) => tokenOf(action) === token,
    ),
    ([, factHandle]) => factHandle,
  )
  if (Option.isSome(maybeHandle)) {
    tapFactHandle(maybeHandle.value)
  }
}

/**
 * Routes a painted token. Menu tokens select or dismiss. Product
 * tokens tap the derived fact handle.
 */
export const tapScreenToken = (
  token: string,
  handle: SyncedCounterHandle,
): void => {
  if (token === Program.actionMenuDismissToken) {
    handle.send(Program.ActionMenuDismissed())
    return
  }
  if (token.startsWith(Program.actionMenuSelectPrefix)) {
    handle.send(
      Program.ActionCommandMenuSelectionMade({
        token: Program.tokenFromActionMenuToken(token),
      }),
    )
    return
  }
  tapForToken(token, handle.actions())
}

/**
 * Taps the fact behind one key press. The keymap comes from the
 * Action `keys` metadata; nothing here knows which key does what.
 */
export const tapForKey = (input: string, handles: CounterFactHandles): void => {
  const key = input.toLowerCase()
  const maybeHandle = Option.map(
    Array.findFirst(
      factHandleEntries(handles),
      ([action]) =>
        Array.contains(action.keys ?? [], key) ||
        Array.contains(action.keys ?? [], input),
    ),
    ([, factHandle]) => factHandle,
  )
  if (Option.isSome(maybeHandle)) {
    tapFactHandle(maybeHandle.value)
  }
}

/**
 * Maps one key to an Action menu Message, then to a product tap.
 * Product Increment is not the menu selection path.
 */
export const dispatchOpenTuiInput = (
  input: string,
  handle: SyncedCounterHandle,
  modifiers: Readonly<{ metaKey: boolean; ctrlKey: boolean }> = {
    metaKey: false,
    ctrlKey: false,
  },
): Option.Option<string> => {
  const snapshot = handle.readModel()
  const menu =
    snapshot._tag === 'Ready' ? snapshot.actionMenu : Program.Closed()
  const product =
    snapshot._tag === 'Ready' ? snapshot.product : Model.make({ count: 0 })
  const rows = listActions(CounterProgram, product)
  const menuKey = isActionMenuEnterKey(input) ? 'Enter' : input
  const menuMessage = actionMenuMessageFromKey(
    {
      key: menuKey,
      metaKey: modifiers.metaKey,
      ctrlKey: modifiers.ctrlKey,
    },
    menu,
    rows,
    product,
  )
  if (menuMessage !== undefined) {
    const maybeChosen =
      menu._tag === 'Open' ? chosenMenuTokenOf(menuMessage) : Option.none()
    handle.send(menuMessage)
    return maybeChosen
  }
  tapForKey(input, handle.actions())
  return Option.none()
}

/**
 * Paints the synced Counter on an OpenTUI renderer until `q`. The
 * Client only subscribes, paints the screen tree, and maps keys and
 * mouse presses to Action taps.
 */
export const runCounterOpenTui = (
  handle: SyncedCounterHandle,
  renderer: CliRenderer,
): Promise<void> =>
  new Promise(resolve => {
    let maybePainted: Renderable | undefined
    let held:
      | Readonly<{
          snapshot: Program.SyncedModel<AppModel, AppMessage>
          token: string
        }>
      | undefined

    const paint = (): void => {
      const live = handle.readModel()
      const snapshot = held !== undefined ? held.snapshot : live
      const maybeChosen =
        held !== undefined ? Option.some(held.token) : Option.none()
      const next = paintOpenTuiFrame(
        renderer,
        productScreenOf(snapshot),
        overlayMenuOf(snapshot, handle, maybeChosen),
        {
          keysForToken: counterKeysForToken,
          onTap: token => {
            tapScreenToken(token, handle)
          },
        },
      )
      if (maybePainted !== undefined) {
        renderer.root.remove(maybePainted)
        maybePainted.destroy()
      }
      maybePainted = next
      renderer.root.add(next, paintedTreeIndex)
      renderer.requestRender()
    }

    const surface = surfaceFor('opentui')
    renderer.root.add(
      new TextRenderable(renderer, {
        content: t`${bold(surface.title)}`,
      }),
    )
    renderer.root.add(
      new TextRenderable(renderer, {
        content: t`${dim(surface.description)}`,
      }),
    )
    renderer.root.add(
      new TextRenderable(renderer, {
        content: t`${dim(surface.sourceUrl)}`,
      }),
    )
    renderer.root.add(
      new TextRenderable(renderer, { content: t`${dim(quitHint)}` }),
    )
    paint()
    const unsubscribe = handle.subscribe(paint)

    renderer.keyInput.on('keypress', key => {
      const input = key.name === '' ? key.sequence : key.name
      if (input.toLowerCase() === 'q') {
        unsubscribe()
        resolve()
        return
      }
      const before = handle.readModel()
      const maybeChosen = dispatchOpenTuiInput(input, handle, {
        metaKey: key.meta,
        ctrlKey: key.ctrl,
      })
      if (Option.isSome(maybeChosen) && before._tag === 'Ready') {
        held = { snapshot: before, token: maybeChosen.value }
        paint()
        held = undefined
        paint()
      }
    })
  })
