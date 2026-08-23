import { Array, Match as M, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { liveHosts, puzzleSourceUrl } from './hostSurface.js'
import { type Action, ResetTape, actions, tokenOf } from './message.js'
import { type Model, uriOf } from './model.js'

const labelOf = (action: Action): string => {
  if (action === ResetTape) {
    return 'reset'
  }
  return Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))
}

const hrefText = (href: string): UiNode => Text(href, { href, mono: true })

const promptNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.prompt).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      ReplicateStep: prompt => [hrefText(prompt.page), hrefText(prompt.script)],
      LabelStep: prompt => [Text(prompt.label)],
      OperatorStep: prompt => [Text(prompt.phase._tag)],
    }),
  )

const liveHostNodes = (): ReadonlyArray<UiNode> => [
  hrefText(puzzleSourceUrl()),
  hrefText(liveHosts.replicate),
  hrefText(liveHosts.grok),
]

/** Product tree: tape, prompt, live hosts, source, replicate links, valid Actions. */
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: labelOf(action),
      }),
  )
  return Column(
    { gap: 1 },
    Text(uriOf(model)),
    ...promptNodes(model),
    ...liveHostNodes(),
    Row({}, ...buttons),
  )
}
