import { Duration, Match as M, Schema as S, Schedule, Stream } from 'effect'
import { Interaction, Runtime, Subscription } from 'foldkit'
import { Carousel, Clipboard, Timer } from 'foldkit/behavior'
import { paintModeOnPage } from 'foldkit/theme'

import { FlushedDuePace, PlaygroundMessage, categoryOf } from './messages'
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

const init: Runtime.ApplicationInit<
  PlaygroundModel,
  PlaygroundMessage
> = () => [initialModel(), []]

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
        syncPageMode(fresh.mode)
        return [fresh, []]
      },
      IgnoredKeyPress: () => [model, []],
    }),
  )
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
  }),
)

export const makePlaygroundApp = (container: HTMLElement) =>
  Runtime.makeApplication({
    Model: PlaygroundModelSchema,
    Message: PlaygroundMessage,
    init,
    update,
    view,
    subscriptions,
    container,
  })

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
      Runtime.run(makePlaygroundApp(root))
    }
  }
}
