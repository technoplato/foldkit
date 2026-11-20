import { Match as M, Option, Schema as S } from 'effect'

import { ts } from '../schema/index.js'

// NOTE: this is the one place that decides how a Transcript's view follows
// the voice. It names no DOM, no React and no phone: a painter measures,
// scrolls and listens, and asks here what to do. `step` is the whole rule
// as a pure function; `start` is the small runner every painter shares.

// SIGHT

/**
 * Where a word sits against the view it scrolls in, along the scrolling
 * axis and all in one unit: the word from `top` to `bottom`, and the view
 * from `viewStart` for `viewSize`. A browser measures in window pixels,
 * `{ top: 380, bottom: 400, viewStart: 0, viewSize: 768 }`; a phone in
 * points down its scrolled content.
 */
export const Sight = S.Struct({
  top: S.Number,
  bottom: S.Number,
  viewStart: S.Number,
  viewSize: S.Number,
})
/** Where a word sits against the view it scrolls in. */
export type Sight = typeof Sight.Type

const MIDDLE_BAND_START = 0.25

const MIDDLE_BAND_END = 0.75

/**
 * Whether a word is in the middle half of its view, where a word being
 * read is left alone.
 *
 * @example
 * ```typescript
 * isInMiddle({ top: 380, bottom: 400, viewStart: 0, viewSize: 768 }) // true
 * isInMiddle({ top: 40, bottom: 60, viewStart: 0, viewSize: 768 }) // false
 * ```
 */
export const isInMiddle = (sight: Sight): boolean =>
  sight.top > sight.viewStart + sight.viewSize * MIDDLE_BAND_START &&
  sight.bottom < sight.viewStart + sight.viewSize * MIDDLE_BAND_END

// STATE

/**
 * What following remembers between facts: when the reader last scrolled,
 * and until when a scroll of the view is taken to be the painter's own.
 */
export const State = S.Struct({
  readerScrolledAtMs: S.Number,
  ownScrollUntilMs: S.Number,
})
/** What following remembers between facts. */
export type State = typeof State.Type

/** Following before anything has happened: nobody has scrolled. */
export const initial: State = {
  readerScrolledAtMs: Number.NEGATIVE_INFINITY,
  ownScrollUntilMs: Number.NEGATIVE_INFINITY,
}

/**
 * What is so when a fact arrives: whether the Transcript says its words
 * follow the voice (`isFollowing`), whether it names a `leaveAction`
 * (`hasLeave`), and the wall-clock time.
 */
export const Context = S.Struct({
  isFollowing: S.Boolean,
  hasLeave: S.Boolean,
  nowMs: S.Number,
})
/** What is so when a fact arrives. */
export type Context = typeof Context.Type

// FACT

/** Why a word is measured: to follow it, or to see whether the reader left it. */
export const Purpose = S.Literals(['Follow', 'Leave'])
/** Why a word is measured. */
export type Purpose = typeof Purpose.Type

/** The word sounding changed, or the Transcript said its words follow again. */
export const ChangedSpokenWord = ts('ChangedSpokenWord')

/** The Transcript named a word to show, its `focusToken`. */
export const NamedWord = ts('NamedWord')

/** The reader moved the view: a wheel, a finger, a drag. */
export const ScrolledByReader = ts('ScrolledByReader')

/**
 * The view moved, and the painter cannot tell who moved it. It counts as
 * the reader's unless the painter itself just brought a word to the middle.
 */
export const ScrolledView = ts('ScrolledView')

/** The wait asked for with `WaitForLeaveCheck` is over. */
export const ElapsedLeaveWait = ts('ElapsedLeaveWait')

/**
 * The word sounding was measured, as `MeasureWord` asked. `maybeSight` is
 * none for a word that has no place yet, such as one in a passage a phone
 * has not laid out, which is far away.
 */
export const MeasuredWord = ts('MeasuredWord', {
  purpose: Purpose,
  maybeSight: S.Option(Sight),
})

/** Everything a painter tells the follow rule. */
export const Fact = S.Union([
  ChangedSpokenWord,
  NamedWord,
  ScrolledByReader,
  ScrolledView,
  ElapsedLeaveWait,
  MeasuredWord,
])
/** Everything a painter tells the follow rule. */
export type Fact = typeof Fact.Type

