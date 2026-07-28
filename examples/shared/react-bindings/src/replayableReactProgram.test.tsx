import { Context, Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import * as Command from 'foldkit/command'
import { m } from 'foldkit/message'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook, waitFor } from '@testing-library/react'

import {
  defineDependencyChoice,
  defineSingleDependencySet,
} from './dependencyChoice.js'
import {
  createReplayableReactProgramBindingsWithFlags,
  createReplayableReactProgramClientWithDependencies,
} from './replayableReactProgram.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const ClickedIncrement = m('ClickedIncrement')
const ClickedWait = m('ClickedWait')
const CompletedWait = m('CompletedWait')
const Message = S.Union([ClickedIncrement, ClickedWait, CompletedWait])
type Message = typeof Message.Type

const Wait = Command.define('Wait', CompletedWait)(Effect.never)

const TestProgram = Program.make({
  id: 'replayable-react-bindings-test',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ count: 0 }), []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<
        readonly [Model, ReadonlyArray<Command.Command<Message>>]
      >(),
      M.tagsExhaustive({
        ClickedIncrement: () => [Model.make({ count: model.count + 1 }), []],
        ClickedWait: () => [model, [Wait()]],
        CompletedWait: () => [model, []],
      }),
    ),
})

type RuntimeModeService = Readonly<{ name: string }>

class RuntimeMode extends Context.Service<RuntimeMode, RuntimeModeService>()(
  'ReplayableReactBindingsTest/RuntimeMode',
) {}

