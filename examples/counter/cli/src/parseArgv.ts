/** Parsed `counter` argv. This file must not import Effect or foldkit. */
export type CounterSessionFlags = Readonly<{
  readonly subject?: string
  readonly audience?: string
  readonly name?: string
  readonly grantedTo?: string
}>

export type CounterIdentityFlags = CounterSessionFlags

export type ParsedCounterArgv =
  | Readonly<{
      readonly _tag: 'Show'
      readonly device?: string
      readonly path?: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
      readonly grantedTo?: string
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
      readonly via?: 'token' | 'palette' | 'spoken'
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
      readonly grantedTo?: string
    }>
  | Readonly<{
      readonly _tag: 'Palette'
      readonly token?: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
      readonly grantedTo?: string
    }>
  | Readonly<{
      readonly _tag: 'Say'
      readonly utterance: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
      readonly grantedTo?: string
    }>
  | Readonly<{
      readonly _tag: 'Replay'
      readonly tape: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
      readonly grantedTo?: string
    }>
  | Readonly<{
      readonly _tag: 'Share'
      readonly name: string
      readonly grantedTo: string
      readonly subject: string
      readonly audience?: string
    }>
  | Readonly<{
      readonly _tag: 'Help'
    }>
  | Readonly<{
      readonly _tag: 'Failed'
      readonly message: string
      readonly exitCode: number
    }>

/** Parsed `counter-screen` argv. */
export type ParsedScreenArgv =
  | Readonly<{
      readonly _tag: 'Show'
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
    }>
  | Readonly<{
      readonly _tag: 'Failed'
      readonly message: string
      readonly exitCode: number
    }>

const helpTokens = ['help', '--help', '-h']

const at = (argv: ReadonlyArray<string>, index: number): string | undefined => {
  if (index < 0 || index >= argv.length) {
    return undefined
  }
  return argv.find((_, itemIndex) => itemIndex === index)
}

const flagValue = (
  argv: ReadonlyArray<string>,
  name: string,
): string | undefined | Readonly<{ error: string }> => {
  const flag = `--${name}`
  const equalsPrefix = `${flag}=`
  let index = 0
  while (index < argv.length) {
    const item = at(argv, index)
    if (item === undefined) {
      return undefined
    }
    if (item.startsWith(equalsPrefix)) {
      const value = item.slice(equalsPrefix.length)
      if (value === '') {
        return { error: `Missing value for ${flag}.` }
      }
      return value
    }
    if (item === flag) {
      const value = at(argv, index + 1)
      if (value === undefined || value.startsWith('-')) {
        return { error: `Missing value for ${flag}.` }
      }
      return value
    }
    index += 1
  }
  return undefined
}

const isFlagName = (item: string): boolean =>
  item === '--device' ||
  item === '--path' ||
  item === '--as' ||
  item === '--audience' ||
  item === '--tape' ||
  item === '--name' ||
  item === '--with' ||
  item.startsWith('--device=') ||
  item.startsWith('--path=') ||
  item.startsWith('--as=') ||
  item.startsWith('--audience=') ||
  item.startsWith('--tape=') ||
  item.startsWith('--name=') ||
  item.startsWith('--with=')

const positionals = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const rest: Array<string> = []
  let index = 0
  while (index < argv.length) {
    const item = at(argv, index)
    if (item === undefined) {
      break
    }
    if (
      item === '--device' ||
      item === '--path' ||
      item === '--as' ||
      item === '--audience' ||
      item === '--tape' ||
      item === '--name' ||
      item === '--with'
    ) {
      index += 2
      continue
    }
    if (isFlagName(item)) {
      index += 1
      continue
    }
    rest.push(item)
    index += 1
  }
  return rest
}

const reservedShareNames = ['increment', 'decrement', 'reset', 'counter']

const shareNameFromPathFlag = (path: string | undefined): string | undefined => {
  if (path === undefined) {
    return undefined
  }
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/counter' || trimmed === 'counter') {
    return undefined
  }
  let token = trimmed
  if (trimmed.startsWith('/counter/')) {
    token = trimmed.slice('/counter/'.length)
  } else if (trimmed.startsWith('counter.')) {
    token = trimmed.slice('counter.'.length)
  }
  if (token === '' || reservedShareNames.includes(token) || token.includes('/')) {
    return undefined
  }
  return token
}

const sessionFrom = (
  argv: ReadonlyArray<string>,
): CounterSessionFlags | Readonly<{ error: string }> => {
  const subject = flagValue(argv, 'as')
  if (subject !== undefined && typeof subject !== 'string') {
    return { error: subject.error }
  }
  const audience = flagValue(argv, 'audience')
  if (audience !== undefined && typeof audience !== 'string') {
    return { error: audience.error }
  }
  if (audience !== undefined && audience !== 'public' && audience !== 'mine') {
    return { error: 'Unknown audience. Use public or mine.' }
  }
  const name = flagValue(argv, 'name')
  if (name !== undefined && typeof name !== 'string') {
    return { error: name.error }
  }
  const grantedTo = flagValue(argv, 'with')
  if (grantedTo !== undefined && typeof grantedTo !== 'string') {
    return { error: grantedTo.error }
  }
  if (name !== undefined && reservedShareNames.includes(name)) {
    return { error: 'share --name must not be an Action token.' }
  }
  return {
    ...(subject === undefined ? {} : { subject }),
    ...(audience === undefined ? {} : { audience }),
    ...(name === undefined ? {} : { name }),
    ...(grantedTo === undefined ? {} : { grantedTo }),
  }
}

