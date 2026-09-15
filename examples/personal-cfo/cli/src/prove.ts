import { Effect } from 'effect'
import {
  type Model,
  RequestedAddAccount,
  RequestedAddVault,
  RequestedArmRadar,
  RequestedChat,
  RequestedLogin,
  RequestedNotify,
  RequestedOpen,
  RequestedRadarTick,
} from 'personal-cfo-core'

import { CfoCliError, withRuntime } from './host.js'
import { paintModel } from './paint.js'

const requireContains = (
  painted: string,
  snippet: string,
): Effect.Effect<void, CfoCliError> => {
  if (!painted.includes(snippet)) {
    return Effect.fail(
      new CfoCliError({
        message: `Prove expected ${JSON.stringify(snippet)} in:\n${painted}`,
        exitCode: 1,
      }),
    )
  }
  return Effect.void
}

const check = (
  model: Model,
  snippet: string,
): Effect.Effect<void, CfoCliError> =>
  requireContains(paintModel(model), snippet)

/** Scripted CLI flow against one Program runtime. */
export const runProve = (): Effect.Effect<string, CfoCliError> =>
  withRuntime(runtime =>
    Effect.gen(function* () {
      const lines: Array<string> = []
      const email = process.env['PERSONAL_CFO_PROVE_EMAIL'] ?? 'alice@fake.com'

      const loggedIn = yield* runtime.run(RequestedLogin({ email }))
      yield* check(loggedIn, email)
      yield* check(loggedIn, 'read_only')
      yield* check(loggedIn, 'net worth')
      lines.push(`ok login ${email}`)

      const session = runtime.readModel()
      yield* check(session, email)
      lines.push('ok session authenticated')

      const dashboard = yield* runtime.run(
        RequestedOpen({ screen: 'dashboard' }),
      )
      yield* check(dashboard, 'net worth')
      lines.push('ok dashboard painted')

      const added = yield* runtime.run(
        RequestedAddAccount({
          name: 'Prove Cash',
          institution: 'Prove Bank',
          kind: 'cash',
          balanceCents: 10_000,
        }),
      )
      yield* check(added, 'Prove Cash')
      lines.push('ok accounts add')

      const accounts = yield* runtime.run(RequestedOpen({ screen: 'accounts' }))
      yield* check(accounts, 'Prove Cash')
      yield* check(accounts, 'read_only')
      lines.push('ok accounts list')

      const vaulted = yield* runtime.run(
        RequestedAddVault({ title: 'W2 stub', origin: 'upload' }),
      )
      yield* check(vaulted, 'W2 stub')
      lines.push('ok vault add')

      const vault = yield* runtime.run(RequestedOpen({ screen: 'vault' }))
      yield* check(vault, 'W2 stub')
      lines.push('ok vault list')

      const armed = yield* runtime.run(
        RequestedArmRadar({
          question: 'Did net worth move?',
          cadence: 'daily',
          everyMinutes: 0,
        }),
      )
      yield* check(armed, 'Did net worth move?')
      lines.push('ok radar arm')

      const radar = yield* runtime.run(RequestedOpen({ screen: 'radar' }))
      yield* check(radar, 'Did net worth move?')
      lines.push('ok radar list')

      const ticked = yield* runtime.run(RequestedRadarTick())
      yield* check(ticked, 'Not professional advice.')
      lines.push('ok radar tick')

      const quiet = yield* runtime.run(RequestedRadarTick())
      yield* check(quiet, 'Did net worth move?')
      lines.push('ok radar quiet-on-same-hash')

      const notified = yield* runtime.run(
        RequestedNotify({
          title: 'Personal CFO',
          body: 'CLI prove ping',
          channel: 'local',
        }),
      )
      yield* check(notified, 'CLI prove ping')
      lines.push('ok notify')

      yield* runtime.run(RequestedChat({ text: 'What is my net worth?' }))
      const chat = yield* runtime.run(RequestedOpen({ screen: 'chat' }))
      yield* check(chat, 'Not professional advice.')
      yield* check(chat, 'net worth')
      lines.push('ok chat grounded')

      return `${lines.join('\n')}\nprove ok\n`
    }),
  )
