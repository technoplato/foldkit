import { Array, Effect, Layer, Option, pipe } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import * as Account from './account/index.js'
import {
  type ScribeRoute,
  scribeRouteFromLink,
  urlToScribeRoute,
} from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedUrl,
  ClickedPlay,
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  GotAccountMessage,
  GotShareMessage,
  type Message,
  ObservedFileUrls,
  ObservedIdentity,
  ObservedRecording,
} from './message.js'
import { type Model, SignedIn, SignedOut } from './model.js'
import {
  type AccessCheck,
  type AccessIdentity,
  ScribeAccountMissing,
  ScribeAccountReady,
  WordsOrigin,
  WordsOriginError,
} from './origin.js'
import { type RecordingDetail, type Section, StoredAudio } from './recording.js'
import * as Share from './share/index.js'
import { makeStaticWordsResources } from './store.js'
import {
  displayedPlaybackOf,
  displayedSharedRangeOf,
  isSignInSettledOf,
  modelForRoute,
  startupCommands,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const shareID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'
const userID = 'c0ffee00-1234-4abc-8def-0123456789ab'
const email = 'listener@example.com'
const audioURL = 'https://files.example.com/audio.wav'

const access: AccessIdentity = {
  email,
  source: 'CloudflareAccess',
  maybeExpiresAtMs: Option.none(),
}

const section = (
  id: string,
  index: number,
  startSeconds: number,
  text: string,
): Section => ({
  id,
  index,
  startSeconds,
  endSeconds: startSeconds + 3.1,
  maybeSpeakerID: Option.none(),
  text,
  words: [
    {
      id: `${id}:0`,
      text,
      startSeconds: startSeconds + 0.15,
      endSeconds: startSeconds + 2.9,
    },
  ],
  isFinal: true,
})

const firstSection = section(
  '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
  0,
  5.2,
  'Good morning',
)
const linkedSection = section(
  '1b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
  1,
  20.4,
  'The soil arrives on Tuesday',
)
const lastSection = section(
  '2b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
  2,
  41.7,
  'That is the budget',
)

const detail: RecordingDetail = {
  summary: {
    id: recordingID,
    title: 'Recording 018',
    startedAtMs: 0,
    durationSeconds: 60,
    maybeUpdatedAtMs: Option.none(),
    maybeOwnerUserID: Option.none(),
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
  },
  sections: [firstSection, linkedSection, lastSection],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const snapshot = (maybeDetail: Option.Option<RecordingDetail>): Message =>
  ObservedRecording({
    recordingID,
    maybeDetail,
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

const noSessionYet = ObservedIdentity({ identity: SignedOut() })
const signedIn = ObservedIdentity({
  identity: SignedIn({
    userID,
    maybeEmail: Option.some(email),
    isGuest: false,
  }),
})
const originFor = (check: AccessCheck) =>
  Layer.succeed(WordsOrigin, {
    checkAccess: Effect.succeed(check),
    mintSession: Effect.succeed({ email, token: 'minted-refresh-token' }),
    mintTranscriptionToken: Effect.fail(
      new WordsOriginError({
        operation: 'MintTranscriptionToken',
        reason: 'Not used when opening links.',
      }),
    ),
  })

const browserWithoutSession = makeStaticWordsResources(
  SignedOut(),
  { recordings: [], skipped: { count: 0, maybeFirstReason: Option.none() } },
  {},
)

const withAccount = Layer.merge(
  originFor(ScribeAccountReady({ access, features: { sharing: 'Enabled' } })),
  browserWithoutSession,
)

const withoutAccount = Layer.merge(
  originFor(ScribeAccountMissing({ access, features: { sharing: 'Enabled' } })),
  browserWithoutSession,
)

const accessFoundTheAccount = GotAccountMessage({
  message: await Effect.runPromise(
    Effect.provide(Account.CheckAccess().effect, withAccount),
  ),
})
const accessFoundNoAccount = GotAccountMessage({
  message: await Effect.runPromise(
    Effect.provide(Account.CheckAccess().effect, withoutAccount),
  ),
})
const connected = GotAccountMessage({
  message: await Effect.runPromise(
    Effect.provide(Account.ConnectAccount({ email }).effect, withAccount),
  ),
})
const answeredMissingBeforeSignIn = ConfirmedMissingRecording({
  recordingID,
  maybeUserID: Option.none(),
})

/**
 * A new tab with no Instant session, in the order round 3 measured on the
 * site: Instant says nobody is signed in, the unauthenticated read comes back
 * empty and the server confirms it, Cloudflare Access finds the account, the
 * browser signs in, and the recording arrives with its audio.
 */
const newTabWithoutSession: ReadonlyArray<Message> = [
  noSessionYet,
  snapshot(Option.none()),
  answeredMissingBeforeSignIn,
  accessFoundTheAccount,
  signedIn,
  connected,
  snapshot(Option.some(detail)),
  ObservedFileUrls({ fileUrls: { 'audio-file': audioURL } }),
  AcquiredAudioPlayer(),
]

type Step = Readonly<{
  message: string
  shown: string
  commands: ReadonlyArray<Readonly<{ name: string; args: unknown }>>
}>

const urlOf = (link: string) => Option.getOrThrow(fromString(link))

const routeOfPageLoad = (link: string): ScribeRoute =>
  urlToScribeRoute(urlOf(link))

const load = (link: string, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    {
      model: modelForRoute(routeOfPageLoad(link)),
      steps: Array.empty<Step>(),
    },
    (state, message) => {
      const [next, commands] = update(state.model, message)
      return {
        model: next,
        steps: [
          ...state.steps,
          {
            message: message._tag,
            shown: displayedPlaybackOf(next)._tag,
            commands: commands.map(command => ({
              name: command.name,
              args: command.args,
            })),
          },
        ],
      }
    },
  )

const readyOf = (model: Model) => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const commandsNamed = (
  steps: ReadonlyArray<Step>,
  name: string,
): ReadonlyArray<unknown> =>
  pipe(
    steps,
    Array.flatMap(step => step.commands),
    Array.filter(command => command.name === name),
    Array.map(command => command.args),
  )

type RecordingLinkCase = Readonly<{
  form: string
  path: string
  startSeconds: number
  maybeFocusSectionID: Option.Option<string>
}>

const recordingLinks: ReadonlyArray<RecordingLinkCase> = [
  {
    form: 'a section link with t',
    path: `/recording/${recordingID}/section/${linkedSection.id}?t=19`,
    startSeconds: 19,
    maybeFocusSectionID: Option.some(linkedSection.id),
  },
  {
    form: 'a section link without t, one second before the section',
    path: `/recording/${recordingID}/section/${linkedSection.id}`,
    startSeconds: 19,
    maybeFocusSectionID: Option.some(linkedSection.id),
  },
  {
    form: 'a section link with a fractional t',
    path: `/recording/${recordingID}/section/${linkedSection.id}?t=12.25`,
    startSeconds: 12.25,
    maybeFocusSectionID: Option.some(linkedSection.id),
  },
  {
    form: 'a moment link',
    path: `/playback/${recordingID}?t=41`,
    startSeconds: 41,
    maybeFocusSectionID: Option.none(),
  },
  {
    form: 'a moment link with the route focus',
    path: `/playback/${recordingID}?t=41&focus=route`,
    startSeconds: 41,
    maybeFocusSectionID: Option.none(),
  },
  {
    form: 'a playback link without t',
    path: `/playback/${recordingID}`,
    startSeconds: 0,
    maybeFocusSectionID: Option.none(),
  },
  {
    form: 'a recording link',
    path: `/recording/${recordingID}`,
    startSeconds: 0,
    maybeFocusSectionID: Option.none(),
  },
  {
    form: 'a thread link',
    path: `/recording/${recordingID}/thread/thread-1`,
    startSeconds: 0,
    maybeFocusSectionID: Option.none(),
  },
  {
    form: 'a thread response link',
    path: `/recording/${recordingID}/thread/thread-1/response/r2`,
    startSeconds: 0,
    maybeFocusSectionID: Option.none(),
  },
]

describe('opening each recording link in a new tab', () => {
  it('signs in the way a new tab does: Access finds the account, then the origin mints a session', () => {
    expect(accessFoundTheAccount.message._tag).toBe('FoundScribeAccount')
    expect(accessFoundNoAccount.message._tag).toBe('FoundNoScribeAccount')
    expect(connected.message._tag).toBe('SucceededConnectAccount')
  })

  for (const link of recordingLinks) {
    it(`lands and plays where ${link.form} points (${link.path})`, () => {
      const https = `https://words.knophy.com${link.path}`
      const { model, steps } = load(https, newTabWithoutSession)
      const ready = readyOf(model)

      expect(scribeRouteFromLink(`scribe-shared:/${link.path}`)).toEqual(
        Option.some(routeOfPageLoad(https)),
      )
      expect(steps.map(step => step.shown)).not.toContain('MissingRecording')
      expect(commandsNamed(steps, 'ConfirmRecording')).toEqual([
        { recordingID, maybeUserID: Option.none() },
      ])
      expect(commandsNamed(steps, 'ConnectAccount')).toEqual([{ email }])
      expect(ready.positionSeconds).toBe(link.startSeconds)
      expect(ready.maybeFocusedSectionID).toEqual(link.maybeFocusSectionID)
      expect(commandsNamed(steps, 'SeekAudio')).toEqual(
        link.startSeconds > 0 ? [{ seconds: link.startSeconds }] : [],
      )

      const [playing, playCommands] = update(model, ClickedPlay())
      const afterPlay = readyOf(playing)
      expect(playCommands.map(command => command.name)).toContain('PlayAudio')
      expect(afterPlay.transport).toBe('Playing')
      expect(afterPlay.positionSeconds).toBe(link.startSeconds)
    })
  }

  it('scrolls a linked section into view and highlights it', () => {
    const { model, steps } = load(
      `https://words.knophy.com/recording/${recordingID}/section/${linkedSection.id}?t=19`,
      newTabWithoutSession,
    )
    expect(commandsNamed(steps, 'ScrollToSection')).toEqual([
      { sectionID: linkedSection.id, placement: 'Center' },
    ])
    expect(commandsNamed(steps, 'ClearFocusHighlightLater')).toEqual([
      { revision: readyOf(model).focusRevision },
    ])
  })

  it('ignores an answer from before sign-in that arrives after it', () => {
    const { model, steps } = load(
      `https://words.knophy.com/playback/${recordingID}?t=41`,
      [
        noSessionYet,
        snapshot(Option.none()),
        accessFoundTheAccount,
        signedIn,
        answeredMissingBeforeSignIn,
        connected,
        snapshot(Option.some(detail)),
      ],
    )
    expect(steps.map(step => step.shown)).not.toContain('MissingRecording')
    expect(readyOf(model).positionSeconds).toBe(41)
  })

  it('lands on the moment when the browser kept its session from an earlier visit', () => {
    const { model, steps } = load(
      `https://words.knophy.com/recording/${recordingID}/section/${linkedSection.id}`,
      [
        signedIn,
        snapshot(Option.none()),
        ConfirmedRecordingExists({
          recordingID,
          maybeUserID: Option.some(userID),
        }),
        accessFoundTheAccount,
        connected,
        snapshot(Option.some(detail)),
      ],
    )
    expect(commandsNamed(steps, 'ConfirmRecording')).toEqual([
      { recordingID, maybeUserID: Option.some(userID) },
    ])
    expect(steps.map(step => step.shown)).not.toContain('MissingRecording')
    expect(readyOf(model).positionSeconds).toBe(19)
    expect(readyOf(model).maybeFocusedSectionID).toEqual(
      Option.some(linkedSection.id),
    )
  })

  it('says a recording is not available only once sign-in has settled', () => {
    const { model, steps } = load(
      `https://words.knophy.com/playback/${recordingID}?t=41`,
      [
        noSessionYet,
        snapshot(Option.none()),
        answeredMissingBeforeSignIn,
        accessFoundTheAccount,
        signedIn,
        connected,
        snapshot(Option.none()),
        ConfirmedMissingRecording({
          recordingID,
          maybeUserID: Option.some(userID),
        }),
      ],
    )
    expect(steps.map(step => step.shown)).toEqual([
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'MissingRecording',
    ])
    expect(isSignInSettledOf(model)).toBe(true)
  })

  it('opens where the link points when the recording arrives after it was not found', () => {
    const { model, steps } = load(
      `https://words.knophy.com/recording/${recordingID}/section/${linkedSection.id}?t=19`,
      [
        signedIn,
        accessFoundTheAccount,
        connected,
        snapshot(Option.none()),
        ConfirmedMissingRecording({
          recordingID,
          maybeUserID: Option.some(userID),
        }),
        snapshot(Option.some(detail)),
      ],
    )
    expect(steps.map(step => step.shown)).toEqual([
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'OpeningPlayback',
      'MissingRecording',
      'ReadyPlayback',
    ])
    expect(readyOf(model).positionSeconds).toBe(19)
    expect(readyOf(model).maybeFocusedSectionID).toEqual(
      Option.some(linkedSection.id),
    )
  })

  it('says it is not available at once when Scribe has no account for the email', () => {
    const { model } = load(
      `https://words.knophy.com/recording/${recordingID}`,
      [noSessionYet, snapshot(Option.none()), answeredMissingBeforeSignIn],
    )
    expect(displayedPlaybackOf(model)._tag).toBe('OpeningPlayback')
    const [awaiting] = update(model, accessFoundNoAccount)
    expect(displayedPlaybackOf(awaiting)._tag).toBe('MissingRecording')
  })

  it('takes a newer link to the same recording while it still looks missing', () => {
    const { model } = load(
      `https://words.knophy.com/recording/${recordingID}`,
      [noSessionYet, snapshot(Option.none()), answeredMissingBeforeSignIn],
    )
    const [relinked] = update(
      model,
      ChangedUrl({
        url: urlOf(`https://words.knophy.com/playback/${recordingID}?t=41`),
      }),
    )
    const afterSignIn = Array.reduce(
      [
        accessFoundTheAccount,
        signedIn,
        connected,
        snapshot(Option.some(detail)),
      ],
      relinked,
      (current, message) => update(current, message)[0],
    )

    expect(relinked.playback._tag).toBe('MissingRecording')
    expect(readyOf(afterSignIn).positionSeconds).toBe(41)
  })
})

describe('opening the other links in a new tab', () => {
  const pages: ReadonlyArray<readonly [string, ScribeRoute['_tag']]> = [
    ['/', 'RecordingList'],
    ['/recordings/map', 'RecordingsMap'],
    ['/recordings/search', 'SearchRecordings'],
    ['/recording/new', 'NewRecording'],
    ['/account', 'Account'],
  ]

  for (const [path, tag] of pages) {
    it(`opens ${path} with no recording open and checks the account first`, () => {
      const model = modelForRoute(
        routeOfPageLoad(`https://words.knophy.com${path}`),
      )
      expect(model.route._tag).toBe(tag)
      expect(model.playback._tag).toBe('NoPlayback')
      expect(startupCommands.map(command => command.name)).toEqual([
        'CheckAccess',
      ])
    })
  }

  it('opens a search link with its words in the search field', () => {
    const model = modelForRoute(
      routeOfPageLoad(
        'https://words.knophy.com/recordings/search?q=rain%20barrel',
      ),
    )
    expect(model.route._tag).toBe('SearchRecordings')
    expect(model.searchQuery).toBe('rain barrel')
    expect(model.playback._tag).toBe('NoPlayback')
  })

  it('opens a share link after sign-in without saying it is not available first', async () => {
    const range: Share.Model.SharedRange = {
      share: {
        id: shareID,
        recordingID,
        visibility: 'Link',
        maybeRecipientEmail: Option.none(),
        maybeLinkToken: Option.some('secret'),
        firstSegmentIndex: 1,
        lastSegmentIndex: 2,
        startSeconds: 20.4,
        endSeconds: 44.8,
        maybeNote: Option.none(),
        maybeSharedBy: Option.some('owner@example.com'),
        createdAtMs: 0,
      },
      maybeTitle: Option.some('Recording 018'),
      maybeNote: Option.none(),
      scrub: Share.Model.PassedScrub(),
      lines: [linkedSection, lastSection],
      images: [],
      isClaimedByViewer: false,
      audio: Share.Model.NoSharedAudio(),
    }
    const start = modelForRoute(
      routeOfPageLoad(
        `https://words.knophy.com/recording/${recordingID}/share/${shareID}?k=secret`,
      ),
    )
    const emptyShare = GotShareMessage({
      message: Share.reportSharedRange({ shareID, maybeRange: Option.none() }),
    })
    const answeredMissingBeforeSignIn = GotShareMessage({
      message: await Effect.runPromise(
        Effect.provide(
          Share.ConfirmSharedRange({
            shareID,
            maybeLinkToken: Option.some('secret'),
            maybeViewerUserID: Option.none(),
          }).effect,
          browserWithoutSession,
        ),
      ),
    })
    const shown = Array.reduce(
      [
        noSessionYet,
        emptyShare,
        accessFoundTheAccount,
        signedIn,
        connected,
        emptyShare,
        answeredMissingBeforeSignIn,
        GotShareMessage({
          message: Share.reportSharedRange({
            shareID,
            maybeRange: Option.some(range),
          }),
        }),
      ],
      {
        model: start,
        tags: Array.empty<string>(),
        confirms: Array.empty<unknown>(),
      },
      (state, message) => {
        const [next, commands] = update(state.model, message)
        return {
          model: next,
          tags: [...state.tags, displayedSharedRangeOf(next)._tag],
          confirms: [
            ...state.confirms,
            ...pipe(
              commands,
              Array.filter(command => command.name === 'ConfirmSharedRange'),
              Array.map(command => command.args),
            ),
          ],
        }
      },
    )

    expect(answeredMissingBeforeSignIn.message._tag).toBe(
      'ConfirmedMissingSharedRange',
    )
    expect(displayedSharedRangeOf(start)._tag).toBe('OpeningSharedRange')
    expect(shown.tags).not.toContain('MissingSharedRange')
    expect(shown.confirms).toEqual([
      {
        shareID,
        maybeLinkToken: Option.some('secret'),
        maybeViewerUserID: Option.none(),
      },
      {
        shareID,
        maybeLinkToken: Option.some('secret'),
        maybeViewerUserID: Option.some(userID),
      },
    ])
    expect(shown.model.share.sharedRange._tag).toBe('ReadySharedRange')
  })
})
