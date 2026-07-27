import { Effect, pipe } from 'effect'

import type { Ports } from '../port/port.js'
import type { Program } from '../program/program.js'
import {
  type ReplayFrameError,
  type ReplayTape,
  type UnsettledReplayFrameError,
  branchReplayTape,
  replayToFrame,
} from './replayTape.js'

export { UnsettledReplayFrameError } from './replayTape.js'

/** A renderer-free, side-effect-free replay inspection session. */
export type ReplaySession<Model, Message> = Readonly<{
  /** Identifies this handle as historical inspection with inert effects. */
  mode: 'Inspecting'
  /** Returns the currently inspected frame. Frame zero is the initial Model. */
  readFrame: () => number
  /** Returns the reconstructed Model at the currently inspected frame. */
  readModel: () => Model
  /** Reconstructs and selects one frame without executing historical effects. */
  seek: (frame: number) => Effect.Effect<Model, ReplayFrameError>
  /** Selects the previous frame when one exists. */
  stepBackward: Effect.Effect<Model, ReplayFrameError>
  /** Selects the next frame when one exists. */
  stepForward: Effect.Effect<Model, ReplayFrameError>
  /** Observes inspected frame changes and returns an unsubscribe function. */
  observe: (listener: (frame: number, model: Model) => void) => () => void
  /**
   * Returns a tape truncated at a settled frame so a new live runtime can
   * extend that exact history.
   */
  branch: (
    frame?: number,
  ) => Effect.Effect<ReplayTape<Model, Message>, UnsettledReplayFrameError>
  /** Returns the immutable source tape. */
  readTape: () => ReplayTape<Model, Message>
}>

/** Creates an inert replay session at the requested frame or at tape end. */
export const makeReplaySession = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  tape: ReplayTape<Model, Message>,
  initialFrame = tape.transitions.length,
): Effect.Effect<ReplaySession<Model, Message>, ReplayFrameError> =>
  Effect.gen(function* () {
    let currentFrame = initialFrame
    let currentModel = yield* replayToFrame(program, tape, currentFrame)
    const listeners = new Set<(frame: number, model: Model) => void>()

    const readFrame = (): number => currentFrame
    const readModel = (): Model => currentModel
    const readTape = (): ReplayTape<Model, Message> => tape

    const seek = (frame: number): Effect.Effect<Model, ReplayFrameError> =>
      pipe(
        replayToFrame(program, tape, frame),
        Effect.tap(model =>
          Effect.sync(() => {
            currentFrame = frame
            currentModel = model
            listeners.forEach(listener => listener(frame, model))
          }),
        ),
      )

    const stepBackward = Effect.suspend(() =>
      seek(Math.max(0, currentFrame - 1)),
    )
    const stepForward = Effect.suspend(() =>
      seek(Math.min(tape.transitions.length, currentFrame + 1)),
    )

    const observe = (
      listener: (frame: number, model: Model) => void,
    ): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    const branch = (
      frame = currentFrame,
    ): Effect.Effect<ReplayTape<Model, Message>, UnsettledReplayFrameError> =>
      branchReplayTape(tape, frame)

    return {
      mode: 'Inspecting',
      readFrame,
      readModel,
      seek,
      stepBackward,
      stepForward,
      observe,
      branch,
      readTape,
    }
  })
