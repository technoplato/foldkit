/**
 * Counter CLI settings read from the environment. This module must not
 * import Effect, Instant, or the Program, so the thin view starts fast.
 *
 * - `COUNTER_TAPE=memory` keeps the count in one process.
 * - `COUNTER_TAPE_PATH=/tmp/counter.json` keeps it in a file.
 * - Otherwise the CLI joins the shared Instant tape through a daemon.
 * - `COUNTER_SYNC=shared-domain` keeps the action menu on this Processor.
 */

/** Where the Counter CLI keeps its count. */
export type CounterCliTape =
  | Readonly<{ _tag: 'Memory' }>
  | Readonly<{ _tag: 'File'; path: string }>
  | Readonly<{ _tag: 'Instant' }>

/** Instant app id for the Counter tape. The view never imports Instant. */
export const counterCliProgramId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

/** Reads the tape from the environment. */
export const counterCliTape = (
  env: NodeJS.ProcessEnv = process.env,
): CounterCliTape => {
  const path = env['COUNTER_TAPE_PATH']
  if (path !== undefined && path !== '') {
    return { _tag: 'File', path }
  } else if (env['COUNTER_TAPE'] === 'memory') {
    return { _tag: 'Memory' }
  } else {
    return { _tag: 'Instant' }
  }
}

/** The synchronization word from the environment, `mirror` by default. */
export const counterCliSyncWord = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const word = env['COUNTER_SYNC']
  return word === undefined || word === '' ? 'mirror' : word
}

/**
 * Separates daemons by tape and synchronization mode, so a Mirror daemon
 * never answers a SharedDomain view.
 */
export const counterCliIsolationKey = (
  env: NodeJS.ProcessEnv = process.env,
): string => `instant:${counterCliSyncWord(env)}`
