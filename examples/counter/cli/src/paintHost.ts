import {
  CounterProgram,
  Device,
  type HostId,
  LastAction,
  type Message,
  type Model,
  OpenedNavigation,
  actionBySpoken,
  actionByToken,
  canonicalShowPath,
  counterValid,
  defaultShowContext,
  invalidActionLog,
  listActions,
  namedShareUri,
  renderReceipt,
  renderShow,
  tokenOf,
} from 'counter-core-example'
import { Array, Option, Schema as S } from 'effect'

/** One `show` or `do` painting. Memory tests still read Model from this. */
export type CliExecution = Readonly<{
  initialModel: Model
  maybeMessage: Option.Option<Message>
  finalModel: Model
  link: 'offline' | 'queued' | 'delivered'
  stdout: string
  stderr: string
  exitCode: number
}>

export type ParsedDevice =
  | Readonly<{ readonly _tag: 'None' }>
  | Readonly<{ readonly _tag: 'Ok'; readonly device: Device }>
  | Readonly<{ readonly _tag: 'Failed'; readonly error: string }>

export const parseDevice = (raw: string | undefined): ParsedDevice => {
  if (raw === undefined) {
    return { _tag: 'None' }
  }
  const decoded = S.decodeUnknownOption(Device)(raw)
  if (Option.isNone(decoded)) {
    return {
      _tag: 'Failed',
      error: `Unknown device "${raw}". Use watch, phone, tablet, computer, or tv.`,
    }
  }
  return { _tag: 'Ok', device: decoded.value }
}

const showContext = (device: Device | undefined, surface: HostId = 'cli') => ({
  ...defaultShowContext,
  ...(device === undefined ? {} : { device }),
  ...(surface === 'cli' ? {} : { surface }),
})

const occupiedShareName = (): string | undefined => {
  const name = process.env['COUNTER_SHARE_NAME']
  if (name === undefined || name === '') {
    return undefined
  }
  return name
}

/**
 * Occupancy Message for `show --device` / `--path` / `--name`.
 * Bare show does not send this. `counter` and `/counter` occupy home.
 * `counter.increment` occupies `/counter/increment`. `--name kitchen`
 * occupies `/kitchen`.
 */
export const occupancyToOpen = (
  device: Device | undefined,
  path: string | undefined,
): Option.Option<ReturnType<typeof OpenedNavigation>> => {
  const shareName = occupiedShareName()
  if (shareName !== undefined) {
    return Option.some(
      OpenedNavigation({
        ...(device === undefined ? {} : { device }),
        path: shareName,
      }),
    )
  }
  const maybePath = canonicalShowPath(path)
  if (device === undefined && Option.isNone(maybePath)) {
    return Option.none()
  }
  return Option.some(
    OpenedNavigation({
      ...(device === undefined ? {} : { device }),
      ...(Option.isSome(maybePath) ? { path: maybePath.value } : {}),
    }),
  )
}

/** Receipt printed by `share --name --with`. */
export const paintShareExecution = (
  name: string,
  owner: string,
  withSubject: string,
  model: Model,
): CliExecution => {
  const receipt = [
    `shared ${name} with ${withSubject}`,
    `  owner          ${owner}`,
    `  with           ${withSubject}`,
    `  uri            ${namedShareUri(name)}`,
  ].join('\n')
  return {
    initialModel: model,
    maybeMessage: Option.some(OpenedNavigation({ path: name })),
    finalModel: model,
    link: 'delivered',
    stdout: [receipt, '', renderShow(model, defaultShowContext)].join('\n'),
    stderr: '',
    exitCode: 0,
  }
}

/** Paints IDENTITY and ACESS. Optional `--device` wraps the product tree. */
export const paintShowExecution = (
  initialModel: Model,
  device: Device | undefined,
  path: string | undefined,
  surface: HostId = 'cli',
): CliExecution => ({
  initialModel,
  maybeMessage: Option.none(),
  finalModel: initialModel,
  link: 'offline',
  stdout: renderShow(initialModel, {
    ...showContext(device, surface),
    ...(path === undefined ? {} : { path }),
  }),
  stderr: '',
  exitCode: 0,
})

