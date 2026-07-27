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

/** One concrete client surface compared by the matrix. */
export const ClientMedium = S.Literals([
  'ReactWeb',
  'FoldkitView',
  'ExpoWeb',
  'EffectTerminal',
  'OpenTui',
  'RawCli',
  'ExpoIos',
  'ExpoAndroid',
])
/** One concrete client surface compared by the matrix. */
export type ClientMedium = typeof ClientMedium.Type

/** A browser client that can run live inside one matrix cell. */
export const LiveClientMedium = S.Literals(['ReactWeb', 'FoldkitView'])
/** A browser client that can run live inside one matrix cell. */
export type LiveClientMedium = typeof LiveClientMedium.Type

/** Every matrix cell is showing its checked-in capture. */
export const ShowingCaptures = S.TaggedStruct('ShowingCaptures', {})

/** One matrix cell is showing an interactive client from its initial mode. */
export const ShowingLiveClient = S.TaggedStruct('ShowingLiveClient', {
  medium: LiveClientMedium,
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
  medium: ClientMedium,
  title: S.String,
  description: S.String,
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
