import {
  type SignedInBooks,
  booksConnectionFromEnv,
  noConnectionSentence,
  notSignedInSentence,
  signInToBooks,
} from 'books-core-example'
import { Option } from 'effect'

/**
 * Signs a terminal Books in from its environment, or says why it can't
 * and exits.
 */
export const signedInOrExit = async (): Promise<SignedInBooks> => {
  const maybeConnection = booksConnectionFromEnv()
  if (Option.isNone(maybeConnection)) {
    process.stderr.write(`${noConnectionSentence}\n`)
    process.exit(1)
  }
  const maybeSignedIn = await signInToBooks(maybeConnection.value)
  if (Option.isNone(maybeSignedIn)) {
    process.stderr.write(`${notSignedInSentence}\n`)
    process.exit(1)
  }
  return maybeSignedIn.value
}
