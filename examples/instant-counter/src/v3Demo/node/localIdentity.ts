import { Data, Effect, Option, Record as Record_, Schema as S } from 'effect'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type {
  MultipleCountersV3LocalIdentityEnvironment,
  MultipleCountersV3LocalIdentityStore,
} from '../client/localIdentity.js'

const IdentityState = S.Struct({
  secrets: S.Record(S.String, S.String),
  sequences: S.Record(S.String, S.Int),
  version: S.Literal(1),
})
const IdentityStateJson = S.fromJsonString(IdentityState)
type IdentityState = typeof IdentityState.Type

/** A Node Client could not preserve its origin secrets or actor sequences. */
export class MultipleCountersV3NodeIdentityError extends Data.TaggedError(
  'MultipleCountersV3NodeIdentityError',
)<Readonly<{ cause: unknown }>> {}

const emptyState = (): IdentityState =>
  IdentityState.make({
    secrets: {},
    sequences: {},
    version: 1,
  })

const writeState = (statePath: string, state: IdentityState): void => {
  const directory = dirname(statePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = `${statePath}.${process.pid.toString()}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, S.encodeSync(IdentityStateJson)(state), {
    flag: 'wx',
    mode: 0o600,
  })
  renameSync(temporaryPath, statePath)
}

const readState = (statePath: string): IdentityState => {
  if (!existsSync(statePath)) {
    return emptyState()
  }
  return S.decodeUnknownSync(IdentityStateJson)(readFileSync(statePath, 'utf8'))
}

/** Named Instant Client surfaces that keep separate Processor identities. */
export const MultipleCountersV3NodeSurface = S.Literals(['cli', 'tui'])

/** Named Instant Client surfaces that keep separate Processor identities. */
export type MultipleCountersV3NodeSurface =
  typeof MultipleCountersV3NodeSurface.Type

/** Default durable directory for one Node Instant Client surface. */
export const multipleCountersV3NodeClientStateDirectory = (
  surface: MultipleCountersV3NodeSurface,
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const override = environment['FOLDKIT_INSTANT_COUNTER_CLIENT_STATE_DIR']
  if (override !== undefined && override.length > 0) {
    return override
  }
  return join(
    homedir(),
    '.config',
    'foldkit-instant-counter',
    'clients',
    surface,
  )
}

/** Node entropy, UUID, and clock sources used only by the host controller. */
export const nodeMultipleCountersV3LocalIdentityEnvironment =
  (): MultipleCountersV3LocalIdentityEnvironment => ({
    now: Date.now,
    randomBytes: () => randomBytes(32),
    randomUuid: () => randomUUID(),
  })

/** File vault with atomic sequence and secret allocation for one Node Client. */
export const makeNodeMultipleCountersV3LocalIdentityStore = (
  stateDirectory: string,
): MultipleCountersV3LocalIdentityStore => {
  const statePath = join(stateDirectory, 'identity.json')
  return {
    nextActorSequence: positionKey =>
      Effect.try({
        try: () => {
          const current = readState(statePath)
          const nextSequence =
            Option.getOrElse(
              Record_.get(current.sequences, positionKey),
              () => 0,
            ) + 1
          const next = IdentityState.make({
            ...current,
            sequences: Record_.set(
              current.sequences,
              positionKey,
              nextSequence,
            ),
          })
          writeState(statePath, next)
          return nextSequence
        },
        catch: cause => new MultipleCountersV3NodeIdentityError({ cause }),
      }),
    readOrCreateValue: (name, create) =>
      Effect.gen(function* () {
        const current = yield* Effect.try({
          try: () => readState(statePath),
          catch: cause => new MultipleCountersV3NodeIdentityError({ cause }),
        })
        const existing = Record_.get(current.secrets, name)
        if (Option.isSome(existing)) {
          return existing.value
        }
        const created = yield* create
        const latest = yield* Effect.try({
          try: () => readState(statePath),
          catch: cause => new MultipleCountersV3NodeIdentityError({ cause }),
        })
        const raced = Record_.get(latest.secrets, name)
        if (Option.isSome(raced)) {
          return raced.value
        }
        yield* Effect.try({
          try: () =>
            writeState(
              statePath,
              IdentityState.make({
                ...latest,
                secrets: Record_.set(latest.secrets, name, created),
              }),
            ),
          catch: cause => new MultipleCountersV3NodeIdentityError({ cause }),
        })
        return created
      }),
  }
}
