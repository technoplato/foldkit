import { Array, Option, Result, Schema as S, SchemaParser } from 'effect'

/** The only Instant emails the local debug login may mint. */
export const MultipleCountersV3DebugEmail = S.Literals([
  'alice@fake.com',
  'bob@fake.com',
])

/** The only Instant emails the local debug login may mint. */
export type MultipleCountersV3DebugEmail =
  typeof MultipleCountersV3DebugEmail.Type

/** Display names for the local debug Instant subjects. */
export const MultipleCountersV3DebugLabel = S.Literals(['Alice', 'Bob'])

/** Display names for the local debug Instant subjects. */
export type MultipleCountersV3DebugLabel =
  typeof MultipleCountersV3DebugLabel.Type

/** One allowlisted debug Instant subject. */
export const MultipleCountersV3DebugSubject = S.Struct({
  email: MultipleCountersV3DebugEmail,
  label: MultipleCountersV3DebugLabel,
})

/** One allowlisted debug Instant subject. */
export type MultipleCountersV3DebugSubject =
  typeof MultipleCountersV3DebugSubject.Type

/** A browser request to mint one debug magic code. */
export const MultipleCountersV3DebugLoginRequest = S.Struct({
  email: MultipleCountersV3DebugEmail,
})

/** A browser request to mint one debug magic code. */
export type MultipleCountersV3DebugLoginRequest =
  typeof MultipleCountersV3DebugLoginRequest.Type

/** A minted debug magic code that must never enter Program state. */
export const MultipleCountersV3DebugLoginIssued = S.Struct({
  code: S.String.check(S.isMinLength(1)),
  email: MultipleCountersV3DebugEmail,
  label: MultipleCountersV3DebugLabel,
})

/** A minted debug magic code that must never enter Program state. */
export type MultipleCountersV3DebugLoginIssued =
  typeof MultipleCountersV3DebugLoginIssued.Type

/** Alice and Bob, in display order. */
export const multipleCountersV3DebugLoginSubjects: ReadonlyArray<MultipleCountersV3DebugSubject> =
  [
    MultipleCountersV3DebugSubject.make({
      email: 'alice@fake.com',
      label: 'Alice',
    }),
    MultipleCountersV3DebugSubject.make({
      email: 'bob@fake.com',
      label: 'Bob',
    }),
  ]

const labelByEmail: Readonly<
  Record<MultipleCountersV3DebugEmail, MultipleCountersV3DebugLabel>
> = {
  'alice@fake.com': 'Alice',
  'bob@fake.com': 'Bob',
}

/** Returns the display name for one allowlisted debug email. */
export const multipleCountersV3DebugSubjectLabel = (
  email: MultipleCountersV3DebugEmail,
): MultipleCountersV3DebugLabel => labelByEmail[email]

/** Decodes a debug login request and rejects every other email. */
export const decodeMultipleCountersV3DebugLoginRequest = (
  body: unknown,
): Result.Result<MultipleCountersV3DebugLoginRequest, unknown> =>
  SchemaParser.decodeUnknownResult(MultipleCountersV3DebugLoginRequest)(body)

/** Decodes a minted debug login response without retaining Instant admin secrets. */
export const decodeMultipleCountersV3DebugLoginIssued = (
  body: unknown,
): Result.Result<MultipleCountersV3DebugLoginIssued, unknown> =>
  SchemaParser.decodeUnknownResult(MultipleCountersV3DebugLoginIssued)(body)

/** Parses Alice or Bob from a CLI token, email, or display name. */
export const parseMultipleCountersV3DebugSubjectToken = (
  token: string,
): Result.Result<MultipleCountersV3DebugSubject, unknown> => {
  const normalized = token.trim().toLowerCase()
  const maybeSubject = Array.findFirst(
    multipleCountersV3DebugLoginSubjects,
    subject =>
      subject.email === normalized ||
      subject.label.toLowerCase() === normalized,
  )
  if (Option.isSome(maybeSubject)) {
    return Result.succeed(maybeSubject.value)
  }
  return Result.fail(new Error('UnknownDebugSubject'))
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Signed-out debug controls. Codes stay in this Client shell, not in the Program. */
export const multipleCountersV3DebugLoginMarkup = (
  maybeIssued: Option.Option<MultipleCountersV3DebugLoginIssued>,
): string => {
  const buttons = multipleCountersV3DebugLoginSubjects
    .map(
      subject =>
        `<button type="button" class="quiet" id="v3-debug-${subject.label.toLowerCase()}" data-debug-email="${escapeHtml(subject.email)}">Sign in as ${escapeHtml(subject.label)}</button>`,
    )
    .join('')
  const issued = Option.isSome(maybeIssued)
    ? `<p class="debug-code" role="status">Current ${escapeHtml(maybeIssued.value.label)} code: <code>${escapeHtml(maybeIssued.value.code)}</code>. Open another tab and choose the same person for a second Processor, or the other person to exercise isolation.</p>`
    : '<p class="muted">Local debug subjects. The headless authority mints Instant magic codes. They never enter Program state.</p>'
  return `<section class="debug-login" aria-label="Debug login"><p class="eyebrow">Debug login</p><div class="debug-login-actions">${buttons}</div>${issued}</section>`
}

/** Same-origin path the Vite proxy forwards to the loopback debug server. */
export const multipleCountersV3DebugLoginPath = '/__foldkit-debug/magic-code'

/** Loopback port for the headless debug login HTTP server. */
export const multipleCountersV3DebugLoginLoopbackPort = 18_788
