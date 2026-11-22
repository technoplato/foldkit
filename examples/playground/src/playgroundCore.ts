import {
  Array,
  Effect,
  Number as EffectNumber,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  String,
} from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  Session,
} from 'foldkit'
import {
  BoundField,
  Checkbox,
  RatingGroup,
  SignaturePad,
  Slider,
  Switch,
  Tabs,
  TagsInput,
} from 'foldkit/behavior'
import { ModelPath } from 'foldkit/declaration'
import { m } from 'foldkit/message'
import { Column, Row, type UiNode, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

import {
  countSnapshotId,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { PlaygroundCliScreen } from './cliScreen'
import { playgroundProps } from './partsProps'
import {
  PartsStateSchema,
  type PlaygroundModel,
  initialModel,
  runBurstSimulation,
} from './state'

// SYNCED DOMAIN SLICE (52 SYNCED/SETTLED/SAMPLED PARTS + PROFILE; OMITS DEVICE-ONLY SECRET, TOOLTIP, HOVERCARD, THEME, FILTER)

export const playgroundProgramId = 'foldkit-playground'
export const playgroundCommandName = 'playground'

export const SyncedPlaygroundModel = S.Struct({
  revision: S.Number,
  originInstance: S.String,
  displayName: S.String,
  bio: S.String,
  dndOrder: S.Array(S.String),
  syncedWriteCount: S.Number,
  parts: PartsStateSchema,
})
export type SyncedPlaygroundModel = typeof SyncedPlaygroundModel.Type

export const initialSyncedPlaygroundModel = (): SyncedPlaygroundModel => {
  const base = initialModel()
  return {
    revision: 0,
    originInstance: 'init',
    displayName: base.profile.profile.displayName,
    bio: base.profile.profile.bio,
    dndOrder: [...base.dndOrder],
    syncedWriteCount: 0,
    parts: {
      ...base.parts,
      tooltip: initialModel().parts.tooltip,
      hoverCard: initialModel().parts.hoverCard,
    },
  }
}

export const extractSyncedSlice = (
  model: PlaygroundModel,
  revision: number,
  originInstance = 'web',
): SyncedPlaygroundModel => {
  const cleanDefaults = initialModel()
  return {
    revision,
    originInstance,
    displayName: model.profile.profile.displayName,
    bio: model.profile.profile.bio,
    dndOrder: [...model.dndOrder],
    syncedWriteCount: model.syncedWriteCount,
    parts: {
      ...model.parts,
      // Device-only parts never leave this device:
      tooltip: cleanDefaults.parts.tooltip,
      hoverCard: cleanDefaults.parts.hoverCard,
    },
  }
}

export const applySyncedSliceToModel = (
  localModel: PlaygroundModel,
  slice: SyncedPlaygroundModel,
): PlaygroundModel => ({
  ...localModel,
  profile: {
    profile: {
      ...localModel.profile.profile,
      displayName: slice.displayName,
      bio: slice.bio,
      // apiToken is Pace.Device({ because: 'Secret' }) — stays strictly local!
    },
  },
  profileStates: {
    displayName: BoundField.initial(slice.displayName),
    bio: BoundField.initial(slice.bio),
    apiToken: localModel.profileStates.apiToken,
  },
  dndOrder: [...slice.dndOrder],
  syncedWriteCount: slice.syncedWriteCount,
  parts: {
    ...slice.parts,
    tooltip: localModel.parts.tooltip,
    hoverCard: localModel.parts.hoverCard,
  },
})

export const encodeSyncedSliceJson = (slice: SyncedPlaygroundModel): string =>
  JSON.stringify(S.encodeSync(SyncedPlaygroundModel)(slice))

export const decodeSyncedSliceJson = (
  json: string,
): Option.Option<SyncedPlaygroundModel> => {
  try {
    const raw: unknown = JSON.parse(json)
    return S.decodeUnknownOption(SyncedPlaygroundModel)(raw)
  } catch {
    return Option.none()
  }
}

// CATALOG ACTIONS (DECLARED ONCE FOR CLI, ACTION MENU, AND SYNC)

const at = ModelPath.of(SyncedPlaygroundModel)

const numberToken = S.NumberFromString

export const SetDisplayName = Catalog.action('SetDisplayName', {
  fields: { name: S.String },
  what: 'Updates the synced profile display name',
  why: 'To rename the shared profile across connected sessions',
  choose: {
    field: 'name',
    noun: 'display name',
    prompt: 'What display name should be saved?',
    token: S.String,
    choicesOf: () => [
      { value: 'Foldkit Core', title: 'Foldkit Core' },
      { value: 'Michael', title: 'Michael' },
    ],
    accepts: (_model: SyncedPlaygroundModel, value: string) =>
      String.trim(value).length < 2
        ? Catalog.Disabled({
            because: 'display name must be at least 2 characters',
          })
        : Catalog.Enabled(),
    nothingToChoose: 'enter a display name',
  },
  mutates: [
    at.revision,
    at.originInstance,
    at.displayName,
    at.syncedWriteCount,
  ],
  meta: { label: 'Set Display Name', keys: [] },
})

export const SetBio = Catalog.action('SetBio', {
  fields: { bio: S.String },
  what: 'Updates the synced profile bio text',
  why: 'To share an updated bio note across connected sessions',
  choose: {
    field: 'bio',
    noun: 'bio',
    prompt: 'What bio text should be saved?',
    token: S.String,
    choicesOf: () => [
      {
        value: 'Zero painter rules. Pure state machines.',
        title: 'Zero painter rules. Pure state machines.',
      },
      {
        value: 'Synced live across web and CLI via InstantDB.',
        title: 'Synced live across web and CLI via InstantDB.',
      },
    ],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'enter bio text',
  },
  mutates: [at.revision, at.originInstance, at.bio, at.syncedWriteCount],
  meta: { label: 'Set Bio', keys: [] },
})

export const SetSlider = Catalog.action('SetSlider', {
  fields: { value: S.Number },
  what: 'Sets the playback gain slider between 0 and 100',
  why: 'To adjust the shared gain level from any surface',
  choose: {
    field: 'value',
    noun: 'gain',
    prompt: 'Which gain value (0–100)?',
    token: numberToken,
    choicesOf: () => [
      { value: 0, title: '0%' },
      { value: 25, title: '25%' },
      { value: 50, title: '50%' },
      { value: 75, title: '75%' },
      { value: 100, title: '100%' },
    ],
    accepts: (_model: SyncedPlaygroundModel, value: number) =>
      EffectNumber.isNumber(value) && value >= 0 && value <= 100
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'gain must be between 0 and 100' }),
    nothingToChoose: 'choose a gain between 0 and 100',
  },
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.slider,
    at.syncedWriteCount,
  ],
  meta: { label: 'Set Slider', keys: [] },
})

