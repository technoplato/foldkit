import { Array, Function, HashMap, Option, Schema, pipe } from 'effect'

import type { Ports } from '../port/port.js'
import type { MessageEnvelope } from '../processor/processor.js'
import type { Program } from '../program/program.js'
import { type DiffResult, computeDiff } from './diff.js'

const DEFAULT_KEYFRAME_INTERVAL = 31

/** A Message sent directly by a Program client. */
const HostTransitionSource = Schema.TaggedStruct('Host', {
  actionName: Schema.optionalKey(Schema.String),
})

/** A Message produced by a Command. */
const CommandTransitionSource = Schema.TaggedStruct('Command', {
  name: Schema.String,
})

/** A Message emitted by a Subscription. */
const SubscriptionTransitionSource = Schema.TaggedStruct('Subscription', {
  name: Schema.String,
})

const ManagedResourceTransitionSource = Schema.TaggedStruct('ManagedResource', {
  name: Schema.String,
})

/** A Message emitted by a Mount. */
const MountTransitionSource = Schema.TaggedStruct('Mount', {
  name: Schema.String,
})

/** A Message received through a Port. */
const PortTransitionSource = Schema.TaggedStruct('Port', {
  name: Schema.String,
})

/** A Message produced by navigation. */
const NavigationTransitionSource = Schema.TaggedStruct('Navigation', {})

/** A Message dispatched by DevTools. */
const DevToolsTransitionSource = Schema.TaggedStruct('DevTools', {})

/** A Message occurrence accepted by a shared Program transport. */
const AcceptedMessageTransitionSource = Schema.TaggedStruct('AcceptedMessage', {
  occurrenceId: Schema.String,
})

/** Provenance for a Message entering the shared Program runtime. */
export const TransitionSource = Schema.Union([
  HostTransitionSource,
  CommandTransitionSource,
  SubscriptionTransitionSource,
  ManagedResourceTransitionSource,
  MountTransitionSource,
  PortTransitionSource,
  NavigationTransitionSource,
  DevToolsTransitionSource,
  AcceptedMessageTransitionSource,
])

/** Provenance for a Message entering the shared Program runtime. */
export type TransitionSource = typeof TransitionSource.Type

/** Metadata for a Command returned by update. */
export type CommandRecord = Readonly<{
  name: string
  args?: Record<string, unknown>
}>

/** One ordered Message transaction in a Program journal. */
export type Transition<Model, Message> = Readonly<{
  sequence: number
  message: Message
  envelope?: MessageEnvelope
  source: TransitionSource
  operationId?: number
  isOperationSettled: boolean
  commands: ReadonlyArray<CommandRecord>
  timestamp: number
  isModelChanged: boolean
  diff: DiffResult
  model: Model
}>

/** An immutable view of the retained portion of a Program journal. */
export type ProgramJournalSnapshot<Model, Message> = Readonly<{
  retainedFromSequence: number
  initialModel: Model
  initialCommands: ReadonlyArray<CommandRecord>
  transitions: ReadonlyArray<Transition<Model, Message>>
  latestModel: Model
}>

/** Input recorded after update has processed one Message. */
export type RecordTransitionInput<Model, Message> = Readonly<{
  message: Message
  envelope?: MessageEnvelope
  source: TransitionSource
  operationId?: number
  isOperationSettled: boolean
  commands: ReadonlyArray<CommandRecord>
  timestamp?: number
  model: Model
}>

/** A synchronous archive used to retain Program journal transitions. */
export type ProgramJournalArchive<Model, Message> = Readonly<{
  read: () => ProgramJournalSnapshot<Model, Message>
  append: (transition: Transition<Model, Message>) => void
  modelAt: (frame: number) => Option.Option<Model>
}>

/** The values supplied when a Program journal creates its retention archive. */
export type ProgramJournalArchiveConfig<Model, Message> = Readonly<{
  initialModel: Model
  initialCommands: ReadonlyArray<CommandRecord>
  applyMessage: (model: Model, message: Message) => Model
}>

/** Creates one retention archive for a Program journal. */
export type ProgramJournalArchiveFactory<Model, Message> = (
  config: ProgramJournalArchiveConfig<Model, Message>,
) => ProgramJournalArchive<Model, Message>

/** A typed, renderer-free journal for a running Program. */
export type ProgramJournal<Model, Message> = Readonly<{
  read: () => ProgramJournalSnapshot<Model, Message>
  record: (input: RecordTransitionInput<Model, Message>) => void
  modelAt: (frame: number) => Option.Option<Model>
  observe: (
    listener: (transition: Transition<Model, Message>) => void,
  ) => () => void
  /** Stops transition publication and releases observer references. */
  shutdown: () => void
}>

