import { Array, Option } from 'effect'
import { type Interaction } from 'foldkit'
import { keyInput, normalizeKey } from 'foldkit/interaction'

import {
  type CliRenderer,
  type Renderable,
  TextRenderable,
  dim,
  t,
} from '@opentui/core'

import { paintOpenTuiFrame } from './paintOpenTui.js'

const quitHint = '[?] actions  [q] quit'
const paintedTreeIndex = 0

/**
 * Runs any bound Program on an OpenTUI renderer until `q`. It repaints on
 * every Model change and routes keys and mouse presses through the
 * Program's interaction.
 */
export const runOpenTui = <Model, Message>(
  bound: Interaction.BoundInteraction<Model, Message>,
  renderer: CliRenderer,
): Promise<void> =>
  new Promise(resolve => {
    let maybePainted: Option.Option<Renderable> = Option.none()

    const keysOf = (action: string): ReadonlyArray<string> =>
      Option.match(
        Array.findFirst(bound.entries(), entry => entry.tag === action),
        {
          onNone: () => [],
          onSome: entry => entry.keys,
        },
      )

    const paint = (): void => {
      const next = paintOpenTuiFrame(renderer, bound.screen(), bound.menu(), {
        keysOf,
        onPress: button => {
          if (button.action !== undefined) {
            bound.press(button.action)
          }
        },
        onChoose: tag => {
          bound.chooseFromMenu(tag)
        },
        onDismiss: () => {
          bound.dismissMenu()
        },
      })
      if (Option.isSome(maybePainted)) {
        renderer.root.remove(maybePainted.value)
        maybePainted.value.destroy()
      }
      maybePainted = Option.some(next)
      renderer.root.add(next, paintedTreeIndex)
      renderer.requestRender()
    }

    renderer.root.add(
      new TextRenderable(renderer, { content: t`${dim(quitHint)}` }),
    )
    paint()
    const stopWatching = bound.subscribe(paint)

    renderer.keyInput.on('keypress', key => {
      const typed = normalizeKey(key.name === '' ? key.sequence : key.name)
      const isHandled = bound.pressKey(
        keyInput(typed, {
          isMeta: key.meta,
          isControl: key.ctrl,
          isShift: key.shift,
        }),
      )
      if (!isHandled && typed === 'q' && Option.isNone(bound.menu())) {
        stopWatching()
        resolve()
      }
    })
  })
