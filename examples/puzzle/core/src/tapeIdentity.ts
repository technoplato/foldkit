/** Instant Program id for the single Puzzle tape. */
export const puzzleTapeProgramId = 'puzzle'

/** Instant Program version for the single Puzzle tape. */
export const puzzleTapeProgramVersion = 1

/** Local same-actor subject when Instant auth is offline. */
export const puzzleLocalSubjectId = 'local-puzzle'

/** Local same-actor session when Instant auth is offline. */
export const localPuzzleSessionId = 'local-puzzle-session'

/** Instant session id shared by every live Puzzle Processor of one subject. */
export const puzzleInstantSessionId = 'puzzle-session'

/** Shared Instant demo subject used by local Puzzle Processors. */
export const puzzleDemoEmail = 'puzzle@knophy.com'

/** Vite path that mints the Puzzle demo Instant session. */
export const puzzleDemoSessionPath = '/__foldkit/puzzle-demo-session'

/** Processor ids written onto the same Instant Puzzle tape. */
export const puzzleProcessorIds = {
  cli: 'cli',
  foldkit: 'foldkit',
  react: 'react',
  svelte: 'svelte',
  tui: 'tui',
} as const

/** Uses the process Processor id, or the host default. */
export const puzzleProcessorIdFrom = (
  value: string | undefined,
  fallback: string,
): string => {
  if (value === undefined || value === '') {
    return fallback
  }
  return value
}

/** Identity fields written onto every same-actor Puzzle tape row. */
export type PuzzleTapeIdentityFields = Readonly<{
  actorId: string
  clientId: string
  originDeviceId: 'computer'
  originatingProcessorId: string
  programId: string
  programVersion: number
  sessionId: string
  subjectId: string
}>

/** Builds identity fields for one Puzzle Processor on a shared tape. */
export const puzzleTapeIdentityFields = (
  processorId: string,
  subjectId: string,
  sessionId: string,
): PuzzleTapeIdentityFields => ({
  actorId: subjectId,
  clientId: processorId,
  originDeviceId: 'computer',
  originatingProcessorId: processorId,
  programId: puzzleTapeProgramId,
  programVersion: puzzleTapeProgramVersion,
  sessionId,
  subjectId,
})
