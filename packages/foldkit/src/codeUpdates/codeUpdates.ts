import {
  Array,
  Context,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
} from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { List, Text, actionButtons } from '../renderers/elements.js'
import type { ListItem, UiNode } from '../renderers/types.js'
import { ts } from '../schema/index.js'

// MODEL

const codeFields = {
  maybeUpdateId: S.Option(S.String),
  maybeRuntime: S.Option(S.String),
  maybeMadeAtMs: S.Option(S.Number),
}

/**
 * The code a build carries: what the Client runs until it takes an
 * update. `maybeRuntime` names the native runtime the code is for, such as
 * `1.0.0`, and `maybeMadeAtMs` says when the code was made.
 *
 * @example
 * ```typescript
 * BuiltIn({
 *   maybeUpdateId: Option.none(),
 *   maybeRuntime: Option.some('1.0.0'),
 *   maybeMadeAtMs: Option.some(Date.UTC(2026, 10, 19, 15, 0)),
 * })
 * ```
 */
export const BuiltIn = ts('BuiltIn', codeFields)
/**
 * An update taken after the build, by its own name.
 *
 * @example
 * ```typescript
 * Update({
 *   maybeUpdateId: Option.some('1a2b3c4d-0000-4000-8000-000000000000'),
 *   maybeRuntime: Option.some('1.0.0'),
 *   maybeMadeAtMs: Option.some(Date.UTC(2026, 10, 20, 19, 37)),
 * })
 * ```
 */
export const Update = ts('Update', codeFields)
/**
 * The code the build carries, run because an update would not start.
 *
 * @example
 * ```typescript
 * FellBack({
 *   maybeUpdateId: Option.none(),
 *   maybeRuntime: Option.some('1.0.0'),
 *   maybeMadeAtMs: Option.none(),
 * })
 * ```
 */
export const FellBack = ts('FellBack', codeFields)
/**
 * Which code a Client is running: the code its build carries, an update
 * taken since, or the built-in code it went back to.
 *
 * @example
 * ```typescript
 * const running: RunningCode = Update({
 *   maybeUpdateId: Option.some('1a2b3c4d-0000-4000-8000-000000000000'),
 *   maybeRuntime: Option.some('1.0.0'),
 *   maybeMadeAtMs: Option.some(Date.UTC(2026, 10, 20, 19, 37)),
 * })
 * ```
 */
export const RunningCode = S.Union([BuiltIn, Update, FellBack])
/** Which code a Client is running. */
export type RunningCode = typeof RunningCode.Type

/**
 * The Client has not asked for newer code since it opened.
 *
 * @example
 * ```typescript
 * const newer: NewerCode = NotAsked()
 * ```
 */
export const NotAsked = ts('NotAsked')
/**
 * The Client is asking whether there is newer code.
 *
 * @example
 * ```typescript
 * const newer: NewerCode = Asking()
 * ```
 */
export const Asking = ts('Asking')
/**
 * The Client asked, and there is no newer code.
 *
 * @example
 * ```typescript
 * const newer: NewerCode = NoneNewer()
 * ```
 */
export const NoneNewer = ts('NoneNewer')
/**
 * There is newer code, and the Client has not fetched it.
 *
 * @example
 * ```typescript
 * Found({ maybeUpdateId: Option.some('9f8e7d6c-0000-4000-8000-000000000000') })
 * ```
 */
export const Found = ts('Found', { maybeUpdateId: S.Option(S.String) })
/**
 * The Client is fetching newer code.
 *
 * @example
 * ```typescript
 * const newer: NewerCode = Fetching()
 * ```
 */
export const Fetching = ts('Fetching')
/**
 * Newer code is fetched and runs once the Client restarts.
 *
 * @example
 * ```typescript
 * Ready({ maybeUpdateId: Option.some('9f8e7d6c-0000-4000-8000-000000000000') })
 * ```
 */
export const Ready = ts('Ready', { maybeUpdateId: S.Option(S.String) })
/**
 * The Client could not ask for newer code, and why, safe to show.
 *
 * @example
 * ```typescript
 * CouldNotAsk({ why: 'The request timed out.' })
 * ```
 */
export const CouldNotAsk = ts('CouldNotAsk', { why: S.String })
/**
 * The Client could not fetch the newer code, and why, safe to show.
 *
 * @example
 * ```typescript
 * CouldNotFetch({ why: 'The network connection was lost.' })
 * ```
 */
export const CouldNotFetch = ts('CouldNotFetch', { why: S.String })
/**
 * What came of asking for newer code, from not asked to fetched and
 * ready. Not reaching the server is ordinary, as when a phone is off the
 * network the server is on: the Client keeps the code it has.
 *
 * @example
 * ```typescript
 * const newer: NewerCode = Ready({
 *   maybeUpdateId: Option.some('9f8e7d6c-0000-4000-8000-000000000000'),
 * })
 * ```
 */
