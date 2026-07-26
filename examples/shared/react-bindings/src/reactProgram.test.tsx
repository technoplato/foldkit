import { Context, Effect, Layer, Match as M, Schema as S } from 'effect'
import { Command, Program, Runtime } from 'foldkit'
import { m } from 'foldkit/message'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook, waitFor } from '@testing-library/react'

import {
  createReactProgramBindings,
  createReactProgramBindingsFromFlags,
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
            ClickedIncrement: () => [
              Model.make({ count: model.count + 1 }),
              [],
            ],
            CompletedLoadProgram: ({ count }) => [Model.make({ count }), []],
          }),
        ),
    })

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
      expect(buildCount).toBeGreaterThan(0)
      expect(releaseCount).toBe(buildCount)
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
