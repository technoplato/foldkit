import { Data } from 'effect'

/** Harness failure. Grade fails are recorded, not thrown. */
export class BenchError extends Data.TaggedError('BenchError')<{
  readonly detail: string
}> {}
