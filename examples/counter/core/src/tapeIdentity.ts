import { CounterProgram } from './program.js'

/** Instant Program id for the single Counter tape. */
export const counterTapeProgramId = CounterProgram.id

/** Instant Program version for the single Counter tape. */
export const counterTapeProgramVersion = CounterProgram.version

/** Local same-actor subject when Instant auth is offline. */
export const localCounterSubjectId = 'local-counter'

/** Local same-actor session when Instant auth is offline. */
export const localCounterSessionId = 'local-counter-session'
