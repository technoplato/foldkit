import {
  Array,
  Data,
  Effect,
  HashSet,
  Option,
  Schema,
  String,
  pipe,
} from 'effect'

import {
  MessageEnvelope,
  type MessageEnvelope as MessageEnvelopeType,
} from '../processor/processor.js'
import type { ProgramSchema } from './program.js'

/** A pure migration between adjacent encoded versions of one event family. */
export type VersionedEventMigration = Readonly<{
  fromVersion: number
  toVersion: number
  migrate: (payload: Schema.Json) => Schema.Json
}>

/** The definition used to construct one versioned event family. */
export type VersionedEventFamilyDefinition<Payload, Message> = Readonly<{
  eventId: string
  minimumVersion: number
  currentVersion: number
  CurrentPayload: ProgramSchema<Payload>
  toMessage: (payload: Payload) => Message
  migrations: ReadonlyArray<VersionedEventMigration>
}>

/** An immutable family that upgrades historical payloads into current Messages. */
export type VersionedEventFamily<Message> = Readonly<{
  eventId: string
  minimumVersion: number
  currentVersion: number
  migrations: ReadonlyArray<VersionedEventMigration>
  decodeCurrent: (
    payload: unknown,
  ) => Effect.Effect<Message, Schema.SchemaError>
}>

/** A versioned event family definition is invalid. */
export class VersionedEventFamilyConstructionError extends Data.TaggedError(
  'VersionedEventFamilyConstructionError',
)<{
  readonly eventId: string
  readonly reason: string
}> {}

const isNonNegativeVersion = (version: number): boolean =>
  Number.isInteger(version) && version >= 0

const validateMigrationChain = <Payload, Message>(
  definition: VersionedEventFamilyDefinition<Payload, Message>,
): Option.Option<string> => {
  if (!String.isNonEmpty(definition.eventId)) {
    return Option.some('eventId must not be empty')
  }
  if (!isNonNegativeVersion(definition.minimumVersion)) {
    return Option.some('minimumVersion must be a non-negative integer')
  }
  if (!isNonNegativeVersion(definition.currentVersion)) {
    return Option.some('currentVersion must be a non-negative integer')
  }
  if (definition.minimumVersion > definition.currentVersion) {
    return Option.some(
      'minimumVersion must be less than or equal to currentVersion',
    )
  }

  const validation = Array.reduce(
    definition.migrations,
    {
      nextVersion: definition.minimumVersion,
      maybeReason: Option.none<string>(),
    },
    (state, migration) => {
      if (Option.isSome(state.maybeReason)) {
        return state
      }
      if (
        !isNonNegativeVersion(migration.fromVersion) ||
        !isNonNegativeVersion(migration.toVersion)
      ) {
        return {
          ...state,
          maybeReason: Option.some(
            'migration versions must be non-negative integers',
          ),
        }
      }
      if (migration.toVersion !== migration.fromVersion + 1) {
        return {
          ...state,
          maybeReason: Option.some(
            'every migration must target the immediately adjacent version',
          ),
        }
      }
      if (migration.fromVersion !== state.nextVersion) {
        return {
          ...state,
          maybeReason: Option.some(
            `expected a migration from version ${state.nextVersion}`,
          ),
        }
      }
      return {
        nextVersion: migration.toVersion,
        maybeReason: Option.none<string>(),
      }
    },
  )

  if (Option.isSome(validation.maybeReason)) {
    return validation.maybeReason
  }
  if (validation.nextVersion !== definition.currentVersion) {
    return Option.some(
      `migration chain must end at version ${definition.currentVersion}`,
    )
  }
  return Option.none()
}

/** Constructs and validates one immutable adjacent-migration event family. */
export const makeVersionedEventFamily = <Payload, Message>(
  definition: VersionedEventFamilyDefinition<Payload, Message>,
): Effect.Effect<
  VersionedEventFamily<Message>,
  VersionedEventFamilyConstructionError
> => {
  const maybeReason = validateMigrationChain(definition)
  if (Option.isSome(maybeReason)) {
    return Effect.fail(
      new VersionedEventFamilyConstructionError({
        eventId: definition.eventId,
        reason: maybeReason.value,
      }),
    )
  }

  const migrations = Object.freeze(
    Array.map(definition.migrations, migration =>
      Object.freeze({ ...migration }),
    ),
  )
  return Effect.succeed(
    Object.freeze({
      eventId: definition.eventId,
      minimumVersion: definition.minimumVersion,
      currentVersion: definition.currentVersion,
      migrations,
      decodeCurrent: (payload: unknown) =>
        pipe(
          Schema.decodeUnknownEffect(definition.CurrentPayload)(payload),
          Effect.map(definition.toMessage),
        ),
    }),
  )
}