export const NewerCode = S.Union([
  NotAsked,
  Asking,
  NoneNewer,
  Found,
  Fetching,
  Ready,
  CouldNotAsk,
  CouldNotFetch,
])
/** What came of asking for newer code. */
export type NewerCode = typeof NewerCode.Type

/**
 * What a host says of its code at one moment: which code runs, and what
 * came of asking for newer code. A Program keeps the last one it heard in
 * its Model, as `Option<CodeStatus>`: none where the host says nothing,
 * as a browser tab or a terminal does. It is a fact about one device, so a
 * Program that is mirrored keeps it out of its shared log.
 *
 * @example
 * ```typescript
 * const status: CodeStatus = { running: BuiltIn({ ... }), newer: NoneNewer() }
 * ```
 */
export const CodeStatus = S.Struct({ running: RunningCode, newer: NewerCode })
/** What a host says of its code at one moment. */
export type CodeStatus = typeof CodeStatus.Type

// SERVICE

/**
 * The host could not restart the Client, and why, safe to show.
 *
 * @example
 * ```typescript
 * Effect.fail(new RestartRefused({ reason: 'this device takes no updates' }))
 * ```
 */
export class RestartRefused extends Data.TaggedError('RestartRefused')<{
  readonly reason: string
}> {}

type CodeUpdatesService = Readonly<{
  statuses: Stream.Stream<CodeStatus>
  restart: Effect.Effect<void, RestartRefused>
}>

const saysNothing: CodeUpdatesService = {
  statuses: Stream.empty,
  restart: Effect.fail(
    new RestartRefused({ reason: 'this device takes no updates' }),
  ),
}

/**
 * What a host says of the code its Client runs, and its way to restart
 * on newer code. `statuses` is the status now, then each change; `restart`
 * starts the Client again on the code it fetched. A phone app that takes
 * updates over the air supplies it, as `expoCodeUpdates` in
 * `@foldkit/react-native/updates` does. A host that supplies none says
 * nothing and refuses a restart, so a Program reads it on every Client.
 *
 * @example
 * ```typescript
 * Layer.succeed(CodeUpdates, {
 *   statuses: Stream.make({ running: BuiltIn({ ... }), newer: NoneNewer() }),
 *   restart: Effect.void,
 * })
 * ```
 */
export const CodeUpdates = Context.Reference<CodeUpdatesService>(
  'foldkit/CodeUpdates',
  { defaultValue: () => saysNothing },
)

/**
 * The supply for a Client that takes no updates, such as a browser tab or
 * a terminal: it says nothing, so a Program shows nothing about updates,
 * and it refuses a restart. It is what a host gets by supplying none;
 * naming it says so on purpose.
 *
 * @example
 * ```typescript
 * Runtime.startHandle({ program, sync, resources: noCodeUpdates })
 * ```
 */
export const noCodeUpdates: Layer.Layer<never> = Layer.succeed(
  CodeUpdates,
  saysNothing,
)

// MESSAGE

/**
 * The host said which code runs and what came of asking for newer code.
 *
 * @example
 * ```typescript
 * ObservedCodeStatus({ status: { running: BuiltIn({ ... }), newer: Asking() } })
 * ```
 */
export const ObservedCodeStatus = m('ObservedCodeStatus', {
  status: CodeStatus,
})

/**
 * The host took the restart. The Client usually starts again before this
 * arrives, so nothing waits on it.
 *
 * @example
 * ```typescript
 * update(maybeStatus, CompletedRestartOnNewerCode()) // [maybeStatus, []]
 * ```
 */
export const CompletedRestartOnNewerCode = m('CompletedRestartOnNewerCode')

/**
 * The host refused the restart, and why, safe to show.
 *
 * @example
 * ```typescript
 * FailedRestartOnNewerCode({ reason: 'this device takes no updates' })
 * ```
 */
export const FailedRestartOnNewerCode = m('FailedRestartOnNewerCode', {
  reason: S.String,
})

// COMMAND

/**
 * Asks the host to start the Client again on the code it fetched. A
 * refusal becomes FailedRestartOnNewerCode with the host's reason, so a
 * host that cannot restart never crashes the Program.
 *
 * @example
 * ```typescript
 * RestartToUpdate: () => [model, [RestartOnNewerCode()]]
 * ```
 */
export const RestartOnNewerCode = Command.define(
  'RestartOnNewerCode',
  CompletedRestartOnNewerCode,
  FailedRestartOnNewerCode,
)(
  Effect.gen(function* () {
    const host = yield* CodeUpdates
    yield* host.restart
    return CompletedRestartOnNewerCode()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedRestartOnNewerCode({ reason: error.reason })),
    ),
  ),
)