export const ToggleSwitch = Catalog.action('ToggleSwitch', {
  what: 'Flips the mirror navigation switch between on and off',
  why: 'To toggle the shared switch state across sessions',
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.switch,
    at.syncedWriteCount,
  ],
  meta: { label: 'Toggle Switch', keys: ['t'] },
})

export const ToggleCheckbox = Catalog.action('ToggleCheckbox', {
  what: 'Toggles the derived ARIA attributes checkbox',
  why: 'To check or uncheck the shared checkbox state',
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.checkbox,
    at.syncedWriteCount,
  ],
  meta: { label: 'Toggle Checkbox', keys: ['x'] },
})

export const SelectTab = Catalog.action('SelectTab', {
  fields: { tab: S.String },
  what: 'Selects the active tab in the Tabs widget',
  why: 'To switch between Core, Pace Sync, and Hosts tabs',
  choose: {
    field: 'tab',
    noun: 'tab',
    prompt: 'Which tab?',
    token: S.String,
    choicesOf: () => [
      { value: 'core', title: 'Foldkit Core' },
      { value: 'sync', title: 'Pace Sync' },
      { value: 'hosts', title: 'HTML · React · RN · CLI' },
    ],
    nothingToChoose: 'no tabs available',
  },
  mutates: [at.revision, at.originInstance, at.parts.tabs, at.syncedWriteCount],
  meta: { label: 'Select Tab', keys: [] },
})

