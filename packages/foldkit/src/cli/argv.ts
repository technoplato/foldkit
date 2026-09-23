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
 * ```
 */
export type ProgramArgv =
  | Readonly<{
      _tag: 'Show'
      flags: Readonly<Record<string, string>>
    }>
  | Readonly<{
      _tag: 'Do'
      token: string
      flags: Readonly<Record<string, string>>
    }>

const booleanFlags: ReadonlySet<string> = new Set(['meta', 'ctrl', 'shift'])

/** Splits argv into words and `--name value` or `--name=value` flags. */
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
  }
  return { _tag: 'Do', token, flags }
}
