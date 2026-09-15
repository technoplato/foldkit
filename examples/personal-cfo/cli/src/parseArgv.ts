import { AccountKind, CadenceTag, VaultOrigin } from 'personal-cfo-core'

/** Parsed `cfo` argv. This file must not import Effect or foldkit. */
export type ParsedCfoArgv =
  | Readonly<{ readonly _tag: 'Help' }>
  | Readonly<{ readonly _tag: 'Show' }>
  | Readonly<{ readonly _tag: 'Session' }>
  | Readonly<{ readonly _tag: 'Prove' }>
  | Readonly<{ readonly _tag: 'Login'; readonly email: string }>
  | Readonly<{ readonly _tag: 'Logout' }>
  | Readonly<{ readonly _tag: 'Open'; readonly screen: string }>
  | Readonly<{
      readonly _tag: 'AddAccount'
      readonly name: string
      readonly institution: string
      readonly kind: string
      readonly balanceCents: string
    }>
  | Readonly<{
      readonly _tag: 'AddVault'
      readonly title: string
      readonly origin: string
    }>
  | Readonly<{
      readonly _tag: 'ArmRadar'
      readonly question: string
      readonly cadence: string
      readonly everyMinutes: string
    }>
  | Readonly<{ readonly _tag: 'TickRadar' }>
  | Readonly<{
      readonly _tag: 'Notify'
      readonly title: string
      readonly body: string
    }>
  | Readonly<{ readonly _tag: 'Chat'; readonly text: string }>
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

const requiredFlag = (
  argv: ReadonlyArray<string>,
  name: string,
): string | Readonly<{ error: string }> => {
  const value = flagValue(argv, name)
  if (value === undefined) {
    return { error: `Missing --${name}.` }
  }
  return value
}

const optionalFlag = (
  argv: ReadonlyArray<string>,
  name: string,
  fallback: string,
): string | Readonly<{ error: string }> => {
  const value = flagValue(argv, name)
  if (value === undefined) {
    return fallback
  }
  return value
}

/** Usage printed for `cfo --help`. */
export const cfoUsage = [
  'cfo 0.0.0',
  '',
  'USAGE',
  '',
  '$ cfo show',
  '$ cfo session',
  '$ cfo login --email <email>',
  '$ cfo logout',
  '$ cfo dashboard | accounts | vault | radar | chat | more',
  '$ cfo accounts add --name <name> --kind cash|brokerage|crypto|real_estate|vehicle|metal|collectible|private|liability --balance-cents <int> [--institution <name>]',
  '$ cfo vault add --title <title> [--origin upload|artifact|memory_note]',
  '$ cfo radar arm --question <text> [--cadence daily|weekly|monthly|custom] [--every-minutes <int>]',
  '$ cfo radar tick',
  '$ cfo notify --title <title> --body <body>',
  '$ cfo chat send --text <text>',
  '$ cfo prove',
].join('\n')

const isHelp = (argv: ReadonlyArray<string>): boolean => {
  const first = at(argv, 0)
  return first !== undefined && helpTokens.includes(first)
}

const screens = [
  'dashboard',
  'accounts',
  'vault',
  'radar',
  'chat',
  'more',
  'sign-in',
] as const

const kinds: ReadonlyArray<typeof AccountKind.Type> = [
  'cash',
  'brokerage',
  'crypto',
  'real_estate',
  'vehicle',
  'metal',
  'collectible',
  'private',
  'liability',
]

const cadences: ReadonlyArray<typeof CadenceTag.Type> = [
  'daily',
  'weekly',
  'monthly',
  'custom',
]

const origins: ReadonlyArray<typeof VaultOrigin.Type> = [
  'upload',
  'artifact',
  'memory_note',
]

