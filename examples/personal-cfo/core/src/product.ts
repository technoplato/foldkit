import { Array, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import {
  assetCents,
  formatUsd,
  liabilityCents,
  netWorthCents,
} from './domain.js'
import { type Model } from './model.js'

const errorLine = (model: Model): UiNode =>
  Option.match(model.maybeError, {
    onNone: () => Text(''),
    onSome: error => Text(`error  ${error}`),
  })

const sessionLine = (model: Model): string => {
  if (model.session._tag === 'Anonymous') {
    return 'session  anonymous'
  }
  return `session  ${model.session.email}  plan ${model.session.plan}  read-only`
}

const nav = (model: Model): UiNode => {
  if (model.session._tag === 'Anonymous') {
    return Row({}, Button({ token: 'login', label: 'Sign in' }))
  }
  return Row(
    {},
    Button({ token: 'dashboard', label: 'Dashboard' }),
    Button({ token: 'accounts', label: 'Accounts' }),
    Button({ token: 'chat', label: 'Chat' }),
    Button({ token: 'radar', label: 'Radar' }),
    Button({ token: 'vault', label: 'Vault' }),
    Button({ token: 'more', label: 'More' }),
    Button({ token: 'logout', label: 'Sign out' }),
  )
}

const dashboardView = (model: Model): UiNode =>
  Column(
    {},
    Text(`net worth    ${formatUsd(netWorthCents(model.accounts))}`),
    Text(`assets       ${formatUsd(assetCents(model.accounts))}`),
    Text(`liabilities  ${formatUsd(liabilityCents(model.accounts))}`),
    Text(`accounts     ${model.accounts.length.toString()}`),
    Text(`radar        ${model.radar.length.toString()}`),
    Text(`vault        ${model.vault.length.toString()}`),
    Text('access       read_only'),
  )

const accountsView = (model: Model): UiNode => {
  if (model.accounts.length === 0) {
    return Text('No accounts. Add a manual read-only account.')
  }
  return Column(
    {},
    ...Array.map(model.accounts, account =>
      Text(
        `${account.name}  ${account.institution}  ${account.kind}  ${formatUsd(account.balanceCents)}  ${account.access}`,
      ),
    ),
  )
}

const vaultView = (model: Model): UiNode => {
  if (model.vault.length === 0) {
    return Text('Vault is empty.')
  }
  return Column(
    {},
    ...Array.map(model.vault, file => Text(`${file.title}  ${file.origin}`)),
  )
}

const radarView = (model: Model): UiNode => {
  if (model.radar.length === 0) {
    return Text('No Radar jobs.')
  }
  return Column(
    {},
    ...Array.map(model.radar, job =>
      Text(
        `${job.status}  ${job.cadence}  ${job.question}  hash=${job.lastAnswerHash || 'none'}  ${job.lastAnswer}`,
      ),
    ),
  )
}

const chatView = (model: Model): UiNode => {
  if (model.chat.length === 0) {
    return Text('Ask a question grounded in the ledger.')
  }
  return Column(
    {},
    ...Array.map(model.chat, message =>
      Text(`${message.role}  ${message.body}`),
    ),
  )
}

const moreView = (model: Model): UiNode =>
  Column(
    {},
    Text('More  settings, research, goals, and asset-class URIs are parked.'),
    Text(`notifications  ${model.notifications.length.toString()}`),
    ...Array.map(model.notifications, notification =>
      Text(
        `${notification.status}  ${notification.channel}  ${notification.title}  ${notification.body}`,
      ),
    ),
    Button({ token: 'notify', label: 'Notify' }),
  )

const signInView = (): UiNode =>
  Column(
    {},
    Text('CFO Silvia clone — read-only net-worth OS'),
    Text('Sign in with email. No password. No money movement.'),
  )

const screenView = (model: Model): UiNode => {
  if (model.session._tag === 'Anonymous' || model.screen === 'sign-in') {
    return signInView()
  }
  if (model.screen === 'dashboard') {
    return dashboardView(model)
  }
  if (model.screen === 'accounts') {
    return accountsView(model)
  }
  if (model.screen === 'vault') {
    return vaultView(model)
  }
  if (model.screen === 'radar') {
    return radarView(model)
  }
  if (model.screen === 'chat') {
    return chatView(model)
  }
  return moreView(model)
}

/** Product tree. Device chrome does not own buttons. */
export const productView = (model: Model): UiNode =>
  Column(
    {},
    Text(sessionLine(model)),
    Text(`screen   /${model.screen}`),
    Text(`status   ${model.status}`),
    errorLine(model),
    screenView(model),
    nav(model),
  )
