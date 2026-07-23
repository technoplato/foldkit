import {
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema as S,
  Stream,
} from 'effect'

import {
  CounterStorage,
  CounterStorageError,
  StoredCounter,
} from './counterStorage.js'

const StoredCounterJson = S.fromJsonString(StoredCounter)

const storageError = (error: unknown): CounterStorageError =>
  new CounterStorageError({ reason: globalThis.String(error) })

/** Provides file-backed Counter persistence using Effect FileSystem services. */
export const makeFileCounterStorageLayer = (
  stateFilePath: string,
): Layer.Layer<CounterStorage, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    CounterStorage,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const stateDirectoryPath = path.dirname(stateFilePath)
      const stateFileName = path.basename(stateFilePath)

      const ensureStateDirectory = fileSystem
        .makeDirectory(stateDirectoryPath, { recursive: true })
        .pipe(Effect.mapError(storageError))

      const load = Effect.gen(function* () {
        const isStored = yield* fileSystem.exists(stateFilePath)
        if (!isStored) {
          return Option.none<StoredCounter>()
        }

        const json = yield* fileSystem.readFileString(stateFilePath)
        const counter = yield* S.decodeUnknownEffect(StoredCounterJson)(json)
        return Option.some(counter)
      }).pipe(Effect.mapError(storageError))

      const save = (counter: StoredCounter) =>
        Effect.gen(function* () {
          yield* ensureStateDirectory
          const json = yield* S.encodeEffect(StoredCounterJson)(counter)
          yield* fileSystem.writeFileString(stateFilePath, json)
        }).pipe(Effect.mapError(storageError))

      const changes = Stream.fromEffect(ensureStateDirectory).pipe(
        Stream.flatMap(() => fileSystem.watch(stateDirectoryPath)),
        Stream.filter(event => path.basename(event.path) === stateFileName),
        Stream.mapEffect(() => load),
        Stream.filter(Option.isSome),
        Stream.map(maybeCounter => maybeCounter.value),
        Stream.mapError(storageError),
      )

      return CounterStorage.of({ load, save, changes })
    }),
  )
