import {
  InstantFailure,
  WrongState,
  instantFailureFromUnknown,
} from '../auth/error.js'

/** Every failure a Sharing action can produce. */
export type SharingError = InstantFailure | WrongState

export { InstantFailure, WrongState, instantFailureFromUnknown }
