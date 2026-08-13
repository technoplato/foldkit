import { Data } from 'effect'

/** An Auth action was refused because the current Identity and Flow forbid it. */
export class WrongState extends Data.TaggedError('WrongState')<{
  readonly action: string
  readonly message: string
}> {}

/** Instant rejected an authentication call. The message is Instant `err.body?.message`. */
export class InstantFailure extends Data.TaggedError('InstantFailure')<{
  readonly message: string
}> {}

/** Every failure an Auth action can produce. */
export type AuthError = InstantFailure | WrongState

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readStringField = (value: unknown, field: string): string | undefined => {
  if (!isRecord(value) || !(field in value)) {
    return undefined
  }
  const candidate = value[field]
  if (typeof candidate === 'string' && candidate !== '') {
    return candidate
  } else {
    return undefined
  }
}

/** Wraps an Instant rejection without retaining tokens or raw error objects. */
export const instantFailureFromUnknown = (cause: unknown): InstantFailure => {
  if (isRecord(cause)) {
    const bodyMessage = readStringField(cause.body, 'message')
    if (bodyMessage !== undefined) {
      return new InstantFailure({ message: bodyMessage })
    }
    const message = readStringField(cause, 'message')
    if (message !== undefined) {
      return new InstantFailure({ message })
    }
  }
  if (cause instanceof Error && cause.message !== '') {
    return new InstantFailure({ message: cause.message })
  } else {
    return new InstantFailure({
      message: 'Instant authentication failed.',
    })
  }
}