/** Paints a `do` receipt plus auto-show. */
export const paintDoExecution = (
  initialModel: Model,
  action: NonNullable<ReturnType<typeof actionByToken>>,
  token: string,
  nextModel: Model,
  link: CliExecution['link'],
  via: 'argv' | 'palette' | 'spoken' = 'argv',
): CliExecution => {
  const last: LastAction = {
    command: action.command ?? token,
    event: action.event ?? token,
    sideEffects: ['tape append', `link  ${link}`],
  }
  const receipt = renderReceipt({
    token: tokenOf(action),
    verb: 'sent',
    from: 'cli',
    via,
    command: last.command,
    event: last.event,
    mutate: action.mutate ?? '',
    sideEffects: action.sideEffects ?? '(none)',
    tape: 'appended',
    link,
  })
  return {
    initialModel,
    maybeMessage: Option.some(action()),
    finalModel: nextModel,
    link,
    stdout: [
      receipt,
      '',
      renderShow(nextModel, {
        ...showContext(undefined),
        last,
      }),
    ].join('\n'),
    stderr: '',
    exitCode: 0,
  }
}

/** Logs an invalid send and reprints show. */
export const paintInvalidDoExecution = (
  token: string,
  initialModel: Model,
): CliExecution => ({
  initialModel,
  maybeMessage: Option.none(),
  finalModel: initialModel,
  link: 'offline',
  stdout: [
    invalidActionLog(token, initialModel),
    '',
    renderShow(initialModel, showContext(undefined)),
  ].join('\n'),
  stderr: '',
  exitCode: 0,
})

/** Paints the Action catalog. No send. */
export const paintPaletteExecution = (initialModel: Model): CliExecution => {
  const rows = listActions(CounterProgram, initialModel)
  const body = ['PALETTE', ...Array.map(rows, row => `  ${row.token}`)].join(
    '\n',
  )
  return {
    initialModel,
    maybeMessage: Option.none(),
    finalModel: initialModel,
    link: 'offline',
    stdout: body,
    stderr: '',
    exitCode: 0,
  }
}

/** Resolves one spoken phrase against the current Model. */
export const resolveHostSpoken = (
  utterance: string,
  initialModel: Model,
):
  | Readonly<{ _tag: 'Unknown'; message: string }>
  | Readonly<{ _tag: 'Invalid'; execution: CliExecution }>
  | Readonly<{
      _tag: 'Send'
      action: NonNullable<ReturnType<typeof actionBySpoken>>
    }> => {
  const action = actionBySpoken(utterance)
  if (action === undefined) {
    return {
      _tag: 'Unknown',
      message: `Unknown utterance "${utterance}". Try "go up" or "start over".`,
    }
  }
  return resolveHostDo(tokenOf(action), initialModel)
}

/** Resolves one token against the current Model. */
export const resolveHostDo = (
  token: string,
  initialModel: Model,
):
  | Readonly<{ _tag: 'Unknown'; message: string }>
  | Readonly<{ _tag: 'Invalid'; execution: CliExecution }>
  | Readonly<{
      _tag: 'Send'
      action: NonNullable<ReturnType<typeof actionByToken>>
    }> => {
  const action = actionByToken(token.trim().toLowerCase())
  if (action === undefined) {
    return {
      _tag: 'Unknown',
      message: `Unknown action "${token}". Use increment, decrement, or reset.`,
    }
  }
  const isValid = Array.some(
    counterValid(initialModel, {}),
    item => item.token === tokenOf(action) && item.valid,
  )
  if (!isValid) {
    return {
      _tag: 'Invalid',
      execution: paintInvalidDoExecution(token, initialModel),
    }
  }
  return { _tag: 'Send', action }
}
