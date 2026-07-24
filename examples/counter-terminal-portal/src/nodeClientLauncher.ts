import { Effect, Layer, Match as M } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

import {
  ClientLauncher,
  ClientLauncherError,
  CounterClient,
} from './clientLauncher.js'

const runForeground = (executablePath: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(
        process.execPath,
        [executablePath, ...args],
        {
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
        },
      )
      const exitCode = yield* handle.exitCode
      if (exitCode !== 0) {
        return yield* Effect.fail(
          new ClientLauncherError({
            reason: `${executablePath} exited with status ${exitCode}`,
          }),
        )
      }
    }),
  ).pipe(
    Effect.mapError(error =>
      error instanceof ClientLauncherError
        ? error
        : new ClientLauncherError({ reason: globalThis.String(error) }),
    ),
  )

/** Provides the Node registry for foreground Counter clients. */
export const makeNodeClientLauncherLayer = (
  tuiEntryPath: string,
): Layer.Layer<
  ClientLauncher,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    ClientLauncher,
    Effect.gen(function* () {
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner
      return ClientLauncher.of({
        open: (client: CounterClient, uri: string) =>
          M.value(client).pipe(
            M.withReturnType<Effect.Effect<void, ClientLauncherError>>(),
            M.when('Tui', () =>
              runForeground(tuiEntryPath, ['--uri', uri]).pipe(
                Effect.provideService(
                  ChildProcessSpawner.ChildProcessSpawner,
                  childProcessSpawner,
                ),
              ),
            ),
            M.exhaustive,
          ),
      })
    }),
  )
