import { Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import {
  type Message,
  type Model,
  SettingsOrigin,
  SettingsProgram,
  keysForToken,
  messageFromKey,
  messageFromToken,
  settingsScreen,
} from 'settings-core-example'

import {
  type CliRenderer,
  type Renderable,
  TextRenderable,
  dim,
  t,
} from '@opentui/core'

import { paintOpenTui } from './paintOpenTui.js'

const quitHint = '[q] quit'

const paintTree = (
  renderer: CliRenderer,
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Renderable =>
  paintOpenTui(renderer, settingsScreen(runtime.readModel()), {
    keysForToken,
    onTap: token => {
      const message = messageFromToken(token)
      if (message === undefined) {
        return
      }
      runtime.send(message)
    },
  })

/** Paints settingsScreen on an OpenTUI renderer until `q`. */
export const runSettingsOpenTui = (
  resources: Layer.Layer<SettingsOrigin>,
  renderer: CliRenderer,
): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: SettingsProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      yield* Effect.callback<void>(resume => {
        let maybePainted: Renderable | undefined
        const paint = (): void => {
          const next = paintTree(renderer, runtime)
          if (maybePainted !== undefined) {
            renderer.root.remove(maybePainted)
            maybePainted.destroy()
          }
          maybePainted = next
          renderer.root.add(next)
          renderer.requestRender()
        }

        renderer.root.add(
          new TextRenderable(renderer, { content: t`${dim(quitHint)}` }),
        )
        paint()
        const unsubscribe = runtime.observeModel(() => {
          paint()
        })

        renderer.keyInput.on('keypress', key => {
          const input = key.name === '' ? key.sequence : key.name
          if (input.toLowerCase() === 'q') {
            resume(Effect.void)
            return
          }
          const message = messageFromKey(input, runtime.readModel(), {
            metaKey: key.meta,
            ctrlKey: key.ctrl,
          })
          if (message === undefined) {
            return
          }
          runtime.send(message)
        })

        return Effect.sync(() => {
          unsubscribe()
        })
      })
      yield* runtime.shutdown
    }),
  )
