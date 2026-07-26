import { Crypto, Layer } from 'effect'
import { FactClient } from 'fact-core-example'
import { Runtime } from 'foldkit'
import { type ReactElement, type ReactNode } from 'react'
import {
  type ReplayDestination,
  type ReplayProgramId,
  Workbench,
} from 'replayability-core-example'
import { createReactProgramBindingsFromFlags } from 'shared-react-bindings-example'

/** Actions exposed to React consumers of the replay workbench. */
export type ReplayabilityActions = Readonly<{
  changedReplayFrame: (frame: number) => void
  clickedPlayback: () => void
  clickedSaveReplay: () => void
  clickedStepBackward: () => void
  clickedStepForward: () => void
  pressedReplayAction: (actionId: string) => void
  selectedReplayProgram: (programId: ReplayProgramId) => void
}>

const replayabilityBindings = createReactProgramBindingsFromFlags({
  createActions: (enqueueMessage): ReplayabilityActions => ({
    changedReplayFrame: frame =>
      enqueueMessage(Workbench.ChangedReplayFrame({ frame }), {
        actionName: 'changed-replay-frame',
      }),
    clickedPlayback: () =>
      enqueueMessage(Workbench.ClickedPlayback(), {
        actionName: 'clicked-playback',
      }),
    clickedSaveReplay: () =>
      enqueueMessage(Workbench.ClickedSaveReplay(), {
        actionName: 'clicked-save-replay',
      }),
    clickedStepBackward: () =>
      enqueueMessage(Workbench.ClickedStepBackward(), {
        actionName: 'clicked-step-backward',
      }),
    clickedStepForward: () =>
      enqueueMessage(Workbench.ClickedStepForward(), {
        actionName: 'clicked-step-forward',
      }),
    pressedReplayAction: actionId =>
      enqueueMessage(Workbench.PressedReplayAction({ actionId }), {
        actionName: actionId,
      }),
    selectedReplayProgram: programId =>
      enqueueMessage(Workbench.SelectedReplayProgram({ programId }), {
        actionName: `selected-${programId.toLowerCase()}`,
      }),
  }),
  makeProgram: ({
    cryptoLayer,
    destination,
    factResources,
    replayTapeStore,
  }: ReplayabilityFlags) =>
    Workbench.makeReplayWorkbench(
      destination,
      replayTapeStore,
      cryptoLayer,
      factResources,
    ),
  name: 'Replayability',
})

type ReplayabilityFlags = Readonly<{
  cryptoLayer: Layer.Layer<Crypto.Crypto>
  destination: ReplayDestination
  factResources: Layer.Layer<FactClient>
  replayTapeStore: Runtime.ReplayTapeStoreService
}>

type ReplayabilityProviderProps = Readonly<{
  children: ReactNode
  fallback?: ReactNode
  flags: ReplayabilityFlags
}>

/** Provides a replay workbench initialized by one typed destination. */
export const ReplayabilityProvider: (
  props: ReplayabilityProviderProps,
) => ReactElement | null = replayabilityBindings.Provider

/** Reads the current immutable replay workbench Model. */
export const useReplayabilityModel = replayabilityBindings.useModel

/** Returns stable, host-callable replay workbench actions. */
export const useReplayabilityActions = replayabilityBindings.useActions
