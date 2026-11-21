import { Match as M, Option, Schema as S, Stream } from 'effect'
import { describe, expectTypeOf, it } from 'vitest'

import { m } from '../message/public.js'
import { ts } from '../schema/index.js'
import * as Subscription from '../subscription/subscription.js'
import {
  type AnyDurabilityModel,
  type SyncedOfSchema,
  ephemeral,
  loaded,
  local,
  model,
  taggedModel,
} from './durability.js'
import { make } from './program.js'
import { type StrictSyncChild } from './sync.js'

const Idle = ts('Idle')
const Player = model({
  synced: { placeMs: S.Number },
  local: { nextCue: local(S.Int, () => 0) },
  loaded: { transcript: loaded(S.String, () => '') },
  ephemeral: { isBuffering: ephemeral(S.Boolean, () => false) },
})
const Loaded = taggedModel('Loaded', {
  key: 'slug',
  synced: { slug: S.String, player: Player },
  local: { savedPlaceMs: local(S.Number, () => 0) },
  ephemeral: { isLive: ephemeral(S.Boolean, () => false) },
})
const Listening = S.Union([Idle, Loaded])
const TestModel = model({
  synced: { speed: S.Number, listening: Listening },
  local: { theme: S.String },
  loaded: { library: loaded(S.Array(S.String), () => []) },
  ephemeral: { maybeNotice: ephemeral(S.Option(S.String), Option.none) },
})
type TestModel = typeof TestModel.Type

const ReceivedLibrary = m('ReceivedLibrary', { titles: S.Array(S.String) })
const SetSpeed = m('SetSpeed', { speed: S.Number })
const TestMessage = S.Union([ReceivedLibrary, SetSpeed])
type TestMessage = typeof TestMessage.Type

