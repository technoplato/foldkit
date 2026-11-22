/**
 * The words a command and its Background Processor say to each other
 * that no Program declares. This module imports nothing, so the thin
 * half of a terminal host reads it without loading Effect.
 */

/** The flag `terminal` starts its own entry with to run the Background Processor. */
export const backgroundProcessorFlag = '--foldkit-background-processor'

/**
 * The word for the Background Processor itself: `counter background`
 * says how it is, and `counter background install` and `counter
 * background uninstall` start it at login or stop doing so.
 */
export const backgroundWord = 'background'

/** The word that stops a Background Processor, `counter stop`. */
export const stopWord = 'stop'

/** The word a command asks a Background Processor what it was built from with. */
export const buildWord = 'background-build'

/**
 * The word a command from another build asks a Background Processor to
 * make way with. A Processor whose Program has work going on stays and
 * answers `Working`; any other saves and answers `Stopped`.
 */
export const makeWayWord = 'background-make-way'

/** The word a shell's tab completion asks a Background Processor for what may come next with. */
export const wordsWord = 'background-words'

/** The flag a stopped Processor's answer carries. */
export const stoppedOutcome = 'Stopped'

/** The flag a Processor's answer carries when it stays because it is working. */
export const workingOutcome = 'Working'

/**
 * The word a command asks a Background Processor how it is with: since
 * when it runs, when it stops, and whether it is working.
 */
export const statusWord = 'background-status'

/** The flag a Processor's answer about itself carries. */
export const statusOutcome = 'Status'

/** The flag that carries the work a Processor has going on, empty when none. */
export const workingFlag = 'working'
