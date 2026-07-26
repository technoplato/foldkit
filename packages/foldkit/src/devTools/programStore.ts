import {
  Array,
  Effect,
  Option,
  Queue,
  Scope,
  Stream,
  SubscriptionRef,
  pipe,
} from 'effect'

import type { Ports } from '../port/port.js'
import type { Transition } from '../runtime/programJournal.js'
import type { ProgramRuntime } from '../runtime/programRuntime.js'
import type { RuntimeFailure } from '../runtime/runtimeDiagnostic.js'
import { evo } from '../struct/index.js'
import {
  type DevToolsRenderBridge,
  type DevToolsStore,
  type HistoryEntry,
  INIT_INDEX,
  type MountRecord,
  type StoreState,
  emptyDiff,
} from './store.js'

const DEFAULT_MAX_ENTRIES = 100

/** Configuration for a DevTools presentation backed by Program history. */
export type ProgramDevToolsStoreConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  P extends Ports | undefined = undefined,
> = Readonly<{
  runtime: ProgramRuntime<Model, Message, P>
  bridge: DevToolsRenderBridge
  excludeFromHistory?: ReadonlyArray<string>
  maxEntries?: number
  initialMountStarts?: ReadonlyArray<MountRecord>
}>

type Mounts = Readonly<{
  starts: ReadonlyArray<MountRecord>
  ends: ReadonlyArray<MountRecord>
}>

