import { Context, Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import * as Command from 'foldkit/command'
import { m } from 'foldkit/message'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook, waitFor } from '@testing-library/react'

import {
  defineDependencyChoice,
  defineDependencySet,
} from './dependencyChoice.js'
import {
  createReactProgramClientWithDependencies,
  createReactProgramClientWithDependency,
} from './reactProgram.js'

type FactClientService = Readonly<{
  fetch: Effect.Effect<string>
}>

class FactClient extends Context.Service<FactClient, FactClientService>()(
  'ReactDependencyChoiceTest/FactClient',
) {}

type FactPrefixService = Readonly<{ value: string }>

class FactPrefix extends Context.Service<FactPrefix, FactPrefixService>()(
  'ReactDependencyChoiceTest/FactPrefix',
) {}

const Idle = S.TaggedStruct('Idle', {})
const Loading = S.TaggedStruct('Loading', {})
const Loaded = S.TaggedStruct('Loaded', { fact: S.String })
const Model = S.Union([Idle, Loading, Loaded])
type Model = typeof Model.Type

const ClickedLoadFact = m('ClickedLoadFact')
const SucceededLoadFact = m('SucceededLoadFact', { fact: S.String })
const Message = S.Union([ClickedLoadFact, SucceededLoadFact])
type Message = typeof Message.Type

const FetchFact = Command.define(
  'FetchFact',
  SucceededLoadFact,
)(
  Effect.flatMap(FactClient, client =>
    Effect.map(client.fetch, fact => SucceededLoadFact({ fact })),
  ),
)

const FactProgram = Program.make({
  id: 'react-dependency-choice-test',
  version: 1,
  Model,
  Message,
  init: () => [Idle.make({}), []],
  update: (_model, message) =>
    M.value(message).pipe(
      M.withReturnType<
        readonly [
          Model,
          ReadonlyArray<Command.Command<Message, never, FactClient>>,
        ]
      >(),
      M.tagsExhaustive({
        ClickedLoadFact: () => [Loading.make({}), [FetchFact()]],
        SucceededLoadFact: ({ fact }) => [Loaded.make({ fact }), []],
      }),
    ),
})

const FetchPrefixedFact = Command.define(
  'FetchPrefixedFact',
  SucceededLoadFact,
)(
  Effect.gen(function* () {
    const client = yield* FactClient
    const prefix = yield* FactPrefix
    const fact = yield* client.fetch
    return SucceededLoadFact({ fact: `${prefix.value}${fact}` })
  }),
)

const PrefixedFactProgram = Program.make({
  id: 'react-multiple-dependency-choice-test',
  version: 1,
  Model,
  Message,
  init: () => [Idle.make({}), []],
  update: (_model, message) =>
    M.value(message).pipe(
      M.withReturnType<
        readonly [
          Model,
          ReadonlyArray<
            Command.Command<Message, never, FactClient | FactPrefix>
          >,
        ]
      >(),
      M.tagsExhaustive({
        ClickedLoadFact: () => [Loading.make({}), [FetchPrefixedFact()]],
        SucceededLoadFact: ({ fact }) => [Loaded.make({ fact }), []],
      }),
    ),
})

const makeFactClient = (fact: string): Layer.Layer<FactClient> =>
  Layer.succeed(FactClient, { fetch: Effect.succeed(fact) })

const makeClient = (dependency: ReturnType<typeof makeFactDependency>) =>
  createReactProgramClientWithDependency({
    createActions: enqueueMessage => ({
      clickedLoadFact: () => enqueueMessage(ClickedLoadFact()),
    }),
    dependency,
    name: 'FactTestProgram',
    program: FactProgram,
    resources: Layer.empty,
    start: (_initialRoute: void) => Runtime.fresh(),
  })

const makeFactDependency = (
  mock: Layer.Layer<FactClient, unknown>,
  live: Layer.Layer<FactClient, unknown>,
) =>
  defineDependencyChoice({
    service: FactClient,
    initial: 'Mock',
    implementations: {
      Mock: mock,
      Live: live,
    },
  })

