import { Array, Effect } from 'effect'
import { type Browser, type BrowserContext, type Page } from 'playwright'

import { BenchError } from './error.js'
import { type CounterAssertName, type NamedAssert } from './maestro.js'
import {
  type InstantWatch,
  bodyText,
  hasActionMenu,
  hasCounterScreen,
  hasPlusAndMinus,
  hasProductScreen,
  openActionMenu,
  readCount,
  tapMinus,
  tapPlus,
  waitForCount,
} from './page.js'
import { MIRROR_HOST, PROOF_HOST } from './proof.js'
import { type AssertResult } from './trace.js'

const failClosedSettleMs = 8_000
const stepWaitMs = 8_000
const startingMarker = 'Starting Instant'
const accessMarker = 'Cloudflare Access'

const passed = (name: CounterAssertName, detail: string): AssertResult => ({
  name,
  passed: true,
  detail,
})

const failed = (name: CounterAssertName, detail: string): AssertResult => ({
  name,
  passed: false,
  detail,
})

const sleep = (ms: number): Effect.Effect<void> => Effect.sleep(`${ms} millis`)

const tryPage = <A>(
  run: () => Promise<A>,
  detail: string,
): Effect.Effect<A, BenchError> =>
  Effect.tryPromise({
    try: run,
    catch: cause => {
      if (cause instanceof BenchError) {
        return cause
      }
      return new BenchError({ detail: `${detail}: ${String(cause)}` })
    },
  })

const waitForPaint = (page: Page): Effect.Effect<void, BenchError> =>
  tryPage(
    () =>
      page
        .waitForSelector('.counter-screen', {
          timeout: stepWaitMs,
          state: 'visible',
        })
        .then(() => undefined),
    'counter-screen did not paint',
  )

const waitForInstant = (
  watch: InstantWatch,
  budgetMs: number,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const started = Date.now()
    while (Date.now() - started < budgetMs) {
      if (watch.receivedSnapshot()) {
        return true
      }
      yield* sleep(100)
    }
    return watch.receivedSnapshot()
  })

/** Grades live Instant snapshot vs fail-closed Memory after 8s. */
export const gradeInstantSettlesLive = (
  page: Page,
  watch: InstantWatch,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const text = yield* tryPage(() => bodyText(page), 'read body')
    if (text.includes(startingMarker)) {
      return failed(
        'instantSettlesLive',
        `${rule.why}. Still "${startingMarker}". Instant never returned a snapshot.`,
      )
    }
    const received = yield* waitForInstant(watch, failClosedSettleMs)
    if (!received) {
      return failed(
        'instantSettlesLive',
        `${rule.why}. Instant never returned a snapshot. Paint may be fail-closed Memory readyCounter(0) after ${failClosedSettleMs}ms.`,
      )
    }
    const sources = watch.sources()
    const maybeSource = Array.match(sources, {
      onEmpty: () => 'instant',
      onNonEmpty: nonempty => nonempty.join(', '),
    })
    return passed(
      'instantSettlesLive',
      `${rule.why}. Live Instant snapshot via ${maybeSource}.`,
    )
  })

/** Grades that the number, plus, and minus are on the painted page. */
export const gradeCountVisible = (
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const text = yield* tryPage(() => bodyText(page), 'read body')
    if (text.includes(accessMarker)) {
      return failed('countVisible', `${rule.why}. Access interstitial.`)
    }
    if (text.includes(startingMarker)) {
      return failed('countVisible', `${rule.why}. Still "${startingMarker}".`)
    }
    const painted = yield* tryPage(
      () => hasCounterScreen(page),
      'look for counter-screen',
    )
    if (!painted) {
      return failed('countVisible', `${rule.why}. .counter-screen missing.`)
    }
    const buttons = yield* tryPage(
      () => hasPlusAndMinus(page),
      'look for plus and minus',
    )
    if (!buttons) {
      return failed('countVisible', `${rule.why}. plus or minus missing.`)
    }
    const count = yield* tryPage(() => readCount(page), 'read count')
    return passed(
      'countVisible',
      `${rule.why}. count ${count} visible with plus and minus.`,
    )
  })

/** Grades that plus raises the visible count by 1. */
export const gradeIncrementRaises = (
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const before = yield* tryPage(() => readCount(page), 'read count')
    yield* tryPage(() => tapPlus(page), 'tap plus')
    const next = before + 1
    const raised = yield* tryPage(
      () => waitForCount(page, next, stepWaitMs).then(() => true),
      'wait for increment',
    ).pipe(Effect.catch(() => Effect.succeed(false)))
    if (!raised) {
      const after = yield* tryPage(
        () => readCount(page),
        'read count after plus',
      )
      return failed(
        'incrementRaises',
        `${rule.why}. expected ${next}, got ${after}.`,
      )
    }
    return passed('incrementRaises', `${rule.why}. ${before} -> ${next}.`)
  })

/** Grades that minus lowers the visible count by 1. */
export const gradeDecrementLowers = (
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const before = yield* tryPage(() => readCount(page), 'read count')
    yield* tryPage(() => tapMinus(page), 'tap minus')
    const next = before - 1
    const lowered = yield* tryPage(
      () => waitForCount(page, next, stepWaitMs).then(() => true),
      'wait for decrement',
    ).pipe(Effect.catch(() => Effect.succeed(false)))
    if (!lowered) {
      const after = yield* tryPage(
        () => readCount(page),
        'read count after minus',
      )
      return failed(
        'decrementLowers',
        `${rule.why}. expected ${next}, got ${after}.`,
      )
    }
    return passed('decrementLowers', `${rule.why}. ${before} -> ${next}.`)
  })

