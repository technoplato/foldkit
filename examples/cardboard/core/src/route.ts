import { Effect } from 'effect'
import * as Program from 'foldkit/program'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'
import { CardboardProgram } from './program.js'

const programRouter = Program.makeRouter(CardboardProgram)

const isConstitutionRoot = (relativeRoute: string): boolean =>
  relativeRoute === '/0' || relativeRoute === '/0/'

const isInitialStateRoute = (
  route: Program.ProgramRoute<Model, Message>,
): boolean =>
  route._tag === 'State' &&
  route.model.zero._tag === 'WaitingAtZero' &&
  route.model.keyboardInput.spacePressCount === 0 &&
  route.model.keyboardInput.lowercaseGPressCount === 0

/** The shared parser-printer for `/0`, Cardboard state, and Cardboard replay routes. */
export const CardboardRouter: Program.ProgramRouter<Model, Message> = {
  Route: programRouter.Route,
  parse: relativeRoute =>
    isConstitutionRoot(relativeRoute)
      ? Effect.succeed(Program.state(initialModel))
      : programRouter.parse(relativeRoute),
  print: route =>
    isInitialStateRoute(route)
      ? Effect.succeed('/0')
      : programRouter.print(route),
  canonicalize: relativeRoute =>
    isConstitutionRoot(relativeRoute)
      ? Effect.succeed('/0')
      : programRouter.canonicalize(relativeRoute),
}

/** The canonical fresh Cardboard route. */
export const initialCardboardRoute: Program.ResolvedProgramRoute<
  Model,
  Message
> = Program.state(initialModel)
