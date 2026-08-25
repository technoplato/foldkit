import {
  type CounterFactClient,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  StaticCounterFactClient,
  activatedInteraction,
  interactionIdentitySourceForOccurrence,
  navigationToPath,
} from 'counters-core-example'
import { Array, Effect, Option, Result } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { Runtime } from 'foldkit'
import { onUpdate } from 'foldkit/program'

// PLAIN HTML SURFACE
//
// The strongest proof of view-agnosticism: no framework, no router, no
// renderer library. One Program boots into a local runtime; the page
// projects the interaction graph into plain DOM and resolves clicked
// tokens through the graph exactly like the CLI host does. Attribution
// derives from this checkout's own git remote via a vite define —
// never hardcoded.

declare const __GITHUB_SOURCE_URL__: string

const sourceUrl = (): string =>
  typeof __GITHUB_SOURCE_URL__ === 'string' ? __GITHUB_SOURCE_URL__ : ''

const bannerText = (): string => {
  const url = sourceUrl()
  return url === ''
    ? 'FOLDKIT COUNTERS — PLAIN HTML'
    : `FOLDKIT COUNTERS — PLAIN HTML · Source: ${url}`
}

const occurrenceId =
  InteractionGraph.InteractionOccurrenceId.make('plain-html-1')

type CountersAction = InteractionGraph.InteractionAction<Interaction>

const actionsForModel = (
  model: Model,
): Result.Result<ReadonlyArray<CountersAction>, unknown> =>
  Result.map(
    MultipleCountersInteractionGraph.project(model),
    projection =>
      Array.filter(
        InteractionGraph.interactiveNodes(projection.root),
        (node): node is CountersAction => node._tag === 'InteractionAction',
      ),
  )

const resolveToken = (model: Model, token: string): Message | undefined => {
  const projected = actionsForModel(model)
  if (Result.isFailure(projected)) {
    return undefined
  }
  const maybeAction = Array.findFirst(
    projected.success,
    action => action.descriptor.token === token,
  )
  if (Option.isNone(maybeAction)) {
    return undefined
  }
  const resolved = MultipleCountersInteractionGraph.resolveWithContext(
    model,
    activatedInteraction(maybeAction.value.reference, occurrenceId),
    interactionIdentitySourceForOccurrence(occurrenceId),
  )
  return Result.isSuccess(resolved) ? resolved.success : undefined
}

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

let send: ((message: Message) => void) | undefined = undefined

const render = (model: Model): void => {
  root.replaceChildren()

  const banner = document.createElement('p')
  banner.textContent = bannerText()
  banner.style.cssText = 'color:#fbbf24;font-weight:600'
  root.append(banner)

  const path = document.createElement('p')
  path.textContent = `Carrier: ${navigationToPath(model.navigation)}`
  path.style.color = '#a8a29e'
  root.append(path)

  const list = document.createElement('section')
  for (const row of model.rows) {
    const card = document.createElement('article')
    card.textContent = `${row.id}: ${row.child.count.toString()}`
    list.append(card)
  }
  root.append(list)

  const actions = document.createElement('section')
  const projected = actionsForModel(model)
  if (Result.isSuccess(projected)) {
    for (const action of projected.success) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = action.descriptor.token
      button.onclick = () => {
        const message = resolveToken(model, action.descriptor.token)
        if (message !== undefined && send !== undefined) {
          send(message)
        }
      }
      actions.append(button)
    }
  }
  root.append(actions)
}

/**
 * Host adoption of the framework decorator vocabulary: every transition
 * is observed (and could be filtered, tagged, or logged) without touching
 * the Program's own update or its wire contract.
 */
const decorated = onUpdate<Model, Message, CounterFactClient>(({ message, nextModel }) => {
  console.info(
    `[plain-html] ${message._tag} -> ${navigationToPath(nextModel.navigation)}`,
  )
})(MultipleCountersProgram)

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.makeProgramRuntime({
    program: decorated,
    resources: StaticCounterFactClient,
  })
  yield* runtime.initialization
  let current = runtime.readModel()
  const paint = (): void => {
    current = runtime.readModel()
    root.replaceChildren()
    render(current)
  }
  paint()
  runtime.observeModel(() => paint())
  send = message => {
    runtime.send(message)
    current = runtime.readModel()
    render(current)
  }
})

void Effect.runPromise(Effect.scoped(program)).catch(error =>
  console.error('Plain HTML Counters failed to start', error),
)
