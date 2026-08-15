import { CounterProgram } from './program.js'

/** Instant Program id for the single Counter tape. */
export const counterTapeProgramId = CounterProgram.id

/** Instant Program version for the single Counter tape. */
export const counterTapeProgramVersion = CounterProgram.version

/** Local same-actor subject when Instant auth is offline. */
export const localCounterSubjectId = 'local-counter'

/** Local same-actor session when Instant auth is offline. */
export const localCounterSessionId = 'local-counter-session'

/** Instant session id shared by every live Counter Processor of one subject. */
export const counterInstantSessionId = 'counter-session'

/** Shared Instant demo subject used by local Counter Processors. */
export const counterDemoEmail = 'counter@foldkit.dev'

/** Processor ids for the CLI and Foldkit browser on one Instant account. */
export const counterProcessorIds = {
  cli: 'cli',
  foldkit: 'foldkit',
  tui: 'tui',
} as const

/** Identity fields written onto every same-actor Counter tape row. */
export type CounterTapeIdentityFields = Readonly<{
  actorId: string
  clientId: string
  originDeviceId: 'computer'
  originatingProcessorId: string
  programId: string
  programVersion: number
  sessionId: string
  subjectId: string
}>

/** Builds identity fields for one Counter Processor on a shared tape. */
export const counterTapeIdentityFields = (
  processorId: string,
  subjectId: string,
  sessionId: string,
): CounterTapeIdentityFields => ({
  actorId: subjectId,
  clientId: processorId,
  originDeviceId: 'computer',
  originatingProcessorId: processorId,
  programId: counterTapeProgramId,
  programVersion: counterTapeProgramVersion,
  sessionId,
  subjectId,
})
