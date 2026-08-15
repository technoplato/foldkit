import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { Text } from '../renderers/elements.js'
import {
  fromCommand,
  fromHost,
  makeProgramJournal,
  retainAllTransitions,
} from './programJournal.js'
import {
  branchReplayTape,
  decodeReplayTape,
  encodeReplayTape,
  fromJournal,
  inspectReplayFrame,
  replayToFrame,
} from './replayTape.js'

const RequestedSave = m('RequestedSave')
const CompletedSave = m('CompletedSave')
const CompletedAudit = m('CompletedAudit')
const Message = S.Union([RequestedSave, CompletedSave, CompletedAudit])
type Message = typeof Message.Type

const Stage = S.Literals(['Ready', 'Saving', 'Saved'])
const Model = S.Struct({ stage: Stage })
type Model = typeof Model.Type

describe('typed Program history and replay tapes', () => {
  it.effect(
    'reconstructs a recursive Command chain without executing historical effects',
    () =>
      Effect.gen(function* () {
        let saveCount = 0
        let auditCount = 0
        const Save = Command.define(
          'Save',
          CompletedSave,
        )(
          Effect.sync(() => {
            saveCount += 1
            return CompletedSave()
          }),
        )
        const Audit = Command.define(
          'Audit',
          CompletedAudit,
        )(
          Effect.sync(() => {
            auditCount += 1
            return CompletedAudit()
          }),
        )
        const Program = make({
          id: 'recursive-command',
          version: 1,
          Model,
          Message,
          init: () => [Model.make({ stage: 'Ready' }), []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<
                readonly [Model, ReadonlyArray<Command.Command<Message>>]
              >(),
              M.tagsExhaustive({
                RequestedSave: () => [{ stage: 'Saving' }, [Save()]],
                CompletedSave: () => [model, [Audit()]],
                CompletedAudit: () => [{ stage: 'Saved' }, []],
              }),
            ),
        })
        const journal = makeProgramJournal({
          program: Program,
          initialModel: { stage: 'Ready' },
          archive: retainAllTransitions({ keyframeInterval: 2 }),
          now: () => 10,
        })
        journal.record({
          message: RequestedSave(),
          source: fromHost('save'),
          operationId: 1,
          isOperationSettled: false,
          commands: [Save()],
          model: { stage: 'Saving' },
        })
        journal.record({
          message: CompletedSave(),
          source: fromCommand('Save'),
          operationId: 1,
          isOperationSettled: false,
          commands: [Audit()],
          model: { stage: 'Saving' },
        })
        journal.record({
          message: CompletedAudit(),
          source: fromCommand('Audit'),
          operationId: 1,
          isOperationSettled: true,
          commands: [],
          model: { stage: 'Saved' },
        })

        expect(Option.getOrThrow(journal.modelAt(0))).toStrictEqual({
          stage: 'Ready',
        })
        expect(Option.getOrThrow(journal.modelAt(1))).toStrictEqual({
          stage: 'Saving',
        })
        expect(Option.getOrThrow(journal.modelAt(3))).toStrictEqual({
          stage: 'Saved',
        })

        const tape = fromJournal(Program, journal.read())
        const replayedModel = yield* replayToFrame(Program, tape, 3)

        expect(replayedModel).toStrictEqual({ stage: 'Saved' })
        expect(saveCount).toBe(0)
        expect(auditCount).toBe(0)
      }),
  )

  it.effect('inspects valid and screen from the Program at a tape frame', () =>
    Effect.gen(function* () {
      const CountModel = S.Struct({ count: S.Number })
      type CountModel = typeof CountModel.Type
      const Bump = m('Bump')
      const CountMessage = S.Union([Bump])
      type CountMessage = typeof CountMessage.Type
      const CountProgram = make({
        id: 'inspect-count',
        version: 1,
        Model: CountModel,
        Message: CountMessage,
        init: () => [CountModel.make({ count: 0 }), []],
        update: (model: CountModel) => [
          CountModel.make({ count: model.count + 1 }),
          [],
        ],
        valid: (model: CountModel) => [
          {
            token: 'bump',
            keys: ['+'],
            spoken: ['bump'],
            valid: true,
          },
          {
            token: 'reset',
            keys: ['r'],
            spoken: ['reset'],
            valid: model.count !== 0,
          },
        ],
        screen: (model: CountModel) => Text(String(model.count)),
      })
      const journal = makeProgramJournal({
        program: CountProgram,
        initialModel: CountModel.make({ count: 0 }),
        now: () => 1,
      })
      journal.record({
        message: Bump(),
        source: fromHost('bump'),
        isOperationSettled: true,
        commands: [],
        model: CountModel.make({ count: 1 }),
      })
      const tape = fromJournal(CountProgram, journal.read())
      const start = yield* inspectReplayFrame(CountProgram, tape, 0)
      const next = yield* inspectReplayFrame(CountProgram, tape, 1)

      expect(start.model).toStrictEqual({ count: 0 })
      expect(start.valid).toStrictEqual([
        { token: 'bump', keys: ['+'], spoken: ['bump'], valid: true },
        { token: 'reset', keys: ['r'], spoken: ['reset'], valid: false },
      ])
      expect(Option.isSome(start.screen) && start.screen.value).toEqual(
        Text('0'),
      )
      expect(next.model).toStrictEqual({ count: 1 })
      expect(Option.getOrUndefined(Array.get(next.valid, 1))).toEqual({
        token: 'reset',
        keys: ['r'],
        spoken: ['reset'],
        valid: true,
      })
      expect(Option.isSome(next.screen) && next.screen.value).toEqual(Text('1'))
    }),
  )

  it.effect('round-trips encoded Messages and causal metadata', () =>
    Effect.gen(function* () {
      const Program = make({
        id: 'save',
        version: 1,
        Model,
        Message,
        init: () => [{ stage: 'Ready' }, []],
        update: (model, _message) => [model, []],
      })
      const journal = makeProgramJournal({
        program: Program,
        initialModel: { stage: 'Ready' },
        now: () => 42,
      })
      journal.record({
        message: RequestedSave(),
        source: fromHost('save'),
        operationId: 7,
        isOperationSettled: true,
        commands: [],
        model: { stage: 'Ready' },
      })
      const tape = fromJournal(Program, journal.read())
      const json = yield* encodeReplayTape(Program, tape)
      const decoded = yield* decodeReplayTape(Program, json)

      expect(decoded).toStrictEqual(tape)
    }),
  )

  it.effect('keeps only runtime events that occurred by a branch frame', () =>
    Effect.gen(function* () {
      const Program = make({
        id: 'runtime-event-branch',
        version: 1,
        Model,
        Message,
        init: () => [{ stage: 'Ready' }, []],
        update: (model, _message) => [model, []],
      })
      const journal = makeProgramJournal({
        program: Program,
        initialModel: Model.make({ stage: 'Ready' }),
      })
      journal.record({
        message: RequestedSave(),
        source: fromHost('save'),
        isOperationSettled: true,
        commands: [],
        model: Model.make({ stage: 'Saving' }),
      })
      journal.record({
        message: CompletedAudit(),
        source: fromCommand('Audit'),
        isOperationSettled: true,
        commands: [],
        model: Model.make({ stage: 'Saved' }),
      })
      const tape = fromJournal(Program, journal.read(), [
        {
          name: 'SelectedDependencyImplementation',
          attributes: { implementation: 'Mock' },
          afterFrame: 0,
          timestamp: 1,
        },
        {
          name: 'SelectedDependencyImplementation',
          attributes: { implementation: 'Preview' },
          afterFrame: 1,
          timestamp: 2,
        },
        {
          name: 'SelectedDependencyImplementation',
          attributes: { implementation: 'Live' },
          afterFrame: 2,
          timestamp: 3,
        },
      ])

      const branch = yield* branchReplayTape(tape, 1)

      expect(branch.transitions).toHaveLength(1)
      expect(branch.runtimeEvents).toStrictEqual([
        expect.objectContaining({
          attributes: { implementation: 'Mock' },
          afterFrame: 0,
        }),
        expect.objectContaining({
          attributes: { implementation: 'Preview' },
          afterFrame: 1,
        }),
      ])
    }),
  )

  it.effect('rejects a tape for a different Program identity', () =>
    Effect.gen(function* () {
      const Program = make({
        id: 'save',
        version: 1,
        Model,
        Message,
        init: () => [{ stage: 'Ready' }, []],
        update: (model, _message) => [model, []],
      })
      const OtherProgram = make({
        ...Program,
        id: 'other',
      })
      const journal = makeProgramJournal({
        program: Program,
        initialModel: { stage: 'Ready' },
      })
      const json = yield* encodeReplayTape(
        Program,
        fromJournal(Program, journal.read()),
      )
      const error = yield* Effect.flip(decodeReplayTape(OtherProgram, json))

      expect(error._tag).toBe('IncompatibleProgramError')
    }),
  )

  it.effect('migrates encoded Messages before current Schema decoding', () =>
    Effect.gen(function* () {
      const Increased = m('Increased')
      const OldMessage = S.Union([Increased])
      const OldProgram = make({
        id: 'counter',
        version: 1,
        Model: S.Struct({ count: S.Number }),
        Message: OldMessage,
        init: () => [{ count: 0 }, []],
        update: (model, _message) => [{ count: model.count + 1 }, []],
      })
      const Incremented = m('Incremented')
      const NewMessage = S.Union([Incremented])
      const NewProgram = make({
        id: 'counter',
        version: 2,
        Model: S.Struct({ count: S.Number }),
        Message: NewMessage,
        init: () => [{ count: 0 }, []],
        update: (model, _message) => [{ count: model.count + 1 }, []],
        migrations: [
          {
            fromVersion: 1,
            toVersion: 2,
            migrate: encodedTape =>
              S.decodeUnknownSync(S.Json)(
                JSON.parse(
                  JSON.stringify(encodedTape)
                    .replace('"programVersion":1', '"programVersion":2')
                    .replace('"_tag":"Increased"', '"_tag":"Incremented"'),
                ),
              ),
          },
        ],
      })
      const journal = makeProgramJournal({
        program: OldProgram,
        initialModel: { count: 0 },
      })
      journal.record({
        message: Increased(),
        source: fromHost('increment'),
        isOperationSettled: true,
        commands: [],
        model: { count: 1 },
      })
      const json = yield* encodeReplayTape(
        OldProgram,
        fromJournal(OldProgram, journal.read()),
      )
      const decoded = yield* decodeReplayTape(NewProgram, json)

      expect(decoded.programVersion).toBe(2)
      expect(decoded.transitions).toStrictEqual([
        expect.objectContaining({ message: Incremented() }),
      ])
    }),
  )

  it.effect('returns a typed error for a non-serializable Message', () =>
    Effect.gen(function* () {
      const ReceivedValue = m('ReceivedValue', { value: S.Unknown })
      const Program = make({
        id: 'unknown-value',
        version: 1,
        Model: S.Struct({ count: S.Number }),
        Message: S.Union([ReceivedValue]),
        init: () => [{ count: 0 }, []],
        update: (model, _message) => [model, []],
      })
      const journal = makeProgramJournal({
        program: Program,
        initialModel: { count: 0 },
      })
      journal.record({
        message: ReceivedValue({ value: () => 'not JSON' }),
        source: fromHost(),
        isOperationSettled: true,
        commands: [],
        model: { count: 0 },
      })
      const error = yield* Effect.flip(
        encodeReplayTape(Program, fromJournal(Program, journal.read())),
      )

      expect(error._tag).toBe('ReplayTapeExportError')
    }),
  )
})