const isReady = (status: CodeStatus): boolean => status.newer._tag === 'Ready'

/**
 * Starts the Client again on the update it fetched: `RestartToUpdate`.
 * Declared once here, so a screen's button, the action menu and an agent
 * all read it, and it is offered only once newer code is ready.
 *
 * @example
 * ```typescript
 * Catalog.entries(catalog, { running, newer: Fetching() })
 * // [Restart: Disabled({ because: 'no newer update is fetched yet' })]
 * ```
 */
export const RestartToUpdate = Catalog.action('RestartToUpdate', {
  what: 'Restarts on the newer update that was fetched',
  why: 'To use the newer update now and not on the next open',
  enabled: (status: CodeStatus) =>
    isReady(status)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'no newer update is fetched yet' }),
  triggers: [RestartOnNewerCode],
  meta: { label: 'Restart', keys: [], title: 'Restart to update' },
})

/**
 * The code updates Actions, for a Program to place in its own Catalog.
 *
 * @example
 * ```typescript
 * const [RestartToUpdate] = Catalog.within(CodeUpdates.catalog, {
 *   childOf: (model: Model) => model.maybeCodeStatus,
 *   nothing: 'this device takes no updates',
 * }).actions
 * ```
 */
export const catalog = Catalog.make([RestartToUpdate])

/**
 * Every code updates Message: the Action, the fact from the host, and
 * what came of a restart.
 *
 * @example
 * ```typescript
 * const codeUpdated = (model: Model, message: CodeUpdates.Message) =>
 *   CodeUpdates.update(model.maybeCodeStatus, message)
 * ```
 */
export const Message = S.Union([
  ...catalog.Message.members,
  ObservedCodeStatus,
  CompletedRestartOnNewerCode,
  FailedRestartOnNewerCode,
])
/** A code updates Message. */
export type Message = typeof Message.Type

/**
 * True for a code updates Message.
 *
 * @example
 * ```typescript
 * isLocalOnly: message => CodeUpdates.isMessage(message)
 * ```
 */
export const isMessage = S.is(Message)

// UPDATE

type Step = readonly [
  Option.Option<CodeStatus>,
  ReadonlyArray<ReturnType<typeof RestartOnNewerCode>>,
]

/**
 * Applies one code updates Message to the status a Program keeps: what
 * the host said replaces it, and asking to restart returns the restart
 * only while newer code is ready. What came of a restart changes nothing
 * here; a Program that wants to say a refusal reads
 * `FailedRestartOnNewerCode` in its own update.
 *
 * @example
 * ```typescript
 * const [maybeCodeStatus, commands] = update(model.maybeCodeStatus, message)
 * // after ObservedCodeStatus({ status }): [Some(status), []]
 * // after RestartToUpdate() while Ready: [Some(status), [RestartOnNewerCode()]]
 * ```
 */
export const update = (
  maybeStatus: Option.Option<CodeStatus>,
  message: Message,
): Step =>
  M.value(message).pipe(
    M.withReturnType<Step>(),
    M.tagsExhaustive({
      ObservedCodeStatus: ({ status }) => [Option.some(status), []],
      RestartToUpdate: () => [
        maybeStatus,
        Option.exists(maybeStatus, isReady) ? [RestartOnNewerCode()] : [],
      ],
      CompletedRestartOnNewerCode: () => [maybeStatus, []],
      FailedRestartOnNewerCode: () => [maybeStatus, []],
    }),
  )

// SUBSCRIPTION

/**
 * The host's reports of its code, as Messages: the status now, then each
 * change. From a host that says nothing it is empty.
 *
 * @example
 * ```typescript
 * codeStatus: entry(
 *   {},
 *   {
 *     modelToDependencies: () => ({}),
 *     dependenciesToStream: () => CodeUpdates.statusStream,
 *   },
 * )
 * ```
 */
export const statusStream: Stream.Stream<typeof ObservedCodeStatus.Type> =
  Stream.unwrap(
    Effect.map(CodeUpdates, host =>
      Stream.map(host.statuses, status => ObservedCodeStatus({ status })),
    ),
  )

// VIEW

const shownIdCharacters = 8

const shortIdOf = (updateId: string): string =>
  updateId.slice(0, shownIdCharacters)

const narrowSpaces = /[  ]/g

/**
 * When code was made, as a person reads it: the day and the minute, in
 * `timeZone`, or in the device's own zone when none is named.
 *
 * @example
 * ```typescript
 * madeAtTextOf(Date.UTC(2026, 10, 20, 19, 37), 'America/New_York')
 * // 'Nov 20, 2026, 2:37 PM'
 * ```
 */
export const madeAtTextOf = (madeAtMs: number, timeZone?: string): string =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  })
    .format(madeAtMs)
    .replace(narrowSpaces, ' ')

