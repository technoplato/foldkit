import { Match as M, Option, Schema as S } from 'effect'

import {
  CounterDetailTarget,
  CounterFactTarget,
  DeleteCounterTarget,
} from './message.js'
import { type CounterDetailMode, CounterId, type Navigation } from './model.js'
import { navigationTargetToPath } from './route.js'

// INSTRUCTIONS

/** Pushes one counter detail onto the stack. */
export const PushCounterDetail = S.TaggedStruct('PushCounterDetail', {
  counterId: CounterId,
})
/** Pops the visible counter detail back to the list. */
export const PopCounterDetail = S.TaggedStruct('PopCounterDetail', {})
/** Presents the counter-fact alert over its detail. */
export const PresentCounterFactAlert = S.TaggedStruct(
  'PresentCounterFactAlert',
  { counterId: CounterId },
)
/** Dismisses the counter-fact alert. */
export const DismissCounterFactAlert = S.TaggedStruct(
  'DismissCounterFactAlert',
  {},
)
/** Presents the delete confirmation over its detail. */
export const PresentDeleteConfirmation = S.TaggedStruct(
  'PresentDeleteConfirmation',
  { counterId: CounterId },
)
/** Dismisses the delete confirmation. */
export const DismissDeleteConfirmation = S.TaggedStruct(
  'DismissDeleteConfirmation',
  {},
)

/** Every platform-neutral screen transition the Program can request. */
export const NavInstruction = S.Union([
  PushCounterDetail,
  PopCounterDetail,
  PresentCounterFactAlert,
  DismissCounterFactAlert,
  PresentDeleteConfirmation,
  DismissDeleteConfirmation,
])
/** Every platform-neutral screen transition the Program can request. */
export type NavInstruction = typeof NavInstruction.Type

// DIFF

const presentInstructionOf = (
  counterId: CounterId,
  mode: CounterDetailMode,
): NavInstruction =>
  M.value(mode).pipe(
    M.withReturnType<NavInstruction>(),
    M.tagsExhaustive({
      CounterFactAlert: () => PresentCounterFactAlert.make({ counterId }),
      DeleteCounterConfirmation: () =>
        PresentDeleteConfirmation.make({ counterId }),
    }),
  )

const dismissInstructionOf = (mode: CounterDetailMode): NavInstruction =>
  M.value(mode).pipe(
    M.withReturnType<NavInstruction>(),
    M.tagsExhaustive({
      CounterFactAlert: () => DismissCounterFactAlert.make({}),
      DeleteCounterConfirmation: () => DismissDeleteConfirmation.make({}),
    }),
  )

const presentedOnPush = (
  counterId: CounterId,
  maybeMode: Option.Option<CounterDetailMode>,
): ReadonlyArray<NavInstruction> =>
  Option.match(maybeMode, {
    onNone: () => [],
    onSome: mode => [presentInstructionOf(counterId, mode)],
  })

const modeTransitions = (
  counterId: CounterId,
  previousMode: Option.Option<CounterDetailMode>,
  nextMode: Option.Option<CounterDetailMode>,
): ReadonlyArray<NavInstruction> =>
  Option.match(previousMode, {
    onNone: () =>
      Option.match(nextMode, {
        onNone: () => [],
        onSome: mode => [presentInstructionOf(counterId, mode)],
      }),
    onSome: previousValue =>
      Option.match(nextMode, {
        onNone: () => [dismissInstructionOf(previousValue)],
        onSome: nextValue =>
          previousValue._tag === nextValue._tag
            ? []
            : [
                dismissInstructionOf(previousValue),
                presentInstructionOf(counterId, nextValue),
              ],
      }),
  })

/**
 * Projects one Navigation transition into ordered platform-neutral
 * instructions for a router adapter to apply. Same state yields none.
 * Detail-to-detail across ids pops then pushes; adapters may collapse
 * that pair onto a native replace.
 */
export const navigatorInstructions = (
  previous: Navigation,
  next: Navigation,
): ReadonlyArray<NavInstruction> => {
  if (next._tag === 'CounterList') {
    if (previous._tag === 'CounterList') {
      return []
    }
    return [
      ...Option.match(previous.maybeMode, {
        onNone: () => [] as ReadonlyArray<NavInstruction>,
        onSome: mode => [dismissInstructionOf(mode)],
      }),
      PopCounterDetail.make({}),
    ]
  }
  if (previous._tag === 'CounterList') {
    return [
      PushCounterDetail.make({ counterId: next.counterId }),
      ...presentedOnPush(next.counterId, next.maybeMode),
    ]
  }
  if (previous.counterId !== next.counterId) {
    return [
      PopCounterDetail.make({}),
      PushCounterDetail.make({ counterId: next.counterId }),
      ...presentedOnPush(next.counterId, next.maybeMode),
    ]
  }
  return modeTransitions(next.counterId, previous.maybeMode, next.maybeMode)
}

// NAVIGATOR

/**
 * The four native operations every router adapter implements. Adapters
 * never decide when to navigate; they only translate these calls.
 */
export interface Navigator {
  readonly push: (path: string) => void
  readonly pop: () => void
  readonly present: (path: string) => void
  readonly dismiss: () => void
}

const instructionPath = (instruction: NavInstruction): string =>
  M.value(instruction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PushCounterDetail: ({ counterId }) =>
        navigationTargetToPath(CounterDetailTarget.make({ counterId })),
      PresentCounterFactAlert: ({ counterId }) =>
        navigationTargetToPath(CounterFactTarget.make({ counterId })),
      PresentDeleteConfirmation: ({ counterId }) =>
        navigationTargetToPath(DeleteCounterTarget.make({ counterId })),
      PopCounterDetail: () => '',
      DismissCounterFactAlert: () => '',
      DismissDeleteConfirmation: () => '',
    }),
  )

/**
 * Applies projected instructions to any Navigator in order. Paths print
 * from the same routers the carrier parses, so pushes and deep links
 * cannot disagree.
 */
export const applyNavigatorInstructions = (
  navigator: Navigator,
  instructions: ReadonlyArray<NavInstruction>,
): void => {
  for (const instruction of instructions) {
    M.value(instruction).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        PushCounterDetail: () => navigator.push(instructionPath(instruction)),
        PopCounterDetail: () => navigator.pop(),
        PresentCounterFactAlert: () =>
          navigator.present(instructionPath(instruction)),
        DismissCounterFactAlert: () => navigator.dismiss(),
        PresentDeleteConfirmation: () =>
          navigator.present(instructionPath(instruction)),
        DismissDeleteConfirmation: () => navigator.dismiss(),
      }),
    )
  }
}
