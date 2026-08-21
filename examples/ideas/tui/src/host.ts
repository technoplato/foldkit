import {
  Array,
  Cause,
  Effect,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'
import {
  ClickedIdea,
  ClosedIdea,
  IdeasProgram,
  type Message,
  type Model,
  ideasFromCatalog,
  visibleIdeas,
} from 'ideas-core-example'

import { ideasResources } from './resources.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 72

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

/** Renders the imported Ideas Model as a terminal screen. */
export const renderIdeasScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const ideas = visibleIdeas(model)
  const source = model.source === 'Instant' ? 'Instant' : 'StaticFallback'
  const lines = [border, framed('Knophy ideas'), framed(source), framed('')]
  const numbered = Array.map(ideas, (idea, index) =>
    framed(`${index + 1}. ${idea.title}`),
  )
  const selected = Option.flatMap(model.selectedId, id =>
    Array.findFirst(ideasFromCatalog(model.catalog), idea => idea.id === id),
  )
  const detail = Option.match(selected, {
    onNone: () => [framed('Press 1-9 to open a note. Q quits.')],
    onSome: idea => [
      framed(idea.title),
      framed(idea.body.slice(0, SCREEN_INNER_WIDTH - 1)),
      framed('[C] close'),
    ],
  })
  return `${CLEAR_SCREEN}${[...lines, ...numbered, framed(''), ...detail, border].join('\n')}\n`
}

/** Maps a terminal key to an imported Ideas Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  if (key === 'c') {
    return Option.some(ClosedIdea.make({}))
  }
  const asNumber = Number.parseInt(key, 10)
  if (!Number.isInteger(asNumber) || asNumber < 1) {
    return Option.none()
  }
  const ideas = visibleIdeas(model)
  const maybeIdea = Array.get(ideas, asNumber - 1)
  return Option.map(maybeIdea, idea => ClickedIdea.make({ id: idea.id }))
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }
      const maybeMessage = messageForInput(key, runtime.readModel())
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model => terminal.display(renderIdeasScreen(model))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      }
      return runInputLoop(inputQueue, runtime, terminal)
    }),
  )

/** Runs the interactive terminal host over the imported Ideas program. */
export const runIdeasTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: IdeasProgram,
          resources: ideasResources(),
        }),
      )
      yield* runtime.initialization
      yield* terminal.display(renderIdeasScreen(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
