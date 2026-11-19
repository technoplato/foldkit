/**
 * The words page on made-up recordings: the same Program, view and browser
 * resources as the live site, with a store that holds recordings that are
 * not anyone's and a sound file of silence. For pictures and measurements
 * that must not show or play a person's words.
 *
 *   pnpm --filter words-foldkit-example run dev:made-up
 *   http://127.0.0.1:5236/?sections=600   a long recording
 */
import { Effect, Layer, Option, Stream } from 'effect'
import { Theme } from 'foldkit'
import {
  Capture,
  ScribeAccountReady,
  Share,
  SignedIn,
  WordsOrigin,
  WordsOriginError,
  type WordsOriginService,
  WordsStoreError,
  makeStaticWordsResources,
} from 'words-core-example'

import {
  browserAppearanceStore,
  browserCaptureEnvironment,
  browserClipboard,
  browserKeyboardInput,
  browserLinkSharer,
  browserNetworkStatus,
  browserTranscriptScroller,
} from '../src/browser.js'
import { startWords } from '../src/start.js'
import { madeUpAudioFileID, madeUpRecordingOf } from './recordings.js'
import { silentAudioUrl } from './silence.js'
import './styles.css'

const email = 'listener@example.com'

const sectionCount = Math.max(
  1,
  Number(new URLSearchParams(window.location.search).get('sections') ?? '40') ||
    40,
)

const recordings = [
  madeUpRecordingOf(
    'a0000000-0000-4000-8000-000000000001',
    'The Lantern Keeper',
    sectionCount,
  ),
  madeUpRecordingOf('a0000000-0000-4000-8000-000000000002', 'Small Hours', 12),
]

const longestSeconds = Math.max(
  ...recordings.map(recording => recording.summary.durationSeconds),
)

const audioUrl = silentAudioUrl(longestSeconds)

const origin: WordsOriginService = {
  checkAccess: Effect.succeed(
    ScribeAccountReady({
      access: {
        email,
        source: 'CloudflareAccess',
        maybeExpiresAtMs: Option.none(),
      },
      features: { sharing: 'Enabled' },
    }),
  ),
  mintSession: Effect.succeed({ email, token: 'made-up' }),
  mintTranscriptionToken: Effect.fail(
    new WordsOriginError({
      operation: 'MintTranscriptionToken',
      reason: 'The made-up page does not record.',
    }),
  ),
  readLiveBeat: () => Effect.succeed(Option.none()),
}

startWords({
  resources: Layer.mergeAll(
    makeStaticWordsResources(
      SignedIn({
        userID: 'c0ffee00-1234-4abc-8def-0123456789ab',
        maybeEmail: Option.some(email),
        isGuest: false,
      }),
      {
        recordings: recordings.map(recording => recording.summary),
        skipped: { count: 0, maybeFirstReason: Option.none() },
      },
      Object.fromEntries(
        recordings.map(recording => [
          recording.summary.id,
          {
            detail: {
              maybeDetail: Option.some(recording),
              skipped: { count: 0, maybeFirstReason: Option.none() },
            },
            fileUrls: { [madeUpAudioFileID]: audioUrl },
          },
        ]),
      ),
    ),
    Capture.makeAcceptingRecordingWriter(),
    Share.makeAcceptingShareWriter(),
    Layer.succeed(WordsOrigin, origin),
    browserClipboard,
    browserLinkSharer,
    browserCaptureEnvironment,
    browserTranscriptScroller,
    browserKeyboardInput,
    browserNetworkStatus,
    browserAppearanceStore,
    Theme.browserSystemAppearance,
  ),
  origin,
  copyReader: {
    observeCopy: () => Stream.succeed(Option.none()),
    readSegments: () => Effect.succeed([]),
    readFileUrls: () =>
      Effect.fail(
        new WordsStoreError({
          operation: 'FetchSharedRange',
          cause: 'The made-up page has no compressed copy.',
        }),
      ),
  },
})