/** The definition used to construct one Program-owned event registry. */
export type VersionedEventRegistryDefinition<Message> = Readonly<{
  programId: string
  currentProgramVersion: number
  families: ReadonlyArray<VersionedEventFamily<Message>>
}>

/** An immutable Program-owned registry of live versioned event families. */
export type VersionedEventRegistry<Message> = Readonly<{
  programId: string
  currentProgramVersion: number
  families: ReadonlyArray<VersionedEventFamily<Message>>
}>

/** A Program-owned versioned event registry definition is invalid. */
export class VersionedEventRegistryConstructionError extends Data.TaggedError(
  'VersionedEventRegistryConstructionError',
)<{
  readonly programId: string
  readonly reason: string
}> {}

/** Constructs and validates one immutable Program-owned event registry. */
export const makeVersionedEventRegistry = <Message>(
  definition: VersionedEventRegistryDefinition<Message>,
): Effect.Effect<
  VersionedEventRegistry<Message>,
  VersionedEventRegistryConstructionError
> => {
  if (!String.isNonEmpty(definition.programId)) {
    return Effect.fail(
      new VersionedEventRegistryConstructionError({
        programId: definition.programId,
        reason: 'programId must not be empty',
      }),
    )
  }
  if (!isNonNegativeVersion(definition.currentProgramVersion)) {
    return Effect.fail(
      new VersionedEventRegistryConstructionError({
        programId: definition.programId,
        reason: 'currentProgramVersion must be a non-negative integer',
      }),
    )
  }

  const eventIds = Array.map(definition.families, family => family.eventId)
  if (HashSet.size(HashSet.fromIterable(eventIds)) !== Array.length(eventIds)) {
    return Effect.fail(
      new VersionedEventRegistryConstructionError({
        programId: definition.programId,
        reason: 'event family identifiers must be unique',
      }),
    )
  }

  return Effect.succeed(
    Object.freeze({
      programId: definition.programId,
      currentProgramVersion: definition.currentProgramVersion,
      families: Object.freeze(
        Array.map(definition.families, family =>
          Object.freeze({
            ...family,
            migrations: Object.freeze(
              Array.map(family.migrations, migration =>
                Object.freeze({ ...migration }),
              ),
            ),
          }),
        ),
      ),
    }),
  )
}

/** The untrusted envelope and payload received for one live event occurrence. */
export type VersionedEventWireInput = Readonly<{
  envelope: unknown
  payload: unknown
}>

/** The preserved wire inputs retained through decoding and migration. */
export type OriginalVersionedEventWireInput = Readonly<{
  envelope: unknown
  payload: unknown
}>

/** A live event envelope could not be decoded. */
export class VersionedEventEnvelopeDecodeError extends Data.TaggedError(
  'VersionedEventEnvelopeDecodeError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly cause: unknown
}> {}

/** A live event envelope targets a different Program. */
export class VersionedEventProgramMismatchError extends Data.TaggedError(
  'VersionedEventProgramMismatchError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly expectedProgramId: string
  readonly actualProgramId: string
}> {}

/** No registered family can decode one live event identifier. */
export class UnknownVersionedEventError extends Data.TaggedError(
  'UnknownVersionedEventError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly eventId: string
}> {}

/** A live event version is outside its registered migration family. */
export class UnsupportedVersionedEventVersionError extends Data.TaggedError(
  'UnsupportedVersionedEventVersionError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly eventId: string
  readonly minimumVersion: number
  readonly currentVersion: number
  readonly actualVersion: number
}> {}

/** A live event migration failed while upgrading one preserved wire payload. */
export class VersionedEventMigrationError extends Data.TaggedError(
  'VersionedEventMigrationError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly eventId: string
  readonly fromVersion: number
  readonly toVersion: number
  readonly cause: unknown
}> {}

/** A live event payload failed JSON or current-family Schema decoding. */
export class VersionedEventPayloadDecodeError extends Data.TaggedError(
  'VersionedEventPayloadDecodeError',
)<{
  readonly original: OriginalVersionedEventWireInput
  readonly eventId: string
  readonly eventVersion: number
  readonly stage: 'Wire' | 'Current'
  readonly cause: unknown
}> {}

