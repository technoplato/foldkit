/**
 * The request a thin CLI view sends for one argv. This module must not
 * import Effect, Instant, or a Program, so a view starts fast.
 *
 * @example
 * ```typescript
 * parseProgramArgv([]) // { _tag: 'Show', flags: {} }
 * parseProgramArgv(['increment']) // { _tag: 'Do', token: 'increment', flags: {} }
 * parseProgramArgv(['key', 'k', '--meta'])
 * // { _tag: 'Do', token: 'key k', flags: { meta: '1' } }
 * parseProgramArgv(['tail']) // { _tag: 'Tail', flags: {} }
 * parseProgramArgv(['watch']) // { _tag: 'Watch', flags: {} }
 * ```
 */
export type ProgramArgv =
  | Readonly<{
      _tag: 'Show'
      flags: Readonly<Record<string, string>>
    }>
  | Readonly<{
      _tag: 'Tail'
      flags: Readonly<Record<string, string>>
    }>
  | Readonly<{
      _tag: 'Watch'
      flags: Readonly<Record<string, string>>
    }>
  | Readonly<{
      _tag: 'Do'
      token: string
      flags: Readonly<Record<string, string>>
    }>

const booleanFlags: ReadonlySet<string> = new Set([
  'meta',
  'ctrl',
  'shift',
  'json',
])

/**
 * Splits argv into words and `--name value` or `--name=value` flags.
 * `--meta`, `--ctrl`, `--shift`, and `--json` take no value.
 */
export const parseProgramArgv = (argv: ReadonlyArray<string>): ProgramArgv => {
  const words: Array<string> = []
  const flags: Record<string, string> = {}
  let pendingFlag: string | undefined
  for (const item of argv) {
    if (pendingFlag !== undefined) {
      flags[pendingFlag] = item
      pendingFlag = undefined
    } else if (item.startsWith('--')) {
      const body = item.slice(2)
      if (body.includes('=')) {
        const [name = '', ...valueParts] = body.split('=')
        flags[name] = valueParts.join('=')
      } else if (booleanFlags.has(body)) {
        flags[body] = '1'
      } else {
        pendingFlag = body
      }
    } else if (item !== '--') {
      words.push(item)
    }
  }
  const token = words.join(' ')
  if (token === '' || token === 'show') {
    return { _tag: 'Show', flags }
  } else if (token === 'tail') {
    return { _tag: 'Tail', flags }
  } else if (token === 'watch') {
    return { _tag: 'Watch', flags }
  } else {
    return { _tag: 'Do', token, flags }
  }
}

/**
 * A topic to follow, as argv names it: the word after `follow`, the
 * screen when there is none, and the flags that shape its text.
 */
export type FollowArgv = Readonly<{
  topic: string
  flags: Readonly<Record<string, string>>
}>

const followWord = 'follow'

const defaultFollowTopic = 'screen'

/**
 * Reads `follow <topic>` from argv, the command every Program's CLI has
 * for hearing a topic of its daemon as it changes: `counter follow`
 * follows the screen, `books follow words --json` the words being read as
 * lines of JSON. Undefined for any other command.
 *
 * @example
 * ```typescript
 * followArgvOf(['follow', 'words', '--json']) // { topic: 'words', flags: { json: '1' } }
 * followArgvOf(['follow']) // { topic: 'screen', flags: {} }
 * followArgvOf(['increment']) // undefined
 * ```
 */
export const followArgvOf = (
  argv: ReadonlyArray<string>,
): FollowArgv | undefined => {
  const request = parseProgramArgv(argv)
  if (request._tag !== 'Do') {
    return undefined
  }
  const [head = '', ...rest] = request.token.split(' ')
  if (head !== followWord) {
    return undefined
  }
  const topic = rest.join(' ')
  return {
    topic: topic === '' ? defaultFollowTopic : topic,
    flags: request.flags,
  }
}

const stdinWord = '-'

/**
 * Argv with its last word read from stdin when that word is a lone dash,
 * so a secret never sits in the shell's history or the process list:
 * `pbpaste | books connect-audible -` sends the pasted address as the
 * word. Stdin's text is trimmed. Without a trailing dash argv comes back
 * as it is and stdin is never read.
 *
 * @example
 * ```typescript
 * await withStdinWord(['connect-audible', '-'], readStdinText)
 * // ['connect-audible', 'https://www.amazon.com/ap/maplanding?…']
 * ```
 */
export const withStdinWord = async (
  argv: ReadonlyArray<string>,
  readStdin: () => Promise<string>,
): Promise<ReadonlyArray<string>> => {
  if (argv.at(-1) !== stdinWord) {
    return argv
  }
  const word = (await readStdin()).trim()
  return [...argv.slice(0, -1), word]
}
