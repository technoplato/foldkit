import {
  CounterProgram,
  Device,
  LastAction,
  type Message,
  type Model,
  actionByToken,
  defaultShowContext,
  invalidActionLog,
  renderReceipt,
  renderShow,
  tokenOf,
} from 'counter-core-example'
import {
  Array,
  Console,
  Data,
  Effect,
  Layer,
  Option,
  Schema as S,
  String as String_,
} from 'effect'
import { Runtime } from 'foldkit'

/** CLI failure for a bad token or target. */
export class CounterCliError extends Data.TaggedError('CounterCliError')<{
  readonly message: string
}> {}

const freshModel = (): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
        }),
      )
      return yield* runtime.initialization
    }),
  )

const runThroughRuntime = (
  model: Model,
  maybeMessage: Option.Option<Message>,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
          start: Runtime.fromModel(model),
        }),
      )
      yield* runtime.initialization
      if (Option.isSome(maybeMessage)) {
        return yield* runtime.run(maybeMessage.value)
      }
      return runtime.readModel()
    }),
  )

const parseTargets = (
  raw: string | undefined,
): Effect.Effect<ReadonlyArray<Device>, CounterCliError> => {
  if (raw === undefined) {
    return Effect.succeed(defaultShowContext.targets)
  }
  const parts = Array.filter(
    Array.map(raw.split(','), part => part.trim()),
    String_.isNonEmpty,
  )
  const decoded = S.decodeUnknownOption(S.Array(Device))(parts)
  if (Option.isNone(decoded)) {
    return Effect.fail(
      new CounterCliError({ message: `Unknown targets "${raw}"` }),
    )
  }
  if (Option.isNone(Array.head(decoded.value))) {
    return Effect.fail(
      new CounterCliError({ message: 'Provide at least one target' }),
    )
  }
  return Effect.succeed(decoded.value)
}

/** One `show` or `do` execution against the imported Program. */
export type CliExecution = Readonly<{
  initialModel: Model
  maybeMessage: Option.Option<Message>
  finalModel: Model
  stdout: string
}>

/** Prints IDENTITY, ACESS, and chrome. `show` is not a Message. */
export const executeShow = (
  targetsRaw: string | undefined,
  path: string | undefined,
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const targets = yield* parseTargets(targetsRaw)
    const initialModel = yield* freshModel()
    const stdout = renderShow(initialModel, {
      targets,
      focus: defaultShowContext.focus,
      ...(path === undefined ? {} : { path }),
    })
    return {
      initialModel,
      maybeMessage: Option.none(),
      finalModel: initialModel,
      stdout,
    }
  })

/** Sends one semantic token, then auto-shows. The process starts at count 0. */
export const executeDo = (
  token: string,
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const initialModel = yield* freshModel()
    const action = actionByToken(token.trim().toLowerCase())
    if (action === undefined) {
      return yield* Effect.fail(
        new CounterCliError({
          message: `Unknown action "${token}". Use increment, decrement, or reset.`,
        }),
      )
    }
    const isValid = action.valid(initialModel, {})
    if (!isValid) {
      const stdout = [
        invalidActionLog(token, initialModel),
        '',
        renderShow(initialModel, {
          targets: defaultShowContext.targets,
          focus: defaultShowContext.focus,
        }),
      ].join('\n')
      return {
        initialModel,
        maybeMessage: Option.none(),
        finalModel: initialModel,
        stdout,
      }
    }

    const message = action()
    const finalModel = yield* runThroughRuntime(
      initialModel,
      Option.some(message),
    )
    const last: LastAction = {
      command: action.command ?? token,
      event: action.event ?? token,
      sideEffects: ['tape append', 'link  offline'],
    }
    const receipt = renderReceipt({
      token: tokenOf(action),
      verb: 'sent',
      from: 'cli',
      via: 'argv',
      command: last.command,
      event: last.event,
      mutate: action.mutate ?? '',
      sideEffects: action.sideEffects ?? '(none)',
      tape: 'appended',
      link: 'offline',
    })
    const stdout = [
      receipt,
      '',
      renderShow(finalModel, {
        targets: defaultShowContext.targets,
        focus: defaultShowContext.focus,
        last,
      }),
    ].join('\n')
    return {
      initialModel,
      maybeMessage: Option.some(message),
      finalModel,
      stdout,
    }
  })

/** Runs `show` and prints. */
export const runShow = (
  targetsRaw: string | undefined,
  path: string | undefined,
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeShow(targetsRaw, path)
    yield* Console.log(execution.stdout)
  })

/** Runs `do` and prints the receipt plus auto-show. */
export const runDo = (token: string): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeDo(token)
    yield* Console.log(execution.stdout)
  })
