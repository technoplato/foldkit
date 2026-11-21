import {
  Array,
  Duration,
  Effect,
  Exit,
  Match as M,
  Schema as S,
  SchemaTransformation,
  Scope,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as Input from '../behavior/input.js'
import * as Pace from '../behavior/pace.js'
import * as Part from '../behavior/part.js'
import * as Slider from '../behavior/slider.js'
import * as Switch from '../behavior/switch.js'
import * as Toggle from '../behavior/toggle.js'
import * as Catalog from '../catalog/catalog.js'
import { m } from '../message/public.js'
import * as Declaration from '../navigation/declaration.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import * as Session from '../session/session.js'
import { start } from './start.js'
import { Memory, type SyncEngine, makeMemoryStore } from './syncEngine.js'

const SETTLE_WINDOW_MS = 40
const SAMPLE_WINDOW_MS = 40
const LONG_SETTLE_WINDOW_MS = 5_000
const POLL_STEP_MS = 5
const POLL_ATTEMPTS = 200

const waitUntil = (isDone: () => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < POLL_ATTEMPTS && !isDone(); attempt += 1) {
      yield* Effect.sleep(Duration.millis(POLL_STEP_MS))
    }
  })

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const SnapshotRow = S.Struct({
  id: S.String,
  payload: S.String,
  asOf: S.String,
  at: S.Number,
})

const makeJsonMessageWire = <Message>(
  messageSchema: S.Codec<Message, unknown, never, never>,
) =>
  MessageRow.pipe(
    S.decodeTo(
      S.fromJsonString(messageSchema),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
      }),
    ),
  )

const makeJsonSnapshotWire = <Model>(
  modelSchema: S.Codec<Model, unknown, never, never>,
) =>
  SnapshotRow.pipe(
    S.decodeTo(
      S.fromJsonString(modelSchema),
      SchemaTransformation.transform({
        decode: row => row.payload,
        encode: payload => ({ id: 'snapshot', payload, asOf: '', at: 0 }),
      }),
    ),
  )

const FieldName = S.Literals(['Title', 'Notes'])

const TypedDraft = m('TypedDraft', { text: S.String })
const TypedField = m('TypedField', { field: FieldName, value: S.String })
const SubmitDraft = m('SubmitDraft')
const DraggedTo = m('DraggedTo', { x: S.Number })
const DroppedDrag = m('DroppedDrag')
const HoveredControl = m('HoveredControl')

const EditorMessage = S.Union([
  TypedDraft,
  TypedField,
  SubmitDraft,
  DraggedTo,
  DroppedDrag,
  HoveredControl,
])
type EditorMessage = typeof EditorMessage.Type

const EditorModel = S.Struct({
  draft: S.String,
  title: S.String,
  notes: S.String,
  submitted: S.Array(S.String),
  dragX: S.Number,
  dropCount: S.Number,
  hoverCount: S.Number,
})
type EditorModel = typeof EditorModel.Type

const initialEditorModel: EditorModel = {
  draft: '',
  title: '',
  notes: '',
  submitted: [],
  dragX: 0,
  dropCount: 0,
  hoverCount: 0,
}

const EditorProgram = make({
  id: 'pace-sync-editor',
  version: 1,
  Model: EditorModel,
  Message: EditorMessage,
  init: () => [initialEditorModel, []],
  update: (model: EditorModel, message: EditorMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [EditorModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        TypedDraft: ({ text }) => [{ ...model, draft: text }, []],
        TypedField: ({ field, value }) =>
          field === 'Title'
            ? [{ ...model, title: value }, []]
            : [{ ...model, notes: value }, []],
        SubmitDraft: () => [
          { ...model, submitted: [...model.submitted, model.draft] },
          [],
        ],
        DraggedTo: ({ x }) => [{ ...model, dragX: x }, []],
        DroppedDrag: () => [{ ...model, dropCount: model.dropCount + 1 }, []],
        HoveredControl: () => [
          { ...model, hoverCount: model.hoverCount + 1 },
          [],
        ],
      }),
    ),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
    paceOf: message =>
      M.value(message).pipe(
        M.tagsExhaustive({
          TypedDraft: () => Pace.Settled({ afterMs: SETTLE_WINDOW_MS }),
          TypedField: ({ field }) => ({
            part: field,
            key: `${field}.TypedField`,
            sync: Pace.Settled({ afterMs: SETTLE_WINDOW_MS }),
          }),
          SubmitDraft: () => Pace.Synced(),
          DraggedTo: () => Pace.Sampled({ everyMs: SAMPLE_WINDOW_MS }),
          DroppedDrag: () => Pace.Synced(),
          HoveredControl: () => Pace.Device({ because: 'InputInProgress' }),
        }),
      ),
  },
})