// INSTRUCTION

/** Which word to bring to the middle: the one sounding, or the one the Transcript named. */
export const FollowedWord = S.Literals(['Spoken', 'Named'])
/** Which word to bring to the middle. */
export type FollowedWord = typeof FollowedWord.Type

/** Measure the word sounding and answer with `MeasuredWord`. Say nothing when no word is sounding. */
export const MeasureWord = ts('MeasureWord', { purpose: Purpose })

/** Scroll the view so the word is in its middle. */
export const BringToMiddle = ts('BringToMiddle', { word: FollowedWord })

/** Answer with `ElapsedLeaveWait` after `afterMs`, in place of any wait still running. */
export const WaitForLeaveCheck = ts('WaitForLeaveCheck', { afterMs: S.Number })

/** Press the Transcript's `leaveAction`: the reader scrolled the word sounding away. */
export const PressLeave = ts('PressLeave')

/** Everything the follow rule asks of a painter. */
export const Instruction = S.Union([
  MeasureWord,
  BringToMiddle,
  WaitForLeaveCheck,
  PressLeave,
])
/** Everything the follow rule asks of a painter. */
export type Instruction = typeof Instruction.Type

// STEP

/** After the reader scrolls, the words are left alone this long, where leaving is the Program's to hear. */
const LEAVING_QUIET_MS = 1000

/** After the reader scrolls, the words are left alone this long, where nothing hears of leaving. */
const SCROLL_QUIET_MS = 4000

/** How long after the reader's scroll the word sounding is looked for in the middle. */
const LEAVE_CHECK_AFTER_MS = 250

/** How long a scroll a painter started is taken to be its own. */
const OWN_SCROLL_MS = 900

/**
 * Whether a newly spoken word is brought to the middle now: only while
 * the words follow the voice, and not for a moment after the reader
 * scrolled, a second where leaving is reported, four where it is not.
 *
 * @example
 * ```typescript
 * shouldFollowWord({ isFollowing: true, hasLeave: true, nowMs: 10_000, userScrolledAtMs: 9_500 }) // false
 * ```
 */
export const shouldFollowWord = (
  facts: Readonly<{
    isFollowing: boolean
    hasLeave: boolean
    nowMs: number
    userScrolledAtMs: number
  }>,
): boolean =>
  facts.isFollowing &&
  facts.nowMs - facts.userScrolledAtMs >=
    (facts.hasLeave ? LEAVING_QUIET_MS : SCROLL_QUIET_MS)

/** What a fact leads to: what following remembers next, and what the painter is asked to do, in order. */
export type Step = Readonly<{
  state: State
  instructions: ReadonlyArray<Instruction>
}>

const readerScrolled = (state: State, nowMs: number): Step => ({
  state: { ...state, readerScrolledAtMs: nowMs },
  instructions: [WaitForLeaveCheck({ afterMs: LEAVE_CHECK_AFTER_MS })],
})

const isAway = (maybeSight: Option.Option<Sight>): boolean =>
  Option.match(maybeSight, {
    onNone: () => true,
    onSome: sight => !isInMiddle(sight),
  })

const measured = (
  state: State,
  context: Context,
  purpose: Purpose,
  maybeSight: Option.Option<Sight>,
): Step => {
  if (!isAway(maybeSight) || !context.isFollowing) {
    return { state, instructions: [] }
  } else if (purpose === 'Follow') {
    return {
      state: { ...state, ownScrollUntilMs: context.nowMs + OWN_SCROLL_MS },
      instructions: [BringToMiddle({ word: 'Spoken' })],
    }
  } else {
    return { state, instructions: context.hasLeave ? [PressLeave()] : [] }
  }
}

/**
 * The follow rule, whole: what one fact leads to. It is pure, so every
 * painter follows the voice the same way, and it is tested with no page.
 *
 * - A new word is sounding: measure it, unless the words do not follow or
 *   the reader has just scrolled. Away from the middle, bring it there.
 * - A word is named: bring it to the middle, following or not.
 * - The reader scrolled: leave the view alone a while, and look shortly
 *   after. If the word sounding has left the middle, press leave.
 *
 * @example
 * ```typescript
 * step(initial, { isFollowing: true, hasLeave: true, nowMs: 5_000 }, ChangedSpokenWord())
 * // { state: initial, instructions: [MeasureWord({ purpose: 'Follow' })] }
 *
 * step(initial, { isFollowing: true, hasLeave: true, nowMs: 5_000 }, ScrolledByReader())
 * // { state: { readerScrolledAtMs: 5_000, ... }, instructions: [WaitForLeaveCheck({ afterMs: 250 })] }
 * ```
 */
