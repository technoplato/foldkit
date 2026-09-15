import { Data, Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'
import {
  type AccountKind,
  type CadenceTag,
  type Message,
  type Model,
  PersonalCfoProgram,
  RequestedAddAccount,
  RequestedAddVault,
  RequestedArmRadar,
  RequestedChat,
  RequestedLogin,
  RequestedLogout,
  RequestedNotify,
  RequestedOpen,
  RequestedRadarTick,
  Screen,
  type VaultOrigin,
  layerMemory,
  layerMemoryNotifier,
  parseCents,
} from 'personal-cfo-core'

import { layerInstantLedger } from './instantLedger.js'
import { layerMacosNotifier } from './macosNotifier.js'
import { paintModel } from './paint.js'
import { type ParsedCfoArgv } from './parseArgv.js'

/** CLI failure with an exit code. */
export class CfoCliError extends Data.TaggedError('CfoCliError')<{
  readonly message: string
  readonly exitCode: number
}> {}

const resources = (): Layer.Layer<
  import('personal-cfo-core').PersonalCfoResources
> => {
  if (process.env['PERSONAL_CFO_LEDGER'] === 'memory') {
    return Layer.merge(layerMemory, layerMemoryNotifier)
  }
  return Layer.merge(layerInstantLedger, layerMacosNotifier)
}

/** One Program runtime for a CLI invocation. Prove reuses this. */
export const withRuntime = <A, E>(
  run: (runtime: Runtime.ProgramRuntime<Model, Message>) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: PersonalCfoProgram,
          resources: resources(),
        }),
      )
      yield* runtime.initialization
      const result = yield* run(runtime)
      yield* runtime.shutdown
      return result
    }),
  )

const send = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  message: Message,
): Effect.Effect<Model> => runtime.run(message)

const decodeScreen = (
  raw: string,
): Effect.Effect<typeof Screen.Type, CfoCliError> => {
  const decoded = S.decodeUnknownResult(Screen)(raw)
  if (decoded._tag === 'Success') {
    return Effect.succeed(decoded.success)
  }
  return Effect.fail(
    new CfoCliError({ message: `Unknown screen "${raw}".`, exitCode: 1 }),
  )
}

/** Runs one parsed command and paints the Program. */
export const executeParsed = (
  parsed: ParsedCfoArgv,
): Effect.Effect<string, CfoCliError> =>
  M.value(parsed).pipe(
    M.withReturnType<Effect.Effect<string, CfoCliError>>(),
    M.tagsExhaustive({
      Help: () => Effect.succeed(''),
      Prove: () =>
        Effect.fail(
          new CfoCliError({
            message: 'Prove is handled by the prove runner.',
            exitCode: 1,
          }),
        ),
      Failed: ({ message, exitCode }) =>
        Effect.fail(new CfoCliError({ message, exitCode })),
      Show: () =>
        withRuntime(runtime => Effect.succeed(paintModel(runtime.readModel()))),
      Session: () =>
        withRuntime(runtime => Effect.succeed(paintModel(runtime.readModel()))),
      Login: ({ email }) =>
        withRuntime(runtime =>
          send(runtime, RequestedLogin({ email })).pipe(Effect.map(paintModel)),
        ),
      Logout: () =>
        withRuntime(runtime =>
          send(runtime, RequestedLogout()).pipe(Effect.map(paintModel)),
        ),
      Open: ({ screen }) =>
        withRuntime(runtime =>
          Effect.gen(function* () {
            const decoded = yield* decodeScreen(screen)
            const model = yield* send(
              runtime,
              RequestedOpen({ screen: decoded }),
            )
            return paintModel(model)
          }),
        ),
      AddAccount: ({ name, institution, kind, balanceCents }) =>
        withRuntime(runtime =>
          Effect.gen(function* () {
            const cents = parseCents(balanceCents)
            if (Option.isNone(cents)) {
              return yield* Effect.fail(
                new CfoCliError({
                  message: 'balance-cents must be an integer.',
                  exitCode: 1,
                }),
              )
            }
            const model = yield* send(
              runtime,
              RequestedAddAccount({
                name,
                institution,
                kind: kind as AccountKind,
                balanceCents: cents.value,
              }),
            )
            return paintModel(model)
          }),
        ),
      AddVault: ({ title, origin }) =>
        withRuntime(runtime =>
          send(
            runtime,
            RequestedAddVault({
              title,
              origin: origin as VaultOrigin,
            }),
          ).pipe(Effect.map(paintModel)),
        ),
      ArmRadar: ({ question, cadence, everyMinutes }) =>
        withRuntime(runtime =>
          Effect.gen(function* () {
            const minutes = parseCents(everyMinutes)
            if (Option.isNone(minutes)) {
              return yield* Effect.fail(
                new CfoCliError({
                  message: 'every-minutes must be an integer.',
                  exitCode: 1,
                }),
              )
            }
            const model = yield* send(
              runtime,
              RequestedArmRadar({
                question,
                cadence: cadence as CadenceTag,
                everyMinutes: minutes.value,
              }),
            )
            return paintModel(model)
          }),
        ),
      TickRadar: () =>
        withRuntime(runtime =>
          send(runtime, RequestedRadarTick()).pipe(Effect.map(paintModel)),
        ),
      Notify: ({ title, body }) =>
        withRuntime(runtime =>
          send(
            runtime,
            RequestedNotify({ title, body, channel: 'local' }),
          ).pipe(Effect.map(paintModel)),
        ),
      Chat: ({ text }) =>
        withRuntime(runtime =>
          send(runtime, RequestedChat({ text })).pipe(Effect.map(paintModel)),
        ),
    }),
  )
