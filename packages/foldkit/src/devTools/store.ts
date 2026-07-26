import { Array, Effect, Option, SubscriptionRef } from 'effect'

import type { DiffResult } from '../runtime/diff.js'
import type { TransitionSource } from '../runtime/programJournal.js'
import type {
  RuntimeDiagnostic,
  RuntimeFailure,
} from '../runtime/runtimeDiagnostic.js'

export const INIT_INDEX = -1

export { computeDiff, emptyDiff } from '../runtime/diff.js'
export type { DiffResult }

export type CommandRecord = Readonly<{
  name: string
  args?: Record<string, unknown>
}>

export type MountRecord = Readonly<{
  name: string
  args?: Record<string, unknown>
}>

export type HistoryEntry = Readonly<{
  tag: string
  message: unknown
  maybeSource: Option.Option<TransitionSource>
  commands: ReadonlyArray<CommandRecord>
  mountStarts: ReadonlyArray<MountRecord>
  mountEnds: ReadonlyArray<MountRecord>
  timestamp: number
  isModelChanged: boolean
  diff: DiffResult
}>

export type StoreState = Readonly<{
  entries: ReadonlyArray<HistoryEntry>
  maybeInitModel: Option.Option<unknown>
  initCommands: ReadonlyArray<CommandRecord>
  initMountStarts: ReadonlyArray<MountRecord>
  startIndex: number
  isPaused: boolean
  pausedAtIndex: number
  maybeLatestModel: Option.Option<unknown>
}>

/** Rendering operations supplied by a DevTools client presentation. */
export type DevToolsRenderBridge = Readonly<{
  render: (model: unknown) => Effect.Effect<void>
  markRenderPending: Effect.Effect<void>
}>

/**
 * The absolute index of the most recently presented entry, or `INIT_INDEX`
 * when no Messages are presented.
 */
export const latestEntryIndex = (state: StoreState): number =>
  Array.match(state.entries, {
    onEmpty: () => INIT_INDEX,
    onNonEmpty: entries => state.startIndex + entries.length - 1,
  })

/** A DevTools presentation backed by the authoritative Program journal. */
export type DevToolsStore = Readonly<{
  attachRenderedMounts: (
    mountStarts: ReadonlyArray<MountRecord>,
    mountEnds: ReadonlyArray<MountRecord>,
  ) => Effect.Effect<void>
  getModelAtIndex: (index: number) => Effect.Effect<unknown>
  getMessageAtIndex: (index: number) => Effect.Effect<Option.Option<unknown>>
  getDiffAtIndex: (index: number) => Effect.Effect<DiffResult>
  getRuntimeDiagnostics: Effect.Effect<ReadonlyArray<RuntimeDiagnostic>>
  getRuntimeFailures: Effect.Effect<ReadonlyArray<RuntimeFailure<unknown>>>
  getReplayIndices: Effect.Effect<ReadonlyArray<number>>
  jumpTo: (index: number) => Effect.Effect<unknown>
  resume: Effect.Effect<void>
  clear: Effect.Effect<void>
  stateRef: SubscriptionRef.SubscriptionRef<StoreState>
}>
