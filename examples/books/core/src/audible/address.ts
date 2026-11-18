import { Schema as S } from 'effect'

// ADDRESS

/**
 * The address a person pasted, carried hidden: it prints as `<redacted>`,
 * and no Schema can write it as JSON.
 */
export const PastedAddress = S.Redacted(S.String, { disallowJsonEncode: true })

export const PastedAddressToken = S.RedactedFromValue(S.String, {
  disallowEncode: true,
})
