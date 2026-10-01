import { Array, Match as M, Option, pipe } from 'effect'

import {
  type HistoryMode,
  type ProgramNavigation,
  routeOf,
} from './declaration.js'
import {
  Launch,
  type Message,
  NavigatedBack,
  OpenedUri,
  type UriVia,
} from './message.js'
import {
  type NavigationStack,
  type PresentationStyle,
  entriesOf,
} from './structure.js'
import { pathAndUri, printStates } from './uri.js'

// PLAN

/**
 * One stack entry as every carrier sees it. `key` is the entry's printed
 * path, its identity; `uri` adds its configuration.
 *
 * @example
 * ```typescript
 * // { key: '/counter/menu', uri: '/counter/menu?q=re', destination: ActionMenu,
 * //   maybeStyle: Some(Dialog()), title: 'Actions' }
 * ```
 */
export type CarrierEntry<Destination> = Readonly<{
  key: string
  uri: string
  destination: Destination
  maybeStyle: Option.Option<PresentationStyle>
  title: string
}>

/** What every carrier shows for one Model: entries root first, and the URI. */
export type CarrierPlan<Destination> = Readonly<{
  entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
  uri: string
  history: HistoryMode
}>

const titleOf = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  destination: Destination,
): string =>
  Option.match(routeOf(navigation, destination), {
    onNone: () => '',
    onSome: route => route.titleOf(destination),
  })

/**
 * The carrier plan for one stack. None when the Program is not
 * URL-addressable or a Destination has no route.
 *
 * @example
 * ```typescript
 * planOf(navigation, model, stack)
 * // Some({ entries: [/counter, /counter/session], uri: '/counter/session', history: 'Record' })
 * ```
 */
export const planOf = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
): Option.Option<CarrierPlan<Destination>> =>
  Option.map(printStates(navigation, stack), states => {
    const levels = Array.prepend(
      Array.map(entriesOf(stack), entry => ({
        destination: entry.destination,
        maybeStyle: Option.some(entry.style),
      })),
      { destination: stack.root, maybeStyle: Option.none<PresentationStyle>() },
    )
    const entries = Array.map(
      Array.zip(states, levels),
      ([state, level]): CarrierEntry<Destination> => {
        const { path, uri } = pathAndUri(state)
        return {
          key: path,
          uri,
          destination: level.destination,
          maybeStyle: level.maybeStyle,
          title: titleOf(navigation, level.destination),
        }
      },
    )
    return {
      entries,
      uri: Array.lastNonEmpty(entries).uri,
      history:
        navigation.historyOf === undefined
          ? 'Record'
          : navigation.historyOf(model),
    }
  })

// MOVE

/**
 * What a carrier shows now, in plan terms. `keys` are the entry keys from
 * the root up; they are empty when the carrier holds an entry the Program
 * did not write, such as a cold deep link.
 */
export type CarrierSnapshot = Readonly<{
  keys: ReadonlyArray<string>
  uri: string
  maybePosition: Option.Option<number>
}>

/** The one move that takes a carrier from its snapshot to a plan. */
export type CarrierMove<Destination> =
  | Readonly<{ _tag: 'Unchanged' }>
  | Readonly<{ _tag: 'Reconfigure' }>
  | Readonly<{
      _tag: 'Push'
      entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
    }>
  | Readonly<{ _tag: 'Pop'; count: number }>
  | Readonly<{
      _tag: 'Replace'
      popCount: number
      entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
    }>
  | Readonly<{ _tag: 'Reset' }>

const sharedPrefixLength = (
  self: ReadonlyArray<string>,
  that: ReadonlyArray<string>,
): number =>
  pipe(
    Array.zip(self, that),
    Array.takeWhile(([selfKey, thatKey]) => selfKey === thatKey),
    Array.length,
  )

const keysOf = <Destination>(
  plan: CarrierPlan<Destination>,
): ReadonlyArray<string> => Array.map(plan.entries, entry => entry.key)

/**
 * Diffs a carrier snapshot against a plan by entry key, then by URI.
 *
 * @example
 * ```typescript
 * carrierMove({ keys: ['/counter'], uri: '/counter', ... }, planAt('/counter/session'))
 * // Push([/counter/session])
 * ```
 */