export const step = (state: State, context: Context, fact: Fact): Step =>
  M.value(fact).pipe(
    M.withReturnType<Step>(),
    M.tagsExhaustive({
      ChangedSpokenWord: () => ({
        state,
        instructions: shouldFollowWord({
          isFollowing: context.isFollowing,
          hasLeave: context.hasLeave,
          nowMs: context.nowMs,
          userScrolledAtMs: state.readerScrolledAtMs,
        })
          ? [MeasureWord({ purpose: 'Follow' })]
          : [],
      }),
      NamedWord: () => ({
        state: { ...state, ownScrollUntilMs: context.nowMs + OWN_SCROLL_MS },
        instructions: [BringToMiddle({ word: 'Named' })],
      }),
      ScrolledByReader: () => readerScrolled(state, context.nowMs),
      ScrolledView: () =>
        context.nowMs > state.ownScrollUntilMs
          ? readerScrolled(state, context.nowMs)
          : { state, instructions: [] },
      ElapsedLeaveWait: () => ({
        state,
        instructions:
          context.isFollowing && context.hasLeave
            ? [MeasureWord({ purpose: 'Leave' })]
            : [],
      }),
      MeasuredWord: ({ purpose, maybeSight }) =>
        measured(state, context, purpose, maybeSight),
    }),
  )

// RUN

/**
 * What a painter gives the runner, the only platform code following
 * needs. `told` reads what the Transcript says now. `measure` finds the
 * word sounding and answers with where it is, with none when it has no
 * place yet, and does not answer at all when no word is sounding.
 * `bringToMiddle` scrolls the view its own way. `pressLeave` presses the
 * Transcript's `leaveAction`.
 */
export type Ports = Readonly<{
  now: () => number
  told: () => Readonly<{ isFollowing: boolean; hasLeave: boolean }>
  measure: (
    purpose: Purpose,
    answer: (maybeSight: Option.Option<Sight>) => void,
  ) => void
  bringToMiddle: (word: FollowedWord) => void
  pressLeave: () => void
}>

/** Following as it runs for one painted Transcript: tell it facts, and stop it when the Transcript goes. */
export type Running = Readonly<{
  tell: (fact: Fact) => void
  stop: () => void
}>

/**
 * Runs the follow rule for one painted Transcript. The painter tells it
 * what happens, and it does what `step` says through the painter's
 * `ports`. It keeps what following remembers, and the one wait.
 *
 * @example
 * ```typescript
 * const follow = start({ now: Date.now, told, measure, bringToMiddle, pressLeave })
 * window.addEventListener('wheel', () => follow.tell(ScrolledByReader()))
 * follow.stop()
 * ```
 */
export const start = (ports: Ports): Running => {
  const held: {
    state: State
    wait: ReturnType<typeof setTimeout> | undefined
    isStopped: boolean
  } = { state: initial, wait: undefined, isStopped: false }
  const tell = (fact: Fact): void => {
    if (held.isStopped) {
      return
    }
    const next = step(held.state, { ...ports.told(), nowMs: ports.now() }, fact)
    held.state = next.state
    next.instructions.forEach(instruction => {
      M.value(instruction).pipe(
        M.tagsExhaustive({
          MeasureWord: ({ purpose }) => {
            ports.measure(purpose, maybeSight => {
              tell(MeasuredWord({ purpose, maybeSight }))
            })
          },
          BringToMiddle: ({ word }) => {
            ports.bringToMiddle(word)
          },
          WaitForLeaveCheck: ({ afterMs }) => {
            clearTimeout(held.wait)
            held.wait = setTimeout(() => {
              tell(ElapsedLeaveWait())
            }, afterMs)
          },
          PressLeave: () => {
            ports.pressLeave()
          },
        }),
      )
    })
  }
  return {
    tell,
    stop: () => {
      held.isStopped = true
      clearTimeout(held.wait)
    },
  }
}
