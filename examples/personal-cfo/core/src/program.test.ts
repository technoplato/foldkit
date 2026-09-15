import { Array, Effect, Layer, Option } from 'effect'
import { Runtime } from 'foldkit'
import { buttonsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { layerMemory } from './memoryLedger.js'
import { layerMemoryNotifier } from './memoryNotifier.js'
import {
  type Message,
  RequestedAddAccount,
  RequestedArmRadar,
  RequestedChat,
  RequestedLogin,
  RequestedNotify,
  RequestedOpen,
} from './message.js'
import { PersonalCfoProgram, personalCfoScreen } from './program.js'

const resources = Layer.merge(layerMemory, layerMemoryNotifier)

const run = (messages: ReadonlyArray<Message>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: PersonalCfoProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      for (const message of messages) {
        yield* runtime.run(message)
      }
      const model = runtime.readModel()
      yield* runtime.shutdown
      return model
    }),
  )

describe('PersonalCfoProgram', () => {
  it('keeps anonymous hosts on sign-in and paints a login button', async () => {
    const model = await Effect.runPromise(run([]))
    expect(model.session._tag).toBe('Anonymous')
    expect(model.screen).toBe('sign-in')
    const tokens = Array.map(
      buttonsOf(personalCfoScreen(model)),
      button => button.token,
    )
    expect(tokens).toContain('login')
    expect(tokens).not.toContain('add-account')
  })

  it('logs in to a seeded read-only ledger and grounds chat', async () => {
    const model = await Effect.runPromise(
      run([
        RequestedLogin({ email: 'alice@fake.com' }),
        RequestedOpen({ screen: 'dashboard' }),
        RequestedChat({ text: 'What is my net worth?' }),
        RequestedAddAccount({
          name: 'Emergency Cash',
          institution: 'Mattress',
          kind: 'cash',
          balanceCents: 50_000,
        }),
        RequestedArmRadar({
          question: 'Did net worth move?',
          cadence: 'daily',
          everyMinutes: 0,
        }),
        RequestedNotify({
          title: 'Ping',
          body: 'CLI local path',
          channel: 'local',
        }),
      ]),
    )
    expect(model.session._tag).toBe('Authenticated')
    if (model.session._tag === 'Authenticated') {
      expect(model.session.plan).toBe('free')
    }
    expect(
      model.accounts.every(account => account.access === 'read_only'),
    ).toBe(true)
    expect(
      model.accounts.some(account => account.name === 'Emergency Cash'),
    ).toBe(true)
    expect(model.radar).toHaveLength(1)
    expect(
      model.notifications.some(item => item.body === 'CLI local path'),
    ).toBe(true)
    const assistant = model.chat.find(item => item.role === 'assistant')
    expect(assistant?.body).toContain('Not professional advice.')
    expect(Option.isNone(model.maybeError)).toBe(true)
  })
})