const withSession = <T extends object>(
  parsed: T,
  session: CounterSessionFlags,
): T & CounterSessionFlags => ({
  ...parsed,
  ...session,
})

const isHelp = (argv: ReadonlyArray<string>): boolean => {
  const first = at(argv, 0)
  return first !== undefined && helpTokens.includes(first)
}

/** Usage printed for `counter --help`. */
export const counterUsage = [
  'counter 0.0.0',
  '',
  'USAGE',
  '',
  '$ counter show [--device watch|phone|tablet|computer|tv] [--path PATH] [--as SUBJECT] [--audience public|mine] [--name NAME]',
  '$ counter do <token>',
  '$ counter palette [token]',
  '$ counter say <utterance>',
  '$ counter replay --tape <path>',
  '$ counter --as SUBJECT share --name NAME --with SUBJECT',
].join('\n')

/** Parses `counter` show / do / palette / say / replay argv. */
export const parseCounterArgv = (
  argv: ReadonlyArray<string>,
): ParsedCounterArgv => {
  if (argv.length === 0 || isHelp(argv)) {
    return { _tag: 'Help' }
  }
  const session = sessionFrom(argv)
  if ('error' in session) {
    return { _tag: 'Failed', message: session.error, exitCode: 1 }
  }
  const words = positionals(argv)
  const command = at(words, 0)
  if (command === 'show') {
    if (at(words, 1) !== undefined) {
      return {
        _tag: 'Failed',
        message: 'show does not take a token.',
        exitCode: 1,
      }
    }
    const rest = argv
    const device = flagValue(rest, 'device')
    if (device !== undefined && typeof device !== 'string') {
      return { _tag: 'Failed', message: device.error, exitCode: 1 }
    }
    const path = flagValue(rest, 'path')
    if (path !== undefined && typeof path !== 'string') {
      return { _tag: 'Failed', message: path.error, exitCode: 1 }
    }
    const pathName =
      typeof path === 'string' ? shareNameFromPathFlag(path) : undefined
    return withSession(
      {
        _tag: 'Show' as const,
        ...(device === undefined ? {} : { device }),
        ...(path === undefined ? {} : { path }),
      },
      {
        ...session,
        ...(session.name === undefined && pathName !== undefined
          ? { name: pathName }
          : {}),
      },
    )
  }
  if (command === 'share') {
    if (session.subject === undefined || session.subject === '') {
      return {
        _tag: 'Failed',
        message: 'share needs --as <subject>.',
        exitCode: 1,
      }
    }
    if (session.name === undefined || session.name === '') {
      return {
        _tag: 'Failed',
        message: 'share needs --name <name>.',
        exitCode: 1,
      }
    }
    if (session.grantedTo === undefined || session.grantedTo === '') {
      return {
        _tag: 'Failed',
        message: 'share needs --with <subject>.',
        exitCode: 1,
      }
    }
    if (at(words, 1) !== undefined) {
      return {
        _tag: 'Failed',
        message: 'share does not take a token.',
        exitCode: 1,
      }
    }
    return {
      _tag: 'Share',
      name: session.name,
      grantedTo: session.grantedTo,
      subject: session.subject,
      ...(session.audience === undefined ? {} : { audience: session.audience }),
    }
  }
  if (command === 'do') {
    const token = at(words, 1)
    if (token === undefined) {
      return {
        _tag: 'Failed',
        message: 'Send increment, decrement, or reset.',
        exitCode: 1,
      }
    }
    if (at(words, 2) !== undefined) {
      return {
        _tag: 'Failed',
        message: `Send one token. Got ${words.slice(1).join(' ')}. Use increment, decrement, or reset.`,
        exitCode: 1,
      }
    }
    return withSession({ _tag: 'Do' as const, token }, session)
  }
  if (command === 'palette') {
    const token = at(words, 1)
    if (at(words, 2) !== undefined) {
      return {
        _tag: 'Failed',
        message: `Send one palette token. Got ${words.slice(1).join(' ')}.`,
        exitCode: 1,
      }
    }
    return withSession(
      {
        _tag: 'Palette' as const,
        ...(token === undefined ? {} : { token }),
      },
      session,
    )
  }
  if (command === 'say') {
    const utterance = words.slice(1).join(' ').trim()
    if (utterance === '') {
      return {
        _tag: 'Failed',
        message: 'say needs an utterance. Try "go up" or "start over".',
        exitCode: 1,
      }
    }
    return withSession({ _tag: 'Say' as const, utterance }, session)
  }
  if (command === 'replay') {
    const tape = flagValue(argv, 'tape')
    if (tape === undefined) {
      return {
        _tag: 'Failed',
        message: 'replay needs --tape <path>.',
        exitCode: 1,
      }
    }
    if (typeof tape !== 'string') {
      return { _tag: 'Failed', message: tape.error, exitCode: 1 }
    }
    return withSession({ _tag: 'Replay' as const, tape }, session)
  }
  return {
    _tag: 'Failed',
    message: `Unknown command "${command ?? ''}". Use show, do, palette, say, replay, or share.`,
    exitCode: 1,
  }
}

/** Parses `counter-screen` argv. Bare invocation shows. */
export const parseScreenArgv = (
  argv: ReadonlyArray<string>,
): ParsedScreenArgv => {
  if (argv.length === 0 || isHelp(argv)) {
    return { _tag: 'Show' }
  }
  if (at(argv, 1) !== undefined) {
    return {
      _tag: 'Failed',
      message: `Send one command. Got ${argv.join(' ')}.`,
      exitCode: 1,
    }
  }
  const token = at(argv, 0)
  if (token === undefined) {
    return { _tag: 'Show' }
  }
  return { _tag: 'Do', token }
}