/** Configuration for a Program journal. */
export type ProgramJournalConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  initialModel: Model
  initialCommands?: ReadonlyArray<CommandRecord>
  archive?: ProgramJournalArchiveFactory<Model, Message>
  now?: () => number
}>

const toCommandRecord = (command: CommandRecord): CommandRecord => ({
  name: command.name,
  ...(command.args === undefined ? {} : { args: command.args }),
})

type InMemoryArchiveOptions = Readonly<{
  keyframeInterval: number
  maximumTransitions: Option.Option<number>
}>

const makeInMemoryArchive = <Model, Message>(
  {
    initialModel,
    initialCommands,
    applyMessage,
  }: ProgramJournalArchiveConfig<Model, Message>,
  options: InMemoryArchiveOptions,
): ProgramJournalArchive<Model, Message> => {
  let retainedFromSequence = 0
  let retainedInitialModel = initialModel
  let retainedInitialCommands = initialCommands
  let transitions: ReadonlyArray<Transition<Model, Message>> = []
  let keyframes = HashMap.make([0, initialModel])
  let latestModel = initialModel

  const read = (): ProgramJournalSnapshot<Model, Message> => ({
    retainedFromSequence,
    initialModel: retainedInitialModel,
    initialCommands: retainedInitialCommands,
    transitions,
    latestModel,
  })

  const rebuildKeyframes = (): void => {
    keyframes = HashMap.make([0, retainedInitialModel])
    let replayedModel = retainedInitialModel
    pipe(
      transitions,
      Array.forEach((transition, index) => {
        replayedModel = applyMessage(replayedModel, transition.message)
        const frame = index + 1
        if (frame % options.keyframeInterval === 0) {
          keyframes = HashMap.set(keyframes, frame, replayedModel)
        }
      }),
    )
  }

  const pruneAtSettledBoundary = (): void => {
    if (Option.isNone(options.maximumTransitions)) {
      return
    }

    const minimumDropCount =
      transitions.length - options.maximumTransitions.value
    if (minimumDropCount <= 0) {
      return
    }

    const maybeBoundaryIndex = pipe(
      transitions,
      Array.findFirstIndex(
        (transition, index) =>
          index + 1 >= minimumDropCount && transition.isOperationSettled,
      ),
    )
    if (Option.isNone(maybeBoundaryIndex)) {
      return
    }

    const maybeBoundary = pipe(transitions, Array.get(maybeBoundaryIndex.value))
    if (Option.isNone(maybeBoundary)) {
      return
    }

    const boundary = maybeBoundary.value
    retainedFromSequence = boundary.sequence
    retainedInitialModel = boundary.model
    retainedInitialCommands = []
    transitions = Array.drop(transitions, maybeBoundaryIndex.value + 1)
    rebuildKeyframes()
  }

  const append = (transition: Transition<Model, Message>): void => {
    transitions = Array.append(transitions, transition)
    latestModel = transition.model
    const frame = transitions.length
    if (frame % options.keyframeInterval === 0) {
      keyframes = HashMap.set(keyframes, frame, transition.model)
    }
    pruneAtSettledBoundary()
  }

  const modelAt = (frame: number): Option.Option<Model> => {
    if (!Number.isInteger(frame) || frame < 0 || frame > transitions.length) {
      return Option.none()
    }

    const keyframe =
      Math.floor(frame / options.keyframeInterval) * options.keyframeInterval
    return pipe(
      keyframes,
      HashMap.get(keyframe),
      Option.map(keyframeModel =>
        pipe(
          transitions,
          Array.drop(keyframe),
          Array.take(frame - keyframe),
          Array.reduce(keyframeModel, (model, transition) => {
            return applyMessage(model, transition.message)
          }),
        ),
      ),
    )
  }

  return { read, append, modelAt }
}

const positiveInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return value
}

const nonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
  return value
}

/** Retains every transition in memory for the lifetime of the Program runtime. */
export const retainAllTransitions = (
  options: Readonly<{ keyframeInterval?: number }> = {},
): (<Model, Message>(
  config: ProgramJournalArchiveConfig<Model, Message>,
) => ProgramJournalArchive<Model, Message>) => {
  const keyframeInterval = positiveInteger(
    'keyframeInterval',
    options.keyframeInterval ?? DEFAULT_KEYFRAME_INTERVAL,
  )
  return <Model, Message>(
    config: ProgramJournalArchiveConfig<Model, Message>,
  ): ProgramJournalArchive<Model, Message> =>
    makeInMemoryArchive(config, {
      keyframeInterval,
      maximumTransitions: Option.none(),
    })
}