describe('React dependency choices', () => {
  it('starts with Mock and routes the next Command through Live after switching', async () => {
    const dependency = makeFactDependency(
      makeFactClient('Mock fact'),
      makeFactClient('Live fact'),
    )
    const client = makeClient(dependency)
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={undefined}>{children}</client.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: client.useActions(),
        dependency: client.useDependency({ dependencyKey: dependency }),
        model: client.useModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Mock',
      })
    })
    const switchTo = result.current.dependency.switchTo

    act(() => {
      result.current.actions.clickedLoadFact()
    })
    await waitFor(() => {
      expect(result.current.model).toEqual({
        _tag: 'Loaded',
        fact: 'Mock fact',
      })
    })

    act(() => {
      result.current.dependency.switchTo('Live')
    })
    await waitFor(() => {
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Live',
      })
    })
    expect(result.current.dependency.switchTo).toBe(switchTo)

    act(() => {
      result.current.actions.clickedLoadFact()
    })
    await waitFor(() => {
      expect(result.current.model).toEqual({
        _tag: 'Loaded',
        fact: 'Live fact',
      })
    })

    if (globalThis.Boolean(false)) {
      // @ts-expect-error Only declared implementation names can be selected.
      result.current.dependency.switchTo('Unknown')
    }
  })

  it('lets in-flight causal work finish against the old implementation', async () => {
    const dependency = makeFactDependency(
      Layer.succeed(FactClient, {
        fetch: Effect.andThen(
          Effect.sleep('50 millis'),
          Effect.succeed('Slow mock fact'),
        ),
      }),
      makeFactClient('Live fact'),
    )
    const client = makeClient(dependency)
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={undefined}>{children}</client.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: client.useActions(),
        dependency: client.useDependency({ dependencyKey: dependency }),
        model: client.useModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.dependency.current._tag).toBe('Ready')
    })
    act(() => {
      result.current.actions.clickedLoadFact()
      result.current.dependency.switchTo('Live')
    })
    expect(result.current.dependency.current).toEqual({
      _tag: 'Switching',
      from: 'Mock',
      to: 'Live',
    })

    await waitFor(() => {
      expect(result.current.model).toEqual({
        _tag: 'Loaded',
        fact: 'Slow mock fact',
      })
    })
    await waitFor(() => {
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Live',
      })
    })
  })

  it('reports typed acquisition failure and keeps the prior implementation', async () => {
    const dependency = makeFactDependency(
      makeFactClient('Mock fact'),
      Layer.effect(FactClient, Effect.fail('Live unavailable')),
    )
    const client = makeClient(dependency)
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={undefined}>{children}</client.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: client.useActions(),
        dependency: client.useDependency({ dependencyKey: dependency }),
        model: client.useModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.dependency.current._tag).toBe('Ready')
    })
    act(() => {
      result.current.dependency.switchTo('Live')
    })
    await waitFor(() => {
      expect(result.current.dependency.current._tag).toBe('Failed')
    })
    const current = result.current.dependency.current
    if (current._tag !== 'Failed') {
      throw new Error('Expected dependency acquisition to fail')
    }
    expect(Option.getOrThrow(current.current)).toBe('Mock')
    expect(current.attempted).toBe('Live')
    expect(current.error._tag).toBe('DependencyStartupError')

    act(() => {
      result.current.actions.clickedLoadFact()
    })
    await waitFor(() => {
      expect(result.current.model).toEqual({
        _tag: 'Loaded',
        fact: 'Mock fact',
      })
    })
  })

  it('owns one dependency scope across the Strict Mode lifecycle', async () => {
    let acquiredCount = 0
    let releasedCount = 0
    const Mock = Layer.effect(
      FactClient,
      Effect.acquireRelease(
        Effect.sync(() => {
          acquiredCount += 1
          return { fetch: Effect.succeed('Mock fact') }
        }),
        () =>
          Effect.sync(() => {
            releasedCount += 1
          }),
      ),
    )
    const dependency = makeFactDependency(Mock, makeFactClient('Live fact'))
    const client = makeClient(dependency)
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <StrictMode>
        <client.Provider initialRoute={undefined}>{children}</client.Provider>
      </StrictMode>
    )
    const { result, unmount } = renderHook(
      () => client.useDependency({ dependencyKey: dependency }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.current._tag).toBe('Ready')
    })
    expect(acquiredCount).toBe(1)
    unmount()

    await waitFor(() => {
      expect(releasedCount).toBe(1)
    })
  })

  it('switches two typed dependency choices independently', async () => {
    const factDependency = makeFactDependency(
      makeFactClient('Mock fact'),
      makeFactClient('Live fact'),
    )
    const prefixDependency = defineDependencyChoice({
      service: FactPrefix,
      initial: 'Short',
      implementations: {
        Short: Layer.succeed(FactPrefix, { value: 'S: ' }),
        Long: Layer.succeed(FactPrefix, { value: 'Long: ' }),
      },
    })
    const client = createReactProgramClientWithDependencies({
      createActions: enqueueMessage => ({
        clickedLoadFact: () => enqueueMessage(ClickedLoadFact()),
      }),
      dependencies: defineDependencySet(factDependency, prefixDependency),
      name: 'PrefixedFactTestProgram',
      program: PrefixedFactProgram,
      resources: Layer.empty,
      start: (_initialRoute: void) => Runtime.fresh(),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={undefined}>{children}</client.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: client.useActions(),
        fact: client.useDependency({ dependencyKey: factDependency }),
        model: client.useModel(),
        prefix: client.useDependency({ dependencyKey: prefixDependency }),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.fact.current).toEqual({
        _tag: 'Ready',
        current: 'Mock',
      })
      expect(result.current.prefix.current).toEqual({
        _tag: 'Ready',
        current: 'Short',
      })
    })

    act(() => {
      result.current.fact.switchTo('Live')
    })
    await waitFor(() => {
      expect(result.current.fact.current).toEqual({
        _tag: 'Ready',
        current: 'Live',
      })
      expect(result.current.prefix.current).toEqual({
        _tag: 'Ready',
        current: 'Short',
      })
    })

    act(() => {
      result.current.prefix.switchTo('Long')
    })
    await waitFor(() => {
      expect(result.current.prefix.current).toEqual({
        _tag: 'Ready',
        current: 'Long',
      })
    })
    act(() => {
      result.current.actions.clickedLoadFact()
    })
    await waitFor(() => {
      expect(result.current.model).toEqual({
        _tag: 'Loaded',
        fact: 'Long: Live fact',
      })
    })

    if (globalThis.Boolean(false)) {
      // @ts-expect-error FactClient only declares Mock and Live.
      result.current.fact.switchTo('Short')
      // @ts-expect-error FactPrefix only declares Short and Long.
      result.current.prefix.switchTo('Mock')
    }
  })
})
