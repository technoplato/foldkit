import { Effect } from 'effect'
import { Schema as S } from 'effect'
import { Processor } from 'foldkit'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { makeFileProgramStore } from './fileStore.js'
import { commitSharedMessage, makeSharedProgramTape } from './tape.js'

const Increment = S.TaggedStruct('Increment', {})
const Message = S.Union([Increment])
type Message = typeof Message.Type

describe('file Program tape', () => {
  it.effect('persists accepted Messages across store instances', () =>
    Effect.gen(function* () {
      const cacheRoot = join(homedir(), '.cache')
      mkdirSync(cacheRoot, { recursive: true })
      const directory = mkdtempSync(join(cacheRoot, 'foldkit-tape-'))
      const path = join(directory, 'tape.json')
      const identity = {
        actor: Processor.SystemActor.make({ processorId: 'cli' }),
        actorId: 'local-counter',
        clientId: 'cli',
        originDeviceId: 'computer',
        originatingProcessorId: 'cli',
        programId: 'counter',
        programVersion: 2,
        sessionId: 'local-counter-session',
        subjectId: 'local-counter',
      } as const

      const firstStore = yield* makeFileProgramStore(path)
      const firstTape = yield* makeSharedProgramTape<Message>({
        Message,
        eventId: message => message._tag,
        identity,
        link: 'offline',
        makeId: () => crypto.randomUUID(),
        now: () => Date.now(),
        store: firstStore,
      })
      yield* commitSharedMessage(firstTape, Increment.make({}), () =>
        Effect.succeed(1),
      )

      const secondStore = yield* makeFileProgramStore(path)
      const secondTape = yield* makeSharedProgramTape<Message>({
        Message,
        eventId: message => message._tag,
        identity,
        link: 'offline',
        makeId: () => crypto.randomUUID(),
        now: () => Date.now(),
        store: secondStore,
      })
      const messages = yield* secondTape.readAcceptedMessages
      expect(messages).toEqual([Increment.make({})])
      rmSync(directory, { force: true, recursive: true })
    }),
  )
})