/** Parses `cfo` argv. */
export const parseCfoArgv = (argv: ReadonlyArray<string>): ParsedCfoArgv => {
  if (argv.length === 0 || isHelp(argv)) {
    return { _tag: 'Help' }
  }
  const command = at(argv, 0)
  if (command === 'show') {
    return { _tag: 'Show' }
  }
  if (command === 'session') {
    return { _tag: 'Session' }
  }
  if (command === 'prove') {
    return { _tag: 'Prove' }
  }
  if (command === 'logout') {
    return { _tag: 'Logout' }
  }
  if (command === 'login') {
    const email = requiredFlag(argv.slice(1), 'email')
    if (typeof email !== 'string') {
      return { _tag: 'Failed', message: email.error, exitCode: 1 }
    }
    return { _tag: 'Login', email }
  }
  if (
    command !== undefined &&
    (screens as ReadonlyArray<string>).includes(command)
  ) {
    const second = at(argv, 1)
    if (command === 'accounts' && second === 'add') {
      const rest = argv.slice(2)
      const name = requiredFlag(rest, 'name')
      const kind = requiredFlag(rest, 'kind')
      const balance = requiredFlag(rest, 'balance-cents')
      const institution = optionalFlag(rest, 'institution', 'Manual')
      if (typeof name !== 'string') {
        return { _tag: 'Failed', message: name.error, exitCode: 1 }
      }
      if (typeof kind !== 'string') {
        return { _tag: 'Failed', message: kind.error, exitCode: 1 }
      }
      if (typeof balance !== 'string') {
        return { _tag: 'Failed', message: balance.error, exitCode: 1 }
      }
      if (typeof institution !== 'string') {
        return { _tag: 'Failed', message: institution.error, exitCode: 1 }
      }
      if (!(kinds as ReadonlyArray<string>).includes(kind)) {
        return {
          _tag: 'Failed',
          message: `Unknown kind "${kind}".`,
          exitCode: 1,
        }
      }
      return {
        _tag: 'AddAccount',
        name,
        institution,
        kind,
        balanceCents: balance,
      }
    }
    if (command === 'vault' && second === 'add') {
      const rest = argv.slice(2)
      const title = requiredFlag(rest, 'title')
      const origin = optionalFlag(rest, 'origin', 'upload')
      if (typeof title !== 'string') {
        return { _tag: 'Failed', message: title.error, exitCode: 1 }
      }
      if (typeof origin !== 'string') {
        return { _tag: 'Failed', message: origin.error, exitCode: 1 }
      }
      if (!(origins as ReadonlyArray<string>).includes(origin)) {
        return {
          _tag: 'Failed',
          message: `Unknown origin "${origin}".`,
          exitCode: 1,
        }
      }
      return { _tag: 'AddVault', title, origin }
    }
    if (command === 'radar' && second === 'arm') {
      const rest = argv.slice(2)
      const question = requiredFlag(rest, 'question')
      const cadence = optionalFlag(rest, 'cadence', 'daily')
      const everyMinutes = optionalFlag(rest, 'every-minutes', '0')
      if (typeof question !== 'string') {
        return { _tag: 'Failed', message: question.error, exitCode: 1 }
      }
      if (typeof cadence !== 'string') {
        return { _tag: 'Failed', message: cadence.error, exitCode: 1 }
      }
      if (typeof everyMinutes !== 'string') {
        return { _tag: 'Failed', message: everyMinutes.error, exitCode: 1 }
      }
      if (!(cadences as ReadonlyArray<string>).includes(cadence)) {
        return {
          _tag: 'Failed',
          message: `Unknown cadence "${cadence}".`,
          exitCode: 1,
        }
      }
      return { _tag: 'ArmRadar', question, cadence, everyMinutes }
    }
    if (command === 'radar' && second === 'tick') {
      return { _tag: 'TickRadar' }
    }
    if (command === 'chat' && second === 'send') {
      const text = requiredFlag(argv.slice(2), 'text')
      if (typeof text !== 'string') {
        return { _tag: 'Failed', message: text.error, exitCode: 1 }
      }
      return { _tag: 'Chat', text }
    }
    if (second !== undefined) {
      return {
        _tag: 'Failed',
        message: `Unexpected argument "${second}".`,
        exitCode: 1,
      }
    }
    return { _tag: 'Open', screen: command }
  }
  if (command === 'notify') {
    const rest = argv.slice(1)
    const title = requiredFlag(rest, 'title')
    const body = requiredFlag(rest, 'body')
    if (typeof title !== 'string') {
      return { _tag: 'Failed', message: title.error, exitCode: 1 }
    }
    if (typeof body !== 'string') {
      return { _tag: 'Failed', message: body.error, exitCode: 1 }
    }
    return { _tag: 'Notify', title, body }
  }
  return {
    _tag: 'Failed',
    message: `Unknown command "${command ?? ''}". Use cfo --help.`,
    exitCode: 1,
  }
}
