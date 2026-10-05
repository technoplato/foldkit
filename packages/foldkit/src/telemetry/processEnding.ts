import { Array, Function, Option, Predicate, Schema as S } from 'effect'

/**
 * The signals that end a Node process unless something handles them, and
 * that telemetry ends its sessions on: SIGINT, which Ctrl-C sends, and
 * SIGTERM, which `kill` sends.
 */
export const EndingSignal = S.Literals(['SIGINT', 'SIGTERM'])

/** A signal telemetry ends its sessions on. */
export type EndingSignal = typeof EndingSignal.Type

/**
 * How long telemetry waits for every session's last lines to be written
 * before it lets a signal end the process: 1 second.
 */
export const defaultSignalFlushTimeoutMs = 1_000

/** The parts of a Node process telemetry listens to for its ending. */
export type SignalingProcess = Readonly<{
  pid: number
  on: (signal: EndingSignal, listener: () => void) => unknown
  off: (signal: EndingSignal, listener: () => void) => unknown
  listenerCount: (signal: EndingSignal) => number
  kill: (pid: number, signal: EndingSignal) => unknown
}>

/** Ends telemetry sessions when the process they run in is told to stop. */
export type ProcessEnding = Readonly<{
  /**
   * Calls `endSession` when the process is told to stop, and returns the
   * function that stops watching. `endSession` resolves once the
   * session's last lines are written.
   */
  watch: (endSession: () => Promise<void>) => () => void
}>

const settledWithin = (
  pending: Promise<unknown>,
  timeoutMs: number,
): Promise<void> =>
  new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs)
    void pending.finally(() => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * Watches one process for SIGINT and SIGTERM on behalf of every telemetry
 * session in it. Telemetry stands in for Node's default only: when nothing
 * else listens for the signal, which would end the process at once, it
 * ends every watched session with SessionStopped, waits up to
 * `flushTimeoutMs` for their sinks to write it, and then sends the signal
 * again with no listener left, so the process ends as it would have, with
 * the same signal. A host that listens for the signal itself, such as
 * `NodeRuntime.runMain` or an OpenTUI renderer, owns its shutdown, and its
 * sessions end when it stops their handles. A second Ctrl-C while the
 * sinks write ends the process at once.
 *
 * @example
 * ```typescript
 * const ending = makeProcessEnding(process)
 * const stopWatching = ending.watch(async () => {
 *   recordSessionStopped()
 *   await Effect.runPromise(sink.flush)
 * })
 * ```
 */
export const makeProcessEnding = (
  process: SignalingProcess,
  flushTimeoutMs: number = defaultSignalFlushTimeoutMs,
): ProcessEnding => {
  const endings = new Set<() => Promise<void>>()
  const listeners = new Map<EndingSignal, () => void>()

  const stopListening = (): void => {
    listeners.forEach((listener, signal) => {
      process.off(signal, listener)
    })
    listeners.clear()
  }

  const endOn = (signal: EndingSignal) => (): void => {
    if (process.listenerCount(signal) > 1) {
      return
    }
    const endingSessions = Array.fromIterable(endings)
    endings.clear()
    stopListening()
    void settledWithin(
      Promise.allSettled(Array.map(endingSessions, endSession => endSession())),
      flushTimeoutMs,
    ).then(() => {
      if (process.listenerCount(signal) === 0) {
        process.kill(process.pid, signal)
      }
    })
  }

  const startListening = (): void => {
    Array.forEach(EndingSignal.literals, signal => {
      const listener = endOn(signal)
      listeners.set(signal, listener)
      process.on(signal, listener)
    })
  }

  return {
    watch: endSession => {
      if (listeners.size === 0) {
        startListening()
      }
      endings.add(endSession)
      return () => {
        endings.delete(endSession)
        if (endings.size === 0) {
          stopListening()
        }
      }
    },
  }
}

const isSignalingProcess = (value: unknown): value is SignalingProcess =>
  Predicate.hasProperty(value, 'pid') &&
  Predicate.isNumber(value.pid) &&
  Predicate.hasProperty(value, 'on') &&
  Predicate.isFunction(value.on) &&
  Predicate.hasProperty(value, 'off') &&
  Predicate.isFunction(value.off) &&
  Predicate.hasProperty(value, 'listenerCount') &&
  Predicate.isFunction(value.listenerCount) &&
  Predicate.hasProperty(value, 'kill') &&
  Predicate.isFunction(value.kill)

const maybeProcessEnding: Option.Option<ProcessEnding> = Option.map(
  Option.liftPredicate(Reflect.get(globalThis, 'process'), isSignalingProcess),
  nodeProcess => makeProcessEnding(nodeProcess),
)

/**
 * Watches the Node process this runs in for SIGINT and SIGTERM, as
 * {@link makeProcessEnding} describes, and does nothing where there is no
 * Node process, such as in a browser.
 */
export const watchProcessEnding = (
  endSession: () => Promise<void>,
): (() => void) =>
  Option.match(maybeProcessEnding, {
    onNone: () => Function.constVoid,
    onSome: ending => ending.watch(endSession),
  })
