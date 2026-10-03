import {
  Context,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  Stream,
} from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../navigation/declaration.js'
import { NavigationStack, stackAtRoot } from '../navigation/structure.js'
import * as Route from '../route/parser.js'
import { startHandle } from '../runtime/handle.js'
import { Memory } from '../runtime/syncEngine.js'
import { m, ts } from '../schema/index.js'
import * as Session from '../session/session.js'
import * as Subscription from '../subscription/subscription.js'
import { compose as composeProgram } from './compose.js'
import { make } from './program.js'

class Ticks extends Context.Service<
  Ticks,
  Readonly<{ ticks: Stream.Stream<number> }>
>()('test/Ticks') {}

const ticksOf = (count: number) =>
  Layer.succeed(Ticks, { ticks: Stream.range(1, count) })

const ClockModel = S.Struct({
  ticked: S.Number,
  clock: S.Literals(['Stopped', 'Running']),
})
type ClockModel = typeof ClockModel.Type

const Start = Catalog.action('Start', {
  what: 'Starts the clock',
  why: 'The person wants it to tick',
  meta: { label: 'Start', keys: ['t'] },
})
const catalog = Catalog.make([Start])

const Ticked = m('Ticked', { tick: S.Number })
const ClockMessage = S.Union([...catalog.Message.members, Ticked])
type ClockMessage = typeof ClockMessage.Type

const Clock = ts('Clock')

const subscriptions = Subscription.make<ClockModel, ClockMessage, Ticks>()(
  entry => ({
    ticks: entry(
      { isRunning: S.Boolean },
      {
        modelToDependencies: model => ({
          isRunning: model.clock === 'Running',
        }),
        dependenciesToStream: ({ isRunning }) =>
          isRunning
            ? Stream.unwrap(
                Effect.gen(function* () {
                  const { ticks } = yield* Ticks
                  return Stream.map(ticks, tick => Ticked({ tick }))
                }),
              )
            : Stream.empty,
      },
    ),
  }),
)

const ClockProgram = make({
  id: 'lifted-clock',
  version: 1,
  Model: ClockModel,
  Message: ClockMessage,
  init: () => [ClockModel.make({ ticked: 0, clock: 'Stopped' }), []],
  update: (model: ClockModel, message: ClockMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [ClockModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Start: () => [{ ...model, clock: 'Running' }, []],
        Ticked: ({ tick }) => [{ ...model, ticked: tick }, []],
      }),
    ),
  catalog,
  subscriptions,
  navigation: Declaration.screens({
    slug: 'clock',
    root: Declaration.rootScreen(Clock, Route.here),
  }),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

const App = ActionMenu.compose({ of: Session.compose({ of: ClockProgram }) })

const AppDestination = S.Union([
  Clock,
  Session.SessionSettings,
  Declaration.NotFound,
  ActionMenu.ActionMenu,
])

const AppModel = S.Struct({
  ticked: S.Number,
  clock: S.Literals(['Stopped', 'Running']),
  session: Session.SessionState,
  navigation: NavigationStack(AppDestination),
})

const Synced = composeProgram.sync({
  of: App,
  snapshot: S.Struct({ id: S.String }).pipe(
    S.decodeTo(
      AppModel,
      SchemaTransformation.transform({
        decode: (): typeof AppModel.Encoded => ({
          ticked: 0,
          clock: 'Stopped',
          session: { mode: 'Mirror', generation: 0 },
          navigation: stackAtRoot(Clock()),
        }),
        encode: () => ({ id: 'clock' }),
      }),
    ),
  ),
  message: S.Struct({ body: S.String }).pipe(
    S.decodeTo(
      S.fromJsonString(App.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ body }),
      }),
    ),
  ),
})

const pollMs = 10
const pollAttempts = 100

const eventually = async (
  isDone: () => boolean,
  attemptsLeft = pollAttempts,
): Promise<void> => {
  if (isDone()) {
    return
  } else if (attemptsLeft === 0) {
    throw new Error('never happened')
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    return eventually(isDone, attemptsLeft - 1)
  }
}

const handles: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

describe('liftEffects', () => {
  it('keeps a child Subscription inside Session, ActionMenu, and sync', () => {
    expect(Object.keys(App.subscriptions ?? {})).toEqual(['ticks'])
    expect(Object.keys(Synced.subscriptions ?? {})).toEqual(['ticks'])
  })

  it('runs it with the resources the handle provides', async () => {
    const handle = startHandle({
      program: Synced,
      sync: Memory({ processor: 'lifted-clock-test' }),
      resources: ticksOf(3),
    })
    handles.push(handle)
    const readyModel = () => {
      const model = handle.readModel()
      return model._tag === 'Ready' ? Option.some(model) : Option.none()
    }
    await eventually(() => Option.isSome(readyModel()))
    handle.send(Start())
    await eventually(() =>
      Option.exists(readyModel(), model => model.ticked === 3),
    )
    const model = Option.getOrThrow(readyModel())
    expect([model.clock, model.ticked]).toEqual(['Running', 3])
  })
})
