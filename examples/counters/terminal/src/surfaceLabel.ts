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
 * The terminal attribution line, or empty when no GitHub origin exists.
 * The URL is never hardcoded; it always names this checkout's source.
 */
export const attributionSuffix = (surface: string): string => {
  const url = gitSourceUrl()
  return url === '' ? surface : `${surface} · Source: ${url}`
}