export const SetRating = Catalog.action('SetRating', {
  fields: { rating: S.Number },
  what: 'Sets the star rating between 0.5 and 5',
  why: 'To record an ergonomics rating in the shared playground',
  choose: {
    field: 'rating',
    noun: 'rating',
    prompt: 'How many stars (0.5–5)?',
    token: numberToken,
    choicesOf: () => [
      { value: 3, title: '3 stars' },
      { value: 4, title: '4 stars' },
      { value: 4.5, title: '4.5 stars' },
      { value: 5, title: '5 stars' },
    ],
    accepts: (_model: SyncedPlaygroundModel, rating: number) =>
      rating >= 0.5 && rating <= 5
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'rating must be between 0.5 and 5' }),
    nothingToChoose: 'choose a star rating',
  },
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.ratingGroup,
    at.syncedWriteCount,
  ],
  meta: { label: 'Set Rating', keys: [] },
})

export const AddTag = Catalog.action('AddTag', {
  fields: { tag: S.String },
  what: 'Appends a tag to the shared TagsInput widget',
  why: 'To label the shared playground session',
  choose: {
    field: 'tag',
    noun: 'tag',
    prompt: 'Which tag should be added?',
    token: S.String,
    choicesOf: () => [
      { value: 'instantdb', title: 'instantdb' },
      { value: 'cli-synced', title: 'cli-synced' },
    ],
    accepts: (_model: SyncedPlaygroundModel, value: string) =>
      String.isEmpty(String.trim(value))
        ? Catalog.Disabled({ because: 'tag cannot be empty' })
        : Catalog.Enabled(),
    nothingToChoose: 'provide a tag',
  },
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.tagsInput,
    at.syncedWriteCount,
  ],
  meta: { label: 'Add Tag', keys: [] },
})

export const ClearSignature = Catalog.action('ClearSignature', {
  what: 'Clears all drawn strokes from the SignaturePad widget',
  why: 'To wipe the shared signature canvas clean',
  mutates: [
    at.revision,
    at.originInstance,
    at.parts.signaturePad,
    at.syncedWriteCount,
  ],
  meta: { label: 'Clear Signature', keys: [] },
})

export const RunBurst = Catalog.action('RunBurst', {
  what: 'Runs the 16-event coalescing burst simulation on AngleSlider and Input',
  why: 'To observe Pace.Sampled and Pace.Settled coalescing live',
  mutates: [
    at.revision,
    at.originInstance,
    at.dndOrder,
    at.syncedWriteCount,
    at.parts,
  ],
  meta: { label: 'Run Burst Simulation', keys: ['b'] },
})

export const ResetPlaygroundAction = Catalog.action('ResetPlayground', {
  what: 'Restores all 54 Playground widgets and profile fields to defaults',
  why: 'To clear saved playground edits back to the initial state',
  aliases: ['Reset', 'Clear'],
  mutates: [
    at.revision,
    at.originInstance,
    at.displayName,
    at.bio,
    at.dndOrder,
    at.syncedWriteCount,
    at.parts,
  ],
  meta: { label: 'Reset to Default', keys: ['r'] },
})

export const playgroundCatalog = Catalog.make([
  SetDisplayName,
  SetBio,
  SetSlider,
  ToggleSwitch,
  ToggleCheckbox,
  SelectTab,
  SetRating,
  AddTag,
  ClearSignature,
  RunBurst,
  ResetPlaygroundAction,
])

export const SyncedWebSlice = m('SyncedWebSlice', {
  sliceJson: S.String,
})

export const PlaygroundCoreMessage = S.Union([
  ...playgroundCatalog.Message.members,
  SyncedWebSlice,
])
export type PlaygroundCoreMessage = typeof PlaygroundCoreMessage.Type