describe('replayable React Program bindings', () => {
  it('drives product actions and replay inspection through one controller', async () => {
    const bindings = createReplayableReactProgramBindingsWithFlags<
      Model,
      Message,
      Readonly<{ clickedIncrement: () => void; clickedWait: () => void }>,
      number
    >({
      createActions: enqueueMessage => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
        clickedWait: () => enqueueMessage(ClickedWait()),
      }),
      name: 'ReplayableTestProgram',
      program: TestProgram,
      resources: Layer.empty,
      route: count => Program.state(Model.make({ count })),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <bindings.Provider flags={4}>{children}</bindings.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: bindings.useActions(),
        model: bindings.useModel(),
        replay: bindings.useReplay(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
    })

    act(() => {
      result.current.actions.clickedIncrement()
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(6)
      expect(result.current.replay.frame).toBe(2)
      expect(result.current.replay.mode).toBe('Live')
    })
    expect(
      result.current.replay.transitions.map(
        transition => transition.message._tag,
      ),
    ).toStrictEqual(['ClickedIncrement', 'ClickedIncrement'])
    await expect(result.current.replay.statePath()).resolves.toContain(
      '/state?',
    )
    await expect(result.current.replay.replayPath()).resolves.toContain(
      '/replay?',
    )

    act(() => {
      result.current.replay.seek(0)
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(result.current.replay.mode).toBe('Inspecting')
    })

    act(() => {
      result.current.replay.resume()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(result.current.replay.frame).toBe(0)
      expect(result.current.replay.finalFrame).toBe(0)
      expect(result.current.replay.mode).toBe('Live')
    })

    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(5)
      expect(result.current.replay.frame).toBe(1)
      expect(result.current.replay.finalFrame).toBe(1)
    })
  })

  it('explains why an unsettled frame cannot become a live branch', async () => {
    const bindings = createReplayableReactProgramBindingsWithFlags<
      Model,
      Message,
      Readonly<{ clickedIncrement: () => void; clickedWait: () => void }>,
      number
    >({
      createActions: enqueueMessage => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
        clickedWait: () => enqueueMessage(ClickedWait()),
      }),
      name: 'UnsettledReplayableTestProgram',
      program: TestProgram,
      resources: Layer.empty,
      route: count => Program.state(Model.make({ count })),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <bindings.Provider flags={4}>{children}</bindings.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: bindings.useActions(),
        model: bindings.useModel(),
        replay: bindings.useReplay(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
    })
    act(() => {
      result.current.actions.clickedWait()
    })
    await waitFor(() => {
      expect(result.current.replay.frame).toBe(1)
    })
    act(() => {
      result.current.replay.inspect()
    })
    await waitFor(() => {
      expect(result.current.replay.mode).toBe('Inspecting')
      expect(result.current.replay.isBranchable).toBe(false)
    })
    act(() => {
      result.current.replay.resume()
    })
    await waitFor(() => {
      expect(result.current.replay.mode).toBe('Inspecting')
      expect(Option.isSome(result.current.replay.maybeError)).toBe(true)
    })
    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(Option.isSome(result.current.replay.maybeError)).toBe(true)
    })
  })

  it('prevents frame zero from branching while initial Commands are pending', async () => {
    const tape = Runtime.fromJournal(
      TestProgram,
      Runtime.makeProgramJournal({
        program: TestProgram,
        initialModel: Model.make({ count: 4 }),
        initialCommands: [{ name: 'Wait' }],
      }).read(),
    )
    const bindings = createReplayableReactProgramBindingsWithFlags<
      Model,
      Message,
      Readonly<{ clickedIncrement: () => void }>,
      void
    >({
      createActions: enqueueMessage => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
      }),
      name: 'InitialCommandReplayableTestProgram',
      program: TestProgram,
      resources: Layer.empty,
      route: () => Program.replay(tape, 0),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <bindings.Provider flags={undefined}>{children}</bindings.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: bindings.useActions(),
        model: bindings.useModel(),
        replay: bindings.useReplay(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.replay.mode).toBe('Inspecting')
      expect(result.current.replay.isBranchable).toBe(false)
    })
    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(Option.isSome(result.current.replay.maybeError)).toBe(true)
    })
  })

  it('records dependency selections and restores them when branching', async () => {
    const dependency = defineDependencyChoice({
      service: RuntimeMode,
      initial: 'Mock',
      implementations: {
        Mock: Layer.succeed(RuntimeMode, { name: 'Mock' }),
        Live: Layer.succeed(RuntimeMode, { name: 'Live' }),
      },
    })
    const client = createReplayableReactProgramClientWithDependencies({
      createActions: enqueueMessage => ({
        clickedIncrement: () => enqueueMessage(ClickedIncrement()),
      }),
      dependencies: defineSingleDependencySet(dependency),
      name: 'DependencyReplayableTestProgram',
      program: TestProgram,
      resources: Layer.empty,
      route: (count: number) => Program.state(Model.make({ count })),
    })
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <client.Provider initialRoute={4}>{children}</client.Provider>
    )
    const { result } = renderHook(
      () => ({
        actions: client.useActions(),
        dependency: client.useDependency({ dependencyKey: dependency }),
        model: client.useModel(),
        replay: client.useReplay(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Mock',
      })
      expect(result.current.replay.runtimeEvents).toHaveLength(1)
    })

    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.replay.frame).toBe(1)
    })
    act(() => {
      result.current.dependency.switchTo('Live')
    })
    await waitFor(() => {
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Live',
      })
      expect(result.current.replay.runtimeEvents).toHaveLength(2)
    })
    expect(result.current.replay.runtimeEvents).toMatchObject([
      {
        name: 'SelectedDependencyImplementation',
        afterFrame: 0,
        attributes: {
          dependency: 'ReplayableReactBindingsTest/RuntimeMode',
          implementation: 'Mock',
        },
      },
      {
        name: 'SelectedDependencyImplementation',
        afterFrame: 1,
        attributes: {
          dependency: 'ReplayableReactBindingsTest/RuntimeMode',
          implementation: 'Live',
        },
      },
    ])

    act(() => {
      result.current.replay.seek(0)
    })
    await waitFor(() => {
      expect(result.current.replay.mode).toBe('Inspecting')
      expect(result.current.replay.occurredRuntimeEvents).toHaveLength(1)
    })
    act(() => {
      result.current.replay.seek(1)
    })
    await waitFor(() => {
      expect(result.current.replay.occurredRuntimeEvents).toHaveLength(2)
    })
    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(6)
      expect(result.current.replay.mode).toBe('Live')
      expect(result.current.dependency.current).toEqual({
        _tag: 'Ready',
        current: 'Live',
      })
    })
    expect(result.current.replay.runtimeEvents).toHaveLength(2)
  })
})
