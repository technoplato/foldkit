import { Array, Match as M, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { type Action, actions, tokenOf } from './message.js'
import {
  type Apply,
  type Draft,
  type Host,
  type Hosts,
  type Model,
  type Notice,
  type Token,
  type Visibility,
  isSettingsHost,
  ownerEmail,
  title,
} from './model.js'

const labelOf = (action: Action): string => {
  if (tokenOf(action) === 'refresh') {
    return 'Refresh'
  }
  if (tokenOf(action) === 'keep') {
    return 'Keep'
  }
  if (tokenOf(action) === 'cancel') {
    return 'Cancel'
  }
  if (tokenOf(action) === 'dismiss') {
    return 'Dismiss'
  }
  return Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))
}

const tokenNodes = (token: Token): ReadonlyArray<UiNode> =>
  M.value(token).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Ready: () => [Text('Ready')],
      MissingToken: () => [Text('MissingToken')],
    }),
  )

const applyNodes = (apply: Apply): ReadonlyArray<UiNode> =>
  M.value(apply).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Applying: () => [Text('Applying')],
      Applied: () => [Text('Applied')],
      Failed: failed => [Text('Failed'), Text(failed.reason)],
    }),
  )

const visibilityNodes = (visibility: Visibility): ReadonlyArray<UiNode> =>
  M.value(visibility).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Public: () => [Text('Public')],
      Restricted: restricted => [
        Text('Restricted'),
        ...Array.map(restricted.emails, email => Text(email)),
      ],
    }),
  )

const hostButtons = (host: Host, applying: boolean): ReadonlyArray<UiNode> => {
  if (applying) {
    return []
  }
  const buttons: UiNode[] = []
  if (!isSettingsHost(host.name) && host.visibility._tag !== 'Public') {
    buttons.push(
      Button({
        token: `public:${host.name}`,
        label: 'public',
      }),
    )
  }
  if (host.visibility._tag !== 'Restricted') {
    buttons.push(
      Button({
        token: `restricted:${host.name}`,
        label: 'restricted',
      }),
    )
  }
  if (host.visibility._tag === 'Restricted' && !isSettingsHost(host.name)) {
    buttons.push(
      Button({
        token: `add:${host.name}`,
        label: 'add',
      }),
    )
    for (const email of host.visibility.emails) {
      if (isSettingsHost(host.name) && email === ownerEmail) {
        continue
      }
      buttons.push(
        Button({
          token: `remove:${host.name}:${email}`,
          label: 'remove',
        }),
      )
    }
  }
  return buttons
}

const hostNodes = (hosts: Hosts, applying: boolean): ReadonlyArray<UiNode> =>
  M.value(hosts).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: () => [Text('Empty')],
      Populated: populated => [
        Text('Populated'),
        ...Array.flatMap(populated.items, host => [
          Text(host.name),
          ...visibilityNodes(host.visibility),
          ...hostButtons(host, applying),
        ]),
      ],
    }),
  )

const draftNodes = (draft: Draft): ReadonlyArray<UiNode> =>
  M.value(draft).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Drafting: drafting => [
        Text('Drafting'),
        Text(drafting.host),
        Text(drafting.text),
      ],
    }),
  )

const noticeNodes = (notice: Notice): ReadonlyArray<UiNode> =>
  M.value(notice).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [Text('None')],
      Some: some => [Text('Some'), Text(some.text)],
    }),
  )

/** Product tree: title, token, apply, hosts, draft, notice, actions. */
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
    Text(title),
    ...tokenNodes(model.token),
    ...applyNodes(model.apply),
    ...hostNodes(model.hosts, model.apply._tag === 'Applying'),
    ...draftNodes(model.draft),
    ...noticeNodes(model.notice),
    Row({}, ...buttons),
  )
}
