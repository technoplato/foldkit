import { Array, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { type Action, Reset, actions, tokenOf } from './message.js'
import { type Model } from './model.js'

const labelOf = (action: Action): string => {
  if (action === Reset) {
    return 'reset'
  }
  return Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))
}

/** Product tree: count plus valid Actions. Device chrome does not own buttons. */
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: labelOf(action),
      }),
  )
  return Column({}, Text(model.count.toString()), Row({}, ...buttons))
}