export const carrierMove = <Destination>(
  snapshot: CarrierSnapshot,
  plan: CarrierPlan<Destination>,
): CarrierMove<Destination> => {
  const planKeys = keysOf(plan)
  const shared = sharedPrefixLength(snapshot.keys, planKeys)
  const added = Array.drop(plan.entries, shared)
  const isSameKeys =
    shared === snapshot.keys.length && shared === planKeys.length
  if (isSameKeys) {
    return snapshot.uri === plan.uri
      ? { _tag: 'Unchanged' }
      : { _tag: 'Reconfigure' }
  } else if (shared === 0) {
    return { _tag: 'Reset' }
  } else if (shared === snapshot.keys.length && Array.isArrayNonEmpty(added)) {
    return { _tag: 'Push', entries: added }
  } else if (shared === planKeys.length) {
    return { _tag: 'Pop', count: snapshot.keys.length - shared }
  } else if (Array.isArrayNonEmpty(added)) {
    return {
      _tag: 'Replace',
      popCount: snapshot.keys.length - shared,
      entries: added,
    }
  } else {
    return { _tag: 'Reset' }
  }
}

/**
 * The fact a carrier change means, or None when the carrier already shows
 * the plan. A snapshot whose keys are a strict prefix of the plan's is a
 * move back; anything else opens the snapshot's URI.
 *
 * @example
 * ```typescript
 * classifyCarrierChange({ keys: ['/counter'], uri: '/counter', ... }, planAt('/counter/menu'), History())
 * // Some(NavigatedBack({ uri: '/counter' }))
 * ```
 */
export const classifyCarrierChange = <Destination>(
  snapshot: CarrierSnapshot,
  plan: CarrierPlan<Destination>,
  via: UriVia,
): Option.Option<Message> => {
  const planKeys = keysOf(plan)
  const shared = sharedPrefixLength(snapshot.keys, planKeys)
  const isSameKeys =
    shared === snapshot.keys.length && shared === planKeys.length
  const isStrictPrefix =
    Array.isReadonlyArrayNonEmpty(snapshot.keys) &&
    shared === snapshot.keys.length &&
    shared < planKeys.length
  if (isSameKeys && snapshot.uri === plan.uri) {
    return Option.none()
  } else if (isStrictPrefix) {
    return Option.some(NavigatedBack({ uri: snapshot.uri }))
  } else {
    return Option.some(OpenedUri({ uri: snapshot.uri, via }))
  }
}

// DRIVER

/** A carrier state our own write will produce. */
export type Expectation = Readonly<{
  label: string
  isMetBy: (snapshot: CarrierSnapshot) => boolean
}>

/** One carrier change, from a user move or from our own write. */
export type CarrierEvent = Readonly<{
  snapshot: CarrierSnapshot
  via: UriVia
}>

/**
 * The only code a carrier adapter writes. `perform` returns None when its
 * write is complete and synchronous, and an Expectation when the carrier
 * reports the result later.
 */
export type CarrierDriver<Destination> = Readonly<{
  name: string
  read: () => CarrierSnapshot
  perform: (
    move: CarrierMove<Destination>,
    plan: CarrierPlan<Destination>,
    snapshot: CarrierSnapshot,
  ) => Option.Option<Expectation>
  subscribe: (listener: (event: CarrierEvent) => void) => () => void
}>

/**
 * What the carrier loop reads from and reports to. A bound Program
 * satisfies it.
 */
export type CarrierSource<Destination> = Readonly<{
  navigation: () => Option.Option<CarrierPlan<Destination>>
  canonicalUri: (uri: string) => Option.Option<string>
  openUri: (uri: string, via: UriVia) => boolean
  navigateBack: (uri: string) => boolean
  subscribe: (listener: () => void) => () => void
}>

const isShownBy = <Destination>(
  source: CarrierSource<Destination>,
  plan: CarrierPlan<Destination>,
  uri: string,
): boolean =>
  Option.match(source.canonicalUri(uri), {
    onNone: () => true,
    onSome: canonical => canonical === plan.uri,
  })

