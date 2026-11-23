import { Array, Match as M, Option } from 'effect'
import { Interaction } from 'foldkit'
import {
  initialTerminalView,
  paintProgram,
  paintTerminal,
} from 'foldkit/cli/program'
import {
  App,
  type AppMessage,
  type AppModel,
} from 'multiple-counters-core-example'

import {
  ClientDefinition,
  type ClientId,
  type ScreenMode,
  ScreenModeDefinition,
} from './model.js'

/** The word the Multiple Counters answer to in a terminal, `counters open /counters/1`. */
export const countersCommandName = 'counters'

/** The screens of the Multiple Counters compared across every client. */
export const screenModes: ReadonlyArray<ScreenModeDefinition> = [
  ScreenModeDefinition.make({
    mode: 'List',
    title: 'Counter list',
    description: 'Counter 1 is on the list at 0, as every new log starts.',
  }),
  ScreenModeDefinition.make({
    mode: 'Detail',
    title: 'Counter page',
    description: 'Counter 1 is open on its own page above the list.',
  }),
  ScreenModeDefinition.make({
    mode: 'DeleteQuestion',
    title: 'Delete question',
    description: 'Counter 1 is asked about in a dialog over its page.',
  }),
]

/** The clients that run the Multiple Counters Program today. */
export const clients: ReadonlyArray<ClientDefinition> = [
  ClientDefinition.make({
    clientId: 'ReactWeb',
    title: 'React',
    description: 'The hosted web app, painted by the React painter.',
    surface: 'Graphical',
    renderer: 'React',
    platform: 'Web',
    host: 'Vite',
    carrier: 'HttpsUrl',
  }),
  ClientDefinition.make({
    clientId: 'SvelteWeb',
    title: 'Svelte',
    description:
      'The same screens, painted by the Svelte painter. It starts on the list: it takes no URI yet.',
    surface: 'Graphical',
    renderer: 'Svelte',
    platform: 'Web',
    host: 'Vite',
    carrier: 'NoUriYet',
  }),
  ClientDefinition.make({
    clientId: 'OpenTui',
    title: 'OpenTUI',
    description:
      'A terminal window drawn by OpenTUI. It starts on the list: it takes no URI yet.',
    surface: 'TerminalUI',
    renderer: 'OpenTui',
    platform: 'Bun',
    host: 'OpenTui',
    carrier: 'NoUriYet',
  }),
  ClientDefinition.make({
    clientId: 'TerminalUi',
    title: 'Terminal UI',
    description: 'The live terminal UI of the counters command.',
    surface: 'TerminalUI',
    renderer: 'Text',
    platform: 'Node',
    host: 'FoldkitTerminal',
    carrier: 'CommandLineArgument',
  }),
  ClientDefinition.make({
    clientId: 'Cli',
    title: 'CLI',
    description: 'One command in, one printed screen out.',
    surface: 'OneShotCLI',
    renderer: 'Text',
    platform: 'Node',
    host: 'FoldkitTerminal',
    carrier: 'CommandLineArgument',
  }),
]

/**
 * The presses that bring a new Multiple Counters to one mode, each the
 * name of a button on the screen before it: `Open:1` is Counter 1's Open,
 * and `Delete` is the Delete on its page.
 *
 * @example
 * ```typescript
 * pressesForScreenMode('DeleteQuestion') // ['Open:1', 'Delete']
 * ```
 */
export const pressesForScreenMode = (mode: ScreenMode): ReadonlyArray<string> =>
  M.value(mode).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.when('List', () => []),
    M.when('Detail', () => ['Open:1']),
    M.when('DeleteQuestion', () => ['Open:1', 'Delete']),
    M.exhaustive,
  )

/**
 * The Multiple Counters Program at one mode, held in memory: the Program's
 * own `init`, then each press of {@link pressesForScreenMode} through its
 * own `update`. Nothing is read from a log or written to one.
 *
 * @example
 * ```typescript
 * boundForScreenMode('Detail').readModel().navigation // the list, then Counter 1's page
 * ```
 */
export const boundForScreenMode = (
  mode: ScreenMode,
): Interaction.BoundInteraction<AppModel, AppMessage> => {
  const held = { model: App.init()[0] }
  const bound = Interaction.bind(App, {
    readModel: () => held.model,
    subscribe: () => () => {},
    send: message => {
      held.model = App.update(held.model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
  Array.forEach(pressesForScreenMode(mode), press => {
    bound.press(press)
  })
  return bound
}

/** Returns the Multiple Counters Model at one mode. */
export const stateForScreenMode = (mode: ScreenMode): AppModel =>
  boundForScreenMode(mode).readModel()

/** Returns the stack of screens at one mode, the list first. */
export const navigationForScreenMode = (
  mode: ScreenMode,
): AppModel['navigation'] => stateForScreenMode(mode).navigation

/**
 * Returns the screen on top at one mode: the dialog when one is open, else
 * the last page, else the list. `{ _tag: 'CounterDetail', counterId: 1 }`.
 */
export const destinationForScreenMode = (mode: ScreenMode): unknown => {
  const stack = navigationForScreenMode(mode)
  return Option.match(stack.maybeModal, {
    onNone: () => Option.getOrElse(Array.last(stack.pages), () => stack.root),
    onSome: modal => modal.destination,
  })
}

/**
 * Prints the URI of one mode with the Program's own router.
 *
 * @example
 * ```typescript
 * portableUriForScreenMode('DeleteQuestion') // '/counters/1/delete/1'
 * ```
 */
export const portableUriForScreenMode = (mode: ScreenMode): string =>
  Option.match(boundForScreenMode(mode).navigation(), {
    onNone: () => '',
    onSome: plan => plan.uri,
  })

/**
 * What `counters` prints at one mode, painted here by the painter the
 * command uses, from {@link boundForScreenMode}.
 *
 * @example
 * ```typescript
 * cliTextForScreenMode('List') // 'at /counters\nCounters\nCounter 1 0 [ + ] …'
 * ```
 */
export const cliTextForScreenMode = (mode: ScreenMode): string =>
  paintProgram(boundForScreenMode(mode), countersCommandName)

/** The size of the terminal the Terminal UI is painted for here. */
export const terminalUiSize = { rows: 20, columns: 72 }

/**
 * What `counters tui` shows at one mode, painted here by the painter the
 * terminal UI uses, from {@link boundForScreenMode}.
 */
export const terminalUiTextForScreenMode = (mode: ScreenMode): string =>
  Array.join(
    paintTerminal(
      boundForScreenMode(mode),
      countersCommandName,
      initialTerminalView,
      terminalUiSize,
    ).lines,
    '\n',
  )

/** Finds the metadata for one selected mode. */
export const definitionForScreenMode = (mode: ScreenMode) =>
  Array.findFirst(screenModes, definition => definition.mode === mode)

/** Returns the stable capture slug for one client surface. */
export const captureSlugForClient = (clientId: ClientId): string =>
  M.value(clientId).pipe(
    M.withReturnType<string>(),
    M.when('ReactWeb', () => 'react'),
    M.when('SvelteWeb', () => 'svelte'),
    M.when('OpenTui', () => 'open-tui'),
    M.when('TerminalUi', () => 'terminal-ui'),
    M.when('Cli', () => 'cli'),
    M.exhaustive,
  )

/** Returns the stable capture slug for one destination mode. */
export const captureSlugForScreenMode = (mode: ScreenMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('List', () => 'list'),
    M.when('Detail', () => 'detail'),
    M.when('DeleteQuestion', () => 'delete'),
    M.exhaustive,
  )
