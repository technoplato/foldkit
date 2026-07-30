import { Effect, Option } from 'effect'

/** Minimum time between automatic viewer reload attempts in one tab. */
export const viewerFailureReloadIntervalMs = 5 * 60 * 1_000

const viewerFailureReloadStorageKey =
  'foldkit.issues.viewer-failure-reload-attempt-ms'

type ViewerFailureRecovery = Readonly<{
  maybeLastAttemptMs: () => Option.Option<number>
  nowMs: () => number
  recordAttempt: (nowMs: number) => boolean
  reload: () => void
}>

/** Reloads a failed viewer once while preventing a persistent failure loop. */
export const recoverViewerAfterFailure = (
  recovery: ViewerFailureRecovery,
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const nowMs = recovery.nowMs()
    const maybeLastAttemptMs = recovery.maybeLastAttemptMs()
    if (
      Option.isSome(maybeLastAttemptMs) &&
      nowMs - maybeLastAttemptMs.value < viewerFailureReloadIntervalMs
    ) {
      return false
    }
    if (!recovery.recordAttempt(nowMs)) {
      return false
    }
    recovery.reload()
    return true
  })

const maybeBrowserLastAttemptMs = (): Option.Option<number> => {
  try {
    const maybeValue = Option.fromNullishOr(
      window.sessionStorage.getItem(viewerFailureReloadStorageKey),
    )
    if (Option.isNone(maybeValue)) {
      return Option.none()
    }
    const value = Number(maybeValue.value)
    return Number.isFinite(value) ? Option.some(value) : Option.none()
  } catch {
    return Option.none()
  }
}

const recordBrowserAttempt = (nowMs: number): boolean => {
  try {
    window.sessionStorage.setItem(viewerFailureReloadStorageKey, String(nowMs))
    return true
  } catch {
    return false
  }
}

/** The browser-host recovery Effect executed only at the React boundary. */
export const recoverCurrentViewerAfterFailure = recoverViewerAfterFailure({
  maybeLastAttemptMs: maybeBrowserLastAttemptMs,
  nowMs: Date.now,
  recordAttempt: recordBrowserAttempt,
  reload: () => window.location.reload(),
})
