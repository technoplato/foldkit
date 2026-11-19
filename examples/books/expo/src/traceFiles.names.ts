// TRACE FILES

/** The folder of the app's own documents that holds its trace files. */
export const traceFolderName = 'foldkit-telemetry'

const dayMs = 24 * 60 * 60 * 1_000

const dayOfName = (name: string): string | undefined =>
  /^(\d{8})T\d{6}Z-\d+\.ndjson$/.exec(name)?.[1]

const dayOf = (at: Date): string =>
  at.toISOString().slice(0, 10).replaceAll('-', '')

/**
 * The trace files to let go of: those written before yesterday, by the
 * day in their names. Anything that is not a trace file is left alone.
 *
 * @example
 * ```typescript
 * staleTraceFilesOf(['20261117T235959Z-000004.ndjson'], new Date('2026-11-19T15:00:00Z'))
 * // ['20261117T235959Z-000004.ndjson']
 * ```
 */
export const staleTraceFilesOf = (
  names: ReadonlyArray<string>,
  now: Date,
): ReadonlyArray<string> => {
  const yesterday = dayOf(new Date(now.getTime() - dayMs))
  return names.filter(name => {
    const day = dayOfName(name)
    return day !== undefined && day < yesterday
  })
}
