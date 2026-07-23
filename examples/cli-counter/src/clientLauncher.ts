import { Context, Data, Effect, Schema as S } from 'effect'

/** Clients supported by the one-shot Counter host. */
export const CounterClient = S.Literals(['Tui'])
export type CounterClient = typeof CounterClient.Type

/** A supported Counter client could not be launched or exited unsuccessfully. */
export class ClientLauncherError extends Data.TaggedError(
  'ClientLauncherError',
)<{
  readonly reason: string
}> {}

/** Host-owned registry for launching Counter clients from portable state. */
export class ClientLauncher extends Context.Service<
  ClientLauncher,
  Readonly<{
    open: (
      client: CounterClient,
      uri: string,
    ) => Effect.Effect<void, ClientLauncherError>
  }>
>()('cli-counter/ClientLauncher') {}
