import { Array, Option } from 'effect'
import { renderScreen } from 'foldkit/renderers'
import {
  type Model,
  formatUsd,
  netWorthCents,
  personalCfoScreen,
  uri,
} from 'personal-cfo-core'

/** Text summary plus the Program screen tree. */
export const paintModel = (model: Model): string => {
  const session =
    model.session._tag === 'Anonymous'
      ? 'anonymous'
      : `${model.session.email} ${model.session.plan}`
  const error = Option.match(model.maybeError, {
    onNone: () => '',
    onSome: value => `\nerror    ${value}`,
  })
  const accountLines = Array.map(
    model.accounts,
    account =>
      `account  ${account.name}  ${account.kind}  ${formatUsd(account.balanceCents)}  ${account.access}`,
  )
  const vaultLines = Array.map(
    model.vault,
    file => `vaultfile ${file.title}  ${file.origin}`,
  )
  const radarLines = Array.map(
    model.radar,
    job => `radarjob  ${job.status}  ${job.question}  ${job.lastAnswer}`,
  )
  const chatLines = Array.map(
    model.chat,
    message => `chatmsg   ${message.role}  ${message.body}`,
  )
  const notifyLines = Array.map(
    model.notifications,
    notification =>
      `notice   ${notification.status}  ${notification.title}  ${notification.body}`,
  )
  const summary = [
    `uri      ${uri}`,
    `session  ${session}`,
    `screen   /${model.screen}`,
    `status   ${model.status}`,
    `net      ${formatUsd(netWorthCents(model.accounts))}`,
    `accounts ${model.accounts.length.toString()}`,
    ...accountLines,
    `vault    ${model.vault.length.toString()}`,
    ...vaultLines,
    `radar    ${model.radar.length.toString()}`,
    ...radarLines,
    `chat     ${model.chat.length.toString()}`,
    ...chatLines,
    `notify   ${model.notifications.length.toString()}`,
    ...notifyLines,
    `access   read_only`,
  ].join('\n')
  return `${summary}${error}\n\n${renderScreen(personalCfoScreen(model))}`
}
