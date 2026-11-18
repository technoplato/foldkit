import {
  type SignedInBooks,
  booksConnectionFromEnv,
  noConnectionSentence,
  notSignedInSentence,
  signInToBooks,
} from 'books-core-example'
import { Option } from 'effect'

/** A terminal signed in, or why it could not be. */
export type SignIn =
  | Readonly<{ _tag: 'SignedIn'; signedIn: SignedInBooks }>
  | Readonly<{ _tag: 'Refused'; reason: string }>

/**
 * Signs a terminal Books in from its environment, or says why it can't:
 * no Instant app named, or no member the mint would sign in.
 *
 * @example
 * ```typescript
 * const signIn = await signInFromEnv()
 * // { _tag: 'Refused', reason: 'Books could not sign you in. Run `books login`…' }
 * ```
 */
export const signInFromEnv = async (): Promise<SignIn> => {
  const maybeConnection = booksConnectionFromEnv()
  if (Option.isNone(maybeConnection)) {
    return { _tag: 'Refused', reason: noConnectionSentence }
  }
  const maybeSignedIn = await signInToBooks(maybeConnection.value)
  return Option.match(maybeSignedIn, {
    onNone: () => ({ _tag: 'Refused', reason: notSignedInSentence }),
    onSome: signedIn => ({ _tag: 'SignedIn', signedIn }),
  })
}

/**
 * Signs a terminal Books in from its environment, or says why it can't
 * and exits.
 */
export const signedInOrExit = async (): Promise<SignedInBooks> => {
  const signIn = await signInFromEnv()
  if (signIn._tag === 'Refused') {
    process.stderr.write(`${signIn.reason}\n`)
    process.exit(1)
  }
  return signIn.signedIn
}
