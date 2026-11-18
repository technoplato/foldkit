import { Match as M, Option } from 'effect'
import { Interaction, Navigation, type Telemetry } from 'foldkit'
import { terminalKeyInput } from 'foldkit/interaction'

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

const paintedTreeIndex = 0

/** The painter an OpenTUI run reports its frames as. */
export const openTuiPainter = 'OpenTUI'

/**
 * Where an OpenTUI run starts, and where it reports its paints.
 * `launchUri` opens once the Program is Ready. `onPainted` hears how long
 * each frame took to build and why: `mount` for the first, `update` after
 * a Model change, and `key` after a key, such as
 * `{ painter: 'OpenTUI', durationMs: 3.4, phase: 'key' }`. Pass
 * telemetry's `recordRendered` to keep every paint with the session.
 */
export type RunOpenTuiOptions = Readonly<{
  launchUri?: string
  onPainted?: (report: Telemetry.RenderReport) => void
}>

type PaintPhase = 'mount' | 'update' | 'key'

/**
 * Runs any bound Program on an OpenTUI renderer until `q`. It repaints on
 * every Model change and routes keys and mouse presses through the
 * Program's interaction. While the Program is Starting or Failed it paints
 * the Program's own description. A Program with a URI paints its
 * navigation frame, and Escape goes back because the Program reads it as
 * Back. The arrows and Tab move a highlight across the buttons, Enter
 * presses it, and an Action's key acts on the highlighted row; a dialog's
 * buttons show their keys. The terminal title names the screen and the
 * Host, `Session | OpenTUI`.
 *
 * @example
 * ```typescript
 * const renderer = await createCliRenderer({ exitOnCtrlC: true })
 * const telemetry = Telemetry.attach(handle, { app: 'counter', sink: fileSink() })
 * await runOpenTui(bindCounter(handle), renderer, {
 *   launchUri: '/counter/session',
 *   onPainted: telemetry.recordRendered,
 * })
 * ```
 */
export const runOpenTui = <Model, Message>(
  bound: Interaction.BoundInteraction<Model, Message>,
  renderer: CliRenderer,
  options: RunOpenTuiOptions = {},
): Promise<void> =>
  new Promise(resolve => {
    let maybePainted: Option.Option<Renderable> = Option.none()
    let focus: Interaction.TerminalFocus = Interaction.noTerminalFocus
    const stopLaunching = Option.match(
      Option.fromNullishOr(options.launchUri),
      {
        onNone: () => () => {},
        onSome: launchUri =>
          Navigation.openWhenReady(bound, launchUri, Navigation.Launch()),
      },
    )

    const paintOptions: PaintOpenTuiOptions & PaintOpenTuiMenuOptions = {
      onPress: button => {
        const action = button.action
        if (action !== undefined && action.startsWith('/')) {
          bound.openUri(action, Navigation.Link())
        } else if (action !== undefined) {
          bound.press(action)
        }
      },
      onChoose: tag => {
        bound.chooseFromMenu(tag)
      },
      onDismiss: () => {
        bound.dismissMenu()
      },
    }

    const paintReady = (): Renderable =>
      Option.match(Navigation.frameOf(bound), {
        onNone: () =>
          paintOpenTuiFrame(
            renderer,
            bound.screen(),
            bound.menu(),
            paintOptions,
          ),
        onSome: frame =>
          paintOpenTuiNavigationFrame(
            renderer,
            Interaction.terminalFrameOf(frame, focus),
            paintOptions,
          ),
      })

    const paint = (phase: PaintPhase): void => {
      const startedAt = performance.now()
      renderer.setTerminalTitle(bound.windowTitle())
      const next = M.value(bound.status()).pipe(
        M.withReturnType<Renderable>(),
        M.tagsExhaustive({
          Ready: paintReady,
          Starting: ({ description }) =>
            new TextRenderable(renderer, { content: t`${dim(description)}` }),
          Failed: ({ description }) =>
            new TextRenderable(renderer, { content: description }),
        }),
      )
      if (Option.isSome(maybePainted)) {
        renderer.root.remove(maybePainted.value)
        maybePainted.value.destroy()
      }
      maybePainted = Option.some(next)
      renderer.root.add(next, paintedTreeIndex)
      renderer.requestRender()
      if (options.onPainted !== undefined) {
        options.onPainted({
          painter: openTuiPainter,
          durationMs: performance.now() - startedAt,
          phase,
        })
      }
    }

    renderer.root.add(
      new TextRenderable(renderer, {
        content: t`${dim(Interaction.terminalFooterOf(bound.menuKeys()))}`,
      }),
    )
    paint('mount')
    const stopWatching = bound.subscribe(() => {
      paint('update')
    })

    renderer.keyInput.on('keypress', key => {
      const input = terminalKeyInput({
        sequence: key.sequence,
        name: key.name,
        isMeta: key.meta,
        isControl: key.ctrl,
        isShift: key.shift,
      })
      const pressed = Interaction.pressTerminalKeyAt(bound, input, focus)
      focus = pressed.focus
      if (pressed.outcome === 'Quit') {
        stopWatching()
        stopLaunching()
        resolve()
      } else {
        paint('key')
      }
    })
  })