/**
 * Opens a launch URI unless the plan already shows it, so a launch at the
 * Program's own URI is not a fact. Returns true when it sent `OpenedUri`.
 *
 * @example
 * ```typescript
 * launch(bound, '/counter/session') // true while the plan shows `/counter`
 * launch(bound, '/counter/')        // false: it canonicalizes to the plan
 * ```
 */
export const launch = <Destination>(
  source: CarrierSource<Destination>,
  uri: string,
): boolean =>
  Option.exists(
    source.navigation(),
    plan => !isShownBy(source, plan, uri) && source.openUri(uri, Launch()),
  )

/**
 * Goes back one entry: reports `NavigatedBack` naming the entry beneath
 * the top. False at the root, where Back belongs to the host.
 *
 * @example
 * ```typescript
 * backOneEntry(bound) // NavigatedBack({ uri: '/counter' }) from `/counter/menu`
 * ```
 */
export const backOneEntry = <Destination>(
  source: CarrierSource<Destination>,
): boolean =>
  pipe(
    source.navigation(),
    Option.flatMap(plan => Array.last(Array.initNonEmpty(plan.entries))),
    Option.match({
      onNone: () => false,
      onSome: beneath => source.navigateBack(beneath.uri),
    }),
  )

/** Something the carrier loop could not do. */
export type CarrierDiagnostic =
  | Readonly<{ _tag: 'GaveUpCorrecting'; uri: string }>
  | Readonly<{ _tag: 'ExpectationExpired'; label: string }>

/**
 * How the carrier loop launches, waits, and reports.
 *
 * - `launchUri` is the URI the carrier opened with, such as the browser's
 *   location or a native deep link. Without one, the carrier adopts the
 *   Program's plan.
 * - `expectationTimeoutMs` bounds the wait for our own asynchronous write.
 * - `reportTimeoutMs` bounds the wait for the Program to answer a fact;
 *   a Program that refuses one is corrected after it.
 * - `maximumCorrections` bounds the writes toward one plan, so a carrier
 *   that rewrites URIs cannot loop forever.
 */
export type CarrierOptions = Readonly<{
  launchUri?: Option.Option<string>
  expectationTimeoutMs?: number
  reportTimeoutMs?: number
  maximumCorrections?: number
  onDiagnostic?: (diagnostic: CarrierDiagnostic) => void
}>

const defaultExpectationTimeoutMs = 1000

const defaultReportTimeoutMs = 100

const defaultMaximumCorrections = 3

type Timer = ReturnType<typeof setTimeout>

type Pending =
  | Readonly<{ _tag: 'Writing'; expectation: Expectation; timer: Timer }>
  | Readonly<{ _tag: 'Reporting'; planUri: string; timer: Timer }>

/**
 * Keeps one carrier showing a bound Program's navigation until the
 * returned stop runs. The Program wins every disagreement: a carrier
 * change the plan did not cause is reported as a fact, and the carrier is
 * then written toward whatever plan the Program answers with.
 *
 * @example
 * ```typescript
 * const stop = runCarrier(bound, browserHistoryDriver(window), {
 *   launchUri: Option.some(windowUri(window)),
 * })
 * ```
 */