// NAVIGATION & CLI SCREEN

export const PlaygroundHome = ts('PlaygroundHome')
export type PlaygroundHome = typeof PlaygroundHome.Type

export const playgroundNavigation = Navigation.screens({
  slug: 'playground',
  root: Navigation.rootScreen(PlaygroundHome, Route.here, {
    title: () => 'Foldkit 54-Part Playground',
  }),
})

const playgroundScreen = (model: SyncedPlaygroundModel): UiNode => {
  const sliderValue = Option.getOrElse(
    Array.head(model.parts.slider.values),
    () => 0,
  )
  const ratingValue = Option.getOrElse(
    model.parts.ratingGroup.maybeValue,
    () => 0,
  )
  const qrText =
    model.parts.qrCode._tag === 'Ready'
      ? model.parts.qrCode.value
      : 'https://foldkit.pisspoursoftware.xyz/playground'

  return Column(
    { gap: 1 },
    PlaygroundCliScreen({
      mode: 'Dark',
      displayName: model.displayName,
      bio: model.bio,
      formValid: String.trim(model.displayName).length >= 2,
      localEventCount: model.revision,
      syncedWriteCount: model.syncedWriteCount,
      sliderValue,
      ratingValue,
      switchOn: model.parts.switch._tag === 'On',
      activeTab: Option.getOrElse(
        model.parts.tabs.maybeSelectedValue,
        () => 'core',
      ),
      qrText,
    }),
    Row(
      { gap: 1 },
      ...actionButtons(
        Array.filter(
          Catalog.entries(playgroundCatalog, model),
          entry =>
            entry.tag === 'ToggleSwitch' ||
            entry.tag === 'RunBurst' ||
            entry.tag === 'ResetPlayground',
        ),
      ),
    ),
  )
}

// UPDATE

const updatePlaygroundCore = (
  model: SyncedPlaygroundModel,
  message: PlaygroundCoreMessage,
): readonly [SyncedPlaygroundModel, ReadonlyArray<never>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [SyncedPlaygroundModel, ReadonlyArray<never>]>(),
    M.tagsExhaustive({
      SetDisplayName: ({ name }) => [
        {
          ...model,
          revision: model.revision + 1,
          originInstance: 'catalog',
          displayName: String.trim(name),
          syncedWriteCount: model.syncedWriteCount + 1,
        },
        [],
      ],
      SetBio: ({ bio }) => [
        {
          ...model,
          revision: model.revision + 1,
          originInstance: 'catalog',
          bio,
          syncedWriteCount: model.syncedWriteCount + 1,
        },
        [],
      ],
      SetSlider: ({ value }) => {
        const [nextSlider] = Slider.chart.transition(
          model.parts.slider,
          Slider.SetSliderValue({ value }),
          playgroundProps.slider,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, slider: nextSlider },
          },
          [],
        ]
      },
      ToggleSwitch: () => {
        const [nextSwitch] = Switch.chart.transition(
          model.parts.switch,
          Switch.ToggleSwitch(),
          playgroundProps.switch,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, switch: nextSwitch },
          },
          [],
        ]
      },
      ToggleCheckbox: () => {
        const [nextCheckbox] = Checkbox.chart.transition(
          model.parts.checkbox,
          Checkbox.ToggleCheckbox(),
          playgroundProps.checkbox,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, checkbox: nextCheckbox },
          },
          [],
        ]
      },
      SelectTab: ({ tab }) => {
        const [nextTabs] = Tabs.chart.transition(
          model.parts.tabs,
          Tabs.SelectTab({ value: tab }),
          playgroundProps.tabs,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, tabs: nextTabs },
          },
          [],
        ]
      },
      SetRating: ({ rating }) => {
        const [nextRating] = RatingGroup.chart.transition(
          model.parts.ratingGroup,
          RatingGroup.SetRating({ value: rating }),
          playgroundProps.ratingGroup,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, ratingGroup: nextRating },
          },
          [],
        ]
      },
      AddTag: ({ tag }) => {
        const [nextTags] = TagsInput.chart.transition(
          model.parts.tagsInput,
          TagsInput.AddTag({ value: String.trim(tag) }),
          playgroundProps.tagsInput,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, tagsInput: nextTags },
          },
          [],
        ]
      },
      ClearSignature: () => {
        const [nextSig] = SignaturePad.chart.transition(
          model.parts.signaturePad,
          SignaturePad.ClearSignature(),
          playgroundProps.signaturePad,
        )
        return [
          {
            ...model,
            revision: model.revision + 1,
            originInstance: 'catalog',
            syncedWriteCount: model.syncedWriteCount + 1,
            parts: { ...model.parts, signaturePad: nextSig },
          },
          [],
        ]
      },
      RunBurst: () => {
        const simulated = runBurstSimulation(
          applySyncedSliceToModel(initialModel(), model),
          1_000,
        )
        return [
          {
            ...extractSyncedSlice(simulated, model.revision + 1, 'catalog'),
            syncedWriteCount: model.syncedWriteCount + 2,
          },
          [],
        ]
      },
      ResetPlayground: () => [
        {
          ...initialSyncedPlaygroundModel(),
          revision: model.revision + 1,
          originInstance: 'catalog',
        },
        [],
      ],
      SyncedWebSlice: ({ sliceJson }) =>
        Option.match(decodeSyncedSliceJson(sliceJson), {
          onNone: () => [model, []],
          onSome: decoded => [
            {
              ...decoded,
              revision: Math.max(model.revision + 1, decoded.revision),
            },
            [],
          ],
        }),
    }),
  )

