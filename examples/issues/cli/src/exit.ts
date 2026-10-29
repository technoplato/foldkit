/**
 * Ends the process with `code` once everything written to standard output
 * and standard error has reached them. A command that has printed its answer
 * is done: a request still in flight, or a socket kept open, must not keep it
 * running (#1358). Exiting before a pipe drains would cut off a long
 * `issues list --json`, so each stream is flushed first.
 */
export const exitOnceWritten = (code: number): void => {
  process.stdout.write('', () => {
    process.stderr.write('', () => {
      process.exit(code)
    })
  })
}
