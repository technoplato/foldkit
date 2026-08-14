import { Array, Option, Schema as S } from 'effect'

import { Device, renderChrome } from './chrome.js'
import { type Action, actions, tokenOf } from './message.js'
import { type Model, title, uri } from './model.js'

/** Focus among valid Actions. TV chrome can stay on increment. */
export const Focus = S.Literals(['increment', 'decrement', 'reset'])
/** A focus token. */
export type Focus = typeof Focus.Type

/** Last mutation printed under COMMANDS / EVENTS / SIDE EFFECTS. */
export const LastAction = S.Struct({
  command: S.String,
  event: S.String,
  sideEffects: S.Array(S.String),
})
/** Last mutation printed under COMMANDS / EVENTS / SIDE EFFECTS. */
export type LastAction = typeof LastAction.Type

/** Adapter input for `show`. This is not a Message. */
export const ShowContext = S.Struct({
  targets: S.Array(Device),
  focus: Focus,
  path: S.optionalKey(S.String),
  last: S.optionalKey(LastAction),
})
/** Adapter input for `show`. */
export type ShowContext = typeof ShowContext.Type

/** Default `show` context: every form factor, focus on increment. */
export const defaultShowContext: ShowContext = {
  targets: ['watch', 'phone', 'tablet', 'laptop', 'tv'],
  focus: 'increment',
}

const IDENTITY_FIELD_WIDTH = 9
const ACTION_FIELD_WIDTH = 15
const RECEIPT_FIELD_WIDTH = 15

const identityField = (name: string, value: string): string =>
  `  ${name.padEnd(IDENTITY_FIELD_WIDTH)}${value}`

const actionField = (name: string, value: string): string =>
  `    ${name.padEnd(ACTION_FIELD_WIDTH)}${value}`

const receiptField = (name: string, value: string): string =>
  `  ${name.padEnd(RECEIPT_FIELD_WIDTH)}${value}`

const formatList = (values: ReadonlyArray<string>): string =>
  `[${values.join(', ')}]`

const formatSpoken = (values: ReadonlyArray<string>): string =>
  `[${Array.map(values, value => `"${value}"`).join(', ')}]`

const isActionValid = (action: Action, model: Model): boolean =>
  action.valid(model, {})

const renderAction = (action: Action, model: Model, focus: Focus): string => {
  const token = tokenOf(action)
  const isValid = isActionValid(action, model)
  const lines = [
    `  ${token}`,
    actionField('keys', formatList(action.keys ?? [])),
    actionField('tokens', formatList(action.tokens ?? [])),
    actionField('spoken', formatSpoken(action.spoken ?? [])),
    actionField('what', action.doc.what),
    actionField('why', action.doc.why),
    actionField('command', action.command ?? token),
    actionField('event', action.event ?? token),
    actionField('mutate', action.mutate ?? ''),
    actionField('side effects', action.sideEffects ?? '(none)'),
    actionField('valid', isValid ? 'true' : 'false'),
  ]
  if (token === focus) {
    lines.push(actionField('focus', 'here'))
  }
  if (!isValid && action.hiddenBecause !== undefined) {
    const reason = action.hiddenBecause(model)
    if (reason !== undefined) {
      lines.push(actionField('hidden', reason))
    }
  }
  return lines.join('\n')
}

const pathToken = (path: string | undefined): Option.Option<string> => {
  if (path === undefined || path === 'counter') {
    return Option.none()
  }
  if (path.startsWith('counter.')) {
    return Option.some(path.slice('counter.'.length))
  }
  return Option.some(path)
}

const actionsForPath = (path: string | undefined): ReadonlyArray<Action> => {
  const maybeToken = pathToken(path)
  if (Option.isNone(maybeToken)) {
    return actions
  }
  return Array.filter(actions, action => tokenOf(action) === maybeToken.value)
}

const renderCommands = (last: LastAction | undefined): string => {
  if (last === undefined) {
    return ['COMMANDS', '  (none yet)'].join('\n')
  }
  return ['COMMANDS', `  ${last.command}`].join('\n')
}

const renderEvents = (last: LastAction | undefined): string => {
  if (last === undefined) {
    return ['EVENTS', '  (none yet)'].join('\n')
  }
  return ['EVENTS', `  ${last.event}`].join('\n')
}

const renderSideEffects = (last: LastAction | undefined): string => {
  if (last === undefined) {
    return ['SIDE EFFECTS', '  (none)'].join('\n')
  }
  const lines = Array.map(last.sideEffects, line => `  ${line}`)
  return ['SIDE EFFECTS', ...lines].join('\n')
}

/** Receipt printed by `do` before auto-show. */
export type Receipt = Readonly<{
  token: string
  verb: 'sent' | 'requested'
  from: string
  via: string
  command: string
  event: string
  mutate: string
  sideEffects: string
  tape: string
  link: 'offline' | 'queued' | 'delivered'
}>

/** Prints a `do` receipt. */
export const renderReceipt = (receipt: Receipt): string =>
  [
    `${receipt.token} ${receipt.verb}`,
    receiptField('from', receipt.from),
    receiptField('via', receipt.via),
    receiptField('command', receipt.command),
    receiptField('message', receipt.token),
    receiptField('event', receipt.event),
    receiptField('mutate', receipt.mutate),
    receiptField('side effects', receipt.sideEffects),
    receiptField('tape', receipt.tape),
    receiptField('link', receipt.link),
  ].join('\n')

/** Logs an invalid send plus the current State. */
export const invalidActionLog = (token: string, model: Model): string =>
  `log  attempted to invoke invalid action ${token}\n     state  count ${model.count}`

/** Prints IDENTITY, ACESS, and device chrome. `show` is not a Message. */
export const renderShow = (model: Model, context: ShowContext): string => {
  const selected = actionsForPath(context.path)
  const actionBlock = Array.map(selected, action =>
    renderAction(action, model, context.focus),
  ).join('\n')
  const chrome = renderChrome(model, context.targets)

  return [
    'IDENTITY',
    identityField('title', title),
    identityField('uri', uri),
    identityField('targets', context.targets.join(', ')),
    '',
    'STATE',
    identityField('count', model.count.toString()),
    identityField('focus', context.focus),
    '',
    'ACTIONS',
    actionBlock,
    '',
    renderCommands(context.last),
    '',
    renderEvents(context.last),
    '',
    renderSideEffects(context.last),
    '',
    chrome,
  ].join('\n')
}
