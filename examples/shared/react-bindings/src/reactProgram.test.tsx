import { Cause, Context, Effect, Layer, Match as M, Schema as S } from 'effect'
import * as Command from 'foldkit/command'
import { m } from 'foldkit/message'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { type ReactNode, StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  createReactProgramBindings,
  createReactProgramBindingsFromFlags,
  createReactProgramClient,
} from './reactProgram.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const ClickedIncrement = m('ClickedIncrement')
const CompletedLoadProgram = m('CompletedLoadProgram', { count: S.Number })
const Message = S.Union([ClickedIncrement, CompletedLoadProgram])
type Message = typeof Message.Type

type ResourceShape = Readonly<{ value: number }>

class Resource extends Context.Service<Resource, ResourceShape>()(
  'ReactProgramBindingsTest/Resource',
) {}

class ResourceStartupError extends S.TaggedErrorClass<ResourceStartupError>()(
  'ResourceStartupError',
  { message: S.String },
) {}

const LoadProgram = Command.define(
  'LoadProgram',
  CompletedLoadProgram,
)(
  Effect.gen(function* () {
    const resource = yield* Resource
    yield* Effect.promise(() => Promise.resolve())
    return CompletedLoadProgram({ count: resource.value })
  }),
)

const TestProgram = Program.make({
  id: 'react-bindings-test',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ count: 0 }), [LoadProgram()]],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<
        readonly [Model, ReadonlyArray<Command.Command<Message>>]
      >(),
      M.tagsExhaustive({
        ClickedIncrement: () => [Model.make({ count: model.count + 1 }), []],
        CompletedLoadProgram: ({ count }) => [Model.make({ count }), []],
      }),
    ),
})

