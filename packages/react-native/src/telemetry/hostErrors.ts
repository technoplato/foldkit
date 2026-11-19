// HOST ERRORS

/** What every line about a JavaScript failure outside the Program starts with. */
export const hostErrorLineMark = 'foldkit-host-error '

/** What every line a phone writes about itself, once, starts with. */
export const hostNoteLineMark = 'foldkit-host-note '

/**
 * One line of facts a phone says about itself when its trace starts, such
 * as whether a guard is on in this build.
 *
 * @example
 * ```typescript
 * hostNoteLineOf({ reactNativeSchedulerGuard: true }, new Date())
 * // 'foldkit-host-note {"at":"…","reactNativeSchedulerGuard":true}'
 * ```
 */
export const hostNoteLineOf = (
  note: Readonly<Record<string, unknown>>,
  at: Date,
): string =>
  `${hostNoteLineMark}${JSON.stringify({ at: at.toISOString(), ...note })}`

const maximumStackCharacters = 1_500

/**
 * React Native's own registry of the handler for JavaScript failures
 * nothing caught, as far as this module uses it.
 */
export type HostErrorUtils = Readonly<{
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void
  setGlobalHandler: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void
}>

/**
 * One line that says a JavaScript failure reached the platform uncaught:
 * when, whether the platform calls it fatal, its name, its message and
 * the top of its stack. The Program's own failures are telemetry's
 * `Crashed`; this is for everything around the Program, such as a
 * painter or a native module's callback.
 *
 * @example
 * ```typescript
 * hostErrorLineOf(new TypeError('x is not a function'), true, new Date())
 * // 'foldkit-host-error {"at":"…","isFatal":true,"name":"TypeError","message":"x is not a function","stack":"…"}'
 * ```
 */
export const hostErrorLineOf = (
  error: unknown,
  isFatal: boolean,
  at: Date,
): string =>
  `${hostErrorLineMark}${JSON.stringify(
    error instanceof Error
      ? {
          at: at.toISOString(),
          isFatal,
          name: error.name,
          message: error.message,
          stack: (error.stack ?? '').slice(0, maximumStackCharacters),
        }
      : {
          at: at.toISOString(),
          isFatal,
          name: typeof error,
          message: String(error),
        },
  )}`

const platformErrorUtils = (): HostErrorUtils | undefined => {
  const found: unknown = Reflect.get(globalThis, 'ErrorUtils')
  return typeof found === 'object' &&
    found !== null &&
    'getGlobalHandler' in found &&
    'setGlobalHandler' in found
    ? // NOTE: React Native defines this global with these two functions.
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      (found as HostErrorUtils)
    : undefined
}

/**
 * Writes a line for every JavaScript failure that reaches the platform
 * uncaught, then lets the platform handle it as it would have. A phone's
 * development build calls it once, so that what stopped the app is
 * written where the machine that serves the build reads it, before the
 * platform takes the app down.
 *
 * @example
 * ```typescript
 * watchHostErrors({ write: line => console.log(line) })
 * ```
 */
export const watchHostErrors = (
  options: Readonly<{
    write: (line: string) => void
    errorUtils?: HostErrorUtils | undefined
    now?: () => Date
  }>,
): void => {
  const errorUtils =
    'errorUtils' in options ? options.errorUtils : platformErrorUtils()
  if (errorUtils === undefined) {
    return
  }
  const now = options.now ?? (() => new Date())
  const platformHandler = errorUtils.getGlobalHandler()
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      options.write(hostErrorLineOf(error, isFatal === true, now()))
    } catch {
      // NOTE: saying what failed never stands in the platform's way.
    }
    platformHandler(error, isFatal)
  })
}
