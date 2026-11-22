import {
  Duration,
  Effect,
  Match as M,
  Option,
  Queue,
  Schema as S,
  Schedule,
  Stream,
} from 'effect'
import { Interaction, Runtime, Subscription } from 'foldkit'
import { Carousel, Clipboard, Timer } from 'foldkit/behavior'
import { paintModeOnPage } from 'foldkit/theme'

import {
  FlushedDuePace,
  PlaygroundMessage,
  SyncedPlaygroundUpdated,
  categoryOf,
} from './messages'
import {
  type PlaygroundTapeMode,
  type SyncedPlaygroundBridge,
  type SyncedPlaygroundModel,
  SyncedWebSlice,
  applySyncedSliceToModel,
  decodeSyncedSliceJson,
  encodeSyncedSliceJson,
  extractSyncedSlice,
  startSyncedPlayground,
} from './playgroundSync'
import {
  type PlaygroundModel,
  PlaygroundModelSchema,
  flushDuePace,
  initialModel,
  runBurstSimulation,
  stepBoundField,
  stepPart,
  submitBoundForm,
} from './state'
import { mountStudioPage } from './studioPage'
import './styles.css'
import { view } from './view'

const ensureThemeStylesheet = (): void => {
  if (typeof document === 'undefined') {
    return
  }
  const styleId = 'foldkit-playground-theme'
  if (document.getElementById(styleId) === null) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = Interaction.screenStylesheet
    document.head.appendChild(style)
  }
}

const syncPageMode = (mode: 'Light' | 'Dark'): void => {
  if (typeof document === 'undefined') {
    return
  }
  paintModeOnPage(mode, {
    root: document.documentElement,
    storage: window.localStorage,
  })
}

export const update = (
  model: PlaygroundModel,
  message: PlaygroundMessage,
): readonly [PlaygroundModel, ReadonlyArray<never>] => {
  const nowMs = Date.now()

  return M.value(message).pipe(
    M.withReturnType<readonly [PlaygroundModel, ReadonlyArray<never>]>(),
    M.tagsExhaustive({
      PartDispatched: ({ partKey, partMessage }) => {
        const next = stepPart(model, partKey, partMessage, nowMs)
        if (
          partKey === 'clipboard' &&
          next.parts.clipboard._tag === 'Copied' &&
          typeof navigator !== 'undefined' &&
          navigator.clipboard !== undefined
        ) {
          void navigator.clipboard
            .writeText(next.parts.clipboard.value)
            .catch(() => undefined)
        }
        return [next, []]
      },
      BoundFieldDispatched: ({ fieldKey, fieldMessage }) => [
        stepBoundField(model, fieldKey, fieldMessage, nowMs),
        [],
      ],
      SubmittedProfileForm: () => [submitBoundForm(model, nowMs), []],
      TriggeredBurstTest: () => [runBurstSimulation(model, nowMs), []],
      FlushedDuePace: ({ nowMs: tickNow }) => {
        let next = flushDuePace(model, tickNow)
        if (next.parts.timer._tag === 'Running') {
          next = stepPart(
            next,
            'timer',
            Timer.TickTimer({ nowMs: tickNow }),
            tickNow,
          )
        }
        if (
          next.parts.carousel._tag === 'Autoplaying' &&
          tickNow % 2200 < 120
        ) {
          next = stepPart(next, 'carousel', Carousel.NextSlide(), tickNow)
        }
        if (next.parts.clipboard._tag === 'Copied' && tickNow % 2000 < 120) {
          next = stepPart(
            next,
            'clipboard',
            Clipboard.ResetClipboard(),
            tickNow,
          )
        }
        return [next, []]
      },
      UpdatedSearchQuery: ({ value }) => [{ ...model, query: value }, []],
      SelectedCategory: ({ category }) => [
        { ...model, category: categoryOf(category) },
        [],
      ],
      ToggledThemeMode: () => {
        const nextMode: 'Light' | 'Dark' =
          model.mode === 'Dark' ? 'Light' : 'Dark'
        syncPageMode(nextMode)
        return [{ ...model, mode: nextMode }, []]
      },
      InspectedPart: ({ partKey }) => [
        {
          ...model,
          inspectedPart: partKey,
          isInspectorOpen: true,
        },
        [],
      ],
      ClosedInspector: () => [{ ...model, isInspectorOpen: false }, []],
      ResetPlayground: () => {
        const fresh = initialModel()
        syncPageMode(model.mode)
        return [
          {
            ...fresh,
            mode: model.mode,
            syncStatus: model.syncStatus,
            lastAppliedRevision: model.lastAppliedRevision + 1,
          },
          [],
        ]
      },
      IgnoredKeyPress: () => [model, []],
      SyncedPlaygroundUpdated: ({ status, maybeSliceJson }) => {
        if (Option.isNone(maybeSliceJson)) {
          return [{ ...model, syncStatus: status }, []]
        }
        const maybeDecoded = decodeSyncedSliceJson(maybeSliceJson.value)
        if (Option.isNone(maybeDecoded)) {
          return [{ ...model, syncStatus: status }, []]
        }
        const decoded = maybeDecoded.value
        if (decoded.revision <= model.lastAppliedRevision) {
          return [{ ...model, syncStatus: status }, []]
        }
        return [
          {
            ...applySyncedSliceToModel(model, decoded),
            syncStatus: status,
            lastAppliedRevision: decoded.revision,
          },
          [],
        ]
      },
    }),
  )
}

