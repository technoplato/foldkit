import { Context, Schema as S, type Stream } from 'effect'

/** Whether the browser has a network connection. */
export const Connectivity = S.Literals(['Online', 'Offline'])
/** Whether the browser has a network connection. */
export type Connectivity = typeof Connectivity.Type

/** The browser's network connection, provided by the host. */
export type NetworkStatusService = Readonly<{
  /** The connectivity now, then every change. */
  changes: Stream.Stream<Connectivity>
}>

/** The browser's network connection, provided by the host. */
export class NetworkStatus extends Context.Service<
  NetworkStatus,
  NetworkStatusService
>()('words-core-example/NetworkStatus') {}
