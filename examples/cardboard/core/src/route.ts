import { Array, Effect, Option, String as String_ } from 'effect'
import * as Program from 'foldkit/program'

import { type Message } from './message.js'
import {
  Model,
  SequencePage,
  initialConversationLedgerModel,
  initialModel,
} from './model.js'
import { CardboardProgram } from './program.js'

const programRouter = Program.makeRouter(CardboardProgram)

/** The canonical portable route for Cardboard at value four. */
export const ruleZeroPortableRoute = '/0'
/** The canonical portable route for Cardboard's supplementary material. */
export const extraPortableRoute = '/0/extra'

const isConstitutionRoot = (relativeRoute: string): boolean =>
  relativeRoute === ruleZeroPortableRoute || relativeRoute === '/0/'

const isConversationLedgerRoot = (relativeRoute: string): boolean =>
  relativeRoute === extraPortableRoute ||
  relativeRoute === '/0/extra/' ||
  relativeRoute === '/0/log' ||
  relativeRoute === '/0/log/'

const sequenceValueForRoute = (
  relativeRoute: string,
): Option.Option<bigint> => {
  const maybeMatch = String_.match(/^\/0\/([5-9]|[1-9][0-9]+)\/?$/u)(
    relativeRoute,
  )
  if (Option.isNone(maybeMatch)) {
    return Option.none()
  }
  const maybeValue = Array.get(maybeMatch.value, 1)
  if (Option.isNone(maybeValue)) {
    return Option.none()
  }
  return Option.some(BigInt(maybeValue.value))
}

/** Prints one sequence value as its canonical portable Cardboard route. */
export const sequencePortableRoute = (value: bigint): string =>
  value === 4n ? ruleZeroPortableRoute : `/0/${value.toString()}`

const isInitialStateRoute = (
  route: Program.ProgramRoute<Model, Message>,
): boolean =>
  route._tag === 'State' &&
  route.model.page._tag === 'SequencePage' &&
  route.model.page.value === 4n &&
  route.model.zero._tag === 'WaitingAtZero' &&
  route.model.keyboardInput.spacePressCount === 0 &&
  route.model.keyboardInput.lowercaseGPressCount === 0

const isConversationLedgerStateRoute = (
  route: Program.ProgramRoute<Model, Message>,
): boolean =>
  route._tag === 'State' &&
  route.model.page._tag === 'ConversationLedgerPage' &&
  route.model.zero._tag === 'WaitingAtZero' &&
  route.model.keyboardInput.spacePressCount === 0 &&
  route.model.keyboardInput.lowercaseGPressCount === 0

/** The shared parser-printer for `/0`, Cardboard state, and Cardboard replay routes. */
export const CardboardRouter: Program.ProgramRouter<Model, Message> = {
  Route: programRouter.Route,
  parse: relativeRoute => {
    const maybeSequenceValue = sequenceValueForRoute(relativeRoute)
    if (Option.isSome(maybeSequenceValue)) {
      return Effect.succeed(
        Program.state(
          Model.make({
            ...initialModel,
            page: SequencePage({ value: maybeSequenceValue.value }),
          }),
        ),
      )
    } else if (isConversationLedgerRoot(relativeRoute)) {
      return Effect.succeed(Program.state(initialConversationLedgerModel))
    } else if (isConstitutionRoot(relativeRoute)) {
      return Effect.succeed(Program.state(initialModel))
    } else {
      return programRouter.parse(relativeRoute)
    }
  },
  print: route => {
    if (route._tag === 'State' && route.model.page._tag === 'SequencePage') {
      return Effect.succeed(sequencePortableRoute(route.model.page.value))
    } else if (isConversationLedgerStateRoute(route)) {
      return Effect.succeed(extraPortableRoute)
    } else if (isInitialStateRoute(route)) {
      return Effect.succeed(ruleZeroPortableRoute)
    } else {
      return programRouter.print(route)
    }
  },
  canonicalize: relativeRoute => {
    const maybeSequenceValue = sequenceValueForRoute(relativeRoute)
    if (Option.isSome(maybeSequenceValue)) {
      return Effect.succeed(sequencePortableRoute(maybeSequenceValue.value))
    } else if (isConversationLedgerRoot(relativeRoute)) {
      return Effect.succeed(extraPortableRoute)
    } else if (isConstitutionRoot(relativeRoute)) {
      return Effect.succeed(ruleZeroPortableRoute)
    } else {
      return programRouter.canonicalize(relativeRoute)
    }
  },
}

/** The canonical fresh Cardboard route. */
export const initialCardboardRoute: Program.ResolvedProgramRoute<
  Model,
  Message
> = Program.state(initialModel)

/** The canonical append-only conversation-ledger route. */
export const conversationLedgerRoute: Program.ResolvedProgramRoute<
  Model,
  Message
> = Program.state(initialConversationLedgerModel)
