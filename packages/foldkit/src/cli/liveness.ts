/**
 * When a Background Processor may stop: the rule, with no Effect, no
 * socket, and no clock of its own. The Processor tells it what it heard,
 * at a time it read, and asks whether the wait is over.
 *
 * A Processor stays up while its Program has work going on, such as a
 * title in the player, while a view is attached, such as `counter watch`,
 * and for a grace after the last of those and the last command, so the
 * next command finds the Program warm. With none of them for the whole
 * grace it stops, and the next command starts it again.
 */
import { Array } from 'effect'

/** How long a Processor waits with nothing to do before it stops: ten minutes. */
export const DEFAULT_IDLE_GRACE_MS = 600_000

/** How often a Processor asks whether its wait is over. */
export const IDLE_CHECK_EVERY_MS = 15_000

/** Since when a Processor has had nothing to do. */
export type Quiet = Readonly<{ sinceMs: number }>

/**
 * What a Processor heard at one moment: the work its Program says is
 * going on, as the words `keepsAlive` gave, such as
 * `['The Lantern Keeper is in the player']`; how many views are attached;
 * and when the last command was answered.
 */
export type Heard = Readonly<{
  nowMs: number
  reasons: ReadonlyArray<string>
  followers: number
  askedAtMs: number
}>

/** A Processor that has just started has had nothing to do since then. */
export const quietSince = (nowMs: number): Quiet => ({ sinceMs: nowMs })

/** Why a Processor is staying up right now, in words; empty when nothing holds it. */
export const holdsOf = (heard: Heard): ReadonlyArray<string> => [
  ...heard.reasons,
  ...(heard.followers > 0
    ? [
        heard.followers === 1
          ? 'a view is attached'
          : `${heard.followers.toString()} views are attached`,
      ]
    : []),
]

/**
 * The quiet after one more hearing: it starts over while anything holds
 * the Processor, and from the last command when that came later.
 *
 * @example
 * ```typescript
 * quietAfter({ sinceMs: 0 }, { nowMs: 60_000, reasons: [], followers: 1, askedAtMs: 0 })
 * // { sinceMs: 60_000 }: a view is attached, so the wait starts over
 * quietAfter({ sinceMs: 0 }, { nowMs: 60_000, reasons: [], followers: 0, askedAtMs: 45_000 })
 * // { sinceMs: 45_000 }: quiet since the last command
 * ```
 */
export const quietAfter = (quiet: Quiet, heard: Heard): Quiet => {
  if (Array.isReadonlyArrayNonEmpty(holdsOf(heard))) {
    return { sinceMs: heard.nowMs }
  } else if (heard.askedAtMs > quiet.sinceMs) {
    return { sinceMs: heard.askedAtMs }
  } else {
    return quiet
  }
}

/**
 * True once a Processor has had nothing to do for the whole grace.
 *
 * @example
 * ```typescript
 * isGraceOver({ sinceMs: 0 }, 600_000, DEFAULT_IDLE_GRACE_MS) // true
 * isGraceOver({ sinceMs: 0 }, 599_999, DEFAULT_IDLE_GRACE_MS) // false
 * ```
 */
export const isGraceOver = (
  quiet: Quiet,
  nowMs: number,
  graceMs: number,
): boolean => nowMs - quiet.sinceMs >= graceMs

/**
 * True while a Processor's Program has work going on, by the words its
 * `keepsAlive` gave. Such a Processor does not make way for another
 * build of its host: ending it would end the work, such as a broadcast
 * on air. A view attached and a recent command hold it up, and are not
 * work.
 *
 * @example
 * ```typescript
 * isWorking(['a broadcast is on air']) // true
 * isWorking([]) // false
 * ```
 */
export const isWorking = (reasons: ReadonlyArray<string>): boolean =>
  Array.isReadonlyArrayNonEmpty(reasons)

/**
 * What a command from another build is told when the Processor stayed:
 * which work keeps it, that it answered the command, when it will be
 * replaced, and how to end it now.
 *
 * @example
 * ```typescript
 * keptWorkingSentence('publisher', ['a broadcast is on air'])
 * // 'The publisher Background Processor is another build and was not replaced, because it is working: a broadcast is on air. …'
 * ```
 */
export const keptWorkingSentence = (
  name: string,
  reasons: ReadonlyArray<string>,
): string =>
  `The ${name} Background Processor is another build and was not replaced, because it is working: ${reasons.join('; ')}. It answered this command. The first command after that work ends replaces it. \`${name} stop\` ends it now.`