/** Typed failures produced while decoding and upgrading one live event. */
export type VersionedEventDecodeError =
  | VersionedEventEnvelopeDecodeError
  | VersionedEventProgramMismatchError
  | UnknownVersionedEventError
  | UnsupportedVersionedEventVersionError
  | VersionedEventMigrationError
  | VersionedEventPayloadDecodeError

/** A current Message decoded from one preserved live event occurrence. */
export type DecodedVersionedEvent<Message> = Readonly<{
  original: OriginalVersionedEventWireInput
  envelope: MessageEnvelopeType
  upgradedPayload: Schema.Json
  message: Message
}>

const migratePayload = <Message>(
  family: VersionedEventFamily<Message>,
  original: OriginalVersionedEventWireInput,
  payload: Schema.Json,
  version: number,
): Effect.Effect<
  Schema.Json,
  VersionedEventMigrationError | UnsupportedVersionedEventVersionError
> => {
  if (version === family.currentVersion) {
    return Effect.succeed(payload)
  }

  const maybeMigration = Array.findFirst(
    family.migrations,
    migration => migration.fromVersion === version,
  )
  if (Option.isNone(maybeMigration)) {
    return Effect.fail(
      new UnsupportedVersionedEventVersionError({
        original,
        eventId: family.eventId,
        minimumVersion: family.minimumVersion,
        currentVersion: family.currentVersion,
        actualVersion: version,
      }),
    )
  }

  const migration = maybeMigration.value
  return pipe(
    Effect.try({
      try: () =>
        Schema.decodeUnknownSync(Schema.Json)(migration.migrate(payload)),
      catch: cause =>
        new VersionedEventMigrationError({
          original,
          eventId: family.eventId,
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
          cause,
        }),
    }),
    Effect.flatMap(nextPayload =>
      migratePayload(family, original, nextPayload, migration.toVersion),
    ),
  )
}

/** Decodes and upgrades one live event while preserving its original wire inputs. */
export const decodeVersionedEvent = <Message>(
  registry: VersionedEventRegistry<Message>,
  input: VersionedEventWireInput,
): Effect.Effect<DecodedVersionedEvent<Message>, VersionedEventDecodeError> => {
  const original = Object.freeze({
    envelope: input.envelope,
    payload: input.payload,
  })

  return Effect.gen(function* () {
    const envelope = yield* pipe(
      Schema.decodeUnknownEffect(MessageEnvelope)(input.envelope),
      Effect.mapError(
        cause => new VersionedEventEnvelopeDecodeError({ original, cause }),
      ),
    )
    if (envelope.programId !== registry.programId) {
      return yield* new VersionedEventProgramMismatchError({
        original,
        expectedProgramId: registry.programId,
        actualProgramId: envelope.programId,
      })
    }

    const maybeFamily = Array.findFirst(
      registry.families,
      family => family.eventId === envelope.eventId,
    )
    if (Option.isNone(maybeFamily)) {
      return yield* new UnknownVersionedEventError({
        original,
        eventId: envelope.eventId,
      })
    }

    const family = maybeFamily.value
    if (
      envelope.eventVersion < family.minimumVersion ||
      envelope.eventVersion > family.currentVersion
    ) {
      return yield* new UnsupportedVersionedEventVersionError({
        original,
        eventId: family.eventId,
        minimumVersion: family.minimumVersion,
        currentVersion: family.currentVersion,
        actualVersion: envelope.eventVersion,
      })
    }

    const payload = yield* pipe(
      Schema.decodeUnknownEffect(Schema.Json)(input.payload),
      Effect.mapError(
        cause =>
          new VersionedEventPayloadDecodeError({
            original,
            eventId: family.eventId,
            eventVersion: envelope.eventVersion,
            stage: 'Wire',
            cause,
          }),
      ),
    )
    const upgradedPayload = yield* migratePayload(
      family,
      original,
      payload,
      envelope.eventVersion,
    )
    const message = yield* pipe(
      family.decodeCurrent(upgradedPayload),
      Effect.mapError(
        cause =>
          new VersionedEventPayloadDecodeError({
            original,
            eventId: family.eventId,
            eventVersion: family.currentVersion,
            stage: 'Current',
            cause,
          }),
      ),
    )

    return Object.freeze({
      original,
      envelope,
      upgradedPayload,
      message,
    })
  })
}
