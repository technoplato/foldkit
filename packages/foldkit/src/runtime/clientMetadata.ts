import { Option, Predicate, Schema as S } from 'effect'

/**
 * Optional client metadata stamped onto each synced Message row a Processor
 * writes, so a tail view can show which browser, window or tab, app build
 * version, and signed-in user produced the row. Every field is optional so
 * older rows without metadata decode cleanly.
 */
export const ClientMetadata = S.Struct({
  browser: S.optionalKey(S.String),
  windowLabel: S.optionalKey(S.String),
  appVersion: S.optionalKey(S.String),
  userEmail: S.optionalKey(S.String),
})
/** Optional client metadata stamped onto each synced Message row. */
export type ClientMetadata = typeof ClientMetadata.Type

/**
 * Static client metadata or a thunk read when a row is written, for hosts
 * whose window title or signed-in user can change after boot.
 */
export type ClientMetadataSource = ClientMetadata | (() => ClientMetadata)

const nonEmptyOf = (value: string | undefined): Option.Option<string> => {
  if (!Predicate.isString(value)) {
    return Option.none()
  }
  const trimmed = value.trim()
  return trimmed === '' ? Option.none() : Option.some(trimmed)
}

/**
 * Resolves a static or dynamic {@link ClientMetadataSource}, trimming values
 * and omitting empty fields so no blank metadata keys are written to a row.
 *
 * @example
 * ```typescript
 * resolveClientMetadata({ browser: 'Chrome', windowLabel: '  ', appVersion: 'v0.131.0' })
 * // { browser: 'Chrome', appVersion: 'v0.131.0' }
 * ```
 */
export const resolveClientMetadata = (
  source: ClientMetadataSource | undefined,
): ClientMetadata => {
  if (source === undefined) {
    return {}
  }
  const raw = typeof source === 'function' ? source() : source
  return {
    ...Option.match(nonEmptyOf(raw.browser), {
      onNone: () => ({}),
      onSome: browser => ({ browser }),
    }),
    ...Option.match(nonEmptyOf(raw.windowLabel), {
      onNone: () => ({}),
      onSome: windowLabel => ({ windowLabel }),
    }),
    ...Option.match(nonEmptyOf(raw.appVersion), {
      onNone: () => ({}),
      onSome: appVersion => ({ appVersion }),
    }),
    ...Option.match(nonEmptyOf(raw.userEmail), {
      onNone: () => ({}),
      onSome: userEmail => ({ userEmail }),
    }),
  }
}

/**
 * Infers a short human-readable browser name from a `navigator.userAgent`
 * string, such as `Chrome`, `Safari`, `Firefox`, `Edge`, or `Opera`.
 *
 * @example
 * ```typescript
 * browserNameOf('Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36') // Some('Chrome')
 * ```
 */
export const browserNameOf = (userAgent: string): Option.Option<string> => {
  if (userAgent.includes('Edg/') || userAgent.includes('EdgiOS/')) {
    return Option.some('Edge')
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    return Option.some('Opera')
  } else if (userAgent.includes('Firefox/') || userAgent.includes('FxiOS/')) {
    return Option.some('Firefox')
  } else if (userAgent.includes('Chrome/') || userAgent.includes('CriOS/')) {
    return Option.some('Chrome')
  } else if (userAgent.includes('Safari/')) {
    return Option.some('Safari')
  } else {
    return Option.none()
  }
}

/**
 * Pure helper that derives {@link ClientMetadata} for a web host from a
 * user-agent string and optional window/tab label, app version, and user email.
 *
 * @example
 * ```typescript
 * browserClientMetadataOf({
 *   userAgent: 'Mozilla/5.0 ... Chrome/131.0 Safari/537.36',
 *   windowLabel: 'Books | React',
 *   appVersion: 'v0.131.0',
 * })
 * // { browser: 'Chrome', windowLabel: 'Books | React', appVersion: 'v0.131.0' }
 * ```
 */
export const browserClientMetadataOf = (
  input: Readonly<{
    userAgent?: string
    windowLabel?: string
    appVersion?: string
    userEmail?: string
  }>,
): ClientMetadata =>
  resolveClientMetadata({
    ...Option.match(
      Option.flatMap(nonEmptyOf(input.userAgent), browserNameOf),
      {
        onNone: () => ({}),
        onSome: browser => ({ browser }),
      },
    ),
    ...(input.windowLabel === undefined
      ? {}
      : { windowLabel: input.windowLabel }),
    ...(input.appVersion === undefined ? {} : { appVersion: input.appVersion }),
    ...(input.userEmail === undefined ? {} : { userEmail: input.userEmail }),
  })

const readGlobalString = (target: unknown, key: string): string | undefined => {
  if (!Predicate.isObject(target)) {
    return undefined
  }
  const value: unknown = Reflect.get(target, key)
  return Predicate.isString(value) ? value : undefined
}

/**
 * Reads {@link ClientMetadata} from the current browser host when available:
 * browser name from `navigator.userAgent` and window/tab label from
 * `windowLabel`, `globalThis.name`, or `document.title`. Safe to call in Node.
 */
export const readBrowserClientMetadata = (
  overrides: Readonly<{
    windowLabel?: string
    appVersion?: string
    userEmail?: string
  }> = {},
): ClientMetadata => {
  const userAgent = readGlobalString(
    Reflect.get(globalThis, 'navigator'),
    'userAgent',
  )
  const windowName = readGlobalString(globalThis, 'name')
  const documentTitle = readGlobalString(
    Reflect.get(globalThis, 'document'),
    'title',
  )
  const inferredWindowLabel =
    overrides.windowLabel ??
    (windowName !== undefined && windowName.trim() !== ''
      ? windowName
      : documentTitle)
  return browserClientMetadataOf({
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(inferredWindowLabel === undefined
      ? {}
      : { windowLabel: inferredWindowLabel }),
    ...(overrides.appVersion === undefined
      ? {}
      : { appVersion: overrides.appVersion }),
    ...(overrides.userEmail === undefined
      ? {}
      : { userEmail: overrides.userEmail }),
  })
}
