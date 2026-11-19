import { Array } from 'effect'

const NETWORK_FAILURE_MESSAGES: ReadonlyArray<string> = [
  'Failed to fetch',
  'Load failed',
  'NetworkError when attempting to fetch resource.',
  'Network request failed',
]

const TIMEOUT_MESSAGES: ReadonlyArray<string> = [
  'did not confirm',
  'did not answer',
  'timed out',
]

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) {
    return `${cause.name} ${cause.message}`
  } else if (typeof cause === 'string') {
    return cause
  } else {
    return ''
  }
}

/**
 * Why a request failed, in plain words, when the cause is one a listener can
 * act on: the network, or Scribe not answering in time. Other causes say
 * nothing, so no internal error text reaches the page.
 *
 * @example
 * ```ts
 * plainCauseOf(new TypeError('Failed to fetch'))
 * // 'The network connection dropped.'
 * plainCauseOf(new Error('permission denied'))
 * // ''
 * ```
 */
export const plainCauseOf = (cause: unknown): string => {
  const message = messageOf(cause)
  if (Array.some(NETWORK_FAILURE_MESSAGES, known => message.includes(known))) {
    return 'The network connection dropped.'
  } else if (
    Array.some(TIMEOUT_MESSAGES, known => message.includes(known)) ||
    message.startsWith('TimeoutError')
  ) {
    return 'Scribe did not answer in time.'
  } else {
    return ''
  }
}

/** A failure sentence and its plain cause, as one line of text. */
export const failureTextOf = (failure: string, cause: unknown): string =>
  Array.join(
    Array.filter([failure, plainCauseOf(cause)], part => part !== ''),
    ' ',
  )