/** Grades the Action menu abstraction on the painted page. */
export const gradeActionMenuAbstraction = (
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    yield* tryPage(() => openActionMenu(page), 'open Action menu')
    yield* sleep(500)
    const visible = yield* tryPage(
      () => hasActionMenu(page),
      'look for Action menu',
    )
    if (!visible) {
      return failed(
        'actionMenuAbstraction',
        `${rule.why}. Overlay not visible after cmd-K or ?.`,
      )
    }
    return passed(
      'actionMenuAbstraction',
      `${rule.why}. Actions overlay visible.`,
    )
  })

/** Grades the same counterScreen on an already-painted mirror host. */
export const gradeSameScreenMirrored = (
  browser: Browser,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const context = yield* tryPage(
      () => browser.newContext(),
      'open mirror context',
    )
    const page = yield* tryPage(() => context.newPage(), 'open mirror page')
    const result = yield* Effect.gen(function* () {
      const response = yield* tryPage(
        () => page.goto(MIRROR_HOST, { waitUntil: 'domcontentloaded' }),
        `goto ${MIRROR_HOST}`,
      )
      if (response === null || response.status() !== 200) {
        const status = response === null ? 0 : response.status()
        return failed(
          'sameScreenMirrored',
          `${rule.why}. ${MIRROR_HOST} HTTP ${status}. Proof remains ${PROOF_HOST}.`,
        )
      }
      yield* tryPage(
        () =>
          page
            .waitForSelector('.fk-text', {
              timeout: stepWaitMs,
              state: 'visible',
            })
            .then(() => undefined),
        'mirror .fk-text did not paint',
      ).pipe(Effect.catch(() => Effect.void))
      const painted = yield* tryPage(
        () => hasProductScreen(page),
        'look for mirrored product screen',
      )
      if (!painted) {
        const body = yield* tryPage(
          () => bodyText(page),
          'read mirror body',
        ).pipe(Effect.catch(() => Effect.succeed('')))
        const snippet = body.trim().slice(0, 180)
        return failed(
          'sameScreenMirrored',
          `${rule.why}. ${MIRROR_HOST} missing counterScreen product tree (${snippet}). Proof remains ${PROOF_HOST}.`,
        )
      }
      return passed(
        'sameScreenMirrored',
        `${rule.why}. ${MIRROR_HOST} paints counterScreen. Proof remains ${PROOF_HOST}.`,
      )
    }).pipe(Effect.ensuring(Effect.promise(() => context.close())))
    return result
  })

/** Grades shared Instant count across two proof-host contexts. Not login. */
export const gradeGlobalSync = (
  browser: Browser,
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    const context = yield* tryPage(
      () => browser.newContext(),
      'open sync context',
    )
    const other = yield* tryPage(() => context.newPage(), 'open sync page')
    const result = yield* Effect.gen(function* () {
      const response = yield* tryPage(
        () => other.goto(PROOF_HOST, { waitUntil: 'domcontentloaded' }),
        `goto ${PROOF_HOST} second context`,
      )
      if (response === null || response.status() !== 200) {
        return failed(
          'globalSync',
          `${rule.why}. second context failed to load.`,
        )
      }
      yield* waitForPaint(other).pipe(Effect.catch(() => Effect.void))
      const before = yield* tryPage(() => readCount(page), 'read proof count')
      yield* tryPage(() => tapPlus(page), 'tap plus on proof')
      const next = before + 1
      const synced = yield* tryPage(
        () => waitForCount(other, next, failClosedSettleMs).then(() => true),
        'wait for other context',
      ).pipe(Effect.catch(() => Effect.succeed(false)))
      yield* tryPage(() => tapMinus(page), 'restore minus on proof').pipe(
        Effect.catch(() => Effect.void),
      )
      if (!synced) {
        const otherCount = yield* tryPage(
          () => readCount(other),
          'read other count',
        ).pipe(Effect.catch(() => Effect.succeed(Number.NaN)))
        return failed(
          'globalSync',
          `${rule.why}. proof ${next}, other ${otherCount}. Not login.`,
        )
      }
      return passed(
        'globalSync',
        `${rule.why}. second context saw ${next}. Not login.`,
      )
    }).pipe(Effect.ensuring(Effect.promise(() => context.close())))
    return result
  })

/** Grades painted Counter with the network offline. */
export const gradeOfflineWorks = (
  context: BrowserContext,
  page: Page,
  rule: NamedAssert,
): Effect.Effect<AssertResult, BenchError> =>
  Effect.gen(function* () {
    yield* tryPage(() => context.setOffline(true), 'set offline')
    const result = yield* Effect.gen(function* () {
      const before = yield* tryPage(() => readCount(page), 'read count offline')
      yield* tryPage(() => tapPlus(page), 'tap plus offline')
      const next = before + 1
      const raised = yield* tryPage(
        () => waitForCount(page, next, stepWaitMs).then(() => true),
        'wait for offline increment',
      ).pipe(Effect.catch(() => Effect.succeed(false)))
      yield* tryPage(() => tapMinus(page), 'restore minus offline').pipe(
        Effect.catch(() => Effect.void),
      )
      if (!raised) {
        const after = yield* tryPage(
          () => readCount(page),
          'read count after offline plus',
        ).pipe(Effect.catch(() => Effect.succeed(Number.NaN)))
        return failed(
          'offlineWorks',
          `${rule.why}. expected ${next} offline, got ${after}.`,
        )
      }
      return passed(
        'offlineWorks',
        `${rule.why}. offline plus raised ${before} -> ${next}.`,
      )
    }).pipe(
      Effect.ensuring(
        tryPage(() => context.setOffline(false), 'set online').pipe(
          Effect.catch(() => Effect.void),
        ),
      ),
    )
    return result
  })
