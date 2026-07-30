import { Effect, Option, Record, Schema as S } from 'effect'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const HeadlessStateV1 = S.Struct({
  actorSequences: S.Record(S.String, S.Int),
  attemptedEffectRequestIds: S.Array(S.String),
  version: S.Literal(1),
})
const HeadlessState = S.Struct({
  actorSequences: S.Record(S.String, S.Int),
  attemptedEffectRequestIds: S.Array(S.String),
  clientId: S.String,
  deviceId: S.String,
  version: S.Literal(2),
})
type HeadlessState = typeof HeadlessState.Type

const PersistedHeadlessStateJson = S.fromJsonString(
  S.Union([HeadlessStateV1, HeadlessState]),
)
const HeadlessStateJson = S.fromJsonString(HeadlessState)

/** The headless process could not preserve its non-secret local protocol state. */
export class HeadlessStateError extends Error {
  readonly _tag = 'HeadlessStateError'
}

/** Durable process-local sequence and effect-attempt state. */
export type HeadlessLocalState = Readonly<{
  claimEffect: (requestId: string) => boolean
  identity: Readonly<{
    clientId: string
    deviceId: string
  }>
  nextActorSequence: (
    actorKey: string,
  ) => Effect.Effect<number, HeadlessStateError>
}>

const emptyState = (): HeadlessState =>
  HeadlessState.make({
    actorSequences: {},
    attemptedEffectRequestIds: [],
    clientId: randomUUID(),
    deviceId: randomUUID(),
    version: 2,
  })

const defaultStatePath = (): string =>
  join(homedir(), '.config', 'foldkit-instant-counter', 'headless-state.json')

/** Selects an optional disposable state path for acceptance runs. */
export const headlessStatePathFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined => {
  const statePath = environment['FOLDKIT_INSTANT_COUNTER_HEADLESS_STATE_PATH']
  return statePath === undefined || statePath.length === 0
    ? undefined
    : statePath
}

const readState = (statePath: string): HeadlessState => {
  if (!existsSync(statePath)) {
    return emptyState()
  }
  const persisted = S.decodeUnknownSync(PersistedHeadlessStateJson)(
    readFileSync(statePath, 'utf8'),
  )
  if (persisted.version === 2) {
    return persisted
  }
  return HeadlessState.make({
    actorSequences: persisted.actorSequences,
    attemptedEffectRequestIds: persisted.attemptedEffectRequestIds,
    clientId: randomUUID(),
    deviceId: randomUUID(),
    version: 2,
  })
}

const writeState = (statePath: string, state: HeadlessState): void => {
  const directory = dirname(statePath)
  const didDirectoryExist = existsSync(directory)
  mkdirSync(directory, { mode: 0o700, recursive: true })
  if (!didDirectoryExist) {
    chmodSync(directory, 0o700)
  }
  const temporaryPath = `${statePath}.${process.pid.toString()}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, S.encodeSync(HeadlessStateJson)(state), {
    flag: 'wx',
    mode: 0o600,
  })
  renameSync(temporaryPath, statePath)
  chmodSync(statePath, 0o600)
}

/** Loads the headless state that prevents sequence reuse and effect retries. */
export const makeHeadlessLocalState = (
  statePath = defaultStatePath(),
): Effect.Effect<HeadlessLocalState, HeadlessStateError> =>
  Effect.try({
    try: () => {
      let state = readState(statePath)
      writeState(statePath, state)
      return {
        claimEffect: requestId => {
          if (state.attemptedEffectRequestIds.includes(requestId)) {
            return false
          }
          const nextState = HeadlessState.make({
            ...state,
            attemptedEffectRequestIds: [
              ...state.attemptedEffectRequestIds,
              requestId,
            ],
          })
          try {
            writeState(statePath, nextState)
            state = nextState
            return true
          } catch {
            return false
          }
        },
        identity: {
          clientId: state.clientId,
          deviceId: state.deviceId,
        },
        nextActorSequence: actorKey =>
          Effect.try({
            try: () => {
              const nextSequence =
                Option.getOrElse(
                  Record.get(state.actorSequences, actorKey),
                  () => 0,
                ) + 1
              const nextState = HeadlessState.make({
                ...state,
                actorSequences: Record.set(
                  state.actorSequences,
                  actorKey,
                  nextSequence,
                ),
              })
              writeState(statePath, nextState)
              state = nextState
              return nextSequence
            },
            catch: cause =>
              new HeadlessStateError(
                `Unable to advance the headless actor sequence: ${String(cause)}`,
              ),
          }),
      }
    },
    catch: cause =>
      new HeadlessStateError(
        `Unable to load the headless protocol state: ${String(cause)}`,
      ),
  })
