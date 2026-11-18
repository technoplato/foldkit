import { Option } from 'effect'
import {
  type SignedInReminders,
  noConnectionSentence,
  notSignedInSentence,
  remindersConnectionFromEnv,
  signInToReminders,
} from 'reminders-core-example'

/**
 * Signs a terminal Reminders in from its environment, or says why it
 * can't and exits.
 */
export const signedInOrExit = async (): Promise<SignedInReminders> => {
  const maybeConnection = remindersConnectionFromEnv()
  if (Option.isNone(maybeConnection)) {
    process.stderr.write(`${noConnectionSentence}\n`)
    process.exit(1)
  }
  const maybeSignedIn = await signInToReminders(maybeConnection.value)
  if (Option.isNone(maybeSignedIn)) {
    process.stderr.write(`${notSignedInSentence}\n`)
    process.exit(1)
  }
  return maybeSignedIn.value
}
