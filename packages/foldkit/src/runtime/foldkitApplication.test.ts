import {
  Array as Array_,
  Effect,
  Fiber,
  Layer,
  Match as M,
  Option,
  Schema as S,
  SubscriptionRef,
} from 'effect'
import { expect, it } from 'vitest'

import * as Command from '../command/index.js'
import { INIT_INDEX } from '../devTools/store.js'
import type { DevToolsStore } from '../devTools/store.js'
import { html } from '../html/index.js'
import { m } from '../message/index.js'
import * as Mount from '../mount/index.js'
import { make } from '../program/program.js'
import { retainAllTransitions } from './programJournal.js'
import { makeFoldkitApplication } from './runtime.js'

const ClickedIncrement = m('ClickedIncrement')
const Message = S.Union([ClickedIncrement])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

it('renders and dispatches through the shared Program runtime', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-root'
  document.body.append(root)
  let updateCount = 0
  const observedCounts: Array<number> = []
  const archivedSequences: Array<number> = []
  const Counter = make({
    id: 'rendered-counter',
    version: 1,
    Model,
    Message,
    init: () => [Model.make({ count: 0 }), []],
    update: (model, message) => {
      updateCount += 1
      return M.value(message).pipe(
        M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
        M.tagsExhaustive({
          ClickedIncrement: () => [Model.make({ count: model.count + 1 }), []],
        }),
      )
    },
  })
  const h = html<Message>()
  const application = makeFoldkitApplication({
    program: Counter,
    resources: Layer.empty,
    container: root,
    journal: {
      archive: config => {
        const archive = retainAllTransitions()(config)
        return {
          ...archive,
          append: transition => {
            archivedSequences.push(transition.sequence)
            archive.append(transition)
          },
        }
      },
    },
    onModel: model => {
      observedCounts.push(model.count)
    },
    view: model => ({
      title: 'Shared Counter',
      body: h.main(
        [],
        [
          h.span([], [model.count.toString()]),
          h.button([h.OnClick(ClickedIncrement())], ['increment']),
        ],
      ),
    }),
  })
  const fiber = Effect.runFork(application.start())

  await expect.poll(() => document.body.textContent).toContain('0')
  const button = document.body.querySelector('button')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected the Counter button to render')
  }
  button.click()

  await expect.poll(() => document.body.textContent).toContain('1')
  expect(updateCount).toBe(1)
  expect(observedCounts).toStrictEqual([0, 1])
  expect(archivedSequences).toStrictEqual([1])

  await Effect.runPromise(Fiber.interrupt(fiber))
  expect(document.body.contains(root)).toBe(true)
  root.remove()
})

it('projects initialization Command history into DevTools', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-init-history-root'
  document.body.append(root)

  const CompletedInitialize = m('CompletedInitialize')
  const InitializationMessage = S.Union([CompletedInitialize])
  type InitializationMessage = typeof InitializationMessage.Type
  const InitializationModel = S.Struct({ count: S.Number })
  type InitializationModel = typeof InitializationModel.Type
  const FinishInitialize = Command.define(
    'FinishInitialize',
    CompletedInitialize,
  )(Effect.succeed(CompletedInitialize()))
  const InitializationProgram = make({
    id: 'initialization-history',
    version: 1,
    Model: InitializationModel,
    Message: InitializationMessage,
    init: () => [InitializationModel.make({ count: 0 }), [FinishInitialize()]],
    update: (model, message) =>
      M.value(message).pipe(
        M.withReturnType<
          readonly [InitializationModel, ReadonlyArray<never>]
        >(),
        M.tagsExhaustive({
          CompletedInitialize: () => [
            InitializationModel.make({ count: model.count + 1 }),
            [],
          ],
        }),
      ),
  })
  const h = html<InitializationMessage>()
  let devToolsStore: DevToolsStore | undefined
  const application = makeFoldkitApplication({
    program: InitializationProgram,
    resources: Layer.empty,
    container: root,
    devTools: {
      show: 'Always',
      overlay: store =>
        Effect.sync(() => {
          devToolsStore = store
        }),
    },
    view: model => ({
      title: 'Initialization History',
      body: h.main([], [model.count.toString()]),
    }),
  })
  const fiber = Effect.runFork(application.start())

  await expect
    .poll(() => {
      if (devToolsStore === undefined) {
        return []
      }
      return SubscriptionRef.getUnsafe(devToolsStore.stateRef).entries.map(
        entry => entry.tag,
      )
    })
    .toStrictEqual(['CompletedInitialize'])
  await expect.poll(() => document.body.textContent).toContain('1')

  await Effect.runPromise(Fiber.interrupt(fiber))
  root.remove()
})

