import {
  type AudioEvent,
  AudioEvent as AudioEvents,
  Milliseconds,
} from 'transcript-player-core-example'

// STATUS

/**
 * What a phone's audio player says about itself, in the port's terms:
 * where it is, whether it is sounding, whether its audio has loaded,
 * whether it has stopped only to load more, whether it just reached the
 * end, and why it failed, if it did.
 */
export type PlayerStatus = Readonly<{
  currentTimeMs: number
  isPlaying: boolean
  isLoaded: boolean
  isWaitingForAudio: boolean
  didJustFinish: boolean
  maybeFailure: string | undefined
}>

/**
 * What the steps remember between two statuses: the second last reported,
 * and whether the audio has sounded since it was asked to.
 */
export type Heard = Readonly<{
  maybeReachedSecond: number | undefined
  hasPlayed: boolean
}>

/** Nothing heard yet: the state a track starts from. */
export const notHeardYet: Heard = {
  maybeReachedSecond: undefined,
  hasPlayed: false,
}

/**
 * What one status means: the events to report, whether the track is
 * done, and whether the device itself paused the audio, as a lock screen
 * does, which the host tells the Program.
 */
export type Step = Readonly<{
  heard: Heard
  events: ReadonlyArray<AudioEvent>
  isDone: boolean
  isPausedByDevice: boolean
}>

const millisecondsPerSecond = 1000

/**
 * Reads one status of a phone's player as the audio port's events. A new
 * second is reported once, with the wall clock; a skip made on the lock
 * screen lands on a second not yet reported, so it is reported as the new
 * place. Audio that stops sounding after it has sounded, without ending
 * or failing, was paused by the device, unless it stopped only to load
 * more: a player waiting for audio was paused by nobody, and goes on by
 * itself.
 *
 * @example
 * ```typescript
 * stepOf(notHeardYet, { currentTimeMs: 12_040, isPlaying: true, … }, Date.now())
 * // { events: [Advanced({ placeMs: 12_040, wallClockMs })], isDone: false, … }
 * ```
 */
export const stepOf = (
  heard: Heard,
  status: PlayerStatus,
  wallClockMs: number,
): Step => {
  if (status.maybeFailure !== undefined) {
    return {
      heard,
      events: [AudioEvents.Failed({ reason: status.maybeFailure })],
      isDone: true,
      isPausedByDevice: false,
    }
  } else if (status.didJustFinish) {
    return {
      heard,
      events: [AudioEvents.Ended()],
      isDone: true,
      isPausedByDevice: false,
    }
  } else if (status.isPlaying) {
    const second = Math.floor(status.currentTimeMs / millisecondsPerSecond)
    return {
      heard: { maybeReachedSecond: second, hasPlayed: true },
      events:
        second === heard.maybeReachedSecond
          ? []
          : [
              AudioEvents.Advanced({
                placeMs: Milliseconds.make(Math.round(status.currentTimeMs)),
                wallClockMs,
              }),
            ],
      isDone: false,
      isPausedByDevice: false,
    }
  } else {
    return {
      heard,
      events: [],
      isDone: false,
      isPausedByDevice:
        heard.hasPlayed && status.isLoaded && !status.isWaitingForAudio,
    }
  }
}

const resumeToleranceMs = 1500

const resumeSettleGraceMs = 500

/**
 * True when an `expo-audio` playback status flip to `playing: true` represents
 * an intentional resume from outside the app (such as lock-screen Play or
 * AirPods tap) rather than a late status event still settling from our own
 * pause.
 *
 * @example
 * ```typescript
 * isDeviceResumeOf({
 *   isSounding: false,
 *   isSettling: false,
 *   stoppedAtMs: 1_000,
 *   nowMs: 1_100,
 *   isPlaying: true,
 * }) // false: still inside the 500 ms settle grace window
 * ```
 */
export const isDeviceResumeOf = (
  state: Readonly<{
    isSounding: boolean
    isSettling: boolean
    stoppedAtMs: number | undefined
    nowMs: number
    isPlaying: boolean
  }>,
): boolean => {
  if (state.isSounding || state.isSettling || !state.isPlaying) {
    return false
  }
  if (
    state.stoppedAtMs !== undefined &&
    state.nowMs - state.stoppedAtMs < resumeSettleGraceMs
  ) {
    return false
  }
  return true
}

/**
 * True when a player already stands where it is asked to play from, as it
 * does when the lock screen resumed it: it is left to play on. Any other
 * place is a move, and the player seeks.
 *
 * @example
 * ```typescript
 * isResumeOf({ currentTimeMs: 61_200, fromMs: 61_000 }) // true
 * isResumeOf({ currentTimeMs: 61_000, fromMs: 120_000 }) // false
 * ```
 */
export const isResumeOf = (
  place: Readonly<{ currentTimeMs: number; fromMs: number }>,
): boolean => Math.abs(place.currentTimeMs - place.fromMs) <= resumeToleranceMs

// SILENCE

/**
 * Whether a phone app was built or served to make no sound at all:
 * `EXPO_PUBLIC_FOLDKIT_SILENT` is set. Every test of a phone app sets it:
 * a test reads what the player reports and the trace, never sound, and a
 * machine that tests is often one a person is working or recording at.
 *
 * @example
 * ```typescript
 * isSilentAsked({ EXPO_PUBLIC_FOLDKIT_SILENT: '1' }) // true
 * ```
 */
export const isSilentAsked = (
  env: Readonly<Record<string, string | undefined>>,
): boolean => (env['EXPO_PUBLIC_FOLDKIT_SILENT'] ?? '').trim() !== ''

/** How loud a player is: its volume, and whether it is muted as well. */
export type Loudness = Readonly<{ volume: number; muted: boolean }>

/**
 * How loud a player is to be. A silent one has no volume and is muted
 * too, so neither setting alone can let sound out.
 *
 * @example
 * ```typescript
 * loudnessOf(true) // { volume: 0, muted: true }
 * ```
 */
export const loudnessOf = (isSilent: boolean): Loudness =>
  isSilent ? { volume: 0, muted: true } : { volume: 1, muted: false }

/**
 * Whether a phone app makes no sound at all, from where it runs and what
 * it was built or served with. On a simulator it is silent with no flag:
 * a simulator sounds from the speaker of the machine it runs on, which a
 * person may be working or recording at. Its sound there has to be asked
 * for by its own name, `EXPO_PUBLIC_FOLDKIT_SOUND_ON_SIMULATOR`. The test
 * switch silences it anywhere, whatever else is asked.
 *
 * @example
 * ```typescript
 * isSilentOn({ isRealDevice: false, env: {} }) // true
 * ```
 */
export const isSilentOn = ({
  isRealDevice,
  env,
}: Readonly<{
  isRealDevice: boolean
  env: Readonly<Record<string, string | undefined>>
}>): boolean =>
  isSilentAsked(env) ||
  (!isRealDevice &&
    (env['EXPO_PUBLIC_FOLDKIT_SOUND_ON_SIMULATOR'] ?? '').trim() === '')

/**
 * Whether a player is as loud as it was told to be, from what the player
 * itself reports. A silent output asks this of every player before it
 * tells it to play.
 */
export const isAsLoudAs = (wanted: Loudness, heard: Loudness): boolean =>
  heard.volume === wanted.volume && heard.muted === wanted.muted

/** Why a silent output did not play a player that would not go silent. */
export const wouldNotGoSilent =
  'the player would not go silent, so it was not played'