/** Retains a settled suffix of the journal in memory. */
export const retainLatestTransitions = (
  options: Readonly<{
    maximumTransitions: number
    keyframeInterval?: number
  }>,
): (<Model, Message>(
  config: ProgramJournalArchiveConfig<Model, Message>,
) => ProgramJournalArchive<Model, Message>) => {
  const keyframeInterval = positiveInteger(
    'keyframeInterval',
    options.keyframeInterval ?? DEFAULT_KEYFRAME_INTERVAL,
  )
  const maximumTransitions = nonNegativeInteger(
    'maximumTransitions',
    options.maximumTransitions,
  )
  return <Model, Message>(
    config: ProgramJournalArchiveConfig<Model, Message>,
  ): ProgramJournalArchive<Model, Message> =>
    makeInMemoryArchive(config, {
      keyframeInterval,
      maximumTransitions: Option.some(maximumTransitions),
    })
}

/** Creates the universal journal whose retained archive is configurable. */
export const makeProgramJournal = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
>({
  program,
  initialModel,
  initialCommands = [],
  archive: makeArchive = retainAllTransitions(),
  now = Date.now,
}: ProgramJournalConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
>): ProgramJournal<Model, Message> => {
  let latestModel = initialModel
  let nextSequence = 1
  let isShutdown = false
  const listeners = new Set<(transition: Transition<Model, Message>) => void>()
  const archive = makeArchive({
    initialModel,
    initialCommands,
    applyMessage: (model, message) => {
      const [nextModel] = program.update(model, message)
      return nextModel
    },
  })

  const record = (input: RecordTransitionInput<Model, Message>): void => {
    if (isShutdown) {
      return
    }
    const transition: Transition<Model, Message> = {
      sequence: nextSequence,
      message: input.message,
      ...(input.envelope === undefined ? {} : { envelope: input.envelope }),
      source: input.source,
      ...(input.operationId === undefined
        ? {}
        : { operationId: input.operationId }),
      isOperationSettled: input.isOperationSettled,
      commands: Array.map(input.commands, toCommandRecord),
      timestamp: input.timestamp ?? now(),
      isModelChanged: latestModel !== input.model,
      diff: computeDiff(latestModel, input.model),
      model: input.model,
    }
    nextSequence += 1
    latestModel = input.model
    archive.append(transition)
    listeners.forEach(listener => {
      try {
        listener(transition)
      } catch (error) {
        console.error('[foldkit] A Program journal observer threw:', error)
      }
    })
  }

  const observe = (
    listener: (transition: Transition<Model, Message>) => void,
  ): (() => void) => {
    if (isShutdown) {
      return Function.constVoid
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const shutdown = (): void => {
    isShutdown = true
    listeners.clear()
  }

  return {
    read: archive.read,
    record,
    modelAt: archive.modelAt,
    observe,
    shutdown,
  }
}

/** Constructs Host provenance for a Message. */
export const fromHost = (actionName?: string): TransitionSource =>
  HostTransitionSource.make(actionName === undefined ? {} : { actionName })

/** Constructs Command provenance for a Message. */
export const fromCommand = (name: string): TransitionSource =>
  CommandTransitionSource.make({ name })

/** Constructs Subscription provenance for a Message. */
export const fromSubscription = (name: string): TransitionSource =>
  SubscriptionTransitionSource.make({ name })

/** Constructs ManagedResource provenance for a lifecycle Message. */
export const fromManagedResource = (name: string): TransitionSource =>
  ManagedResourceTransitionSource.make({ name })

/** Constructs Mount provenance for a Message. */
export const fromMount = (name: string): TransitionSource =>
  MountTransitionSource.make({ name })

/** Constructs Port provenance for a Message. */
export const fromPort = (name: string): TransitionSource =>
  PortTransitionSource.make({ name })

/** Constructs navigation provenance for a Message. */
export const fromNavigation = (): TransitionSource =>
  NavigationTransitionSource.make({})

/** Constructs DevTools provenance for a Message. */
export const fromDevTools = (): TransitionSource =>
  DevToolsTransitionSource.make({})

/** Constructs accepted Message transport provenance. */
export const fromAcceptedMessage = (occurrenceId: string): TransitionSource =>
  AcceptedMessageTransitionSource.make({ occurrenceId })
