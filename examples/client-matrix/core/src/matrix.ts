import {
  CounterDetail,
  CounterFactAlert,
  CounterList,
  DeleteCounterConfirmation,
  LoadingCounterFact,
  type Navigation,
  destinationForModel,
  modelForNavigation,
  navigationToPath,
} from 'counters-core-example'
import { Array, Match as M, Option } from 'effect'

import {
  ClientDefinition,
  type ClientId,
  type ScreenMode,
  ScreenModeDefinition,
} from './model.js'

/** The canonical destination modes compared across every client. */
export const screenModes: ReadonlyArray<ScreenModeDefinition> = [
  ScreenModeDefinition.make({
    mode: 'List',
    title: 'Counter list',
    description: 'Two identified Counter Submodels are visible.',
  }),
  ScreenModeDefinition.make({
    mode: 'Detail',
    title: 'Counter detail',
    description: 'counter-1 is selected with no presentation mode.',
  }),
  ScreenModeDefinition.make({
    mode: 'Fact',
    title: 'Fact presentation',
    description: 'Opening the fact state restores its Command and settles.',
  }),
  ScreenModeDefinition.make({
    mode: 'DeleteConfirmation',
    title: 'Delete confirmation',
    description: 'The selected counter presents its destructive confirmation.',
  }),
]

/** The concrete client surfaces compared by the matrix. */
export const clients: ReadonlyArray<ClientDefinition> = [
  ClientDefinition.make({
    clientId: 'ReactWeb',
    title: 'React',
    description: 'Shared React bindings with a React web presenter.',
    surface: 'Graphical',
    renderer: 'React',
    platform: 'Web',
    host: 'Vite',
    carrier: 'HttpsUrl',
  }),
  ClientDefinition.make({
    clientId: 'FoldkitView',
    title: 'Foldkit',
    description: 'The canonical Foldkit view renderer.',
    surface: 'Graphical',
    renderer: 'FoldkitView',
    platform: 'Web',
    host: 'Vite',
    carrier: 'HttpsUrl',
  }),
  ClientDefinition.make({
    clientId: 'ExpoWeb',
    title: 'Expo Web',
    description: 'The universal React Native application running on web.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Web',
    host: 'Expo',
    carrier: 'HttpsUrl',
  }),
  ClientDefinition.make({
    clientId: 'EffectTerminal',
    title: 'Effect Terminal',
    description: 'A line-oriented Effect Terminal host.',
    surface: 'LineTerminal',
    renderer: 'Text',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
  }),
  ClientDefinition.make({
    clientId: 'OpenTui',
    title: 'OpenTUI',
    description: 'The OpenTUI React terminal reconciler.',
    surface: 'TerminalUI',
    renderer: 'OpenTuiReact',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
  }),
  ClientDefinition.make({
    clientId: 'RawCli',
    title: 'Raw CLI',
    description: 'Portable URI input with stdout-only rendering.',
    surface: 'OneShotCLI',
    renderer: 'Text',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
  }),
  ClientDefinition.make({
    clientId: 'ExpoIos',
    title: 'Expo iOS',
    description: 'The universal Expo application on an iOS simulator.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Ios',
    host: 'Expo',
    carrier: 'CustomSchemeUrl',
  }),
  ClientDefinition.make({
    clientId: 'ExpoAndroid',
    title: 'Expo Android',
    description: 'The universal Expo application on an Android emulator.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Android',
    host: 'Expo',
    carrier: 'CustomSchemeUrl',
  }),
]

/** Returns the canonical navigation state represented by one matrix mode. */
export const navigationForScreenMode = (mode: ScreenMode): Navigation =>
  M.value(mode).pipe(
    M.withReturnType<Navigation>(),
    M.when('List', () => CounterList.make({})),
    M.when('Detail', () =>
      CounterDetail.make({
        counterId: 'counter-1',
        maybeMode: Option.none(),
        presentationId: 'detail-matrix-detail',
      }),
    ),
    M.when('Fact', () =>
      CounterDetail.make({
        counterId: 'counter-1',
        maybeMode: Option.some(
          CounterFactAlert.make({
            detailPresentationId: 'detail-matrix-fact',
            requestId: 'fact-matrix-fact',
            status: LoadingCounterFact.make({}),
          }),
        ),
        presentationId: 'detail-matrix-fact',
      }),
    ),
    M.when('DeleteConfirmation', () =>
      CounterDetail.make({
        counterId: 'counter-1',
        maybeMode: Option.some(
          DeleteCounterConfirmation.make({
            confirmationId: 'delete-matrix-delete',
            detailPresentationId: 'detail-matrix-delete',
          }),
        ),
        presentationId: 'detail-matrix-delete',
      }),
    ),
    M.exhaustive,
  )

/** Returns the canonical Multiple Counters Model represented by one mode. */
export const stateForScreenMode = (mode: ScreenMode) =>
  modelForNavigation(navigationForScreenMode(mode))

/** Returns the renderer-neutral destination represented by one mode. */
export const destinationForScreenMode = (mode: ScreenMode) =>
  destinationForModel(stateForScreenMode(mode))

/** Prints the global portable URI represented by one mode. */
export const portableUriForScreenMode = (mode: ScreenMode): string =>
  navigationToPath(navigationForScreenMode(mode))

/** Finds the metadata for one selected mode. */
export const definitionForScreenMode = (mode: ScreenMode) =>
  Array.findFirst(screenModes, definition => definition.mode === mode)

/** Returns the stable capture slug for one client surface. */
export const captureSlugForClient = (clientId: ClientId): string =>
  M.value(clientId).pipe(
    M.withReturnType<string>(),
    M.when('ReactWeb', () => 'react'),
    M.when('FoldkitView', () => 'foldkit'),
    M.when('ExpoWeb', () => 'gui'),
    M.when('EffectTerminal', () => 'terminal'),
    M.when('OpenTui', () => 'tui'),
    M.when('RawCli', () => 'cli'),
    M.when('ExpoIos', () => 'expo-ios'),
    M.when('ExpoAndroid', () => 'expo-android'),
    M.exhaustive,
  )

/** Returns the stable capture slug for one destination mode. */
export const captureSlugForScreenMode = (mode: ScreenMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('List', () => 'list'),
    M.when('Detail', () => 'detail'),
    M.when('Fact', () => 'fact'),
    M.when('DeleteConfirmation', () => 'delete'),
    M.exhaustive,
  )
