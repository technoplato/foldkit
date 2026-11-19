import { Effect, Layer, Option, Queue, Stream } from 'effect'
import {
  type AudioPlayer,
  type AudioSource,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio'
import {
  type AudioEvent,
  AudioOutput,
  type Speed,
  type Track,
  countedSound,
} from 'transcript-player-core-example'

import {
  type PlayerStatus,
  isResumeOf,
  isSilentAsked,
  loudnessOf,
  notHeardYet,
  stepOf,
} from './steps'

// OUTPUT

/**
 * What a phone shows for a track on its lock screen and in Control
 * Center: its title, and who it is by.
 */
export type TrackLabel = Readonly<{ title: string; artist?: string }>

/**
 * How a host fits the phone's audio to its Program.
 *
 * - `sourceOf` gives the audio a track's address plays, when it is not
 *   the address itself, such as a file the app carries.
 * - `labelOf` names a track for the lock screen.
 * - `onDevicePause` and `onDevicePlay` are called when the device itself
 *   pauses or resumes the audio, as its lock screen, its headphones or a
 *   phone call do. The host presses the Program's own Actions, so the
 *   Model keeps knowing whether it plays.
 * - `isSilent` makes every player silent: no volume, and muted. It still
 *   plays and reports, so a test reads the player's state and never
 *   sound. Left out, the app is silent when it was built or served with
 *   `EXPO_PUBLIC_FOLDKIT_SILENT` set, as every test of a phone app does.
 */
export type ExpoAudioOptions = Readonly<{
  sourceOf?: (url: string) => AudioSource | number
  labelOf?: (track: Track) => TrackLabel
  onDevicePause?: () => void
  onDevicePlay?: () => void
  isSilent?: boolean
}>

const statusEveryMs = 250

const millisecondsPerSecond = 1000

const waitingToPlay = 'waitingToPlayAtSpecifiedRate'

type Held = {
  url: string
  player: AudioPlayer
  isSounding: boolean
  isSettling: boolean
}

const statusOf = (status: AudioStatus): PlayerStatus => ({
  currentTimeMs: status.currentTime * millisecondsPerSecond,
  isPlaying: status.playing,
  isLoaded: status.isLoaded,
  // NOTE: a player that streams stops sounding while it loads more. It
  // says so two ways: it is buffering, or it is waiting to play at its
  // rate. Either is the player's own doing, not a pause.
  isWaitingForAudio:
    status.isBuffering || status.timeControlStatus === waitingToPlay,
  didJustFinish: status.didJustFinish,
  maybeFailure: undefined,
})

/**
 * A phone's audio output through `expo-audio`: one player for the track
 * being played, from the track's place at its speed, reporting each new
 * second it reaches. It plays on when the app is in the background or the
 * phone is locked, shows on the lock screen with its skips, and stays
 * there while paused. The player is kept between a pause and the next
 * play, so the lock screen can resume it; the host then hears
 * `onDevicePlay`. A track with no audio counts silently, so the player
 * still moves.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(
 *   resources,
 *   expoAudioOutput({ onDevicePause: () => bound.press('Pause') }),
 * )
 * ```
 */
export const expoAudioOutput = (
  options: ExpoAudioOptions = {},
): Layer.Layer<AudioOutput> => {
  let maybeHeld: Held | undefined = undefined
  let isSessionSet = false
  const isSilent =
    options.isSilent ??
    isSilentAsked({
      EXPO_PUBLIC_FOLDKIT_SILENT: process.env.EXPO_PUBLIC_FOLDKIT_SILENT,
    })
  const loudness = loudnessOf(isSilent)

  // NOTE: set on every player when it is made and again each time it is
  // told to play, so nothing between the two can leave a silent app
  // sounding.
  const setLoudness = (player: AudioPlayer): void => {
    player.volume = loudness.volume
    player.muted = loudness.muted
  }

  const setSession = (): void => {
    if (isSessionSet) {
      return
    }
    isSessionSet = true
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    })
  }

  const playerFor = (url: string): Held => {
    if (maybeHeld !== undefined && maybeHeld.url === url) {
      return maybeHeld
    }
    if (maybeHeld !== undefined) {
      maybeHeld.player.clearLockScreenControls()
      maybeHeld.player.remove()
    }
    const player = createAudioPlayer(
      options.sourceOf === undefined ? url : options.sourceOf(url),
      { updateInterval: statusEveryMs },
    )
    setLoudness(player)
    const held: Held = { url, player, isSounding: false, isSettling: false }
    player.addListener('playbackStatusUpdate', status => {
      // NOTE: a pause this output asked for takes a moment to show in the
      // player's status. Until it does, sounding is not a device's resume.
      if (!status.playing) {
        held.isSettling = false
      }
      const isResumedByDevice =
        !held.isSounding && !held.isSettling && status.playing
      if (isResumedByDevice && options.onDevicePlay !== undefined) {
        options.onDevicePlay()
      }
    })
    maybeHeld = held
    return held
  }

  const sound = (
    url: string,
    track: Track,
    readSpeed: () => Speed,
  ): Stream.Stream<AudioEvent> =>
    Stream.callback<AudioEvent>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          setSession()
          const held = playerFor(url)
          const player = held.player
          held.isSounding = true
          const isResume = isResumeOf({
            currentTimeMs: player.currentTime * millisecondsPerSecond,
            fromMs: track.fromMs,
          })
          if (!isResume) {
            void player.seekTo(track.fromMs / millisecondsPerSecond)
          }
          player.setPlaybackRate(readSpeed())
          setLoudness(player)
          player.play()
          player.setActiveForLockScreen(
            true,
            options.labelOf === undefined ? {} : options.labelOf(track),
            { showSeekBackward: true, showSeekForward: true },
          )
          const state = { heard: notHeardYet, isOver: false }
          const subscription = player.addListener(
            'playbackStatusUpdate',
            status => {
              if (state.isOver) {
                return
              }
              player.setPlaybackRate(readSpeed())
              const step = stepOf(state.heard, statusOf(status), Date.now())
              state.heard = step.heard
              step.events.forEach(event => {
                Queue.offerUnsafe(queue, event)
              })
              if (step.isDone) {
                state.isOver = true
                Queue.endUnsafe(queue)
              } else if (step.isPausedByDevice) {
                state.isOver = true
                held.isSounding = false
                if (options.onDevicePause !== undefined) {
                  options.onDevicePause()
                }
              }
            },
          )
          return { held, state, subscription }
        }),
        ({ held, state, subscription }) =>
          Effect.sync(() => {
            state.isOver = true
            held.isSounding = false
            held.isSettling = held.player.playing
            subscription.remove()
            held.player.pause()
          }),
      ),
    )

  return Layer.succeed(AudioOutput, {
    sound: (track, readSpeed) =>
      Option.match(track.maybeAudioUrl, {
        onNone: () => countedSound(track, readSpeed),
        onSome: url => sound(url, track, readSpeed),
      }),
  })
}
