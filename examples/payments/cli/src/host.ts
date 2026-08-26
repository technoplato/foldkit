import { Console, Data, Effect, Match as M, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'
import {
  ClearedCredentials,
  ConnectedWallet,
  CredentialFieldId,
  DisconnectedWallet,
  InertPaymentProcessorLive,
  type Message,
  type Model,
  PaymentsProgram,
  RAIL_IDS,
  RailId,
  RecordedCredentialPresence,
  RequestedSession,
  RequestedVerify,
  ResetCheckout,
  SelectedRail,
  displayForModel,
} from 'payments-core-example'

/** A payments CLI token could not be translated to a Message. */
export class PaymentsCliError extends Data.TaggedError('PaymentsCliError')<{
  readonly reason: string
}> {}

const parseRailId = (
  token: string,
): Effect.Effect<RailId, PaymentsCliError> => {
  const decoded = S.decodeUnknownResult(RailId)(token)
  if (decoded._tag === 'Success') {
    return Effect.succeed(decoded.success)
  }
  return Effect.fail(
    new PaymentsCliError({
      reason: `Unknown rail "${token}". Use: ${RAIL_IDS.join(', ')}`,
    }),
  )
}

const parseField = (
  token: string,
): Effect.Effect<typeof CredentialFieldId.Type, PaymentsCliError> => {
  const decoded = S.decodeUnknownResult(CredentialFieldId)(token)
  if (decoded._tag === 'Success') {
    return Effect.succeed(decoded.success)
  }
  return Effect.fail(
    new PaymentsCliError({
      reason: `Unknown credential field "${token}"`,
    }),
  )
}

const messagesForTokens = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Message>, PaymentsCliError> =>
  Effect.gen(function* () {
    const messages: Array<Message> = []
    let index = 0
    while (index < tokens.length) {
      const token = tokens.at(index)
      if (token === undefined) {
        break
      }
      const next = tokens.at(index + 1)
      if (token === 'select') {
        if (next === undefined) {
          return yield* Effect.fail(
            new PaymentsCliError({ reason: 'select needs a rail id' }),
          )
        }
        const rail = yield* parseRailId(next)
        messages.push(SelectedRail({ rail }))
        index += 2
        continue
      }
      if (token === 'record') {
        if (next === undefined) {
          return yield* Effect.fail(
            new PaymentsCliError({ reason: 'record needs a credential field' }),
          )
        }
        const field = yield* parseField(next)
        messages.push(RecordedCredentialPresence({ field, isPresent: true }))
        index += 2
        continue
      }
      const maybeControl = M.value(token).pipe(
        M.withReturnType<Option.Option<Message>>(),
        M.when('clear', () => Option.some(ClearedCredentials())),
        M.when('connect', () => Option.some(ConnectedWallet())),
        M.when('disconnect', () => Option.some(DisconnectedWallet())),
        M.when('start', () => Option.some(RequestedSession())),
        M.when('verify', () => Option.some(RequestedVerify({}))),
        M.when('reset', () => Option.some(ResetCheckout())),
        M.orElse(() => Option.none()),
      )
      if (Option.isNone(maybeControl)) {
        return yield* Effect.fail(
          new PaymentsCliError({
            reason: `Unknown command "${token}". Use select, record, clear, connect, start, verify, reset.`,
          }),
        )
      }
      messages.push(maybeControl.value)
      index += 1
    }
    return messages
  })

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let nextModel = runtime.readModel()
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
  })

const execute = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<Model, PaymentsCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: PaymentsProgram,
          resources: InertPaymentProcessorLive,
        }),
      )
      yield* runtime.initialization
      const messages = yield* messagesForTokens(tokens)
      const model = yield* runMessages(runtime, messages)
      yield* runtime.shutdown
      return model
    }),
  )

/** Prints the imported Payments Model. */
export const runPaymentsShow = (): Effect.Effect<void, PaymentsCliError> =>
  Effect.gen(function* () {
    const model = yield* execute([])
    yield* Console.log(displayForModel(model))
  })

/** Runs CLI tokens through the renderer-free runtime and prints show. */
export const runPaymentsDo = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<void, PaymentsCliError> =>
  Effect.gen(function* () {
    const model = yield* execute(tokens)
    yield* Console.log(displayForModel(model))
  })
