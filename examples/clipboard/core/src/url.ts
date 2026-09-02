import { defaultPort } from './model.js'

const tailscaleCgNat = /^100\.(?:6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./
const dottedIp = /^\d{1,3}(?:\.\d{1,3}){3}$/

/** True when a host or URL is a Tailscale CGNAT address or MagicDNS name. */
export const isTailnetAddress = (value: string): boolean => {
  const host = hostOf(value)
  if (host.endsWith('.ts.net')) {
    return true
  }
  return tailscaleCgNat.test(`${host}.`)
}

/** Hostname or IP taken from a URL, host:port, or bare name. */
export const hostOf = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return trimmed
  }
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname
    }
  } catch {
    return trimmed
  }
  const withoutBrackets = trimmed.replace(/^\[([^\]]+)\]/, '$1')
  if (withoutBrackets.startsWith('[')) {
    return trimmed
  }
  const colon = withoutBrackets.lastIndexOf(':')
  if (colon > -1 && dottedIp.test(withoutBrackets.slice(0, colon))) {
    return withoutBrackets.slice(0, colon)
  }
  if (colon > -1 && !withoutBrackets.includes('.')) {
    return withoutBrackets.slice(0, colon)
  }
  return withoutBrackets
}

/**
 * Accepts a MagicDNS name, 100.x IP, host:port, or full ws URL.
 * Tailnet and LAN use the same raw-text WebSocket protocol.
 */
export const websocketUrl = (
  hint: string,
  port: number = defaultPort,
): string => {
  const trimmed = hint.trim()
  if (trimmed.length === 0) {
    return `ws://0.0.0.0:${String(port)}`
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed
  }
  if (trimmed.includes('://')) {
    return trimmed
  }
  if (trimmed.startsWith('[') && trimmed.includes(']:')) {
    return `ws://${trimmed}`
  }
  if (/:\d+$/.test(trimmed)) {
    return `ws://${trimmed}`
  }
  return `ws://${trimmed}:${String(port)}`
}

/** Human label for the path a URL will take. */
export const transportOf = (url: string): 'tailnet' | 'lan' | 'local' => {
  const host = hostOf(url)
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost') {
    return 'local'
  }
  if (isTailnetAddress(url)) {
    return 'tailnet'
  }
  return 'lan'
}
