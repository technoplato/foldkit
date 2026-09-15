import { Option } from 'effect'

import { Screen } from './domain.js'
import {
  Message,
  RequestedLogout,
  RequestedNotify,
  RequestedOpen,
  RequestedRadarTick,
} from './message.js'

const screens: ReadonlyArray<typeof Screen.Type> = [
  'dashboard',
  'accounts',
  'vault',
  'radar',
  'chat',
  'more',
  'sign-in',
]

/** Maps a painted button token to a Message. Login still needs an email. */
export const messageFromToken = (token: string): Option.Option<Message> => {
  if (token === 'logout') {
    return Option.some(RequestedLogout())
  }
  if (token === 'tick-radar') {
    return Option.some(RequestedRadarTick())
  }
  if (token === 'notify') {
    return Option.some(
      RequestedNotify({
        title: 'Personal CFO',
        body: 'Local ping from the Personal CFO Program.',
        channel: 'local',
      }),
    )
  }
  const screen = screens.find(item => item === token)
  if (screen !== undefined) {
    return Option.some(RequestedOpen({ screen }))
  }
  return Option.none()
}