describe('React Program bindings', () => {
  it('starts after commit, supports async Commands, and releases resources', async () => {
    let buildCount = 0
    let releaseCount = 0
    const journalMessageTags: Array<string> = []

    const ResourceLive = Layer.effect(
      Resource,
      Effect.acquireRelease(
        Effect.sync(() => {
          buildCount += 1
          return { value: 41 }
        }),
        () =>
          Effect.sync(() => {
            releaseCount += 1
          }),
      ),
    )

    const bindings = createReactProgramBindings<
      Model,
      Message,
      Readonly<{ clickedIncrement: () => void }>,
      Resource
    >({
      createActions: enqueueMessage => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
      }),
      name: 'TestProgram',
      program: TestProgram,
      resources: ResourceLive,
      journal: {
        archive: config => {
          const archive = Runtime.retainAllTransitions()(config)
          return {
            ...archive,
            append: transition => {
              journalMessageTags.push(transition.message._tag)
              archive.append(transition)
            },
          }
        },
      },
    })

    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <StrictMode>
        <bindings.Provider>{children}</bindings.Provider>
      </StrictMode>
    )

    const { result, unmount } = renderHook(
      () => ({
        actions: bindings.useActions(),
        model: bindings.useModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model).toEqual({ count: 41 })
    })

    const actions = result.current.actions
    act(() => {
      result.current.actions.clickedIncrement()
    })
    expect(result.current.model).toEqual({ count: 42 })
    expect(result.current.actions).toBe(actions)
    expect(journalMessageTags).toContain('ClickedIncrement')

    unmount()

    await waitFor(() => {
      expect(buildCount).toBe(1)
      expect(releaseCount).toBe(1)
    })
  })

  it('reports asynchronous startup through a renderable lifecycle snapshot', async () => {
    const lifecycleTags: Array<string> = []
    const ResourceLive = Layer.effect(
      Resource,
      Effect.andThen(Effect.sleep('50 millis'), Effect.succeed({ value: 23 })),
    )
    const bindings = createReactProgramBindings({
      createActions: () => ({}),
      name: 'AsyncTestProgram',
      program: TestProgram,
      resources: ResourceLive,
      onLifecycleChanged: lifecycle => {
        lifecycleTags.push(lifecycle._tag)
      },
    })

    const { unmount } = render(
      <bindings.Provider
        fallback={lifecycle => <p data-testid="lifecycle">{lifecycle._tag}</p>}
      >
        <p>Ready</p>
      </bindings.Provider>,
    )

    expect(screen.getByTestId('lifecycle').textContent).toBe('Starting')
    await waitFor(() => {
      expect(screen.getByText('Ready').textContent).toBe('Ready')
    })
    expect(lifecycleTags).toEqual(['Idle', 'Starting', 'Ready'])

    unmount()
    await waitFor(() => {
      expect(lifecycleTags).toEqual([
        'Idle',
        'Starting',
        'Ready',
        'Stopping',
        'Stopped',
      ])
    })
  })

  it('preserves a typed Layer acquisition failure', async () => {
    const startupFailure = new ResourceStartupError({
      message: 'Resource unavailable',
    })
    const failures: Array<ResourceStartupError> = []
    const bindings = createReactProgramBindings<
      Model,
      Message,
      Readonly<Record<string, never>>,
      Resource,
      ResourceStartupError
    >({
      createActions: () => ({}),
      name: 'FailedTestProgram',
      program: TestProgram,
      resources: Layer.effect(Resource, Effect.fail(startupFailure)),
      onLifecycleChanged: lifecycle => {
        if (lifecycle._tag === 'Failed') {
          const error = Cause.squash(lifecycle.cause)
          if (error instanceof ResourceStartupError) {
            failures.push(error)
          }
        }
      },
    })

    render(
      <bindings.Provider
        fallback={lifecycle => (
          <p data-testid="failed-lifecycle">{lifecycle._tag}</p>
        )}
      >
        <p>Ready</p>
      </bindings.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('failed-lifecycle').textContent).toBe('Failed')
    })
    expect(failures).toEqual([startupFailure])
  })

  it('cancels Layer acquisition when unmounted while Starting', async () => {
    let buildCount = 0
    const lifecycleTags: Array<string> = []
    const ResourceLive = Layer.effect(
      Resource,
      Effect.andThen(
        Effect.sleep('1 second'),
        Effect.sync(() => {
          buildCount += 1
          return { value: 0 }
        }),
      ),
    )
    const bindings = createReactProgramBindings({
      createActions: () => ({}),
      name: 'CancelledTestProgram',
      program: TestProgram,
      resources: ResourceLive,
      onLifecycleChanged: lifecycle => {
        lifecycleTags.push(lifecycle._tag)
      },
    })
    const { unmount } = render(
      <bindings.Provider fallback={() => <p>Starting</p>}>
        <p>Ready</p>
      </bindings.Provider>,
    )

    await waitFor(() => {
      expect(lifecycleTags).toContain('Starting')
    })
    unmount()

    await waitFor(() => {
      expect(lifecycleTags).toContain('Stopped')
    })
    expect(buildCount).toBe(0)
  })

  it('stops Commands before releasing the Resources Layer', async () => {
    const lifecycleOrder: Array<string> = []
    const CompletedHoldProgram = m('CompletedHoldProgram')
    const HoldProgramMessage = S.Union([CompletedHoldProgram])
    type HoldProgramMessage = typeof HoldProgramMessage.Type
    const HoldProgram = Command.define(
      'HoldProgram',
      CompletedHoldProgram,
    )(
      Effect.flatMap(Resource, () => Effect.never).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            lifecycleOrder.push('Command')
          }),
        ),
      ),
    )
    const ProgramWithHold = Program.make({
      id: 'react-bindings-shutdown-test',
      version: 1,
      Model,
      Message: HoldProgramMessage,
      init: () => [Model.make({ count: 0 }), [HoldProgram()]],
      update: model => [model, []],
    })
    const ResourceLive = Layer.effect(
      Resource,
      Effect.acquireRelease(Effect.succeed({ value: 0 }), () =>
        Effect.sync(() => {
          lifecycleOrder.push('Resource')
        }),
      ),
    )
    const bindings = createReactProgramBindings<
      Model,
      HoldProgramMessage,
      Readonly<Record<string, never>>,
      Resource
    >({
      createActions: () => ({}),
      name: 'ShutdownTestProgram',
      program: ProgramWithHold,
      resources: ResourceLive,
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <bindings.Provider>{children}</bindings.Provider>
    )
    const { result, unmount } = renderHook(() => bindings.useModel(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.count).toBe(0)
    })
    unmount()

    await waitFor(() => {
      expect(lifecycleOrder).toEqual(['Command', 'Resource'])
    })
  })

  it('renders the Idle fallback on the server without acquiring Resources', () => {
    let buildCount = 0
    const bindings = createReactProgramBindings({
      createActions: () => ({}),
      name: 'ServerTestProgram',
      program: TestProgram,
      resources: Layer.effect(
        Resource,
        Effect.sync(() => {
          buildCount += 1
          return { value: 0 }
        }),
      ),
    })

    const html = renderToString(
      <bindings.Provider fallback={lifecycle => lifecycle._tag}>
        <p>Ready</p>
      </bindings.Provider>,
    )

    expect(html).toContain('Idle')
    expect(buildCount).toBe(0)
  })

  it('starts one typed initialRoute without treating it as live navigation', async () => {
    const client = createReactProgramClient({
      createActions: () => ({}),
      name: 'InitialRouteTestProgram',
      program: TestProgram,
      resources: Layer.succeed(Resource, { value: 0 }),
      start: (count: number) => Runtime.fromModel(Model.make({ count })),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={17}>{children}</client.Provider>
    )
    const { result } = renderHook(() => client.useModel(), { wrapper })

    await waitFor(() => {
      expect(result.current.count).toBe(17)
    })
  })

  it('creates a Program definition from typed Provider flags', async () => {
    const bindings = createReactProgramBindingsFromFlags({
      createActions: (
        enqueueMessage,
      ): Readonly<{
        clickedIncrement: () => void
      }> => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
      }),
      makeProgram: (count: number) => ({
        program: Program.make({
          id: 'react-bindings-flags-test',
          version: 1,
          Model,
          Message,
          init: () => [Model.make({ count }), []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<
                readonly [Model, ReadonlyArray<Command.Command<Message>>]
              >(),
              M.tagsExhaustive({
                ClickedIncrement: () => [
                  Model.make({ count: model.count + 1 }),
                  [],
                ],
                CompletedLoadProgram: () => [model, []],
              }),
            ),
        }),
        resources: Layer.empty,
      }),
      name: 'FlagsTestProgram',
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <bindings.Provider flags={7}>{children}</bindings.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: bindings.useActions(),
        model: bindings.useModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model).toEqual({ count: 7 })
    })
    const actions = result.current.actions
    act(() => {
      actions.clickedIncrement()
    })
    expect(result.current.model).toEqual({ count: 8 })
    expect(result.current.actions).toBe(actions)
  })
})
