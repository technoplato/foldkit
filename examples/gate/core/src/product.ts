import { Duration, Match as M } from 'effect'
import { Button, Column, Text, type UiNode } from 'foldkit/renderers'

import { type Model, type Origin, type Quota } from './model.js'

const quotaLine = (kind: 'Rate' | 'Messages', quota: Quota): string =>
  M.value(quota).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Remaining: ({ left, capacity, resets }) =>
        `${kind} remaining ${left.toString()} of ${capacity.toString()} resets ${Duration.toMillis(resets).toString()}`,
      Exhausted: ({ capacity, resets }) =>
        `${kind} exhausted of ${capacity.toString()} resets ${Duration.toMillis(resets).toString()}`,
    }),
  )

const originNodes = (origin: Origin): ReadonlyArray<UiNode> =>
  M.value(origin).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Unread: () => [Text('Unread')],
      Reading: () => [Text('Reading')],
      Failed: ({ reason }) =>
        M.value(reason).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            BadGateway: () => [Text('Bad gateway')],
            Unreachable: () => [Text('Unreachable')],
            Invalid: () => [Text('Invalid')],
          }),
        ),
      Read: ({ rate, messages }) => [
        Text(quotaLine('Rate', rate)),
        Text(quotaLine('Messages', messages)),
      ],
    }),
  )

const refreshNodes = (origin: Origin): ReadonlyArray<UiNode> => {
  if (origin._tag === 'Reading') {
    return []
  }
  return [Button({ token: 'refresh', label: 'Refresh' })]
}

/** Product tree: title, origin branch, Refresh when not Reading. */
export const productView = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Gate'),
    ...originNodes(model.origin),
    ...refreshNodes(model.origin),
  )