describe('Model durability compile-time enforcement', () => {
  it('excludes loaded, local, and ephemeral fields from SyncedOfSchema and foldSynced', () => {
    type Synced = SyncedOfSchema<typeof TestModel>
    expectTypeOf<Synced>().toHaveProperty('speed')
    expectTypeOf<Synced>().toHaveProperty('listening')

    const fold = (current: Synced): Synced => {
      // @ts-expect-error loaded field `library` cannot be read in shared fold
      void current.library
      // @ts-expect-error local field `theme` cannot be read in shared fold
      void current.theme
      // @ts-expect-error ephemeral field `maybeNotice` cannot be read in shared fold
      void current.maybeNotice
      if (current.listening._tag === 'Loaded') {
        void current.listening.slug
        void current.listening.player.placeMs
        // @ts-expect-error nested loaded field `transcript` cannot be read in shared fold
        void current.listening.player.transcript
        // @ts-expect-error nested local field `savedPlaceMs` cannot be read in shared fold
        void current.listening.savedPlaceMs
      }
      return current
    }
    void fold

    make({
      id: 'fold-synced-check',
      version: 1,
      Model: TestModel,
      Message: TestMessage,
      init: () => [
        TestModel.make({
          speed: 1,
          listening: Idle(),
          theme: 'System',
          library: [],
          maybeNotice: Option.none(),
        }),
        [],
      ],
      update: current => [current, []],
      synchronization: {
        messageCategory: () => 'Domain',
        projectDomain: current => current.speed,
        foldSynced: synced => {
          // @ts-expect-error loaded field `library` cannot be read inside foldSynced
          void synced.library
          return synced
        },
      },
    })
  })

  it('rejects writing synced or local fields from a Subscription (literal, spread, aliased)', () => {
    Subscription.forModel(TestModel)<TestMessage>()(entry => ({
      badSyncedTop: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          // @ts-expect-error cannot write synced field `speed` from Subscription
          apply: () => ({ speed: 2 }),
        },
      ),
      badLocalTop: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          // @ts-expect-error cannot write local field `theme` from Subscription
          apply: () => ({ theme: 'dark' }),
        },
      ),
      badSpreadModel: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          // @ts-expect-error spreading full Model writes synced/local fields
          apply: current => ({ ...current, library: ['a'] }),
        },
      ),
      badUnionSwitch: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          // @ts-expect-error cannot switch tagged union variant from Subscription
          apply: () => ({ listening: Idle() }),
        },
      ),
      badNestedSynced: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          apply: () => ({
            // @ts-expect-error cannot write nested synced `placeMs` inside Loaded.player
            listening: { Loaded: { player: { placeMs: 100 } } },
          }),
        },
      ),
      badNestedLocal: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          apply: () => ({
            // @ts-expect-error cannot write nested local `savedPlaceMs` inside Loaded
            listening: { Loaded: { savedPlaceMs: 100 } },
          }),
        },
      ),
      badAliasedVariable: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          // @ts-expect-error aliased object with synced key is rejected via `speed?: never`
          apply: () => {
            const sneak = { library: ['a'], speed: 2 }
            return sneak
          },
        },
      ),
      badEmitSyncedAction: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () =>
            // @ts-expect-error cannot emit undeclared synced Action `SetSpeed`
            Stream.make(SetSpeed({ speed: 2 })),
          apply: (_m, { titles }) => ({ library: titles }),
        },
      ),
    }))
  })

  it('excludes Subscription facts from config.update and rejects legacy Subscription.make on DurabilityModel', () => {
    const scopedSubs = Subscription.forModel(TestModel)<TestMessage>()(
      entry => ({
        lib: entry(
          {},
          {
            facts: [ReceivedLibrary],
            modelToDependencies: () => ({}),
            dependenciesToStream: () => Stream.empty,
            apply: (_m, { titles }) => ({ library: titles }),
          },
        ),
      }),
    )

    make({
      id: 'update-excludes-facts',
      version: 1,
      Model: TestModel,
      Message: TestMessage,
      init: () => [
        TestModel.make({
          speed: 1,
          listening: Idle(),
          theme: 'System',
          library: [],
          maybeNotice: Option.none(),
        }),
        [],
      ],
      subscriptions: scopedSubs,
      update: (current, message) =>
        M.value(message).pipe(
          M.withReturnType<readonly [TestModel, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            SetSpeed: ({ speed }) => [{ ...current, speed }, []],
            // @ts-expect-error Subscription fact `ReceivedLibrary` is excluded from config.update
            ReceivedLibrary: () => [current, []],
          }),
        ),
    })

    const legacySubs = Subscription.make<TestModel, TestMessage>()(entry => ({
      lib: entry(
        {},
        {
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
        },
      ),
    }))

    make({
      id: 'reject-legacy-subs',
      version: 1,
      // @ts-expect-error DurabilityModel requires Subscription.forModel(Model)
      Model: TestModel,
      Message: TestMessage,
      init: () => [
        TestModel.make({
          speed: 1,
          listening: Idle(),
          theme: 'System',
          library: [],
          maybeNotice: Option.none(),
        }),
        [],
      ],
      subscriptions: legacySubs,
      update: current => [current, []],
    })
  })

  it('rejects duplicate fields across durability buckets and unclassified raw S.Struct', () => {
    // @ts-expect-error duplicate field `speed` across synced and local buckets
    model({
      synced: { speed: S.Number },
      local: { speed: S.Number },
    })

    const RawModel = S.Struct({ count: S.Number })
    const RawProgram = make({
      id: 'raw',
      version: 1,
      Model: RawModel,
      Message: SetSpeed,
      init: () => [{ count: 0 }, []],
      update: current => [current, []],
    })

    const requireStrict = <Child extends StrictSyncChild>(_child: Child) =>
      _child
    const requireDurability = <ModelSchema extends AnyDurabilityModel>(
      _schema: ModelSchema,
    ) => _schema

    // @ts-expect-error raw S.Struct is not a DurabilityModel
    requireDurability(RawModel)
    // @ts-expect-error synced Program Model must be built with Program.model(...)
    requireStrict(RawProgram)
  })
})