it('renders transformed Model values when DevTools inspects history', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-transformed-model-root'
  document.body.append(root)

  const TransformedModel = S.Struct({ value: S.BigIntFromString })
  type TransformedModel = typeof TransformedModel.Type
  const TransformedProgram = make({
    id: 'transformed-model-history',
    version: 1,
    Model: TransformedModel,
    Message,
    init: () => [TransformedModel.make({ value: 69n }), []],
    update: model => [model, []],
  })
  const h = html<Message>()
  let devToolsStore: DevToolsStore | undefined
  const application = makeFoldkitApplication({
    program: TransformedProgram,
    resources: Layer.empty,
    container: root,
    devTools: {
      show: 'Always',
      overlay: store =>
        Effect.sync(() => {
          devToolsStore = store
        }),
    },
    view: model => ({
      title: 'Transformed Model History',
      body: h.main([], [model.value.toString()]),
    }),
  })
  const fiber = Effect.runFork(application.start())

  await expect.poll(() => document.body.textContent).toContain('69')
  await expect.poll(() => devToolsStore).toBeDefined()
  if (devToolsStore === undefined) {
    throw new Error('Expected the DevTools store to be available')
  }
  await Effect.runPromise(devToolsStore.jumpTo(INIT_INDEX))
  expect(document.body.textContent).toContain('69')

  await Effect.runPromise(Fiber.interrupt(fiber))
  root.remove()
})

it('records Mount-emitted Messages with Mount provenance', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-mount-provenance-root'
  document.body.append(root)

  const CompletedMeasure = m('CompletedMeasure')
  const MountMessage = S.Union([CompletedMeasure])
  type MountMessage = typeof MountMessage.Type
  const MountModel = S.Struct({ isMeasured: S.Boolean })
  type MountModel = typeof MountModel.Type
  const MeasurePanel = Mount.define(
    'MeasurePanel',
    CompletedMeasure,
  )(() => Effect.succeed(CompletedMeasure()))
  const MountProgram = make({
    id: 'mount-provenance',
    version: 1,
    Model: MountModel,
    Message: MountMessage,
    init: () => [MountModel.make({ isMeasured: false }), []],
    update: (_model, message) =>
      M.value(message).pipe(
        M.withReturnType<readonly [MountModel, ReadonlyArray<never>]>(),
        M.tagsExhaustive({
          CompletedMeasure: () => [MountModel.make({ isMeasured: true }), []],
        }),
      ),
  })
  const h = html<MountMessage>()
  let devToolsStore: DevToolsStore | undefined
  const application = makeFoldkitApplication({
    program: MountProgram,
    resources: Layer.empty,
    container: root,
    devTools: {
      show: 'Always',
      overlay: store =>
        Effect.sync(() => {
          devToolsStore = store
        }),
    },
    view: model => ({
      title: 'Mount Provenance',
      body: h.main(
        [h.OnMount(MeasurePanel())],
        [model.isMeasured ? 'measured' : 'unmeasured'],
      ),
    }),
  })
  const fiber = Effect.runFork(application.start())

  await expect.poll(() => document.body.textContent).toContain('measured')
  await expect
    .poll(() => {
      if (devToolsStore === undefined) {
        return undefined
      }
      const maybeEntry = Array_.head(
        SubscriptionRef.getUnsafe(devToolsStore.stateRef).entries,
      )
      if (Option.isNone(maybeEntry)) {
        return undefined
      }
      return Option.getOrUndefined(maybeEntry.value.maybeSource)
    })
    .toStrictEqual({ _tag: 'Mount', name: 'MeasurePanel' })

  await Effect.runPromise(Fiber.interrupt(fiber))
  root.remove()
})

