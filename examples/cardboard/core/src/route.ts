import { Effect } from 'effect'
import * as Program from 'foldkit/program'

import { type Message } from './message.js'
import {
  type Model,
  initialConversationLedgerModel,
  initialModel,
} from './model.js'
import { CardboardProgram } from './program.js'

const programRouter = Program.makeRouter(CardboardProgram)

const isConstitutionRoot = (relativeRoute: string): boolean =>
  relativeRoute === '/0' || relativeRoute === '/0/'

const isConversationLedgerRoot = (relativeRoute: string): boolean =>
  relativeRoute === '/0/0' || relativeRoute === '/0/0/'

const isInitialStateRoute = (
  route: Program.ProgramRoute<Model, Message>,
): boolean =>
  route._tag === 'State' &&
  route.model.page._tag === 'RuleZeroPage' &&
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
    if (isConversationLedgerRoot(relativeRoute)) {
      return Effect.succeed(Program.state(initialConversationLedgerModel))
    } else if (isConstitutionRoot(relativeRoute)) {
      return Effect.succeed(Program.state(initialModel))
    } else {
      return programRouter.parse(relativeRoute)
    }
  },
  print: route => {
    if (isConversationLedgerStateRoute(route)) {
      return Effect.succeed('/0/0')
    } else if (isInitialStateRoute(route)) {
      return Effect.succeed('/0')
    } else {
      return programRouter.print(route)
    }
  },
  canonicalize: relativeRoute => {
    if (isConversationLedgerRoot(relativeRoute)) {
      return Effect.succeed('/0/0')
    } else if (isConstitutionRoot(relativeRoute)) {
      return Effect.succeed('/0')
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
