import { Context, Effect, Match as M, Schema as S, Stream } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { m } from '../message/index.js'
import { Appearance, Contrast, Mode, modeOf } from './theme.js'

// MODEL

/**
 * Appearance as a Program holds it: what the person chose, and the mode
 * the system is in on this device. Both are state in the Model. The
 * choice arrives as an Action, the system's mode as a fact from the host,
 * and every painter is handed the mode they resolve to; none looks it up.
 */
export const AppearanceState = S.Struct({
  appearance: Appearance,
  systemMode: Mode,
  systemContrast: S.optionalKey(Contrast),
})
/** Appearance as a Program holds it. */
export type AppearanceState = typeof AppearanceState.Type

/** Following the system, in light until the system says otherwise. */
export const initialAppearance: AppearanceState = {
  appearance: 'System',
  systemMode: 'Light',
}

/** The mode a Program is painted in, from its appearance state. */
export const modeOfState = (state: AppearanceState): Mode =>
  modeOf(state.appearance, state.systemMode)

/**
 * The contrast a Program is painted with, from its appearance state: what
 * the system on this device asks for, and the usual contrast for a state
 * saved before contrast was a part of it.
 */
export const contrastOfState = (state: AppearanceState): Contrast =>
  state.systemContrast ?? 'Standard'

// MESSAGE

const titleOf = (appearance: Appearance): string =>
  appearance === 'System' ? 'Follow the system' : appearance

/**
 * Chooses how the Program looks: `SetAppearance:Dark`, `:Light`, or
 * `:System` to follow the device. Declared once here, so it is in the
 * action menu, has a description, and a CLI can send it.
 */
export const SetAppearance = Catalog.action('SetAppearance', {
  fields: { appearance: Appearance },
  choose: {
    field: 'appearance',
    prompt: 'How should it look?',
    token: Appearance,
    choicesOf: (state: AppearanceState) =>
      Appearance.literals.map(appearance => ({
        value: appearance,
        title: titleOf(appearance),
        availability:
          appearance === state.appearance
            ? Catalog.Disabled({ because: 'it looks this way now' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there is no other look',
  },
  what: 'Sets the look to light, to dark, or to follow the system',
  why: 'The person wants the screen lighter or darker',
  meta: { label: 'Appearance', keys: [], title: 'Appearance' },
})

/** The appearance Actions, for a Program to place in its own Catalog. */
export const catalog = Catalog.make([SetAppearance])

/** The host saw the system in a mode, on this device. */
export const ObservedSystemMode = m('ObservedSystemMode', { mode: Mode })

/** The host saw the system ask for the usual contrast, or for more. */
export const ObservedSystemContrast = m('ObservedSystemContrast', {
  contrast: Contrast,
})

/** Every appearance Message: the Action, and the facts from the host. */
export const Message = S.Union([
  ...catalog.Message.members,
  ObservedSystemMode,
  ObservedSystemContrast,
])
/** An appearance Message. */
export type Message = typeof Message.Type

/** True for an appearance Message. */
export const isMessage = S.is(Message)

// UPDATE

/**
 * Applies one appearance Message: the choice replaces the appearance, the
 * observed mode replaces the system's.
 *
 * @example
 * ```typescript
 * update(state, SetAppearance({ appearance: 'Dark' })) // { appearance: 'Dark', systemMode: 'Light' }
 * ```
 */
export const update = (
  state: AppearanceState,
  message: Message,
): AppearanceState =>
  M.value(message).pipe(
    M.withReturnType<AppearanceState>(),
    M.tagsExhaustive({
      SetAppearance: ({ appearance }) => ({ ...state, appearance }),
      ObservedSystemMode: ({ mode }) => ({ ...state, systemMode: mode }),
      ObservedSystemContrast: ({ contrast }) => ({
        ...state,
        systemContrast: contrast,
      }),
    }),
  )

// SUBSCRIPTION

/**
 * The mode the system is in on this device, as the host reports it: the
 * mode now, then each change. A browser host reads it from the page, a
 * terminal host may read its own setting; a host that gives none is
 * taken to be in light. This is the only place a system's mode enters a
 * Program.
 */
export const SystemAppearance = Context.Reference<
  Readonly<{
    modes: Stream.Stream<Mode>
    contrasts?: Stream.Stream<Contrast>
  }>
>('foldkit/SystemAppearance', {
  defaultValue: () => ({
    modes: Stream.make('Light'),
    contrasts: Stream.make('Standard'),
  }),
})

/** The host's reports of the system's mode, as Messages. */
export const systemModeStream: Stream.Stream<typeof ObservedSystemMode.Type> =
  Stream.unwrap(
    Effect.map(SystemAppearance, host =>
      Stream.map(host.modes, mode => ObservedSystemMode({ mode })),
    ),
  )

/**
 * The host's reports of the contrast the system asks for, as Messages. A
 * host that reports none is taken to ask for the usual contrast.
 */
export const systemContrastStream: Stream.Stream<
  typeof ObservedSystemContrast.Type
> = Stream.unwrap(
  Effect.map(SystemAppearance, host =>
    Stream.map(
      host.contrasts ?? Stream.make<[Contrast]>('Standard'),
      contrast => ObservedSystemContrast({ contrast }),
    ),
  ),
)
