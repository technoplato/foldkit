import { Array, Option } from 'effect'

// ENV

/** The Instant app and owner every Brandon dot process reads from the environment. */
export type BrandonEnv = Readonly<{
  appId: string
  adminToken: string
  ownerUserID: string
}>

const required = (name: string): string => {
  const value = process.env[name]?.trim() ?? ''
  if (value === '') {
    throw new Error(`Missing ${name}.`)
  }
  return value
}

/** Reads the three values `brandon` and the origin cannot run without. */
export const brandonEnv = (): BrandonEnv => ({
  appId: required('BRANDON_INSTANT_APP_ID'),
  adminToken: required('BRANDON_INSTANT_ADMIN_TOKEN'),
  ownerUserID: required('BRANDON_OWNER_USER_ID'),
})

/** A comma-separated value as a list, spaces trimmed. */
export const listOf = (value: string | undefined): ReadonlyArray<string> =>
  Array.filter(
    Array.map((value ?? '').split(','), part => part.trim()),
    part => part !== '',
  )

/** An environment value that may be absent. */
export const maybeEnv = (name: string): Option.Option<string> =>
  Option.filter(
    Option.fromNullishOr(process.env[name]?.trim()),
    value => value !== '',
  )
