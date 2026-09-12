/** Parsed `counter` argv. This file must not import Effect or foldkit. */
export type CounterIdentityFlags = Readonly<{
  readonly subject?: string
  readonly audience?: string
  readonly name?: string
}>

export type ParsedCounterArgv =
  | Readonly<{
      readonly _tag: 'Show'
      readonly device?: string
      readonly path?: string
      readonly surface?: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
      readonly via?: 'token' | 'palette' | 'spoken'
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
    }>
  | Readonly<{
      readonly _tag: 'Palette'
      readonly token?: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
    }>
  | Readonly<{
      readonly _tag: 'Say'
      readonly utterance: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
    }>
  | Readonly<{
      readonly _tag: 'Replay'
      readonly tape: string
      readonly subject?: string
      readonly audience?: string
      readonly name?: string
    }>
  | Readonly<{
      readonly _tag: 'Share'
      readonly name: string
      readonly with: string
      readonly subject?: string
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

const showSurfaces = [
  'opentui',
  'react',
  'react-screen',
  'svelte',
  'expo',
  'foldkit',
  'tui',
  'tui-screen',
  'cli',
  'cli-screen',
] as const

const isShowSurface = (
  value: string,
): value is (typeof showSurfaces)[number] => {
  for (const surface of showSurfaces) {
    if (surface === value) {
      return true
    }
  }
  return false
}

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
  item === '--surface' ||
  item === '--as' ||
  item === '--audience' ||
  item === '--tape' ||
  item === '--name' ||
  item === '--with' ||
  item.startsWith('--device=') ||
  item.startsWith('--path=') ||
  item.startsWith('--surface=') ||
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
      item === '--surface' ||
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

const shareNamePattern = /^[A-Za-z][A-Za-z0-9-]*$/

const identityFrom = (
  argv: ReadonlyArray<string>,
): CounterIdentityFlags | Readonly<{ error: string }> => {
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
  if (name !== undefined && !shareNamePattern.test(name)) {
    return {
      error:
        'Unknown share name. Use a letter, then letters, digits, or dashes.',
    }
  }
  return {
    ...(subject === undefined ? {} : { subject }),
    ...(audience === undefined ? {} : { audience }),
    ...(name === undefined ? {} : { name }),
  }
}

const withIdentity = <T extends object>(
  parsed: T,
  identity: CounterIdentityFlags,
): T & CounterIdentityFlags => ({
  ...parsed,
  ...identity,
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
  '$ counter show [--device watch|phone|tablet|computer|tv] [--path PATH] [--surface foldkit|svelte|react|react-screen|expo|cli|tui|opentui] [--as SUBJECT] [--audience public|mine] [--name SHARE]',
  '$ counter do <token>',
  '$ counter palette [token]',
  '$ counter say <utterance>',
  '$ counter share --name SHARE --with SUBJECT --as SUBJECT',
  '$ counter replay --tape <path>',
].join('\n')

/** Parses `counter` show / do / palette / say / share / replay argv. */
export const parseCounterArgv = (
  argv: ReadonlyArray<string>,
): ParsedCounterArgv => {
  if (argv.length === 0 || isHelp(argv)) {
    return { _tag: 'Help' }
  }
  const identity = identityFrom(argv)
  if ('error' in identity) {
    return { _tag: 'Failed', message: identity.error, exitCode: 1 }
  }
  const words = positionals(argv)
  const command = at(words, 0)
  if (
    identity.name !== undefined &&
    identity.subject === undefined &&
    command !== 'share'
  ) {
    return {
      _tag: 'Failed',
      message: 'named share needs --as SUBJECT.',
      exitCode: 1,
    }
  }
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
    const surface = flagValue(rest, 'surface')
    if (surface !== undefined && typeof surface !== 'string') {
      return { _tag: 'Failed', message: surface.error, exitCode: 1 }
    }
    if (surface !== undefined && !isShowSurface(surface)) {
      return {
        _tag: 'Failed',
        message: `Unknown surface "${surface}". Use foldkit, svelte, react, react-screen, expo, cli, tui, or opentui.`,
        exitCode: 1,
      }
    }
    return withIdentity(
      {
        _tag: 'Show' as const,
        ...(device === undefined ? {} : { device }),
        ...(path === undefined ? {} : { path }),
        ...(surface === undefined ? {} : { surface }),
      },
      identity,
    )
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
    return withIdentity({ _tag: 'Do' as const, token }, identity)
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
    return withIdentity(
      {
        _tag: 'Palette' as const,
        ...(token === undefined ? {} : { token }),
      },
      identity,
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
    return withIdentity({ _tag: 'Say' as const, utterance }, identity)
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
    return withIdentity({ _tag: 'Replay' as const, tape }, identity)
  }
  if (command === 'share') {
    if (at(words, 1) !== undefined) {
      return {
        _tag: 'Failed',
        message: 'share does not take a token. Use --name and --with.',
        exitCode: 1,
      }
    }
    const name = identity.name
    const withSubject = flagValue(argv, 'with')
    if (withSubject !== undefined && typeof withSubject !== 'string') {
      return { _tag: 'Failed', message: withSubject.error, exitCode: 1 }
    }
    if (name === undefined) {
      return {
        _tag: 'Failed',
        message: 'share needs --name NAME.',
        exitCode: 1,
      }
    }
    if (withSubject === undefined) {
      return {
        _tag: 'Failed',
        message: 'share needs --with SUBJECT.',
        exitCode: 1,
      }
    }
    if (!shareNamePattern.test(withSubject)) {
      return {
        _tag: 'Failed',
        message:
          'Unknown --with subject. Use a letter, then letters, digits, or dashes.',
        exitCode: 1,
      }
    }
    if (identity.subject === undefined) {
      return {
        _tag: 'Failed',
        message: 'share needs --as SUBJECT.',
        exitCode: 1,
      }
    }
    return {
      _tag: 'Share',
      name,
      with: withSubject,
      subject: identity.subject,
      ...(identity.audience === undefined
        ? {}
        : { audience: identity.audience }),
    }
  }
  return {
    _tag: 'Failed',
    message: `Unknown command "${command ?? ''}". Use show, do, palette, say, share, or replay.`,
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
