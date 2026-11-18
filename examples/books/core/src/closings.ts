import { Array, Option, pipe } from 'effect'

import { Milliseconds } from './ids.js'
import { type Model, type Title, progressOf, titlesOf } from './model.js'
import {
  type PlayClosing,
  type UnendedPlay,
  mediaKeyOf,
} from './scribeTimeline.js'
import { minimumStretchMs } from './stretch.js'

// CLOSINGS

/**
 * A save of the title this recent may come from a page still playing it,
 * on this device or another, so its plays are left open until it is older.
 */
export const recentSaveMs = 60_000

const titleOfMediaKey = (
  model: Model,
  mediaKey: string,
): Option.Option<Title> =>
  Array.findFirst(titlesOf(model), title => mediaKeyOf(title) === mediaKey)

const isPlayingHere = (model: Model, title: Title, play: UnendedPlay) =>
  model.listening._tag === 'Loaded' &&
  model.listening.slug === title.slug &&
  model.listening.stretch._tag !== 'Quiet' &&
  play.startedAtMs >= model.listening.stretch.stretch.startedAtMs

const firstSecondsOf = (
  play: UnendedPlay,
): Readonly<{ mediaEndMs: Milliseconds; endedAtMs: number }> => ({
  mediaEndMs: Milliseconds.make(
    Math.round(
      play.mediaStartSeconds * 1000 + minimumStretchMs * play.playbackRate,
    ),
  ),
  endedAtMs: play.startedAtMs + minimumStretchMs,
})

const isBeforeNextPlay = (play: UnendedPlay, savedAtMs: number) =>
  Option.match(play.maybeNextPlayStartedAtMs, {
    onNone: () => true,
    onSome: nextStartedAtMs => savedAtMs < nextStartedAtMs,
  })

/**
 * Where an unended play ended, as well as Books can know: the title's last
 * save, when it came after the play began and before any later play of the
 * title; else the first 3 s, which the play's start proves it played.
 */
const endOf = (
  model: Model,
  title: Title,
  play: UnendedPlay,
): Readonly<{ mediaEndMs: Milliseconds; endedAtMs: number }> =>
  pipe(
    progressOf(model, title.slug),
    Option.filter(
      progress =>
        progress.savedAtMs > play.startedAtMs &&
        isBeforeNextPlay(play, progress.savedAtMs),
    ),
    Option.match({
      onNone: () => firstSecondsOf(play),
      onSome: progress => ({
        mediaEndMs: Milliseconds.make(
          Math.max(
            Math.round(play.mediaStartSeconds * 1000),
            progress._tag === 'InProgress'
              ? progress.placeMs
              : title.durationMs,
          ),
        ),
        endedAtMs: progress.savedAtMs,
      }),
    }),
  )

/**
 * How Books ends each play a closed page left open: at the title's last
 * save, as the page closing. It leaves the play this page is still playing,
 * and every play of a title saved in the last minute, which may still be
 * playing elsewhere; the next check ends them once they are quiet.
 *
 * @example
 * ```typescript
 * closingsOf(model, plays, Date.now())
 * // [{ play, mediaEndMs: 180000, endedAtMs: <its last save>, reason: 'PageClosed' }]
 * ```
 */
export const closingsOf = (
  model: Model,
  plays: ReadonlyArray<UnendedPlay>,
  checkedAtMs: number,
): ReadonlyArray<PlayClosing> =>
  Array.getSomes(
    Array.map(plays, play =>
      Option.flatMap(
        titleOfMediaKey(model, play.mediaKey),
        (title): Option.Option<PlayClosing> => {
          const isRecentlySaved = Option.exists(
            progressOf(model, title.slug),
            progress => checkedAtMs - progress.savedAtMs < recentSaveMs,
          )
          if (isPlayingHere(model, title, play) || isRecentlySaved) {
            return Option.none()
          } else {
            return Option.some({
              play,
              ...endOf(model, title, play),
              reason: 'PageClosed',
            })
          }
        },
      ),
    ),
  )
