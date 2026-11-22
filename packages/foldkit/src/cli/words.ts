/**
 * The words a command and its Background Processor say to each other
 * that no Program declares. This module imports nothing, so the thin
 * half of a terminal host reads it without loading Effect.
 */

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