it('renders one terminal crash with the originating Message', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-crash-root'
  document.body.append(root)

  const ClickedCrash = m('ClickedCrash')
  const CompletedCrash = m('CompletedCrash')
  const CrashMessage = S.Union([ClickedCrash, CompletedCrash])
  type CrashMessage = typeof CrashMessage.Type
  const CrashModel = S.Struct({ updateCount: S.Number })
  type CrashModel = typeof CrashModel.Type
  const Crash = Command.define(
    'Crash',
    CompletedCrash,
  )(Effect.die(new Error('shared engine exploded')))
  const CrashProgram = make({
    id: 'rendered-crash',
    version: 1,
    Model: CrashModel,
    Message: CrashMessage,
    init: () => [CrashModel.make({ updateCount: 0 }), []],
    update: (model, message) =>
      M.value(message).pipe(
        M.withReturnType<
          readonly [CrashModel, ReadonlyArray<Command.Command<CrashMessage>>]
        >(),
        M.tagsExhaustive({
          ClickedCrash: () => [
            CrashModel.make({ updateCount: model.updateCount + 1 }),
            [Crash()],
          ],
          CompletedCrash: () => [model, []],
        }),
      ),
  })
  const h = html<CrashMessage>()
  const reports: Array<Readonly<{ model: CrashModel; message: unknown }>> = []
  const application = makeFoldkitApplication({
    program: CrashProgram,
    resources: Layer.empty,
    container: root,
    crash: {
      report: context => {
        reports.push({ model: context.model, message: context.message })
      },
      view: context => ({
        title: 'Crashed',
        body: h.main([], [`crashed: ${context.error.message}`]),
      }),
    },
    view: model => ({
      title: 'Crash Counter',
      body: h.button(
        [h.OnClick(ClickedCrash())],
        [`crash ${model.updateCount.toString()}`],
      ),
    }),
  })
  const fiber = Effect.runFork(application.start())

  await expect.poll(() => document.body.textContent).toContain('crash 0')
  const button = document.body.querySelector('button')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected the crash button to render')
  }
  button.click()

  await expect
    .poll(() => document.body.textContent)
    .toContain('crashed: shared engine exploded')
  expect(reports).toStrictEqual([
    {
      model: { updateCount: 1 },
      message: Option.some(ClickedCrash()),
    },
  ])
  button.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(reports).toHaveLength(1)

  await Effect.runPromise(Fiber.interrupt(fiber))
  root.remove()
})

it('keeps an initial-render crash visible until disposal', async () => {
  const root = document.createElement('div')
  root.id = 'shared-program-initial-crash-root'
  document.body.append(root)
  const h = html<Message>()
  const application = makeFoldkitApplication({
    program: make({
      id: 'initial-render-crash',
      version: 1,
      Model,
      Message,
      init: () => [Model.make({ count: 0 }), []],
      update: model => [model, []],
    }),
    resources: Layer.empty,
    container: root,
    crash: {
      view: context => ({
        title: 'Initial crash',
        body: h.main([], [`initial crash: ${context.error.message}`]),
      }),
    },
    view: () => {
      throw new Error('view exploded')
    },
  })
  const fiber = Effect.runFork(application.start())

  await expect
    .poll(() => document.body.textContent)
    .toContain('initial crash: view exploded')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(document.body.textContent).toContain('initial crash: view exploded')

  await Effect.runPromise(Fiber.interrupt(fiber))
  expect(document.body.contains(root)).toBe(true)
  root.remove()
})
