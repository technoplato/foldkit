import {
  type Action,
  type Model,
  actionByToken,
  counterScreen,
  tokenOf,
} from 'counter-core-example'
import { Array, Option } from 'effect'

import { type CliPainting, paintCli } from './paintCli.js'

const screenBinaryName = 'counter-screen'
const notOnThisScreen = 'not on this screen'

const whatFor = (token: string): string => {
  const action = actionByToken(token)
  if (action === undefined) {
    return ''
  }
  return action.doc.what
}

/** Paints the Counter screen tree plus its argv vocabulary. */
export const paintCounterCli = (model: Model): CliPainting =>
  paintCli(counterScreen(model), {
    binaryName: screenBinaryName,
    whatFor,
  })

const showStdout = (painting: CliPainting): string =>
  [painting.screen, '', painting.usage].join('\n')

const hiddenSentence = (action: Action, model: Model): string => {
  if (action.hiddenBecause === undefined) {
    return notOnThisScreen
  }
  return Option.getOrElse(
    Option.fromNullishOr(action.hiddenBecause(model)),
    () => notOnThisScreen,
  )
}

/** One screen-window CLI painting. */
export type ScreenCliExecution = Readonly<{
  finalModel: Model
  stdout: string
  stderr: string
  exitCode: number
}>

/** Paints the current screen. Bare invocation and `help` land here. */
export const paintScreenShow = (initialModel: Model): ScreenCliExecution => ({
  finalModel: initialModel,
  stdout: showStdout(paintCounterCli(initialModel)),
  stderr: '',
  exitCode: 0,
})

/** Resolves one screen token against the current tree. */
export const resolveScreenDo = (
  token: string,
  initialModel: Model,
):
  | Readonly<{ _tag: 'Failed'; execution: ScreenCliExecution }>
  | Readonly<{
      _tag: 'Send'
      action: NonNullable<ReturnType<typeof actionByToken>>
    }> => {
  const normalized = token.trim().toLowerCase()
  const painting = paintCounterCli(initialModel)
  const action = actionByToken(normalized)
  if (action === undefined) {
    return {
      _tag: 'Failed',
      execution: {
        finalModel: initialModel,
        stdout: '',
        stderr: [`Unknown command "${token}".`, '', painting.usage].join('\n'),
        exitCode: 1,
      },
    }
  }
  const isOnScreen = Array.some(
    painting.commands,
    command => command.token === tokenOf(action),
  )
  if (!isOnScreen) {
    return {
      _tag: 'Failed',
      execution: {
        finalModel: initialModel,
        stdout: '',
        stderr: [
          `"${normalized}" is hidden: ${hiddenSentence(action, initialModel)}`,
          '',
          painting.usage,
        ].join('\n'),
        exitCode: 1,
      },
    }
  }
  return { _tag: 'Send', action }
}

/** Paints the next screen after a successful send. */
export const paintScreenDo = (
  action: NonNullable<ReturnType<typeof actionByToken>>,
  nextModel: Model,
): ScreenCliExecution => ({
  finalModel: nextModel,
  stdout: [
    `sent ${tokenOf(action)}`,
    '',
    showStdout(paintCounterCli(nextModel)),
  ].join('\n'),
  stderr: '',
  exitCode: 0,
})
