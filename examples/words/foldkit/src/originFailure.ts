const ORIGIN = 'words.pisspoursoftware.xyz'

/**
 * What went wrong with a request to the words origin, in words a reader can act
 * on. Only a request that ran out of time "did not answer": a browser that could
 * not complete it (most often Cloudflare Access sending it to a sign-in on another
 * site, which a script cannot follow) or any other failure says so.
 */
export const originFailureReason = (cause: unknown): string => {
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return `${ORIGIN} did not answer within 5 seconds.`
  }
  if (cause instanceof TypeError) {
    return `The browser could not complete the request to ${ORIGIN} (${cause.message}). This browser is not signed in to words, or it is offline.`
  }
  const what = cause instanceof Error ? cause.message : String(cause)
  return `The request to ${ORIGIN} failed: ${what}`
}
