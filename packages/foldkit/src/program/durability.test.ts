import {
  Effect,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  Stream,
  pipe,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { described, observablesOf } from '../declaration/declare.js'
import { m } from '../message/public.js'
import * as Navigation from '../navigation/public.js'
import * as Route from '../route/parser.js'
import * as LocalSnapshot from '../runtime/localSnapshot.js'
import { start } from '../runtime/start.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import { ts } from '../schema/index.js'
import * as Session from '../session/session.js'
import * as Subscription from '../subscription/subscription.js'
import { AppearanceState, initialAppearance } from '../theme/appearance.js'
import { compose } from './compose.js'
import {
  ForbiddenSubscriptionWriteError,
  applySubscriptionPatch,
  assertDurabilityExhaustive,
  ephemeral,
  hasDurabilityBelow,
  hydrateFromSynced,
  loaded,
  local,
  mergeOnRefold,
  model,
  projectSynced,
  stripForLocalSnapshot,
  stripForSharedSnapshot,
  taggedModel,
} from './durability.js'
import { make } from './program.js'

// FIXTURES

const Idle = ts('Idle')

const Media = model({
  synced: {
    mediaId: S.String.check(S.isMinLength(1)),
    durationMs: S.Number,
  },
  loaded: {
    maybeAudioUrl: loaded(S.Option(S.String), Option.none),
    sections: loaded(S.Array(S.String), () => []),
  },
})

const Player = model({
  synced: {
    media: Media,
    placeMs: S.Number,
  },
  local: {
    nextCue: local(S.Int, () => 0),
    readerMode: local(
      S.String.pipe(S.withDecodingDefaultTypeKey(Effect.succeed('Follow'))),
      () => 'Follow',
    ),
  },
  loaded: {
    transcript: loaded(S.String, () => ''),
  },
  ephemeral: {
    isPlaying: ephemeral(S.Boolean, () => false),
    maybeTickPlaceMs: ephemeral(S.OptionFromOptionalKey(S.Number), Option.none),
  },
})

const Loaded = taggedModel('Loaded', {
  key: 'slug',
  synced: {
    slug: S.String,
    player: Player,
  },
  local: {
    savedPlaceMs: local(S.Number, () => 0),
  },
  ephemeral: {
    isStretching: ephemeral(S.Boolean, () => false),
  },
})

const Listening = S.Union([Idle, Loaded])

const Appearance = model({
  local: {
    choice: S.Literals(['System', 'Light', 'Dark']),
  },
  ephemeral: {
    systemMode: ephemeral(S.Literals(['Light', 'Dark']), () => 'Light'),
  },
})

const TestModel = model({
  synced: {
    speed: S.Number.annotate(
      described({
        what: 'Playback speed multiplier',
        why: 'Determines how fast audio plays',
      }),
    ),
    listening: Listening,
  },
  local: {
    appearance: Appearance.annotate(
      described({
        what: 'Color theme preference',
        why: 'Controls light or dark styling on this device',
      }),
    ),
    maybeProblem: S.Option(S.String),
  },
  loaded: {
    library: loaded(
      S.Array(S.String).annotate(
        described({
          what: 'Loaded titles',
          why: 'Shows the user shelf',
        }),
      ),
      () => [],
    ),
    chapters: loaded(S.Record(S.String, S.Array(S.String)), () => ({})),
  },
  ephemeral: {
    maybeNotice: ephemeral(S.Option(S.String), Option.none),
    maybeMenu: ephemeral(S.OptionFromOptionalKey(S.String), Option.none),
  },
})
type TestModel = typeof TestModel.Type

const baselineModel = (): TestModel =>
  TestModel.make({
    speed: 1,
    listening: Idle(),
    appearance: Appearance.make({ choice: 'System', systemMode: 'Light' }),
    maybeProblem: Option.none(),
    library: [],
    chapters: {},
    maybeNotice: Option.none(),
    maybeMenu: Option.none(),
  })

const loadedModel = (
  slug: string,
  overrides: Partial<{
    placeMs: number
    savedPlaceMs: number
    nextCue: number
    transcript: string
    isPlaying: boolean
    isStretching: boolean
    maybeTickPlaceMs: Option.Option<number>
    sections: ReadonlyArray<string>
    maybeAudioUrl: Option.Option<string>
  }> = {},
): TestModel =>
  TestModel.make({
    speed: 1.5,
    listening: Loaded({
      slug,
      player: Player.make({
        media: Media.make({
          mediaId: `media-${slug}`,
          durationMs: 3600_000,
          maybeAudioUrl: overrides.maybeAudioUrl ?? Option.some('https://x/a'),
          sections: overrides.sections ?? ['Ch 1', 'Ch 2'],
        }),
        placeMs: overrides.placeMs ?? 120_000,
        nextCue: overrides.nextCue ?? 42,
        readerMode: 'Browse',
        transcript: overrides.transcript ?? 'Once upon a time...',
        isPlaying: overrides.isPlaying ?? true,
        maybeTickPlaceMs: overrides.maybeTickPlaceMs ?? Option.some(125_000),
      }),
      savedPlaceMs: overrides.savedPlaceMs ?? 110_000,
      isStretching: overrides.isStretching ?? true,
    }),
    appearance: Appearance.make({ choice: 'Dark', systemMode: 'Dark' }),
    maybeProblem: Option.some('offline'),
    library: ['book-a', 'book-b', 'book-c'],
    chapters: { 'book-a': ['Intro', 'Middle', 'End'] },
    maybeNotice: Option.some('Copied link'),
    maybeMenu: Option.some('book-a'),
  })

// TESTS

describe('Program.model & Program.taggedModel', () => {
  it('preserves Effect 4 combinators, toCodecJson, spreads, and observablesOf', () => {
    const codec = S.toCodecJson(TestModel)
    const sample = loadedModel('book-a')
    const encoded = S.encodeSync(codec)(sample)
    const decoded = S.decodeUnknownSync(codec)(encoded)
    expect(decoded).toEqual(sample)

    const spread = S.Struct({ ...TestModel.fields })
    expect(hasDurabilityBelow(spread.ast)).toBe(true)

    const observedPaths = observablesOf(TestModel).map(({ path }) =>
      path.join('.'),
    )
    expect(observedPaths).toEqual(['speed', 'appearance', 'library'])
  })

  it('throws on duplicate field across buckets', () => {
    expect(() =>
      Reflect.apply(model, undefined, [
        {
          synced: { count: S.Number },
          local: { count: S.Number },
        },
      ]),
    ).toThrow(/duplicate.*count/i)
  })

  it('assertDurabilityExhaustive passes on valid DurabilityModel and fails on raw or bad reset', () => {
    expect(() => assertDurabilityExhaustive(TestModel)).not.toThrow()

    const RawStruct = S.Struct({ count: S.Number })
    expect(() => assertDurabilityExhaustive(RawStruct)).toThrow(
      /Program\.model/,
    )

    const BadReset = model({
      loaded: {
        mediaId: loaded(S.String.check(S.isMinLength(1)), () => ''),
      },
    })
    expect(() => assertDurabilityExhaustive(BadReset)).toThrow(/mediaId/)
  })
})

describe('stripForLocalSnapshot', () => {
  it('strips loaded and ephemeral fields recursively while keeping synced and local fields', () => {
    const populated = loadedModel('book-a')
    const stripped = stripForLocalSnapshot(TestModel.ast, populated)

    expect(stripped.speed).toBe(1.5)
    expect(stripped.appearance).toEqual({
      choice: 'Dark',
      systemMode: 'Light',
    })
    expect(stripped.maybeProblem).toEqual(Option.some('offline'))
    expect(stripped.library).toEqual([])
    expect(stripped.chapters).toEqual({})
    expect(stripped.maybeNotice).toEqual(Option.none())
    expect(stripped.maybeMenu).toEqual(Option.none())

    expect(stripped.listening._tag).toBe('Loaded')
    if (stripped.listening._tag === 'Loaded') {
      expect(stripped.listening.slug).toBe('book-a')
      expect(stripped.listening.savedPlaceMs).toBe(110_000)
      expect(stripped.listening.isStretching).toBe(false)
      expect(stripped.listening.player.placeMs).toBe(120_000)
      expect(stripped.listening.player.nextCue).toBe(42)
      expect(stripped.listening.player.readerMode).toBe('Browse')
      expect(stripped.listening.player.transcript).toBe('')
      expect(stripped.listening.player.isPlaying).toBe(false)
      expect(stripped.listening.player.maybeTickPlaceMs).toEqual(Option.none())
      expect(stripped.listening.player.media).toEqual({
        mediaId: 'media-book-a',
        durationMs: 3600_000,
        maybeAudioUrl: Option.none(),
        sections: [],
      })
    }

    expect(S.is(TestModel)(stripped)).toBe(true)
  })

  it('is copy-on-write when already stripped', () => {
    const base = baselineModel()
    expect(stripForLocalSnapshot(TestModel.ast, base)).toBe(base)
  })
})

describe('stripForSharedSnapshot', () => {
  it('strips loaded, ephemeral, and local fields back to resets or initialModel', () => {
    const initial = baselineModel()
    const populated = loadedModel('book-a')
    const stripped = stripForSharedSnapshot(TestModel.ast, populated, initial)

    expect(stripped.speed).toBe(1.5)
    expect(stripped.appearance).toEqual({
      choice: 'System',
      systemMode: 'Light',
    })
    expect(stripped.maybeProblem).toEqual(Option.none())
    expect(stripped.library).toEqual([])
    expect(stripped.maybeNotice).toEqual(Option.none())
    if (stripped.listening._tag === 'Loaded') {
      expect(stripped.listening.slug).toBe('book-a')
      expect(stripped.listening.savedPlaceMs).toBe(0)
      expect(stripped.listening.isStretching).toBe(false)
      expect(stripped.listening.player.placeMs).toBe(120_000)
      expect(stripped.listening.player.nextCue).toBe(0)
      expect(stripped.listening.player.readerMode).toBe('Follow')
      expect(stripped.listening.player.transcript).toBe('')
      expect(stripped.listening.player.isPlaying).toBe(false)
      expect(stripped.listening.player.media.sections).toEqual([])
    }
    expect(S.is(TestModel)(stripped)).toBe(true)
  })
})

describe('mergeOnRefold', () => {
  it('preserves local, loaded, and ephemeral fields while taking synced fields from refolded', () => {
    const current = loadedModel('book-a', {
      placeMs: 120_000,
      savedPlaceMs: 110_000,
      transcript: 'Current loaded transcript',
      isPlaying: true,
      isStretching: true,
    })
    const refolded = TestModel.make({
      ...baselineModel(),
      speed: 2,
      listening: Loaded({
        slug: 'book-a',
        player: Player.make({
          media: Media.make({
            mediaId: 'media-book-a',
            durationMs: 3600_000,
            maybeAudioUrl: Option.none(),
            sections: [],
          }),
          placeMs: 240_000,
          nextCue: 0,
          readerMode: 'Follow',
          transcript: '',
          isPlaying: false,
          maybeTickPlaceMs: Option.none(),
        }),
        savedPlaceMs: 0,
        isStretching: false,
      }),
    })

    const merged = mergeOnRefold(TestModel.ast, current, refolded)

    expect(merged.speed).toBe(2)
    expect(merged.appearance).toEqual(current.appearance)
    expect(merged.maybeProblem).toEqual(current.maybeProblem)
    expect(merged.library).toEqual(current.library)
    expect(merged.maybeNotice).toEqual(current.maybeNotice)
    expect(merged.listening._tag).toBe('Loaded')
    if (merged.listening._tag === 'Loaded') {
      expect(merged.listening.slug).toBe('book-a')
      expect(merged.listening.savedPlaceMs).toBe(110_000)
      expect(merged.listening.isStretching).toBe(true)
      expect(merged.listening.player.placeMs).toBe(240_000)
      expect(merged.listening.player.nextCue).toBe(42)
      expect(merged.listening.player.transcript).toBe(
        'Current loaded transcript',
      )
      expect(merged.listening.player.isPlaying).toBe(true)
      expect(merged.listening.player.media.sections).toEqual(['Ch 1', 'Ch 2'])
    }
  })

  it('does not leak loaded/ephemeral/local fields when entity key switches on refold', () => {
    const current = loadedModel('book-a', {
      savedPlaceMs: 110_000,
      transcript: 'Book A words',
      isStretching: true,
    })
    const refolded = TestModel.make({
      ...baselineModel(),
      speed: 1,
      listening: Loaded({
        slug: 'book-b',
        player: Player.make({
          media: Media.make({
            mediaId: 'media-book-b',
            durationMs: 5000_000,
            maybeAudioUrl: Option.none(),
            sections: [],
          }),
          placeMs: 0,
          nextCue: 0,
          readerMode: 'Follow',
          transcript: '',
          isPlaying: false,
          maybeTickPlaceMs: Option.none(),
        }),
        savedPlaceMs: 0,
        isStretching: false,
      }),
    })

    const merged = mergeOnRefold(TestModel.ast, current, refolded)

    expect(merged.library).toEqual(current.library)
    expect(merged.listening._tag).toBe('Loaded')
    if (merged.listening._tag === 'Loaded') {
      expect(merged.listening.slug).toBe('book-b')
      expect(merged.listening.savedPlaceMs).toBe(0)
      expect(merged.listening.isStretching).toBe(false)
      expect(merged.listening.player.transcript).toBe('')
      expect(merged.listening.player.media.sections).toEqual([])
      expect(merged.listening.player.nextCue).toBe(0)
    }
  })

  it('takes refolded variant directly when union tag switches', () => {
    const current = loadedModel('book-a')
    const refolded = baselineModel()

    const merged = mergeOnRefold(TestModel.ast, current, refolded)
    expect(merged.listening).toEqual(Idle())
    expect(merged.library).toEqual(current.library)
  })
})

describe('projectSynced & hydrateFromSynced', () => {
  it('projects only synced fields and re-hydrates back to a valid full Model', () => {
    const initial = baselineModel()
    const populated = loadedModel('book-a')
    const synced = projectSynced(TestModel.ast, populated)

    expect(synced).toEqual({
      speed: 1.5,
      listening: {
        _tag: 'Loaded',
        slug: 'book-a',
        player: {
          media: {
            mediaId: 'media-book-a',
            durationMs: 3600_000,
          },
          placeMs: 120_000,
        },
      },
    })

    const hydrated = hydrateFromSynced<TestModel>(
      TestModel.ast,
      initial,
      synced,
    )
    expect(S.is(TestModel)(hydrated)).toBe(true)
    expect(hydrated.appearance).toEqual(initial.appearance)
    expect(hydrated.library).toEqual([])
    if (hydrated.listening._tag === 'Loaded') {
      expect(hydrated.listening.slug).toBe('book-a')
      expect(hydrated.listening.savedPlaceMs).toBe(0)
      expect(hydrated.listening.player.placeMs).toBe(120_000)
      expect(hydrated.listening.player.transcript).toBe('')
      expect(hydrated.listening.player.nextCue).toBe(0)
    }
  })
})

describe('applySubscriptionPatch', () => {
  it('applies top-level and nested loaded/ephemeral patches and ignores mismatched union variants', () => {
    const active = loadedModel('book-a', { transcript: '' })
    const patched = applySubscriptionPatch(TestModel.ast, active, {
      library: ['new-book'],
      appearance: { systemMode: 'Light' },
      listening: {
        Loaded: {
          isStretching: false,
          player: {
            transcript: 'Fresh transcript',
            media: { sections: ['S1'] },
          },
        },
      },
    })

    expect(patched.library).toEqual(['new-book'])
    expect(patched.appearance).toEqual({ choice: 'Dark', systemMode: 'Light' })
    if (patched.listening._tag === 'Loaded') {
      expect(patched.listening.isStretching).toBe(false)
      expect(patched.listening.player.transcript).toBe('Fresh transcript')
      expect(patched.listening.player.media.sections).toEqual(['S1'])
      expect(patched.listening.player.placeMs).toBe(120_000)
    }

    const idle = baselineModel()
    const ignored = applySubscriptionPatch(TestModel.ast, idle, {
      listening: {
        Loaded: {
          player: { transcript: 'Late arrival' },
        },
      },
    })
    expect(ignored).toBe(idle)
  })

  it('throws ForbiddenSubscriptionWriteError for untyped writes to synced or local leaves', () => {
    const base = baselineModel()
    expect(() =>
      applySubscriptionPatch(TestModel.ast, base, { speed: 2 }),
    ).toThrow(ForbiddenSubscriptionWriteError)
    expect(() =>
      applySubscriptionPatch(TestModel.ast, base, {
        appearance: { choice: 'Dark' },
      }),
    ).toThrow(ForbiddenSubscriptionWriteError)
    expect(() =>
      applySubscriptionPatch(TestModel.ast, base, {
        listening: Idle(),
      }),
    ).toThrow(ForbiddenSubscriptionWriteError)
  })
})

describe('Program.make, Subscription.forModel, combinators, and LocalSnapshot', () => {
  const ReceivedLibrary = m('ReceivedLibrary', { titles: S.Array(S.String) })
  const ObservedSystemMode = m('ObservedSystemMode', {
    mode: S.Literals(['Light', 'Dark']),
  })
  const SetSpeed = Catalog.action('SetSpeed', {
    what: 'Sets playback speed',
    why: 'To listen faster or slower',
    fields: { speed: S.Number },
    meta: { label: 'Set speed', keys: [] },
  })
  const SetProblem = m('SetProblem', { problem: S.String })
  const Home = ts('Home')
  const NavModel = model({
    synced: {
      speed: S.Number,
    },
    local: {
      appearance: Appearance,
      maybeProblem: S.Option(S.String),
    },
    loaded: {
      library: loaded(S.Array(S.String), () => []),
    },
    ephemeral: {
      maybeNotice: ephemeral(S.Option(S.String), Option.none),
    },
  })
  type NavModel = typeof NavModel.Type

  const NavMessage = S.Union([
    SetSpeed,
    SetProblem,
    ReceivedLibrary,
    ObservedSystemMode,
  ])
  type NavMessage = typeof NavMessage.Type

  const navSubscriptions = Subscription.forModel(NavModel)<NavMessage>()(
    entry => ({
      library: entry(
        {},
        {
          facts: [ReceivedLibrary],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          apply: (_model, { titles }) => ({
            library: titles,
            maybeNotice: Option.some(`Loaded ${String(titles.length)}`),
          }),
        },
      ),
      systemMode: entry(
        {},
        {
          facts: [ObservedSystemMode],
          modelToDependencies: () => ({}),
          dependenciesToStream: () => Stream.empty,
          apply: (_model, { mode }) => ({
            appearance: { systemMode: mode },
          }),
        },
      ),
    }),
  )

  const NavProgram = make({
    id: 'durability-nav',
    version: 1,
    Model: NavModel,
    Message: NavMessage,
    catalog: Catalog.make([SetSpeed]),
    navigation: Navigation.screens({
      root: Navigation.rootScreen(Home, Route.here),
    }),
    init: () => [
      NavModel.make({
        speed: 1,
        appearance: Appearance.make({ choice: 'System', systemMode: 'Light' }),
        maybeProblem: Option.none(),
        library: [],
        maybeNotice: Option.none(),
      }),
      [],
    ],
    update: (current, message) =>
      M.value(message).pipe(
        M.withReturnType<readonly [NavModel, ReadonlyArray<never>]>(),
        M.tagsExhaustive({
          SetSpeed: ({ speed }) => [{ ...current, speed }, []],
          SetProblem: ({ problem }) => [
            { ...current, maybeProblem: Option.some(problem) },
            [],
          ],
        }),
      ),
    subscriptions: navSubscriptions,
    synchronization: {
      messageCategory: () => 'Domain',
      projectDomain: current => ({ speed: current.speed }),
      foldSynced: (synced, message) =>
        M.value(message).pipe(
          M.withReturnType<typeof synced>(),
          M.tagsExhaustive({
            SetSpeed: ({ speed }) => ({ ...synced, speed }),
            SetProblem: () => synced,
          }),
        ),
    },
  })

  it('dispatches Subscription facts through applySubscriptionPatch and auto-derives keepOnRefold & isLocalOnly', () => {
    const [initial] = NavProgram.init()
    const [afterLib] = NavProgram.update(
      initial,
      ReceivedLibrary({ titles: ['alpha', 'beta'] }),
    )
    expect(afterLib.library).toEqual(['alpha', 'beta'])
    expect(afterLib.maybeNotice).toEqual(Option.some('Loaded 2'))

    const [afterMode] = NavProgram.update(
      afterLib,
      ObservedSystemMode({ mode: 'Dark' }),
    )
    expect(afterMode.appearance).toEqual({
      choice: 'System',
      systemMode: 'Dark',
    })

    expect(
      NavProgram.synchronization?.isLocalOnly?.(
        ReceivedLibrary({ titles: [] }),
      ),
    ).toBe(true)
    expect(
      NavProgram.synchronization?.isLocalOnly?.(SetSpeed({ speed: 2 })),
    ).toBe(false)

    const refolded = NavModel.make({
      ...initial,
      speed: 2,
    })
    const kept = NavProgram.synchronization?.keepOnRefold?.(afterMode, refolded)
    expect(kept?.speed).toBe(2)
    expect(kept?.library).toEqual(['alpha', 'beta'])
    expect(kept?.appearance.systemMode).toBe('Dark')
  })

  it('preserves durability across ActionMenu.compose(Session.compose(Part.compose(child))) and LocalSnapshot byte invariance', () => {
    const Composed = ActionMenu.compose({
      of: Session.compose({
        of: Part.compose({ of: NavProgram }),
        initialMode: 'SharedDomain',
      }),
    })
    const [initial] = Composed.init()
    const [populated] = Composed.update(
      initial,
      ReceivedLibrary({
        titles: Array.from({ length: 500 }, (_, i) => `book-${String(i)}`),
      }),
    )
    const [populatedWithMode] = Composed.update(
      populated,
      ObservedSystemMode({ mode: 'Dark' }),
    )

    const sizes = LocalSnapshot.assertSnapshotByteInvariance({
      program: {
        id: Composed.id,
        version: Composed.version,
        foldRevision: 'durability-v1',
        Model: Composed.Model,
        initialModel: initial,
      },
      baseline: initial,
      populated: populatedWithMode,
    })
    expect(sizes.localBytes).toBeGreaterThan(0)
    expect(Option.isSome(sizes.sharedBytes)).toBe(true)

    const [withSpeed] = Composed.update(initial, SetSpeed({ speed: 2 }))
    expect(() =>
      LocalSnapshot.assertSnapshotByteInvariance({
        program: {
          id: Composed.id,
          version: Composed.version,
          Model: Composed.Model,
          initialModel: initial,
        },
        baseline: initial,
        populated: withSpeed,
      }),
    ).toThrow(/invariance/i)
  })

  it('runs foldSynced during strangerViewpoint shared snapshots in Runtime.start', async () => {
    let foldSyncedCalls = 0
    const Tracked = make({
      id: 'tracked-durability',
      version: 1,
      Model: NavModel,
      Message: NavMessage,
      init: NavProgram.init,
      update: (current, message) =>
        M.value(message).pipe(
          M.withReturnType<readonly [NavModel, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            SetSpeed: ({ speed }) => [{ ...current, speed }, []],
            SetProblem: ({ problem }) => [
              { ...current, maybeProblem: Option.some(problem) },
              [],
            ],
          }),
        ),
      subscriptions: navSubscriptions,
      synchronization: {
        messageCategory: () => 'Domain',
        projectDomain: current => ({ speed: current.speed }),
        foldSynced: (synced, message) => {
          foldSyncedCalls += 1
          return M.value(message).pipe(
            M.withReturnType<typeof synced>(),
            M.tagsExhaustive({
              SetSpeed: ({ speed }) => ({ ...synced, speed }),
              SetProblem: () => synced,
            }),
          )
        },
      },
    })

    const SnapshotRow = S.Struct({
      id: S.String,
      speed: S.Number,
      asOf: S.String,
      at: S.Number,
    })
    const Projection = SnapshotRow.pipe(
      S.decodeTo(
        S.toType(NavModel),
        SchemaTransformation.transform({
          decode: (row): NavModel => ({
            ...Tracked.init()[0],
            speed: row.speed,
          }),
          encode: m_ => ({ id: 'snap', speed: m_.speed, asOf: '', at: 0 }),
        }),
      ),
    )
    const MsgRow = S.Struct({
      id: S.String,
      tag: S.Literals(['SetSpeed']),
      speed: S.Number,
      from: S.String,
      createdAtMs: S.Number,
    })
    const MsgWire = MsgRow.pipe(
      S.decodeTo(
        S.toType(NavMessage),
        SchemaTransformation.transform({
          decode: (row): NavMessage => SetSpeed({ speed: row.speed }),
          encode: msg => ({
            id: '',
            tag: 'SetSpeed' as const,
            speed: msg._tag === 'SetSpeed' ? msg.speed : 1,
            from: '',
            createdAtMs: 0,
          }),
        }),
      ),
    )

    const Synced = compose.sync({
      of: Tracked,
      snapshot: Projection,
      message: MsgWire,
      foldRevision: 'tracked-v1',
    })

    const store = makeMemoryStore()
    const localStore = LocalSnapshot.memory()

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* start({
            program: Synced,
            sync: Memory({ store, processor: 'device-1' }),
            localSnapshot: localStore,
            sharedSnapshot: {
              stride: 1,
              minDelta: 1,
              minIntervalMs: 0,
              jitterMs: 0,
            },
          })
          yield* started.run(SetSpeed({ speed: 2 }))
          yield* started.run(ReceivedLibrary({ titles: ['huge-title'] }))
        }),
      ),
    )

    expect(foldSyncedCalls).toBeGreaterThan(0)
    const saved = localStore.peek()
    expect(Option.isSome(saved)).toBe(true)
    if (Option.isSome(saved)) {
      expect(saved.value).not.toContain('huge-title')
    }
  })

  it('supports Subscription.aggregateForModel and Subscription.liftScoped', () => {
    const ChildModel = model({
      synced: { id: S.String },
      loaded: { data: loaded(S.String, () => '') },
    })
    const ParentModel = model({
      synced: { child: ChildModel },
      ephemeral: { ping: ephemeral(S.Number, () => 0) },
    })
    const ReceivedData = m('ReceivedData', { data: S.String })
    const Pinged = m('Pinged', { count: S.Number })
    const ChildMsg = ReceivedData
    const ParentMsg = S.Union([ReceivedData, Pinged])

    const childSubs = Subscription.forModel(ChildModel)<typeof ChildMsg.Type>()(
      entry => ({
        data: entry(
          {},
          {
            facts: [ReceivedData],
            modelToDependencies: () => ({}),
            dependenciesToStream: () => Stream.empty,
            apply: (_m, { data }) => ({ data }),
          },
        ),
      }),
    )

    const lifted = Subscription.liftScoped(childSubs)(ParentModel, {
      toChildModel: parent => parent.child,
      toParentMessage: message => message,
      toParentPatch: patch => ({ child: patch }),
    })

    const ownSubs = Subscription.forModel(ParentModel)<typeof ParentMsg.Type>()(
      entry => ({
        ping: entry(
          {},
          {
            facts: [Pinged],
            modelToDependencies: () => ({}),
            dependenciesToStream: () => Stream.empty,
            apply: (_m, { count }) => ({ ping: count }),
          },
        ),
      }),
    )

    const combined = Subscription.aggregateForModel(ParentModel)<
      typeof ParentMsg.Type
    >()(lifted, ownSubs)

    const CombinedProgram = make({
      id: 'combined-scoped',
      version: 1,
      Model: ParentModel,
      Message: ParentMsg,
      init: () => [
        ParentModel.make({
          child: ChildModel.make({ id: 'c1', data: '' }),
          ping: 0,
        }),
        [],
      ],
      update: current => [current, []],
      subscriptions: combined,
    })

    const [initState] = CombinedProgram.init()
    const [afterData] = CombinedProgram.update(
      initState,
      ReceivedData({ data: 'hello' }),
    )
    expect(afterData.child.data).toBe('hello')
    const [afterPing] = CombinedProgram.update(afterData, Pinged({ count: 7 }))
    expect(afterPing.ping).toBe(7)
  })

  it('strips optionalKey ephemeral fields by omitting the key when reset returns undefined (AppearanceState)', () => {
    expect(() => assertDurabilityExhaustive(AppearanceState)).not.toThrow()

    const populated: AppearanceState = {
      appearance: 'Dark',
      systemMode: 'Dark',
      systemContrast: 'More',
    }
    const strippedLocal = stripForLocalSnapshot(AppearanceState.ast, populated)
    expect(strippedLocal).toEqual({
      appearance: 'Dark',
      systemMode: 'Light',
    })
    expect('systemContrast' in strippedLocal).toBe(false)

    const codec = S.toCodecJson(AppearanceState)
    const encoded = S.encodeSync(codec)(strippedLocal)
    expect(S.decodeUnknownSync(codec)(encoded)).toEqual(strippedLocal)

    const strippedShared = stripForSharedSnapshot(
      AppearanceState.ast,
      populated,
      initialAppearance,
    )
    expect(strippedShared).toEqual(initialAppearance)
    expect('systemContrast' in strippedShared).toBe(false)
  })

  it('hydrates syncedModel before folding navigation or session messages in Session and ActionMenu', () => {
    const Home = ts('Home')
    const Book = ts('Book', { bookId: S.String })
    const SettledBook = ts('SettledBook', { bookId: S.String, page: S.Number })
    const Dest = S.Union([Home, Book, SettledBook])
    const ReadingsLoading = ts('ReadingsLoading')
    const ReadingsReady = ts('ReadingsReady')
    const Readings = S.Union([ReadingsLoading, ReadingsReady])
    const WithSettleModel = model({
      synced: {
        speed: S.Number,
        navigation: Navigation.NavigationStack(Dest),
      },
      loaded: {
        readings: loaded(Readings, ReadingsLoading),
      },
    })
    type WithSettleModel = typeof WithSettleModel.Type
    const SetRate = Catalog.action('SetRate', {
      fields: { speed: S.Number },
      what: 'Sets the reading rate',
      why: 'To read faster or slower',
      meta: { label: 'Set Rate', keys: [] },
    })
    const WithSettleMessage = S.Union([
      SetRate,
      Navigation.OpenedUri,
      Navigation.NavigatedBack,
    ])
    type WithSettleMessage = typeof WithSettleMessage.Type

    const declared = Navigation.screens({
      slug: 'library',
      root: Navigation.rootScreen(Home, Route.here, { title: () => 'Home' }),
      screens: [
        Navigation.pushScreen(
          Book,
          pipe(Route.literal('book'), Route.slash(Route.string('bookId'))),
          { title: () => 'Book' },
        ),
        Navigation.pushScreen(
          SettledBook,
          pipe(
            Route.literal('book'),
            Route.slash(Route.string('bookId')),
            Route.slash(Route.literal('page')),
            Route.slash(Route.int('page')),
          ),
          { title: () => 'Book page' },
        ),
      ],
    })
    const nav = Navigation.composeNavigation({
      child: declared,
      hold: 'Owns',
      Destination: S.Union([Home, Book, SettledBook, Navigation.NotFound]),
      childOf: (current: WithSettleModel) => current,
      stack: Navigation.fieldLens<
        WithSettleModel,
        typeof Dest.Type | Navigation.NotFound
      >(),
      embedNotFound: notFound => notFound,
      routes: [],
      settleEntry: (current, destination) =>
        destination._tag === 'Book' && current.readings._tag === 'ReadingsReady'
          ? SettledBook({ bookId: destination.bookId, page: 1 })
          : destination,
    })

    const ChildProgram = make({
      id: 'with-settle',
      version: 1,
      Model: WithSettleModel,
      Message: WithSettleMessage,
      catalog: Catalog.make([SetRate]),
      navigation: nav,
      init: () => [
        WithSettleModel.make({
          speed: 1,
          navigation: Navigation.stackAtRoot(Home()),
          readings: ReadingsLoading(),
        }),
        [],
      ],
      update: (current, message) =>
        M.value(message).pipe(
          M.withReturnType<readonly [WithSettleModel, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            SetRate: ({ speed }) => [{ ...current, speed }, []],
            OpenedUri: fact => [Navigation.foldMessage(nav, current, fact), []],
            NavigatedBack: fact => [
              Navigation.foldMessage(nav, current, fact),
              [],
            ],
          }),
        ),
      synchronization: {
        messageCategory: () => 'Navigation',
        projectDomain: () => ({}),
        foldSynced: (synced, message) =>
          M.value(message).pipe(
            M.withReturnType<typeof synced>(),
            M.tags({
              SetRate: ({ speed }) => ({ ...synced, speed }),
            }),
            M.orElse(() => synced),
          ),
      },
    })

    const SessionProgram = Session.compose({ of: ChildProgram })
    const MenuProgram = ActionMenu.compose({ of: SessionProgram })

    for (const composed of [SessionProgram, MenuProgram]) {
      const foldSynced = composed.synchronization?.foldSynced
      expect(foldSynced).toBeDefined()
      if (foldSynced === undefined) {
        continue
      }
      const [initial] = composed.init()
      const startSynced = projectSynced(composed.Model.ast, initial)
      const afterOpen = foldSynced(
        startSynced,
        Navigation.OpenedUri({
          uri: '/library/book/a-new-earth',
          via: Navigation.Link(),
        }),
      )
      expect(afterOpen.navigation.pages).toEqual([
        Book({ bookId: 'a-new-earth' }),
      ])
      expect('readings' in afterOpen).toBe(false)

      const afterBack = foldSynced(
        afterOpen,
        Navigation.NavigatedBack({ uri: '/library' }),
      )
      expect(afterBack.navigation.pages).toEqual([])
      expect('readings' in afterBack).toBe(false)

      const afterGoBack = foldSynced(afterOpen, Session.GoBack())
      expect(afterGoBack.navigation.pages).toEqual([])
      expect('readings' in afterGoBack).toBe(false)

      const afterMirror = foldSynced(afterOpen, Session.MirrorNavigation())
      expect(afterMirror.navigation.pages).toEqual([])
      expect('readings' in afterMirror).toBe(false)
    }
  })
})