export type MakePlaygroundAppOptions = Readonly<{
  sync?: PlaygroundTapeMode
  syncEngine?: Runtime.SyncEngine
}>

const makePlaygroundSyncStream = (
  bridge: SyncedPlaygroundBridge,
): Stream.Stream<PlaygroundMessage> =>
  Stream.callback<PlaygroundMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const report = (): void => {
          const syncedState = bridge.handle.readModel()
          if (syncedState._tag !== 'Ready') {
            Queue.offerUnsafe(
              queue,
              SyncedPlaygroundUpdated({
                status: 'Connecting',
                maybeSliceJson: Option.none(),
              }),
            )
            return
          }
          const slice: SyncedPlaygroundModel = {
            revision: syncedState.revision,
            originInstance: syncedState.originInstance,
            displayName: syncedState.displayName,
            bio: syncedState.bio,
            dndOrder: syncedState.dndOrder,
            syncedWriteCount: syncedState.syncedWriteCount,
            parts: syncedState.parts,
          }
          Queue.offerUnsafe(
            queue,
            SyncedPlaygroundUpdated({
              status: 'Synced',
              maybeSliceJson: Option.some(encodeSyncedSliceJson(slice)),
            }),
          )
        }
        report()
        const unsubscribe = bridge.handle.subscribe(report)
        return unsubscribe
      }),
      unsubscribe =>
        Effect.promise(async () => {
          unsubscribe()
          await bridge.stop()
        }),
    ),
  )

export const makePlaygroundApp = (
  container: HTMLElement,
  options: MakePlaygroundAppOptions = {},
) => {
  const bridge =
    options.sync !== undefined || options.syncEngine !== undefined
      ? startSyncedPlayground(options.sync ?? 'Instant', options.syncEngine)
      : undefined

  const init: Runtime.ApplicationInit<
    PlaygroundModel,
    PlaygroundMessage
  > = () => [
    {
      ...initialModel(),
      syncStatus: bridge !== undefined ? 'Connecting' : 'LocalOnly',
    },
    [],
  ]

  const appUpdate = (
    model: PlaygroundModel,
    message: PlaygroundMessage,
  ): readonly [PlaygroundModel, ReadonlyArray<never>] => {
    if (message._tag === 'SyncedPlaygroundUpdated' && bridge !== undefined) {
      if (Option.isSome(message.maybeSliceJson)) {
        const maybeDecoded = decodeSyncedSliceJson(message.maybeSliceJson.value)
        if (
          Option.isSome(maybeDecoded) &&
          maybeDecoded.value.originInstance === bridge.instance
        ) {
          return [
            {
              ...model,
              syncStatus: message.status,
              lastAppliedRevision: Math.max(
                model.lastAppliedRevision,
                maybeDecoded.value.revision,
              ),
            },
            [],
          ]
        }
      }
      return update(model, message)
    }

    if (message._tag === 'ResetPlayground') {
      const [resetModel, commands] = update(model, message)
      if (bridge !== undefined) {
        bridge.bound.press('ResetPlayground')
      }
      return [resetModel, commands]
    }

    const [next, commands] = update(model, message)
    if (
      bridge !== undefined &&
      next.syncedWriteCount > model.syncedWriteCount
    ) {
      const nextRevision = next.lastAppliedRevision + 1
      const published: PlaygroundModel = {
        ...next,
        lastAppliedRevision: nextRevision,
      }
      const slice = extractSyncedSlice(published, nextRevision, bridge.instance)
      bridge.handle.send(
        SyncedWebSlice({
          sliceJson: encodeSyncedSliceJson(slice),
        }),
      )
      return [published, commands]
    }

    return [next, commands]
  }

  const subscriptions = Subscription.make<PlaygroundModel, PlaygroundMessage>()(
    entry => ({
      tick: entry(
        { active: S.Boolean },
        {
          modelToDependencies: () => ({ active: true }),
          dependenciesToStream: () =>
            Stream.fromSchedule(Schedule.spaced(Duration.millis(100))).pipe(
              Stream.map(() => FlushedDuePace({ nowMs: Date.now() })),
            ),
        },
      ),
      playgroundSync: entry(
        { enabled: S.Boolean },
        {
          modelToDependencies: () => ({ enabled: bridge !== undefined }),
          dependenciesToStream: ({ enabled }) =>
            enabled && bridge !== undefined
              ? makePlaygroundSyncStream(bridge)
              : Stream.empty,
        },
      ),
    }),
  )

  return Runtime.makeApplication({
    Model: PlaygroundModelSchema,
    Message: PlaygroundMessage,
    init,
    update: appUpdate,
    view,
    subscriptions,
    container,
  })
}

if (typeof document !== 'undefined') {
  ensureThemeStylesheet()
  syncPageMode('Dark')
  const root = document.getElementById('root')
  if (root !== null) {
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '/'
    if (pathname.startsWith('/studio') || pathname.startsWith('/navigation')) {
      mountStudioPage(root)
    } else {
      Runtime.run(makePlaygroundApp(root, { sync: 'Instant' }))
    }
  }
}