const EditorMessageWire = makeJsonMessageWire(EditorMessage)
const EditorSnapshotWire = makeJsonSnapshotWire(EditorModel)

const SyncedEditor = compose.sync({
  of: EditorProgram,
  snapshot: EditorSnapshotWire,
  message: EditorMessageWire,
})

const LongSettledEditor = compose.sync({
  of: make({
    ...EditorProgram,
    id: 'pace-sync-long-settled-editor',
    synchronization: {
      messageCategory: () => 'Domain',
      projectDomain: model => model,
      paceOf: message =>
        message._tag === 'TypedDraft'
          ? Pace.Settled({ afterMs: LONG_SETTLE_WINDOW_MS })
          : Pace.Synced(),
    },
  }),
  snapshot: EditorSnapshotWire,
  message: EditorMessageWire,
})

const decodeEditorRows = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<EditorMessage> =>
  Array.map(rows, row => S.decodeUnknownSync(EditorMessageWire)(row))

const readyEditorOf = (
  model: ReturnType<typeof SyncedEditor.init>[0],
): EditorModel => {
  if (model._tag !== 'Ready') {
    throw new Error(`Expected Ready model, got ${model._tag}`)
  }
  const { _tag: _readyTag, ...editor } = model
  return editor
}

describe('Runtime.start Pace synchronization', () => {
  it('Pace.Settled updates local Model immediately, writes 0 rows during burst, and writes the final coalesced Message once after settling', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
          })
          const phone = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'phone', store }),
          })

          for (const text of ['f', 'fo', 'fol', 'fold']) {
            yield* desktop.run(TypedDraft({ text }))
            expect(readyEditorOf(desktop.readModel()).draft).toBe(text)
            expect(store.messages).toHaveLength(0)
          }

          expect(readyEditorOf(phone.readModel()).draft).toBe('')

          yield* waitUntil(() => store.messages.length > 0)
          yield* Effect.sleep(Duration.millis(SETTLE_WINDOW_MS + 20))

          expect(decodeEditorRows(store.messages)).toEqual([
            TypedDraft({ text: 'fold' }),
          ])
          expect(readyEditorOf(phone.readModel()).draft).toBe('fold')
        }),
      ),
    )
  })

  it('Pace.Settled flushes waiting keystrokes strictly before a Pace.Synced Submit with 2 writes total', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
          })
          const phone = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'phone', store }),
          })

          yield* desktop.run(TypedDraft({ text: 'he' }))
          yield* desktop.run(TypedDraft({ text: 'hello' }))
          expect(store.messages).toHaveLength(0)

          yield* desktop.run(SubmitDraft())

          expect(decodeEditorRows(store.messages)).toEqual([
            TypedDraft({ text: 'hello' }),
            SubmitDraft(),
          ])
          expect(readyEditorOf(desktop.readModel()).submitted).toEqual([
            'hello',
          ])
          expect(readyEditorOf(phone.readModel()).draft).toBe('hello')
          expect(readyEditorOf(phone.readModel()).submitted).toEqual(['hello'])

          yield* Effect.sleep(Duration.millis(SETTLE_WINDOW_MS + 20))
          expect(store.messages).toHaveLength(2)
        }),
      ),
    )
  })

  it('coalesces per-Part { part, key, sync } targets independently and flushes every waiting key before Synced', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
          })
          const phone = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'phone', store }),
          })

          yield* desktop.run(TypedField({ field: 'Title', value: 'A' }))
          yield* desktop.run(TypedField({ field: 'Notes', value: 'first' }))
          yield* desktop.run(TypedField({ field: 'Title', value: 'Atlas' }))
          yield* desktop.run(
            TypedField({ field: 'Notes', value: 'first draft' }),
          )
          expect(store.messages).toHaveLength(0)

          yield* desktop.run(SubmitDraft())

          expect(decodeEditorRows(store.messages)).toEqual([
            TypedField({ field: 'Title', value: 'Atlas' }),
            TypedField({ field: 'Notes', value: 'first draft' }),
            SubmitDraft(),
          ])
          expect(readyEditorOf(phone.readModel()).title).toBe('Atlas')
          expect(readyEditorOf(phone.readModel()).notes).toBe('first draft')
        }),
      ),
    )
  })

  it('Pace.Sampled writes the 1st drag tick immediately, coalesces intermediate ticks, and flushes the latest tick once the sample window passes', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
          })
          const phone = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'phone', store }),
          })

          yield* desktop.run(DraggedTo({ x: 10 }))
          expect(readyEditorOf(desktop.readModel()).dragX).toBe(10)
          expect(decodeEditorRows(store.messages)).toEqual([
            DraggedTo({ x: 10 }),
          ])

          yield* desktop.run(DraggedTo({ x: 20 }))
          yield* desktop.run(DraggedTo({ x: 30 }))
          yield* desktop.run(DraggedTo({ x: 40 }))
          expect(readyEditorOf(desktop.readModel()).dragX).toBe(40)
          expect(store.messages).toHaveLength(1)

          yield* waitUntil(() => store.messages.length >= 2)
          yield* Effect.sleep(Duration.millis(SAMPLE_WINDOW_MS + 20))

          expect(decodeEditorRows(store.messages)).toEqual([
            DraggedTo({ x: 10 }),
            DraggedTo({ x: 40 }),
          ])
          expect(readyEditorOf(phone.readModel()).dragX).toBe(40)
        }),
      ),
    )
  })

  it('Pace.Sampled flushes the newest waiting tick before a Pace.Synced drop', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
          })

          yield* desktop.run(DraggedTo({ x: 10 }))
          yield* desktop.run(DraggedTo({ x: 25 }))
          yield* desktop.run(DraggedTo({ x: 35 }))
          expect(store.messages).toHaveLength(1)

          yield* desktop.run(DroppedDrag())
          expect(decodeEditorRows(store.messages)).toEqual([
            DraggedTo({ x: 10 }),
            DraggedTo({ x: 35 }),
            DroppedDrag(),
          ])
        }),
      ),
    )
  })

  it('Pace.Device updates local Model immediately, writes 0 rows, does not flush waiting settled input, and ignores remote rows', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktopEngine = Memory({ processor: 'desktop', store })
          const desktop = yield* start({
            program: SyncedEditor,
            sync: desktopEngine,
          })
          const phone = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'phone', store }),
          })

          yield* desktop.run(TypedDraft({ text: 'draft' }))
          yield* desktop.run(HoveredControl())
          yield* desktop.run(HoveredControl())

          expect(readyEditorOf(desktop.readModel()).hoverCount).toBe(2)
          expect(readyEditorOf(phone.readModel()).hoverCount).toBe(0)
          expect(store.messages).toHaveLength(0)

          desktopEngine.injectMessage({
            id: 'remote-hover',
            body: JSON.stringify(HoveredControl()),
            from: 'phone',
            createdAtMs: Date.now() + 10_000,
          })
          expect(readyEditorOf(desktop.readModel()).hoverCount).toBe(2)

          yield* waitUntil(() => store.messages.length >= 2)
          const desktopRows = Array.filter(
            store.messages,
            row => S.decodeUnknownSync(MessageRow)(row).from === 'desktop',
          )
          expect(decodeEditorRows(desktopRows)).toEqual([
            TypedDraft({ text: 'draft' }),
          ])
          expect(readyEditorOf(desktop.readModel()).hoverCount).toBe(2)
          expect(readyEditorOf(phone.readModel()).hoverCount).toBe(0)
        }),
      ),
    )
  })

  it('serializes causal flushes even when the sync engine delays earlier writes', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const baseEngine = Memory({ processor: 'desktop', store })
          let writeCount = 0
          const delayedEngine: SyncEngine = {
            ...baseEngine,
            write: write =>
              Effect.gen(function* () {
                writeCount += 1
                if (writeCount === 1) {
                  yield* Effect.sleep(Duration.millis(25))
                }
                return yield* baseEngine.write(write)
              }),
          }

          const desktop = yield* start({
            program: SyncedEditor,
            sync: delayedEngine,
          })

          yield* desktop.run(TypedDraft({ text: 'causal' }))
          yield* desktop.run(SubmitDraft())

          expect(decodeEditorRows(store.messages)).toEqual([
            TypedDraft({ text: 'causal' }),
            SubmitDraft(),
          ])
        }),
      ),
    )
  })

  it('respects a controllable clock when deciding when settled writes become due', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          let nowMs = 1_000
          const desktop = yield* start({
            program: SyncedEditor,
            sync: Memory({ processor: 'desktop', store }),
            clock: () => nowMs,
          })

          yield* desktop.run(TypedDraft({ text: 'a' }))
          nowMs = 1_020
          yield* desktop.run(TypedDraft({ text: 'ab' }))
          expect(store.messages).toHaveLength(0)

          nowMs = 1_059
          yield* Effect.sleep(Duration.millis(SETTLE_WINDOW_MS + 15))
          expect(store.messages).toHaveLength(0)

          nowMs = 1_060
          yield* waitUntil(() => store.messages.length > 0)
          expect(decodeEditorRows(store.messages)).toEqual([
            TypedDraft({ text: 'ab' }),
          ])
        }),
      ),
    )
  })

  it('interrupts any pending pace timer cleanly on scope close with zero post-close writes', async () => {
    const store = makeMemoryStore()
    const scope = await Effect.runPromise(Scope.make())

    const runtime = await Effect.runPromise(
      start({
        program: LongSettledEditor,
        sync: Memory({ processor: 'desktop', store }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await Effect.runPromise(runtime.run(TypedDraft({ text: 'unsaved' })))
    expect(readyEditorOf(runtime.readModel()).draft).toBe('unsaved')
    expect(store.messages).toHaveLength(0)

    const closedAtStart = Date.now()
    await Effect.runPromise(Scope.close(scope, Exit.void))
    const closeElapsedMs = Date.now() - closedAtStart

    expect(closeElapsedMs).toBeLessThan(1_000)
    await Effect.runPromise(Effect.sleep(Duration.millis(60)))
    expect(store.messages).toHaveLength(0)
  })

  it('works end-to-end with composed core Parts (Input Settled, Slider Sampled, Toggle Synced, Switch deviceOnly)', async () => {
    const Home = ts('Home')
    const Ping = Catalog.action('Ping', {
      what: 'Records a ping',
      why: 'To verify base Program Actions beside composed Parts',
      meta: { label: 'Ping', keys: [] },
    })
    const baseCatalog = Catalog.make([Ping])

    const BaseProgram = make({
      id: 'pace-composed-parts',
      version: 1,
      Model: S.Struct({ pings: S.Number }),
      Message: baseCatalog.Message,
      init: () => [{ pings: 0 }, []],
      update: model => [{ pings: model.pings + 1 }, []],
      catalog: baseCatalog,
      navigation: Declaration.screens({
        slug: 'parts',
        root: Declaration.rootScreen(Home, Route.here),
      }),
    })

    const inputProps: Input.Props = { id: 'search' }
    const sliderProps: Slider.Props = {
      id: 'volume',
      min: 0,
      max: 100,
      step: 1,
      defaultValues: [0],
    }
    const toggleProps: Toggle.Props = { id: 'bold' }
    const switchProps: Switch.Props = { id: 'local-switch' }

    const PartsApp = Part.compose({
      of: BaseProgram,
      parts: [
        Part.given(
          Input.make({ settleMs: SETTLE_WINDOW_MS }),
          () => inputProps,
        ),
        Part.given(
          Slider.make({ defaultValue: 0, sampleMs: SAMPLE_WINDOW_MS }),
          () => sliderProps,
        ),
        Part.given(Toggle.part, () => toggleProps),
        Part.given(
          Switch.deviceOnly({
            name: 'LocalSwitch',
            because: 'OwnChoice',
          }),
          () => switchProps,
        ),
      ],
    })

    const SessionPartsApp = Session.compose({ of: PartsApp })
    const PartsMessageWire = makeJsonMessageWire(SessionPartsApp.Message)
    const PartsSnapshotWire = makeJsonSnapshotWire(SessionPartsApp.Model)
    const SyncedPartsApp = compose.sync({
      of: SessionPartsApp,
      snapshot: PartsSnapshotWire,
      message: PartsMessageWire,
    })

    const decodePartTags = (rows: ReadonlyArray<unknown>) =>
      Array.map(rows, row => S.decodeUnknownSync(PartsMessageWire)(row)._tag)

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const desktop = yield* start({
            program: SyncedPartsApp,
            sync: Memory({ processor: 'desktop', store }),
          })
          const phone = yield* start({
            program: SyncedPartsApp,
            sync: Memory({ processor: 'phone', store }),
          })

          yield* desktop.run(Input.ChangeInput({ value: 'f' }))
          yield* desktop.run(Input.ChangeInput({ value: 'fo' }))
          yield* desktop.run(Input.ChangeInput({ value: 'fold' }))

          const desktopAfterType = desktop.readModel()
          expect(desktopAfterType._tag).toBe('Ready')
          if (desktopAfterType._tag === 'Ready') {
            expect(Input.draftOf(desktopAfterType.parts['Input'])).toBe('fold')
          }
          expect(store.messages).toHaveLength(0)

          yield* desktop.run(Switch.ToggleSwitch())
          const desktopAfterSwitch = desktop.readModel()
          if (desktopAfterSwitch._tag === 'Ready') {
            expect(desktopAfterSwitch.parts['LocalSwitch']).toEqual(Switch.On())
          }
          expect(store.messages).toHaveLength(0)

          yield* desktop.run(Toggle.ToggleButton())
          expect(decodePartTags(store.messages)).toEqual([
            'ChangeInput',
            'ToggleButton',
          ])

          const phoneAfterToggle = phone.readModel()
          expect(phoneAfterToggle._tag).toBe('Ready')
          if (phoneAfterToggle._tag === 'Ready') {
            expect(Input.draftOf(phoneAfterToggle.parts['Input'])).toBe('fold')
            expect(phoneAfterToggle.parts['Toggle']).toEqual(Toggle.Pressed())
            expect(phoneAfterToggle.parts['LocalSwitch']).toEqual(Switch.Off())
          }

          yield* desktop.run(
            Slider.PressSliderTrack({ pointerId: 1, x: 10, y: 0, value: 10 }),
          )
          yield* desktop.run(
            Slider.MoveSliderDrag({ pointerId: 1, x: 20, y: 0, value: 20 }),
          )
          expect(store.messages).toHaveLength(4)

          yield* desktop.run(
            Slider.MoveSliderDrag({ pointerId: 1, x: 35, y: 0, value: 35 }),
          )
          yield* desktop.run(
            Slider.MoveSliderDrag({ pointerId: 1, x: 50, y: 0, value: 50 }),
          )
          expect(store.messages).toHaveLength(4)

          const desktopMidDrag = desktop.readModel()
          if (desktopMidDrag._tag === 'Ready') {
            expect(Slider.valuesOf(desktopMidDrag.parts['Slider'])).toEqual([
              50,
            ])
          }

          yield* waitUntil(() => store.messages.length >= 5)
          expect(decodePartTags(store.messages)).toEqual([
            'ChangeInput',
            'ToggleButton',
            'PressSliderTrack',
            'MoveSliderDrag',
            'MoveSliderDrag',
          ])

          yield* desktop.run(Slider.ReleaseSliderDrag({}))
          expect(decodePartTags(store.messages)).toEqual([
            'ChangeInput',
            'ToggleButton',
            'PressSliderTrack',
            'MoveSliderDrag',
            'MoveSliderDrag',
            'ReleaseSliderDrag',
          ])

          const phoneFinal = phone.readModel()
          expect(phoneFinal._tag).toBe('Ready')
          if (phoneFinal._tag === 'Ready') {
            expect(Slider.valuesOf(phoneFinal.parts['Slider'])).toEqual([50])
            expect(Slider.isDragging(phoneFinal.parts['Slider'])).toBe(false)
            expect(phoneFinal.parts['LocalSwitch']).toEqual(Switch.Off())
          }
        }),
      ),
    )
  })
})
