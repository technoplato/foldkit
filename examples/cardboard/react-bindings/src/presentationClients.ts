import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** A presentation Client that opens an inline replay through HTTPS. */
export const WebReplayClient = ts('WebReplayClient', {
  clientId: S.Literals(['ReactWeb', 'ExpoWeb']),
  description: S.String,
  title: S.String,
  url: S.String,
})

/** A presentation Client that opens an inline replay through a custom scheme. */
export const MobileReplayClient = ts('MobileReplayClient', {
  clientId: S.Literal('ExpoMobile'),
  deepLink: S.String,
  description: S.String,
  title: S.String,
})

/** A presentation Client that opens an inline replay from a terminal command. */
export const TerminalReplayClient = ts('TerminalReplayClient', {
  clientId: S.Literal('EffectTui'),
  command: S.String,
  description: S.String,
  title: S.String,
})

/** A known presentation Client whose inline replay carrier is not implemented. */
export const UnavailableReplayClient = ts('UnavailableReplayClient', {
  clientId: S.Literal('FoldkitView'),
  description: S.String,
  reason: S.String,
  title: S.String,
})

/** One presentation Client for the currently selected replay frame. */
export const ReplayPresentationClient = S.Union([
  WebReplayClient,
  MobileReplayClient,
  TerminalReplayClient,
  UnavailableReplayClient,
])
/** One presentation Client for the currently selected replay frame. */
export type ReplayPresentationClient = typeof ReplayPresentationClient.Type

/** Wraps one portable replay path in every currently known Cardboard Client. */
export const replayPresentationClients = (
  portableReplayPath: string,
): ReadonlyArray<ReplayPresentationClient> => [
  WebReplayClient({
    clientId: 'ReactWeb',
    description: 'The standalone React presentation in a new window.',
    title: 'React Web',
    url: `https://cardboard.knophy.com${portableReplayPath}`,
  }),
  WebReplayClient({
    clientId: 'ExpoWeb',
    description: 'The React Native presentation running on the web.',
    title: 'Expo Web',
    url: `https://expodemo.knophy.com${portableReplayPath}`,
  }),
  MobileReplayClient({
    clientId: 'ExpoMobile',
    deepLink: `foldkit://showcase${portableReplayPath}`,
    description: 'The same Expo application on iOS or Android.',
    title: 'Expo Mobile',
  }),
  TerminalReplayClient({
    clientId: 'EffectTui',
    command: `pnpm demo:cardboard:tui -- '${portableReplayPath}'`,
    description: 'The interactive Effect terminal presentation.',
    title: 'Effect TUI',
  }),
  UnavailableReplayClient({
    clientId: 'FoldkitView',
    description: 'The canonical Foldkit view over the same Program.',
    reason:
      'Program history is available in DevTools. Mounting a selected replay frame from an in-app link still needs the Foldkit runtime-control seam.',
    title: 'Foldkit View',
  }),
]
