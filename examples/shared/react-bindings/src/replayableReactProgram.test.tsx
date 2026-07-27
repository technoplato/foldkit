import { Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import * as Command from 'foldkit/command'
import { m } from 'foldkit/message'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook, waitFor } from '@testing-library/react'

import { createReplayableReactProgramBindingsWithFlags } from './replayableReactProgram.js'

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

    act(() => {
      result.current.replay.changedFrame(0)
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(result.current.replay.mode).toBe('Inspecting')
    })

    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(5)
      expect(result.current.replay.frame).toBe(1)
      expect(result.current.replay.finalFrame).toBe(1)
      expect(result.current.replay.mode).toBe('Live')
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
      result.current.replay.clickedInspect()
    })
    await waitFor(() => {
      expect(result.current.replay.mode).toBe('Inspecting')
      expect(result.current.replay.isBranchable).toBe(false)
    })
    act(() => {
      result.current.actions.clickedIncrement()
    })
    await waitFor(() => {
      expect(result.current.model.count).toBe(4)
      expect(Option.isSome(result.current.replay.maybeBranchError)).toBe(true)
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
      expect(Option.isSome(result.current.replay.maybeBranchError)).toBe(true)
    })
  })
})
