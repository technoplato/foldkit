/**
 * The name the Counters' Background Processor is found under on this
 * machine. This module must not import Effect, Instant, or the Program,
 * so a command starts fast.
 */
export const countersProgramId = 'multiple-counters'

/** The word every command starts with, `counters add`. */
export const countersCommandName = 'counters'
