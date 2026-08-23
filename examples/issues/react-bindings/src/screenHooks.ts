import { Option } from 'effect'
import { type UiNode } from 'foldkit/renderers'
import {
  Interaction,
  type Message,
  type Model,
  issuesScreen,
  messageForScreenToken,
} from 'issues-core-example'
import { useEffect } from 'react'

/** One live Issue Tracker occurrence the screen hooks can paint. */
export type IssueScreenRuntime = Readonly<{
  useModel: () => Model
  useActions: () => Readonly<{
    performed: (interaction: Interaction) => void
  }>
}>

type BoundScreen = Readonly<{
  model: Model
  send: (message: Message) => void
}>

let runtime: IssueScreenRuntime | undefined
let bound: BoundScreen | undefined

/** Binds leftover screen hooks to one Issue Tracker React client. */
export const attachIssueScreenRuntime = (next: IssueScreenRuntime): void => {
  runtime = next
}

/** Clears the bound leftover screen runtime. */
export const resetIssueScreenRuntime = (): void => {
  runtime = undefined
  bound = undefined
}

const requireRuntime = (): IssueScreenRuntime => {
  if (runtime === undefined) {
    throw new Error('Issue screen runtime is not attached.')
  }
  return runtime
}

/** Host-neutral Issues screen tree from the attached React client. */
export const useScreen = (): UiNode => {
  const client = requireRuntime()
  const model = client.useModel()
  const actions = client.useActions()
  useEffect(() => {
    bound = {
      model,
      send: message =>
        actions.performed(
          Interaction.make({
            label: message._tag,
            message,
            token: message._tag,
          }),
        ),
    }
    return () => {
      if (bound?.model === model) {
        bound = undefined
      }
    }
  }, [actions, model])
  bound = {
    model,
    send: message =>
      actions.performed(
        Interaction.make({
          label: message._tag,
          message,
          token: message._tag,
        }),
      ),
  }
  return issuesScreen(model)
}

/** Sends the Message behind a leftover screen token. */
export const sendScreenToken = (token: string): void => {
  if (bound === undefined) {
    return
  }
  const maybe = messageForScreenToken(bound.model, token)
  if (Option.isSome(maybe)) {
    bound.send(maybe.value)
  }
}
