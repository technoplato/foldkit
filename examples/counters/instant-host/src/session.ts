import { Data, Option, Schema as S } from 'effect'

import { countersDemoEmail, countersDemoSessionPath } from './identity.js'

/** Instant client surface required to establish a Counters session. */
export type CountersSessionDatabase = Readonly<{
  auth: Readonly<{
    signInWithToken: (token: string) => Promise<unknown>
  }>
  getAuth: () => Promise<unknown>
}>

/** A signed-in Instant subject for the Multiple Counters window. */
export const SignedInCountersSession = S.TaggedStruct(
  'SignedInCountersSession',
  {
    userId: S.String,
  },
)
/** A signed-in Instant subject for the Multiple Counters window. */
export type SignedInCountersSession = typeof SignedInCountersSession.Type

/** Instant demo sign-in failed. The Host must show this error. */
export class CountersDemoSignInError extends Data.TaggedError(
  'CountersDemoSignInError',
)<Readonly<{ message: string }>> {}

/** Instant demo mint path did not return a token. */
export const countersDemoMintFailed = (): CountersDemoSignInError =>
  new CountersDemoSignInError({
    message:
      'Instant demo sign-in failed. The mint path did not return a token.',
  })

/** Instant has no signed-in Multiple Counters demo subject. */
export const countersDemoNoSession = (): CountersDemoSignInError =>
  new CountersDemoSignInError({
    message: 'Instant has no Multiple Counters demo session.',
  })

/** Instant session establishment failed. */
export const FailedCountersSession = S.TaggedStruct('FailedCountersSession', {
  error: S.String,
})
/** Instant session establishment failed. */
export type FailedCountersSession = typeof FailedCountersSession.Type

/** Result of establishing a Counters Instant session. */
export const CountersSession = S.Union([
  SignedInCountersSession,
  FailedCountersSession,
])
/** Result of establishing a Counters Instant session. */
export type CountersSession = typeof CountersSession.Type

/** Inputs the runtime uses to sign Instant in. Window code does not call these. */
export type CountersSessionInput = Readonly<{
  accessToken?: string
  database: CountersSessionDatabase
  ensureHostedSession: (
    options: Readonly<{ accessToken?: string }>,
  ) => Promise<unknown>
  fetch?: typeof fetch
  sessionUrl?: string
}>

const DemoSessionBody = S.Struct({
  email: S.optionalKey(S.String),
  token: S.String,
})

const isAbsoluteHttpUrl = (url: string): boolean =>
  url.startsWith('https://') || url.startsWith('http://')

const userIdFromAuth = (user: unknown): Option.Option<string> => {
  if (typeof user !== 'object' || user === null || !('id' in user)) {
    return Option.none()
  }
  const id = user.id
  if (typeof id !== 'string' || id === '') {
    return Option.none()
  }
  return Option.some(id)
}

const signedInUser = async (
  database: CountersSessionDatabase,
): Promise<Option.Option<SignedInCountersSession>> => {
  const user = await database.getAuth()
  const maybeId = userIdFromAuth(user)
  if (Option.isNone(maybeId)) {
    return Option.none()
  }
  return Option.some(
    SignedInCountersSession.make({
      userId: maybeId.value,
    }),
  )
}

/** Reads a minted demo token from an absolute Instant mint URL. */
export const fetchCountersDemoSession = async (
  sessionUrl: string,
  runFetch: typeof fetch = fetch,
): Promise<Option.Option<string>> => {
  if (!isAbsoluteHttpUrl(sessionUrl)) {
    return Option.none()
  }
  try {
    const response = await runFetch(sessionUrl, {
      credentials: 'same-origin',
    })
    if (!response.ok) {
      return Option.none()
    }
    const maybeBody = S.decodeUnknownOption(DemoSessionBody)(
      await response.json(),
    )
    if (Option.isNone(maybeBody) || maybeBody.value.token === '') {
      return Option.none()
    }
    return Option.some(maybeBody.value.token)
  } catch {
    return Option.none()
  }
}

/** Signs in the shared Instant demo subject. A failed mint is an error. */
export const signInDemoSession = async (
  database: CountersSessionDatabase,
  sessionPath: string = countersDemoSessionPath,
  runFetch: typeof fetch = fetch,
): Promise<void> => {
  const existing = await database.getAuth()
  if (existing !== null) {
    return
  }
  let response: Response
  try {
    response = await runFetch(sessionPath, {
      credentials: 'same-origin',
    })
  } catch {
    throw countersDemoMintFailed()
  }
  if (!response.ok) {
    throw countersDemoMintFailed()
  }
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    body.token === ''
  ) {
    throw countersDemoMintFailed()
  }
  await database.auth.signInWithToken(body.token)
}

/** Signs Instant in as the shared demo subject when a mint URL is available. */
export const signInCountersDemoSession = async (
  database: CountersSessionDatabase,
  sessionUrl: string,
  runFetch: typeof fetch = fetch,
): Promise<void> => {
  const existing = await signedInUser(database)
  if (Option.isSome(existing)) {
    return
  }
  const maybeToken = await fetchCountersDemoSession(sessionUrl, runFetch)
  if (Option.isNone(maybeToken)) {
    return
  }
  await database.auth.signInWithToken(maybeToken.value)
}

/** Establishes Instant identity for the Counters window. Never hangs. */
export const establishCountersSession = async (
  input: CountersSessionInput,
): Promise<CountersSession> => {
  const existing = await signedInUser(input.database)
  if (Option.isSome(existing)) {
    return existing.value
  }
  try {
    if (input.accessToken !== undefined && input.accessToken !== '') {
      await input.ensureHostedSession({
        accessToken: input.accessToken,
      })
    } else {
      await input.ensureHostedSession({})
    }
  } catch {
    return FailedCountersSession.make({
      error: 'Hosted Instant sign-in failed.',
    })
  }
  const afterHosted = await signedInUser(input.database)
  if (Option.isSome(afterHosted)) {
    return afterHosted.value
  }
  if (input.sessionUrl !== undefined && input.sessionUrl !== '') {
    if (!isAbsoluteHttpUrl(input.sessionUrl)) {
      return FailedCountersSession.make({
        error:
          'Demo Instant mint must be an absolute URL. Metro must not mint a login ticket.',
      })
    }
    try {
      await signInCountersDemoSession(
        input.database,
        input.sessionUrl,
        input.fetch ?? fetch,
      )
    } catch {
      return FailedCountersSession.make({
        error: `Instant could not sign in ${countersDemoEmail}.`,
      })
    }
  }
  const afterDemo = await signedInUser(input.database)
  if (Option.isSome(afterDemo)) {
    return afterDemo.value
  }
  return FailedCountersSession.make({
    error: 'Sign-in failed. Instant has no session.',
  })
}
