import {
  type BoundBooks,
  bindBooks,
  startMadeUpBooks,
  titlesOf,
} from 'books-core-example/browser'
import { Array, Layer, Option } from 'effect'
import { Processor } from 'foldkit'
import { Platform } from 'react-native'
import { Pause, Play, type Track } from 'transcript-player-core-example/browser'
import {
  type TrackLabel,
  expoAudioOutput,
} from 'transcript-player-expo-example'

import { nativeSystemAppearance } from '@foldkit/react-native/theme'

const boundBooksKey = Symbol.for('foldkit.books.expo.boundBooks')

type ExpoGlobals = typeof globalThis & {
  [boundBooksKey]?: Promise<BoundBooks>
}

const expoGlobals = (): ExpoGlobals => globalThis

const expoHost = (): Processor.Host.Host =>
  Platform.OS === 'ios'
    ? Processor.Host.ExpoIos()
    : Processor.Host.ExpoAndroid()

// NOTE: the made-up titles name audio at an address nothing answers. The
// app carries a made-up voice for them, made from the made-up words' own
// times by `scripts/make-made-up-voice.mjs`.
const madeUpAudioOrigin = 'https://audio.invalid/'

const madeUpVoice = (): number => require('../assets/made-up/voice.m4a')

/**
 * What the phone's audio needs of the running Books, which starts after
 * the audio is made: the Model, to name a track, and a press, to tell the
 * Program what the lock screen did.
 */
type Running = { maybeBooks: BoundBooks | undefined }

const labelOf =
  (running: Running) =>
  (track: Track): TrackLabel => {
    const model = running.maybeBooks?.readModel()
    const maybeTitle =
      model === undefined || model._tag !== 'Ready'
        ? Option.none()
        : Array.findFirst(
            titlesOf(model),
            title => title.mediaId === track.mediaId,
          )
    return Option.match(maybeTitle, {
      onNone: () => ({ title: track.mediaId }),
      onSome: title => ({
        title: title.name,
        artist: Array.join(title.authors, ', '),
      }),
    })
  }

const phoneAudio = (running: Running) =>
  expoAudioOutput({
    sourceOf: url =>
      url.startsWith(madeUpAudioOrigin) ? madeUpVoice() : { uri: url },
    labelOf: labelOf(running),
    onDevicePause: () => {
      running.maybeBooks?.press(Pause()._tag)
    },
    onDevicePlay: () => {
      running.maybeBooks?.press(Play()._tag)
    },
  })

/**
 * Starts Books once per JavaScript runtime, on the made-up library every
 * Client can open: three titles nobody wrote, with made-up words and a
 * made-up voice. Nobody is signed in and no real library is read. The
 * Program hears the phone's own appearance, plays through the phone's
 * audio, in the background and on the lock screen, and hears what the
 * lock screen does as its own Play and Pause. Fast Refresh runs this
 * module again, so the running Books lives on `globalThis` and is reused.
 *
 * @example
 * ```typescript
 * const books = await startExpoBooks()
 * ```
 */
export const startExpoBooks = (): Promise<BoundBooks> => {
  const globals = expoGlobals()
  const existing = globals[boundBooksKey]
  if (existing !== undefined) {
    return existing
  }
  const running: Running = { maybeBooks: undefined }
  const started = startMadeUpBooks({
    host: expoHost(),
    resources: Layer.mergeAll(nativeSystemAppearance, phoneAudio(running)),
  }).then(handle => {
    const books = bindBooks(handle)
    running.maybeBooks = books
    return books
  })
  globals[boundBooksKey] = started
  return started
}