const madeLinesOf = (
  running: RunningCode,
  timeZone: string | undefined,
): ReadonlyArray<string> =>
  Array.fromOption(
    Option.map(
      running.maybeMadeAtMs,
      madeAtMs => `Made ${madeAtTextOf(madeAtMs, timeZone)}`,
    ),
  )

const builtInTitle = 'Running the code this app was built with'

const runningRowOf = (
  running: RunningCode,
  timeZone: string | undefined,
): ListItem =>
  M.value(running).pipe(
    M.withReturnType<ListItem>(),
    M.tagsExhaustive({
      BuiltIn: () => ({
        key: 'running',
        title: builtInTitle,
        lines: madeLinesOf(running, timeZone),
      }),
      Update: ({ maybeUpdateId }) => ({
        key: 'running',
        title: Option.match(maybeUpdateId, {
          onNone: () => 'Running an update',
          onSome: updateId => `Running update ${shortIdOf(updateId)}`,
        }),
        lines: madeLinesOf(running, timeZone),
      }),
      FellBack: () => ({
        key: 'running',
        title: builtInTitle,
        lines: [
          'An update would not start, so the app went back to it',
          ...madeLinesOf(running, timeZone),
        ],
      }),
    }),
  )

const namedOr = (
  maybeUpdateId: Option.Option<string>,
  named: (name: string) => string,
  unnamed: string,
): string =>
  Option.match(maybeUpdateId, {
    onNone: () => unnamed,
    onSome: updateId => named(`Update ${shortIdOf(updateId)}`),
  })

const restartButtonOf = (
  entries: ReadonlyArray<Catalog.Entry>,
): Pick<ListItem, 'trailing'> =>
  Array.match(
    Array.filter(
      entries,
      entry =>
        entry.tag === RestartToUpdate.tag &&
        Catalog.isEnabled(entry.availability),
    ),
    {
      onEmpty: () => ({}),
      onNonEmpty: offered => ({ trailing: actionButtons(offered) }),
    },
  )

const newerRowOf = (
  newer: NewerCode,
  entries: ReadonlyArray<Catalog.Entry>,
): ListItem =>
  M.value(newer).pipe(
    M.withReturnType<ListItem>(),
    M.tagsExhaustive({
      NotAsked: () => ({
        key: 'newer',
        title: 'Has not asked for a newer update',
      }),
      Asking: () => ({ key: 'newer', title: 'Asking for a newer update…' }),
      NoneNewer: () => ({ key: 'newer', title: 'No newer update' }),
      Found: ({ maybeUpdateId }) => ({
        key: 'newer',
        title: 'A newer update is out',
        lines: [
          namedOr(
            maybeUpdateId,
            name => `${name} is not fetched yet`,
            'It is not fetched yet',
          ),
        ],
      }),
      Fetching: () => ({ key: 'newer', title: 'Fetching a newer update…' }),
      Ready: ({ maybeUpdateId }) => ({
        key: 'newer',
        title: 'A newer update is ready',
        lines: [
          namedOr(
            maybeUpdateId,
            name => `${name} runs after a restart`,
            'It runs after a restart',
          ),
        ],
        ...restartButtonOf(entries),
      }),
      CouldNotAsk: ({ why }) => ({
        key: 'newer',
        title: 'Could not ask for a newer update',
        lines: [why],
      }),
      CouldNotFetch: ({ why }) => ({
        key: 'newer',
        title: 'Could not fetch the newer update',
        lines: [why],
      }),
    }),
  )

/**
 * The section about updates, for any screen: which code the Client runs
 * and when it was made, then where asking for newer code stands, with
 * the restart's own button once newer code is ready. Empty where the host
 * says nothing, so a browser tab or a terminal shows no such section.
 * `entries` are the Program's Catalog entries, where the button's label,
 * hint and press are read. `timeZone` names the zone to say times in; the
 * device's own when left out.
 *
 * @example
 * ```typescript
 * Column({}, ...CodeUpdates.sectionOf(model.maybeCodeStatus, Catalog.entries(catalog, model)))
 * // Updates
 * //   Running update 1a2b3c4d · Made Nov 20, 2026, 2:37 PM
 * //   A newer update is ready · Update 9f8e7d6c runs after a restart [Restart]
 * ```
 */
export const sectionOf = (
  maybeStatus: Option.Option<CodeStatus>,
  entries: ReadonlyArray<Catalog.Entry>,
  options: Readonly<{ timeZone?: string }> = {},
): ReadonlyArray<UiNode> =>
  Option.match(maybeStatus, {
    onNone: () => [],
    onSome: ({ running, newer }) => [
      Text('Updates', { dim: true }),
      List({
        label: 'Updates',
        items: [
          runningRowOf(running, options.timeZone),
          newerRowOf(newer, entries),
        ],
      }),
    ],
  })
