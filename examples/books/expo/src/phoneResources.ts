import {
  type BoundBooks,
  booksOrigin,
  titlesOf,
} from 'books-core-example/browser'
import { Array, Layer, Option } from 'effect'
import { Pause, Play, type Track } from 'transcript-player-core-example/browser'
import {
  type TrackLabel,
  expoAudioOutput,
} from 'transcript-player-expo-example'

import { nativeSystemAppearance } from '@foldkit/react-native/theme'

import { isSilentOf } from './connection'
import { nativeLinkSharing } from './nativeLinkSharing'

// NOTE: the made-up titles name audio at an address nothing answers. The
// app carries a made-up voice for them, made from the made-up words' own
// times by `scripts/make-made-up-voice.mjs`.
const madeUpAudioOrigin = 'https://audio.invalid/'

const madeUpVoice = (): number => require('../assets/made-up/voice.m4a')

/**
 * What the phone's own services need of the running Books, which starts
 * after they are made: the Model, to name a track, and a press, to tell
 * the Program what the lock screen did.
 */
export type Running = { maybeBooks: BoundBooks | undefined }

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

/**
 * Whether this app makes no sound, from what it was built or served
 * with: silent on the made-up library unless its sound is asked for by
 * name, and silent anywhere the test switch is on.
 */
export const isBooksSilent = (): boolean =>
  isSilentOf({
    EXPO_PUBLIC_BOOKS_INSTANT_APP_ID:
      process.env.EXPO_PUBLIC_BOOKS_INSTANT_APP_ID,
    EXPO_PUBLIC_BOOKS_MADE_UP: process.env.EXPO_PUBLIC_BOOKS_MADE_UP,
    EXPO_PUBLIC_BOOKS_MADE_UP_SOUND:
      process.env.EXPO_PUBLIC_BOOKS_MADE_UP_SOUND,
    EXPO_PUBLIC_FOLDKIT_SILENT: process.env.EXPO_PUBLIC_FOLDKIT_SILENT,
  })

/**
 * The services that are the phone's own, whichever library Books opens:
 * its report of the system's appearance, its audio, in the background and
 * on the lock screen, with what the lock screen does told to the Program
 * as its own Play and Pause, and its share sheet and clipboard.
 *
 * @example
 * ```typescript
 * startMadeUpBooks({ host, resources: phoneResources(running) })
 * ```
 */
export const phoneResources = (running: Running) =>
  Layer.mergeAll(
    nativeSystemAppearance,
    nativeLinkSharing(booksOrigin),
    expoAudioOutput({
      isSilent: isBooksSilent(),
      sourceOf: url =>
        url.startsWith(madeUpAudioOrigin) ? madeUpVoice() : { uri: url },
      labelOf: labelOf(running),
      onDevicePause: () => {
        running.maybeBooks?.press(Pause()._tag)
      },
      onDevicePlay: () => {
        running.maybeBooks?.press(Play()._tag)
      },
    }),
  )