/** Creates a DevTools store that presents the Program runtime's authoritative journal. */
export const createProgramDevToolsStore = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  P extends Ports | undefined = undefined,
>({
  runtime,
  bridge,
  excludeFromHistory = [],
  maxEntries = DEFAULT_MAX_ENTRIES,
  initialMountStarts = [],
}: ProgramDevToolsStoreConfig<Model, Message, P>): Effect.Effect<
  DevToolsStore,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const excludedTags = new Set(excludeFromHistory)
    const mountsBySequence = new Map<number, Mounts>()
    const stateRef = yield* SubscriptionRef.make<StoreState>({
      entries: [],
      maybeInitModel: Option.none(),
      initCommands: [],
      initMountStarts: initialMountStarts,
      startIndex: 0,
      isPaused: false,
      pausedAtIndex: 0,
      maybeLatestModel: Option.none(),
    })
    let hiddenThroughSequence = 0

    const visibleTransitions = (): ReadonlyArray<Transition<Model, Message>> =>
      pipe(
        runtime.journal.read().transitions,
        Array.filter(
          transition =>
            transition.sequence > hiddenThroughSequence &&
            !excludedTags.has(transition.message._tag),
        ),
      )

    const toEntry = (transition: Transition<Model, Message>): HistoryEntry => {
      const mounts = mountsBySequence.get(transition.sequence) ?? {
        starts: [],
        ends: [],
      }
      return {
        tag: transition.message._tag,
        message: transition.message,
        maybeSource: Option.some(transition.source),
        commands: transition.commands,
        mountStarts: mounts.starts,
        mountEnds: mounts.ends,
        timestamp: transition.timestamp,
        isModelChanged: transition.isModelChanged,
        diff: transition.diff,
      }
    }

    const refresh = SubscriptionRef.update(stateRef, previousState => {
      const journal = runtime.journal.read()
      const transitions = visibleTransitions()
      const retainedTransitions = Array.takeRight(transitions, maxEntries)
      const nextStartIndex = transitions.length - retainedTransitions.length
      const isPausedAtRetainedIndex =
        previousState.pausedAtIndex === INIT_INDEX ||
        previousState.pausedAtIndex >= nextStartIndex
      return {
        entries: Array.map(retainedTransitions, toEntry),
        maybeInitModel: Option.some(journal.initialModel),
        initCommands: journal.initialCommands,
        initMountStarts: previousState.initMountStarts,
        startIndex: nextStartIndex,
        isPaused: previousState.isPaused && isPausedAtRetainedIndex,
        pausedAtIndex: previousState.pausedAtIndex,
        maybeLatestModel: Option.some(journal.latestModel),
      }
    })

    const transitionQueue = yield* Queue.unbounded<Transition<Model, Message>>()
    const stopObservingJournal = runtime.journal.observe(transition => {
      Queue.offerUnsafe(transitionQueue, transition)
    })
    yield* Effect.addFinalizer(() => Effect.sync(stopObservingJournal))
    yield* refresh
    yield* Stream.fromQueue(transitionQueue).pipe(
      Stream.runForEach(() => refresh),
      Effect.forkScoped,
    )

    const resolveTransition = (index: number): Transition<Model, Message> => {
      const transitions = visibleTransitions()
      return pipe(transitions, Array.get(index), Option.getOrThrow)
    }

    const getModelAtIndex = (index: number): Effect.Effect<unknown> =>
      Effect.sync(() => {
        if (index === INIT_INDEX) {
          return runtime.journal.read().initialModel
        }
        const transitions = visibleTransitions()
        const transition = pipe(
          transitions,
          Array.get(index),
          Option.getOrThrow,
        )
        const isLatestVisible = index === transitions.length - 1
        return isLatestVisible
          ? runtime.journal.read().latestModel
          : transition.model
      })

    const getMessageAtIndex = (
      index: number,
    ): Effect.Effect<Option.Option<unknown>> =>
      Effect.sync(() =>
        index === INIT_INDEX
          ? Option.none()
          : Option.some(resolveTransition(index).message),
      )

    const getDiffAtIndex = (index: number) =>
      Effect.sync(() =>
        index === INIT_INDEX ? emptyDiff : resolveTransition(index).diff,
      )

    const jumpTo = (index: number) =>
      Effect.gen(function* () {
        const model = yield* getModelAtIndex(index)
        yield* bridge.render(model)
        yield* SubscriptionRef.update(stateRef, state =>
          evo(state, {
            isPaused: () => true,
            pausedAtIndex: () => index,
          }),
        )
        return model
      })

    const resume = Effect.gen(function* () {
      yield* SubscriptionRef.update(stateRef, state =>
        evo(state, { isPaused: () => false }),
      )
      yield* bridge.markRenderPending
    })

    const clear = Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(stateRef)
      if (!state.isPaused) {
        const maybeLastTransition = Array.last(
          runtime.journal.read().transitions,
        )
        hiddenThroughSequence = Option.match(maybeLastTransition, {
          onNone: () => 0,
          onSome: transition => transition.sequence,
        })
        yield* refresh
      }
    })

    const attachRenderedMounts = (
      mountStarts: ReadonlyArray<MountRecord>,
      mountEnds: ReadonlyArray<MountRecord>,
    ) =>
      Effect.gen(function* () {
        if (
          Array.isReadonlyArrayEmpty(mountStarts) &&
          Array.isReadonlyArrayEmpty(mountEnds)
        ) {
          return
        }
        const maybeLastTransition = Array.last(visibleTransitions())
        if (Option.isNone(maybeLastTransition)) {
          yield* SubscriptionRef.update(stateRef, state =>
            evo(state, {
              initMountStarts: Array.appendAll(mountStarts),
            }),
          )
          return
        }
        const sequence = maybeLastTransition.value.sequence
        const current = mountsBySequence.get(sequence) ?? {
          starts: [],
          ends: [],
        }
        mountsBySequence.set(sequence, {
          starts: Array.appendAll(current.starts, mountStarts),
          ends: Array.appendAll(current.ends, mountEnds),
        })
        yield* refresh
      })

    const getReplayIndices = pipe(
      stateRef,
      SubscriptionRef.get,
      Effect.map(state => {
        const entryIndices = Array.map(
          state.entries,
          (_, index) => state.startIndex + index,
        )
        return Option.isSome(state.maybeInitModel)
          ? Array.prepend(entryIndices, INIT_INDEX)
          : entryIndices
      }),
    )

    const getRuntimeDiagnostics = Effect.sync(runtime.readDiagnostics)
    const getRuntimeFailures = Effect.sync(
      (): ReadonlyArray<RuntimeFailure<unknown>> => runtime.readFailures(),
    )

    return {
      attachRenderedMounts,
      getModelAtIndex,
      getMessageAtIndex,
      getDiffAtIndex,
      getRuntimeDiagnostics,
      getRuntimeFailures,
      getReplayIndices,
      jumpTo,
      resume,
      clear,
      stateRef,
    }
  })
