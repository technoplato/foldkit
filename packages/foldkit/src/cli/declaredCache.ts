/**
 * Declarations as plain data, kept in a file between runs. A host
 * declares what it does with Effect Schema fields; the plain data
 * derived from them is all a slim view needs to read an argv and print
 * usage, so the view reads this file and loads Effect only when the file
 * is missing or older than the code. This module must not import
 * Effect, Instant, or a Program, so a view starts fast.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * What {@link cachedDerivation} needs: the file to keep the plain data
 * in, the built file whose change makes it stale, and how to derive the
 * data when it is.
 */
export type CachedDerivationOptions<A> = Readonly<{
  cachePath: string
  sourcePath: string
  derive: () => Promise<A>
}>

const stampOf = (sourcePath: string): string => {
  const stat = statSync(sourcePath)
  return `${stat.mtimeMs.toString()}:${stat.size.toString()}`
}

const kept = (cachePath: string, stamp: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath, 'utf8'))
    return typeof parsed === 'object' &&
      parsed !== null &&
      'stamp' in parsed &&
      parsed.stamp === stamp &&
      'value' in parsed
      ? parsed.value
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Plain data derived from a host's declarations: read from the file
 * when it was derived from the code as it is now, and derived again,
 * then kept, when it was not. Deriving is the only step that loads the
 * host's Effect Schema fields, so a view that finds the file loads no
 * Effect. The data must be plain, as a declaration is, because it is
 * kept as JSON.
 *
 * @example
 * ```typescript
 * const declared = await cachedDerivation({
 *   cachePath: join(stateDirectory, 'declared.json'),
 *   sourcePath: fileURLToPath(new URL('./declared.js', import.meta.url)),
 *   derive: async () => (await import('./declared.js')).hostTree,
 * })
 * ```
 */
export const cachedDerivation = async <A>(
  options: CachedDerivationOptions<A>,
): Promise<A> => {
  const stamp = stampOf(options.sourcePath)
  const found = kept(options.cachePath, stamp)
  if (found !== undefined) {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    return found as A
  }
  const value = await options.derive()
  try {
    mkdirSync(dirname(options.cachePath), { recursive: true })
    writeFileSync(options.cachePath, JSON.stringify({ stamp, value }))
  } catch {
    return value
  }
  return value
}
