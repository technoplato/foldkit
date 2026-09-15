import { Option, Schema as S } from 'effect'

import {
  Account,
  Anonymous,
  AppNotification,
  ChatMessage,
  RadarJob,
  Screen,
  Session,
  Snapshot,
  VaultFile,
} from './domain.js'

/** Portable URI for this Program. */
export const uri = '/dashboard'

/** Product identity title printed by `show`. */
export const title = 'personal-cfo'

/**
 * Product identity sentence. Host chrome does not replace this.
 */
export const description =
  'read-only personal AI CFO / net-worth OS. Core Program owns the rules; CLI and Expo only paint.'

/** In-flight Command marker. */
export const Status = S.Literals(['idle', 'working'])
/** In-flight Command marker. */
export type Status = typeof Status.Type

/** The canonical Personal CFO Model. */
export const Model = S.Struct({
  session: Session,
  screen: Screen,
  status: Status,
  maybeError: S.Option(S.String),
  accounts: S.Array(Account),
  vault: S.Array(VaultFile),
  radar: S.Array(RadarJob),
  chat: S.Array(ChatMessage),
  notifications: S.Array(AppNotification),
})
/** The canonical Personal CFO Model. */
export type Model = typeof Model.Type

const screenAfterSnapshot = (model: Model, snapshot: Snapshot): Screen => {
  if (snapshot.session._tag === 'Anonymous') {
    return 'sign-in'
  }
  if (model.screen === 'sign-in') {
    return 'dashboard'
  }
  return model.screen
}

/** Applies a durable snapshot onto the current screen. */
export const withSnapshot = (model: Model, snapshot: Snapshot): Model =>
  Model.make({
    session: snapshot.session,
    screen: screenAfterSnapshot(model, snapshot),
    status: 'idle',
    maybeError: Option.none(),
    accounts: snapshot.accounts,
    vault: snapshot.vault,
    radar: snapshot.radar,
    chat: snapshot.chat,
    notifications: snapshot.notifications,
  })

/** Signed-out Model used by init. */
export const emptyModel = (): Model =>
  Model.make({
    session: Anonymous.make({}),
    screen: 'sign-in',
    status: 'idle',
    maybeError: Option.none(),
    accounts: [],
    vault: [],
    radar: [],
    chat: [],
    notifications: [],
  })
