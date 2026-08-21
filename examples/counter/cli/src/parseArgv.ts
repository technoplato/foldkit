/** Parsed `counter` argv. This file must not import Effect or foldkit. */
export type ParsedCounterArgv =
  | Readonly<{
      readonly _tag: 'Show'
      readonly device?: string
      readonly path?: string
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
    }>
  | Readonly<{
      readonly _tag: 'Replay'
      readonly tape: string
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
  '$ counter show [--device watch|phone|tablet|computer|tv] [--path PATH]',
  '$ counter do <token>',
  '$ counter replay --tape <path>',
].join('\n')

/** Parses `counter` show / do / replay argv. */
export const parseCounterArgv = (
  argv: ReadonlyArray<string>,
): ParsedCounterArgv => {
  if (argv.length === 0 || isHelp(argv)) {
    return { _tag: 'Help' }
  }
  const command = at(argv, 0)
  if (command === 'show') {
    const rest = argv.slice(1)
    const device = flagValue(rest, 'device')
    if (device !== undefined && typeof device !== 'string') {
      return { _tag: 'Failed', message: device.error, exitCode: 1 }
    }
    const path = flagValue(rest, 'path')
    if (path !== undefined && typeof path !== 'string') {
      return { _tag: 'Failed', message: path.error, exitCode: 1 }
    }
    return {
      _tag: 'Show',
      ...(device === undefined ? {} : { device }),
      ...(path === undefined ? {} : { path }),
    }
  }
  if (command === 'do') {
    const token = at(argv, 1)
    if (token === undefined) {
      return {
        _tag: 'Failed',
        message: 'Send increment, decrement, or reset.',
        exitCode: 1,
      }
    }
    if (at(argv, 2) !== undefined) {
      return {
        _tag: 'Failed',
        message: `Send one token. Got ${argv.slice(1).join(' ')}. Use increment, decrement, or reset.`,
        exitCode: 1,
      }
    }
    return { _tag: 'Do', token }
  }
  if (command === 'replay') {
    const rest = argv.slice(1)
    const tape = flagValue(rest, 'tape')
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
    return { _tag: 'Replay', tape }
  }
  return {
    _tag: 'Failed',
    message: `Unknown command "${command ?? ''}". Use show, do, or replay.`,
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
