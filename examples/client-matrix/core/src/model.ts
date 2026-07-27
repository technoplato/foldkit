import { Schema as S } from 'effect'

/** One canonical Multiple Counters destination shown by the matrix. */
export const ScreenMode = S.Literals([
  'List',
  'Detail',
  'Fact',
  'DeleteConfirmation',
])
/** One canonical Multiple Counters destination shown by the matrix. */
export type ScreenMode = typeof ScreenMode.Type

/** The configurable axis used to organize the comparison matrix. */
export const MatrixOrientation = S.Literals(['ModesAsRows', 'ClientsAsRows'])
/** The configurable axis used to organize the comparison matrix. */
export type MatrixOrientation = typeof MatrixOrientation.Type

/** One runnable Program client compared by the matrix. */
export const ClientId = S.Literals([
  'ReactWeb',
  'FoldkitView',
  'ExpoWeb',
  'EffectTerminal',
  'OpenTui',
  'RawCli',
  'ExpoIos',
  'ExpoAndroid',
])
/** One runnable Program client compared by the matrix. */
export type ClientId = typeof ClientId.Type

/** A browser client that can run live inside one matrix cell. */
export const LiveClientId = S.Literals(['ReactWeb', 'FoldkitView'])
/** A browser client that can run live inside one matrix cell. */
export type LiveClientId = typeof LiveClientId.Type

/** The human interaction shape exposed by one client. */
export const InteractionSurface = S.Literals([
  'Graphical',
  'TerminalUI',
  'LineTerminal',
  'OneShotCLI',
])
/** The human interaction shape exposed by one client. */
export type InteractionSurface = typeof InteractionSurface.Type

/** The presentation technology used by one client. */
export const ClientRenderer = S.Literals([
  'React',
  'FoldkitView',
  'ReactNative',
  'OpenTuiReact',
  'Text',
])
/** The presentation technology used by one client. */
export type ClientRenderer = typeof ClientRenderer.Type

/** The execution platform hosting one client. */
export const ClientPlatform = S.Literals(['Web', 'Node', 'Ios', 'Android'])
/** The execution platform hosting one client. */
export type ClientPlatform = typeof ClientPlatform.Type

/** The composition host or toolchain used to launch one client. */
export const ClientHost = S.Literals(['Vite', 'Expo', 'EffectPlatform'])
/** The composition host or toolchain used to launch one client. */
export type ClientHost = typeof ClientHost.Type

/** The host-owned wrapper around a portable relative URI. */
export const UriCarrier = S.Literals([
  'HttpsUrl',
  'CustomSchemeUrl',
  'CommandLineArgument',
])
/** The host-owned wrapper around a portable relative URI. */
export type UriCarrier = typeof UriCarrier.Type

/** Every matrix cell is showing its checked-in capture. */
export const ShowingCaptures = S.TaggedStruct('ShowingCaptures', {})

/** One matrix cell is showing an interactive client from its initial mode. */
export const ShowingLiveClient = S.TaggedStruct('ShowingLiveClient', {
  clientId: LiveClientId,
  mode: ScreenMode,
})

/** The mutually exclusive live-client state of the comparison matrix. */
export const LiveClientState = S.Union([ShowingCaptures, ShowingLiveClient])
/** The mutually exclusive live-client state of the comparison matrix. */
export type LiveClientState = typeof LiveClientState.Type

/** Metadata for one canonical destination. */
export const ScreenModeDefinition = S.Struct({
  mode: ScreenMode,
  title: S.String,
  description: S.String,
})
/** Metadata for one canonical destination. */
export type ScreenModeDefinition = typeof ScreenModeDefinition.Type

/** Metadata for one client surface. */
export const ClientDefinition = S.Struct({
  clientId: ClientId,
  title: S.String,
  description: S.String,
  surface: InteractionSurface,
  renderer: ClientRenderer,
  platform: ClientPlatform,
  host: ClientHost,
  carrier: UriCarrier,
})
/** Metadata for one client surface. */
export type ClientDefinition = typeof ClientDefinition.Type

/** The Client Matrix application Model. */
export const Model = S.Struct({
  liveClientState: LiveClientState,
  orientation: MatrixOrientation,
  selectedMode: ScreenMode,
})
/** The Client Matrix application Model. */
export type Model = typeof Model.Type
