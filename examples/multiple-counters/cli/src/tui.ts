#!/usr/bin/env node
/**
 * `counters-tui`: the Multiple Counters as a live terminal UI, the same
 * as `counters tui`. It is a view of the Background Processor, so `q`
 * closes it and the Program keeps running for the next command.
 */
process.argv.splice(2, process.argv.length, 'tui')

await import('./entry.js')
