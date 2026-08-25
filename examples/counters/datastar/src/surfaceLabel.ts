import { execSync } from 'node:child_process'

/** Turns any git remote spelling into a browsable URL when it is GitHub. */
export const normalizeRemoteUrl = (remote: string): string => {
  const trimmed = remote.trim()
  const https = /^https:\/\/[^/]+\/(.+?)(?:\.git)?$/u.exec(trimmed)
  if (https !== null) {
    return `https://github.com/${https[1] ?? ''}`
  }
  const ssh = /^git@github\.com:(.+?)(?:\.git)?$/u.exec(trimmed)
  if (ssh !== null) {
    return `https://github.com/${ssh[1] ?? ''}`
  }
  return ''
}

let cachedSourceUrl: string | undefined

/** This checkout's own origin URL, derived at run time. Never hardcoded. */
export const gitSourceUrl = (): string => {
  if (cachedSourceUrl === undefined) {
    try {
      cachedSourceUrl = normalizeRemoteUrl(
        execSync('git remote get-url origin', { encoding: 'utf8' }),
      )
    } catch {
      cachedSourceUrl = ''
    }
  }
  return cachedSourceUrl
}

/**
 * The terminal demo label: what you are looking at, where its source
 * lives, and the canonical carrier URI of the state being shown.
 */
export const surfaceLines = (
  surface: string,
  carrierPath: string,
  sourceUrl: string = gitSourceUrl(),
): ReadonlyArray<string> =>
  [
    sourceUrl === ''
      ? `Surface: ${surface}`
      : `Surface: ${surface} · Source: ${sourceUrl}`,
    `Carrier: ${carrierPath}`,
  ]
