import { Schema as S } from 'effect'

const MovePreviousSource = S.TaggedStruct('MovePreviousSource', {})
const MoveNextSource = S.TaggedStruct('MoveNextSource', {})
const MovePreviousAction = S.TaggedStruct('MovePreviousAction', {})
const MoveNextAction = S.TaggedStruct('MoveNextAction', {})
const Activate = S.TaggedStruct('Activate', {})
const Back = S.TaggedStruct('Back', {})

/** The semantic Counter actions that OpenTUI may invoke. */
export const CountersInteractionId = S.Literals([
  'AddCounter',
  'Back',
  'CancelDeleteCounter',
  'ConfirmDeleteCounter',
  'DecrementCounter',
  'DeleteCounter',
  'DismissCounterFact',
  'IncrementCounter',
  'OpenCounter',
  'ResetCounter',
  'ShowCounterFact',
])
/** The semantic Counter actions that OpenTUI may invoke. */
export type CountersInteractionId = typeof CountersInteractionId.Type

const Invoke = S.TaggedStruct('Invoke', {
  interactionId: CountersInteractionId,
})
const ReplayPrevious = S.TaggedStruct('ReplayPrevious', {})
const ReplayNext = S.TaggedStruct('ReplayNext', {})
const Inspect = S.TaggedStruct('Inspect', {})
const Quit = S.TaggedStruct('Quit', {})
const Ignored = S.TaggedStruct('Ignored', {})

/** A normalized Client-local input that never enters the Program journal. */
export const LocalInput = S.Union([
  MovePreviousSource,
  MoveNextSource,
  MovePreviousAction,
  MoveNextAction,
  Activate,
  Back,
  Invoke,
  ReplayPrevious,
  ReplayNext,
  Inspect,
  Quit,
  Ignored,
])
/** A normalized Client-local input that never enters the Program journal. */
export type LocalInput = typeof LocalInput.Type

/** The local context that determines the meaning of spatial input. */
export const LocalInputContext = S.Literals([
  'Browse',
  'Confirmation',
  'Editing',
])
/** The local context that determines the meaning of spatial input. */
export type LocalInputContext = typeof LocalInputContext.Type

/** Normalizes one raw key without constructing a Program Message. */
export const normalizeInput = (
  keyName: string,
  context: LocalInputContext,
): LocalInput => {
  const key = keyName.toLowerCase()
  if (context === 'Editing') {
    return key === 'escape' ? Back.make({}) : Ignored.make({})
  }
  if (key === 'q') {
    return Quit.make({})
  }
  if (key === '[') {
    return ReplayPrevious.make({})
  }
  if (key === ']') {
    return ReplayNext.make({})
  }
  if (key === 'i') {
    return Inspect.make({})
  }
  if (key === 'escape') {
    return Back.make({})
  }
  if (key === 'enter' || key === 'return') {
    return Activate.make({})
  }
  if (context === 'Confirmation') {
    if (key === 'left' || key === 'h' || key === 'up' || key === 'k') {
      return MovePreviousAction.make({})
    }
    if (key === 'right' || key === 'l' || key === 'down' || key === 'j') {
      return MoveNextAction.make({})
    }
  } else {
    if (key === 'up' || key === 'k') {
      return MovePreviousSource.make({})
    }
    if (key === 'down' || key === 'j') {
      return MoveNextSource.make({})
    }
  }
  if (key === '+') {
    return Invoke.make({ interactionId: 'IncrementCounter' })
  }
  if (key === '-') {
    return Invoke.make({ interactionId: 'DecrementCounter' })
  }
  if (key === 'd' || key === 'x') {
    return Invoke.make({ interactionId: 'DeleteCounter' })
  }
  if (key === 'a') {
    return Invoke.make({ interactionId: 'AddCounter' })
  }
  if (key === 'r') {
    return Invoke.make({ interactionId: 'ResetCounter' })
  }
  if (key === 'f') {
    return Invoke.make({ interactionId: 'ShowCounterFact' })
  }
  return Ignored.make({})
}