export const runCarrier = <Destination>(
  source: CarrierSource<Destination>,
  driver: CarrierDriver<Destination>,
  options: CarrierOptions = {},
): (() => void) => {
  const expectationTimeoutMs =
    options.expectationTimeoutMs ?? defaultExpectationTimeoutMs
  const reportTimeoutMs = options.reportTimeoutMs ?? defaultReportTimeoutMs
  const maximumCorrections =
    options.maximumCorrections ?? defaultMaximumCorrections
  let maybePending: Option.Option<Pending> = Option.none()
  let maybeLaunchUri: Option.Option<string> = options.launchUri ?? Option.none()
  let hasLaunched = false
  let maybeWrittenPlanUri: Option.Option<string> = Option.none()
  let writesTowardPlan = 0
  let isStopped = false

  const report = (diagnostic: CarrierDiagnostic): void => {
    if (options.onDiagnostic !== undefined) {
      options.onDiagnostic(diagnostic)
    }
  }

  const clearPending = (): void => {
    if (Option.isSome(maybePending)) {
      clearTimeout(maybePending.value.timer)
    }
    maybePending = Option.none()
  }

  const reconcile = (): void => {
    if (isStopped || Option.isSome(maybePending)) {
      return
    }
    const maybePlan = source.navigation()
    if (Option.isNone(maybePlan)) {
      return
    }
    const plan = maybePlan.value
    if (!Option.contains(maybeWrittenPlanUri, plan.uri)) {
      maybeWrittenPlanUri = Option.some(plan.uri)
      writesTowardPlan = 0
    }
    const snapshot = driver.read()
    const move = carrierMove(snapshot, plan)
    if (move._tag === 'Unchanged') {
      return
    }
    if (writesTowardPlan >= maximumCorrections) {
      report({ _tag: 'GaveUpCorrecting', uri: plan.uri })
      return
    }
    writesTowardPlan += 1
    const maybeExpectation = Option.filter(
      driver.perform(move, plan, snapshot),
      expectation => !expectation.isMetBy(driver.read()),
    )
    if (Option.isSome(maybeExpectation)) {
      maybePending = Option.some({
        _tag: 'Writing',
        expectation: maybeExpectation.value,
        timer: setTimeout(expireWrite, expectationTimeoutMs),
      })
    } else {
      reconcile()
    }
  }

  const expireWrite = (): void => {
    if (Option.isSome(maybePending) && maybePending.value._tag === 'Writing') {
      report({
        _tag: 'ExpectationExpired',
        label: maybePending.value.expectation.label,
      })
    }
    maybePending = Option.none()
    reconcile()
  }

  const expireReport = (): void => {
    maybePending = Option.none()
    reconcile()
  }

  const reportFact = (fact: Message, planUri: string): void => {
    clearPending()
    maybePending = Option.some({
      _tag: 'Reporting',
      planUri,
      timer: setTimeout(expireReport, reportTimeoutMs),
    })
    const isSent = M.value(fact).pipe(
      M.withReturnType<boolean>(),
      M.tagsExhaustive({
        OpenedUri: ({ uri, via }) => source.openUri(uri, via),
        NavigatedBack: ({ uri }) => source.navigateBack(uri),
      }),
    )
    if (!isSent) {
      clearPending()
      reconcile()
    }
  }

  const onModel = (): void => {
    if (isStopped) {
      return
    }
    const maybePlan = source.navigation()
    if (Option.isNone(maybePlan)) {
      return
    }
    const plan = maybePlan.value
    const isAnswered = Option.exists(
      maybePending,
      pending => pending._tag === 'Reporting' && pending.planUri !== plan.uri,
    )
    if (isAnswered) {
      clearPending()
    }
    if (!hasLaunched) {
      hasLaunched = true
      const maybeUnshownLaunch = Option.filter(
        maybeLaunchUri,
        launchUri => !isShownBy(source, plan, launchUri),
      )
      if (Option.isSome(maybeUnshownLaunch)) {
        reportFact(
          OpenedUri({ uri: maybeUnshownLaunch.value, via: Launch() }),
          plan.uri,
        )
        return
      }
    }
    reconcile()
  }

  const onCarrier = ({ snapshot, via }: CarrierEvent): void => {
    if (isStopped) {
      return
    }
    const maybePlan = source.navigation()
    if (Option.isNone(maybePlan)) {
      maybeLaunchUri = Option.some(snapshot.uri)
      return
    }
    const plan = maybePlan.value
    const isOwnWrite = Option.exists(
      maybePending,
      pending =>
        pending._tag === 'Writing' && pending.expectation.isMetBy(snapshot),
    )
    if (isOwnWrite) {
      clearPending()
      reconcile()
      return
    }
    Option.match(classifyCarrierChange(snapshot, plan, via), {
      onNone: () => {
        clearPending()
        reconcile()
      },
      onSome: fact => reportFact(fact, plan.uri),
    })
  }

  const stopModel = source.subscribe(onModel)
  const stopCarrier = driver.subscribe(onCarrier)
  onModel()
  return () => {
    isStopped = true
    clearPending()
    stopModel()
    stopCarrier()
  }
}