// COMPOSED SYNC PROGRAM

export const PlaygroundCoreProgram = Program.make({
  id: playgroundProgramId,
  version: 1,
  Model: SyncedPlaygroundModel,
  Message: PlaygroundCoreMessage,
  init: () => [initialSyncedPlaygroundModel(), []],
  update: updatePlaygroundCore,
  catalog: playgroundCatalog,
  navigation: playgroundNavigation,
  screen: playgroundScreen,
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

export const PlaygroundApp = ActionMenu.compose({
  of: Session.compose({
    of: PlaygroundCoreProgram,
  }),
})

const [initialPlaygroundAppModel] = PlaygroundApp.init()

export const PlaygroundSnapshotRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const PlaygroundRevisionOnly = S.Struct({ revision: S.Number })

export const PlaygroundSnapshotProjection = PlaygroundSnapshotRow.pipe(
  S.decodeTo(
    PlaygroundApp.Model,
    SchemaTransformation.transformOrFail({
      decode: () =>
        Effect.mapError(
          S.encodeUnknownEffect(PlaygroundApp.Model)(initialPlaygroundAppModel),
          error => error.issue,
        ),
      encode: encoded =>
        Effect.map(
          Effect.mapError(
            S.decodeUnknownEffect(PlaygroundRevisionOnly)(encoded),
            error => error.issue,
          ),
          ({ revision }) => ({
            id: countSnapshotId,
            value: revision,
            asOf: '',
            at: 0,
          }),
        ),
    }),
  ),
)

export const PlaygroundMessageWire = snapshotLogMessageWire(
  PlaygroundApp.Message,
)

export const SyncedPlayground = Program.compose.sync({
  of: PlaygroundApp,
  snapshot: PlaygroundSnapshotProjection,
  message: PlaygroundMessageWire,
  foldRevision: 'foldkit-playground-fold-v1',
})

export type SyncedPlaygroundState = ReturnType<typeof SyncedPlayground.init>[0]
export type SyncedPlaygroundMessage = typeof SyncedPlayground.Message.Type
export type BoundPlayground = Interaction.BoundInteraction<
  SyncedPlaygroundState,
  SyncedPlaygroundMessage
>
export type PlaygroundTapeMode = 'Instant' | 'Memory'

export const makePlaygroundInstance = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
