import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { keyInput, normalizeKey } from 'foldkit/interaction'

import {
  type CliRenderer,
  type Renderable,
  TextRenderable,
  dim,
  t,
} from '@opentui/core'

import {
  type PaintOpenTuiMenuOptions,
  type PaintOpenTuiOptions,
  paintOpenTuiFrame,
  paintOpenTuiNavigationFrame,
} from './paintOpenTui.js'

const quitHint = '[q] quit'
const paintedTreeIndex = 0

/** Where an OpenTUI run starts. `launchUri` opens once the Program is Ready. */
export type RunOpenTuiOptions = Readonly<{
  launchUri?: string
}>

/**
 * Runs any bound Program on an OpenTUI renderer until `q`. It repaints on
 * every Model change and routes keys and mouse presses through the
 * Program's interaction. A Program with a URI paints its navigation frame,
 * and Escape goes back because the Program reads it as Back.
 *
 * @example
 * ```typescript
 * const renderer = await createCliRenderer({ exitOnCtrlC: true })
 * await runOpenTui(bindCounter(handle), renderer, { launchUri: '/counter/session' })
 * ```
 */
export const runOpenTui = <Model, Message>(
  bound: Interaction.BoundInteraction<Model, Message>,
  renderer: CliRenderer,
  options: RunOpenTuiOptions = {},
): Promise<void> =>
  new Promise(resolve => {
    let maybePainted: Option.Option<Renderable> = Option.none()
    const stopLaunching = Option.match(
      Option.fromNullishOr(options.launchUri),
      {
        onNone: () => () => {},
        onSome: launchUri =>
          Navigation.openWhenReady(bound, launchUri, Navigation.Launch()),
      },
    )

    const keysOf = (action: string): ReadonlyArray<string> =>
      Option.match(
        Array.findFirst(bound.entries(), entry => entry.tag === action),
        {
          onNone: () => [],
          onSome: entry => entry.keys,
        },
      )

    const paintOptions: PaintOpenTuiOptions & PaintOpenTuiMenuOptions = {
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
    }

    const paint = (): void => {
      const next = Option.match(Navigation.frameOf(bound), {
        onNone: () =>
          paintOpenTuiFrame(
            renderer,
            bound.screen(),
            bound.menu(),
            paintOptions,
          ),
        onSome: frame =>
          paintOpenTuiNavigationFrame(renderer, frame, paintOptions),
      })
      if (Option.isSome(maybePainted)) {
        renderer.root.remove(maybePainted.value)
        maybePainted.value.destroy()
      }
      maybePainted = Option.some(next)
      renderer.root.add(next, paintedTreeIndex)
      renderer.requestRender()
    }

    const hint = Option.match(Interaction.menuHintOf(bound.menuKeys()), {
      onNone: () => quitHint,
      onSome: menuHint => `${menuHint}  ${quitHint}`,
    })
    renderer.root.add(
      new TextRenderable(renderer, { content: t`${dim(hint)}` }),
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
        stopLaunching()
        resolve()
      }
    })
  })
