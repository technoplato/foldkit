import {
  ClickedCheckAccountAgain,
  ClickedCopyAccountLink,
  ClickedCopyUserID,
  ClickedSignInAgain,
  ClickedSignOut,
  LostInstantSession,
  type Message,
} from './message.js'

/** The listener asks to check the account now. */
export const checkAccountNow = (): Message => ClickedCheckAccountAgain()
/** The listener copies the link that opens the iPhone's Account screen. */
export const copyAccountLink = (): Message => ClickedCopyAccountLink()
/** The listener copies their Instant user id. */
export const copyUserID = (payload: Readonly<{ userID: string }>): Message =>
  ClickedCopyUserID(payload)
/** The listener signs out. */
export const signOut = (): Message => ClickedSignOut()
/** The listener signs in again after signing out. */
export const signInAgain = (): Message => ClickedSignInAgain()
/** Instant reported no signed-in user while the account counted as connected. */
export const reportLostInstantSession = (): Message => LostInstantSession()
