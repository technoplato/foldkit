import { Array, Option } from 'effect'
import { evo } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import {
  MediaSessionPlay,
  MediaSessionSeek,
  MediaSessionSkip,
} from './audioPlayer.js'
import * as Capture from './capture/index.js'
import {
  PlaybackRoute,
  RecordingListRoute,
  RecordingRoute,
  SearchRecordingsRoute,
  SectionRoute,
  ShareRoute,
  scribeRouteToPath,
  scribeRouteToShareUrl,
} from './link.js'
import { firstRecordingWindow } from './listWindow.js'
import {
  AcquiredAudioPlayer,
  ChangedConnectivity,
  ChangedPlayheadVisibility,
  ChangedUrl,
  ClickedCloseMiniPlayer,
  ClickedCopyMomentLink,
  ClickedCopySectionLink,
  ClickedEnterFullScreen,
  ClickedExitFullScreen,
  ClickedPause,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedShareRecordingLink,
  ClickedSkip,
  ClickedSkipToContent,
  ClickedSkipToPlayer,
  ClickedTryOpeningAgain,
  ClickedWord,
  ConfirmedMissingRecording,
  ElapsedAnnouncementPause,
  ElapsedFocusHighlight,
  ElapsedOpeningPatience,
  ElapsedSearchPause,
  EndedScrub,
  FailedObserveRecording,
  GotShareMessage,
  HeardAudioEnded,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
  HeardMediaSessionAction,
  type Message,
  MovedScrub,
  ObservedFileUrls,
  ObservedIdentity,
  ObservedRecording,
  ObservedRecordings,
  PressedScrubberArrow,
  PressedShortcut,
  ScrolledTranscriptAway,
  StartedScrub,
  TickedLiveClock,
  UpdatedSearchQuery,
} from './message.js'
import {
  type Model,
  OpeningPlayback,
  type ReadyPlayback,
  SignedIn,
} from './model.js'
import {
  type RecordingDetail,
  type RecordingSummary,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import * as Share from './share/index.js'
import {
  audioSourceOf,
  displayedLengthOf,
  fileIDsOf,
  followedSectionOf,
  isCountingLiveOf,
  isLiveRecording,
  isReturnShownOf,
  liveDurationSecondsOf,
  modelForRoute,
  openingWaitOf,
  playbackPhaseOf,
  receivedShareOf,
  shortcutContextOf,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const otherRecordingID = '8f1a2b3c-4d5e-4f60-9a7b-8c9d0e1f2a3b'

const section = (
  id: string,
  index: number,
  startSeconds: number,
  text: string,
): Section => ({
  id,
  index,
  startSeconds,
  endSeconds: startSeconds + 2,
  maybeSpeakerID: Option.none(),
  text,
  words: [
    {
      id: `${id}:0`,
      text,
      startSeconds: startSeconds + 0.2,
      endSeconds: startSeconds + 1,
    },
  ],
  isFinal: true,
})

const sectionA = section('0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', 0, 5, 'Hello')
const sectionB = section('1b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', 1, 20, 'World')

const detail = (overrides: Partial<RecordingDetail> = {}): RecordingDetail => ({
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
    isLiveRoomSet: false,
    captureGaps: [],
  },
  sections: [sectionA, sectionB],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
  ...overrides,
})

const urlOf = (link: string) => Option.getOrThrow(fromString(link))

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    { model, commandNames: Array.empty<string>() },
    (state, message) => {
      const [next, commands] = update(state.model, message)
      return {
        model: next,
        commandNames: [
          ...state.commandNames,
          ...commands.map(command => command.name),
        ],
      }
    },
  )

const commandsOf = (model: Model, message: Message) => {
  const [next, commands] = update(model, message)
  return {
    model: next,
    commands: commands.map(command => ({
      name: command.name,
      args: command.args,
    })),
  }
}

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const opened = (route: Parameters<typeof scribeRouteToShareUrl>[0]) =>
  modelForRoute(route)

const observed = (recordingDetail: RecordingDetail = detail()) =>
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(recordingDetail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

describe('opening links', () => {
  it('opens a section link one second before the section and highlights it', () => {
    const start = opened(
      SectionRoute({
        recordingID,
        sectionID: sectionB.id,
        t: Option.none(),
      }),
    )
    const { model, commandNames } = run(start, [observed()])
    const ready = readyOf(model)

    expect(ready.positionSeconds).toBe(19)
    expect(ready.maybePendingSeekSeconds).toEqual(Option.some(19))
    expect(ready.maybeFocusedSectionID).toEqual(Option.some(sectionB.id))
    expect(ready.follow).toBe('Detached')
    expect(commandNames).toEqual([
      'ClearFocusHighlightLater',
      'ScrollToSection',
    ])

    const cleared = run(model, [
      ElapsedFocusHighlight({ revision: ready.focusRevision }),
    ])
    expect(readyOf(cleared.model).maybeFocusedSectionID).toEqual(Option.none())
  })

  it("uses the link's t when it has one", () => {
    const start = opened(
      SectionRoute({
        recordingID,
        sectionID: sectionB.id,
        t: Option.some('12.5'),
      }),
    )
    expect(readyOf(run(start, [observed()]).model).positionSeconds).toBe(12.5)
  })

  it('seeks once the audio player is ready', () => {
    const start = opened(
      PlaybackRoute({
        recordingID,
        t: Option.some('30'),
        focus: Option.none(),
      }),
    )
    const { model, commandNames } = run(start, [
      observed(),
      AcquiredAudioPlayer(),
    ])

    expect(readyOf(model).maybePendingSeekSeconds).toEqual(Option.none())
    expect(commandNames).toEqual(['ScrollToSection', 'SeekAudio'])
  })

  it('asks the server before saying a recording is not shared, and recovers if it arrives', () => {
    const start = opened(RecordingRoute({ recordingID }))
    const empty = ObservedRecording({
      recordingID,
      maybeDetail: Option.none(),
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
    })
    const afterEmpty = run(start, [empty])
    expect(afterEmpty.commandNames).toEqual(['ConfirmRecording'])
    expect(afterEmpty.model.playback._tag).toBe('OpeningPlayback')

    const missing = run(afterEmpty.model, [
      ConfirmedMissingRecording({ recordingID, maybeUserID: Option.none() }),
    ])
    expect(missing.model.playback._tag).toBe('MissingRecording')

    expect(run(missing.model, [observed()]).model.playback._tag).toBe(
      'ReadyPlayback',
    )
  })

  it('starts a recording opened without a moment at the top of its page', () => {
    expect(
      run(opened(RecordingRoute({ recordingID })), [observed()]).commandNames,
    ).toEqual(['ScrollToRecordingTitle'])
  })

  it('closes playback when the URL returns to the list', () => {
    const start = run(opened(RecordingRoute({ recordingID })), [observed()])
    const list = run(start.model, [
      ChangedUrl({ url: urlOf(scribeRouteToShareUrl(RecordingListRoute())) }),
    ])
    expect(list.model.playback._tag).toBe('NoPlayback')
  })
})

describe('playing', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-1' } }),
    AcquiredAudioPlayer(),
  ]).model

  it('loads the first audio URL and keeps it when the signed URL changes', () => {
    expect(audioSourceOf(ready)).toEqual(
      Option.some({ url: 'https://files/audio-1', attempt: 0 }),
    )
    const refreshed = run(ready, [
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-2' } }),
    ]).model
    expect(audioSourceOf(refreshed)).toEqual(
      Option.some({ url: 'https://files/audio-1', attempt: 0 }),
    )
    const retried = run(refreshed, [ClickedRetryAudio()]).model
    expect(audioSourceOf(retried)).toEqual(
      Option.some({ url: 'https://files/audio-2', attempt: 1 }),
    )
  })

  it('plays from a clicked word and follows the playhead again', () => {
    const detached = run(ready, [ScrolledTranscriptAway()]).model
    const { model, commandNames } = run(detached, [
      ClickedWord({ seconds: 20.2 }),
    ])
    const next = readyOf(model)

    expect(next.positionSeconds).toBe(20.2)
    expect(next.transport).toBe('Playing')
    expect(next.follow).toBe('Following')
    expect(commandNames).toEqual(['SeekAudio', 'PlayAudio'])
    expect(
      Option.map(followedSectionOf(next), followed => followed.id),
    ).toEqual(Option.some(sectionB.id))
  })

  it('ignores player positions while the listener drags the scrubber, then seeks', () => {
    const { model, commandNames } = run(ready, [
      StartedScrub({ seconds: 10 }),
      MovedScrub({ seconds: 40 }),
      HeardAudioPosition({ seconds: 3 }),
      EndedScrub({ seconds: 41 }),
    ])
    const next = readyOf(model)

    expect(next.positionSeconds).toBe(41)
    expect(next.scrub._tag).toBe('NotScrubbing')
    expect(commandNames).toEqual(['SeekAudio', 'ScrollToSection'])
  })

  it('returns to the playhead after scrolling away', () => {
    const detached = run(ready, [ScrolledTranscriptAway()]).model
    expect(readyOf(detached).follow).toBe('Detached')
    expect(
      readyOf(run(detached, [ClickedReturnToPlayhead()]).model).follow,
    ).toBe('Following')
  })

  it('shows Playing while audio plays and Paused only when it stopped part way through', () => {
    const phaseAt = (model: Model) => playbackPhaseOf(readyOf(model))
    const playing = run(ready, [ClickedPlay(), HeardAudioPlaying()]).model
    const pausedPartWay = run(playing, [
      HeardAudioPosition({ seconds: 12 }),
      HeardAudioPaused(),
    ]).model
    const ended = run(pausedPartWay, [
      HeardAudioPosition({ seconds: 60 }),
      HeardAudioEnded(),
    ]).model

    expect(phaseAt(ready)).toEqual(Option.none())
    expect(phaseAt(playing)).toEqual(Option.some('Playing'))
    expect(phaseAt(pausedPartWay)).toEqual(Option.some('Paused'))
    expect(phaseAt(ended)).toEqual(Option.none())
  })

  it('shows no playback phase for a recording still in progress', () => {
    const live = run(opened(RecordingRoute({ recordingID })), [
      observed(
        detail({
          summary: { ...detail().summary, activity: 'Recording' },
          audio: UploadingAudio({ byteCount: 0 }),
        }),
      ),
    ]).model
    expect(playbackPhaseOf(readyOf(live))).toEqual(Option.none())
  })

  it('reopens a recording where the listener left it, unless a link names a moment', () => {
    const listURL = urlOf(scribeRouteToShareUrl(RecordingListRoute()))
    const recordingURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID })),
    )
    const otherURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID: otherRecordingID })),
    )
    const left = run(ready, [
      ClickedPlay(),
      HeardAudioPosition({ seconds: 42 }),
      ChangedUrl({ url: otherURL }),
      ChangedUrl({ url: listURL }),
    ]).model
    const reopened = run(left, [ChangedUrl({ url: recordingURL }), observed()])
    const linked = run(left, [
      ChangedUrl({
        url: urlOf(
          scribeRouteToShareUrl(
            PlaybackRoute({
              recordingID,
              t: Option.some('10'),
              focus: Option.none(),
            }),
          ),
        ),
      }),
      observed(),
    ])
    const finished = run(ready, [
      HeardAudioPosition({ seconds: 60 }),
      ChangedUrl({ url: listURL }),
      ChangedUrl({ url: recordingURL }),
      observed(),
    ])

    expect(left.maybeBackgroundPlayback).toEqual(Option.none())
    expect(left.resumePositions).toEqual({ [recordingID]: 42 })
    expect(readyOf(reopened.model).positionSeconds).toBe(42)
    expect(readyOf(reopened.model).maybePendingSeekSeconds).toEqual(
      Option.some(42),
    )
    expect(reopened.commandNames).toContain('ScrollToSection')
    expect(readyOf(linked.model).positionSeconds).toBe(10)
    expect(readyOf(finished.model).positionSeconds).toBe(0)
  })

  it('keeps a playing recording playing while the listener browses, and brings it back where it is', () => {
    const listURL = urlOf(scribeRouteToShareUrl(RecordingListRoute()))
    const recordingURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID })),
    )
    const playing = run(ready, [
      ClickedPlay(),
      HeardAudioPlaying(),
      HeardAudioPosition({ seconds: 21 }),
    ]).model
    const browsing = run(playing, [ChangedUrl({ url: listURL })])
    const later = run(browsing.model, [
      HeardAudioPosition({ seconds: 30 }),
      ClickedPause(),
    ])
    const back = run(later.model, [ChangedUrl({ url: recordingURL })])

    expect(browsing.model.playback._tag).toBe('NoPlayback')
    expect(audioSourceOf(browsing.model)).toEqual(audioSourceOf(playing))
    expect(
      Option.map(browsing.model.maybeBackgroundPlayback, background => [
        background.recordingID,
        background.transport,
      ]),
    ).toEqual(Option.some([recordingID, 'Playing']))
    expect(later.commandNames).toEqual(['PauseAudio'])
    expect(
      Option.map(later.model.maybeBackgroundPlayback, background => [
        background.positionSeconds,
        background.transport,
      ]),
    ).toEqual(Option.some([30, 'Paused']))
    expect(readyOf(back.model).positionSeconds).toBe(30)
    expect(back.model.maybeBackgroundPlayback).toEqual(Option.none())
    expect(back.commandNames).toEqual(['ScrollToSection'])
  })

  it('keeps nothing in the background that was never played, and closes it on request', () => {
    const listURL = urlOf(scribeRouteToShareUrl(RecordingListRoute()))
    const untouched = run(ready, [ChangedUrl({ url: listURL })]).model
    const closed = run(ready, [
      ClickedPlay(),
      HeardAudioPosition({ seconds: 8 }),
      ChangedUrl({ url: listURL }),
      ClickedCloseMiniPlayer(),
    ]).model

    expect(untouched.maybeBackgroundPlayback).toEqual(Option.none())
    expect(closed.maybeBackgroundPlayback).toEqual(Option.none())
    expect(audioSourceOf(closed)).toEqual(Option.none())
  })

  it("keeps a playback playing beside this browser's own recording in progress, and back again (F3)", () => {
    const liveID = otherRecordingID
    const withCapture: Model = evo(ready, {
      capture: () => ({
        state: Capture.Model.Capturing({
          draft: {
            recordingID: liveID,
            transcriptionID: 'transcription-1',
            ownerUserID: 'user-1',
            activityClientID: 'client-1',
            startedAtMs: 0,
            title: 'Recording 019',
            deviceIcon: 'laptop',
            maybeBuildInfo: Option.none(),
          },
          transport: 'Recording',
          recordedSeconds: 3,
          levels: Capture.Model.silentLevels(),
          transcriber: 'Live',
          maybeTranscriberNotice: Option.none(),
          maybeWriteProblem: Option.none(),
          progress: Capture.Model.emptyProgress(),
          durationWrittenSeconds: 0,
        }),
      }),
    })
    const liveURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID: liveID })),
    )
    const playbackURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID })),
    )
    const onLive = run(withCapture, [
      ClickedPlay(),
      HeardAudioPosition({ seconds: 12 }),
      ChangedUrl({ url: liveURL }),
    ])
    const toggled = run(onLive.model, [
      PressedShortcut({ shortcut: 'TogglePlayback' }),
    ])
    const backToPlayback = run(onLive.model, [ChangedUrl({ url: playbackURL })])

    expect(onLive.model.playback).toMatchObject({
      _tag: 'OpeningPlayback',
      recordingID: liveID,
    })
    expect(
      Option.map(
        onLive.model.maybeBackgroundPlayback,
        background => background.recordingID,
      ),
    ).toEqual(Option.some(recordingID))
    expect(audioSourceOf(onLive.model)).toEqual(audioSourceOf(ready))
    expect(shortcutContextOf(onLive.model).isPlaybackReady).toBe(true)
    expect(toggled.commandNames).toEqual(['PauseAudio'])
    expect(readyOf(backToPlayback.model).positionSeconds).toBe(12)
    expect(backToPlayback.model.maybeBackgroundPlayback).toEqual(Option.none())
  })

  it('stops the background recording when another recording opens', () => {
    const otherURL = urlOf(
      scribeRouteToShareUrl(RecordingRoute({ recordingID: otherRecordingID })),
    )
    const listURL = urlOf(scribeRouteToShareUrl(RecordingListRoute()))
    const replaced = run(ready, [
      ClickedPlay(),
      HeardAudioPosition({ seconds: 8 }),
      ChangedUrl({ url: listURL }),
      ChangedUrl({ url: otherURL }),
    ]).model

    expect(replaced.maybeBackgroundPlayback).toEqual(Option.none())
    expect(audioSourceOf(replaced)).toEqual(Option.none())
  })

  it('plays only once the audio player is ready', () => {
    const noPlayer = run(opened(RecordingRoute({ recordingID })), [observed()])
    expect(run(noPlayer.model, [ClickedPlay()]).commandNames).toEqual([])
    expect(run(ready, [ClickedPlay()]).commandNames).toEqual(['PlayAudio'])
  })
})

describe('following a recording in progress', () => {
  it('follows the newest section as snapshots arrive and has no audio yet', () => {
    const live = detail({
      summary: { ...detail().summary, activity: 'Recording' },
      audio: UploadingAudio({ byteCount: 0 }),
    })
    const first = run(opened(RecordingRoute({ recordingID })), [observed(live)])
    const firstReady = readyOf(first.model)
    expect(isLiveRecording(firstReady)).toBe(true)
    expect(audioSourceOf(first.model)).toEqual(Option.none())
    expect(fileIDsOf(first.model)).toEqual([])

    const sectionC = section(
      '2b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
      2,
      40,
      'Again',
    )
    const grown = run(first.model, [
      observed({ ...live, sections: [sectionA, sectionB, sectionC] }),
    ])
    expect(
      Option.map(
        followedSectionOf(readyOf(grown.model)),
        followed => followed.id,
      ),
    ).toEqual(Option.some(sectionC.id))
  })
})

describe('copying links', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [observed()]).model

  it('copies a section link with the one-second lead-in', () => {
    const [, commands] = update(
      ready,
      ClickedCopySectionLink({ sectionID: sectionB.id }),
    )
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.pisspoursoftware.xyz/recording/${recordingID}/section/${sectionB.id}?t=19`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })

  it('copies the playback form for a moment before the first section', () => {
    const at = run(ready, [HeardAudioPosition({ seconds: 2.5 })]).model
    const [, commands] = update(at, ClickedCopyMomentLink())
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.pisspoursoftware.xyz/playback/${recordingID}?t=1`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })

  it("shares a recording's link through the system share sheet, like Share Link in the iPhone's list", () => {
    const [, commands] = update(
      opened(RecordingListRoute()),
      ClickedShareRecordingLink({ recordingID, title: 'Recording 018' }),
    )
    expect(
      commands.map(command => ({ name: command.name, args: command.args })),
    ).toEqual([
      {
        name: 'ShareRecordingLink',
        args: {
          url: `https://words.pisspoursoftware.xyz/recording/${recordingID}`,
          title: 'Recording 018',
        },
      },
    ])
  })

  it('copies a link to the current moment in the section link form, with the lead-in', () => {
    const at = run(ready, [HeardAudioPosition({ seconds: 42.7 })]).model
    const [, commands] = update(at, ClickedCopyMomentLink())
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.pisspoursoftware.xyz/recording/${recordingID}/section/${sectionB.id}?t=41`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })
})

describe('signing in', () => {
  it('forgets a list read under another identity, so nothing stale counts as loaded', () => {
    const signedOutList = run(opened(RecordingListRoute()), [
      ObservedRecordings({
        window: firstRecordingWindow,
        recordings: [],
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
        hasOlder: false,
      }),
    ])
    expect(signedOutList.model.recordings._tag).toBe('LoadedRecordings')
    const signedIn = run(signedOutList.model, [
      ObservedIdentity({
        identity: SignedIn({
          userID: 'user-1',
          maybeEmail: Option.some('owner@example.com'),
          isGuest: false,
        }),
      }),
    ])
    expect(signedIn.model.recordings._tag).toBe('LoadingRecordings')
  })
})

describe('following the playhead', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-1' } }),
    AcquiredAudioPlayer(),
  ]).model

  it('scrolls to each new section the playhead reaches, and only then', () => {
    const intoA = commandsOf(ready, HeardAudioPosition({ seconds: 6 }))
    expect(intoA.commands).toEqual([
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionA.id, placement: 'Center' },
      },
    ])
    const withinA = commandsOf(
      intoA.model,
      HeardAudioPosition({ seconds: 6.5 }),
    )
    expect(withinA.commands).toEqual([])
    const intoB = commandsOf(withinA.model, HeardAudioPosition({ seconds: 21 }))
    expect(intoB.commands).toEqual([
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionB.id, placement: 'Center' },
      },
    ])
  })

  it('stops following when the listener scrolls away, and Back to Playhead scrolls back', () => {
    const detached = run(ready, [
      HeardAudioPosition({ seconds: 6 }),
      ScrolledTranscriptAway(),
    ]).model
    const moved = commandsOf(detached, HeardAudioPosition({ seconds: 21 }))
    expect(moved.commands).toEqual([])
    expect(isReturnShownOf(readyOf(moved.model))).toBe(false)

    const offScreen = run(moved.model, [
      ChangedPlayheadVisibility({
        sectionID: sectionB.id,
        visibility: 'OffScreen',
      }),
    ]).model
    expect(isReturnShownOf(readyOf(offScreen))).toBe(true)

    const returned = commandsOf(offScreen, ClickedReturnToPlayhead())
    expect(readyOf(returned.model).follow).toBe('Following')
    expect(returned.commands).toEqual([
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionB.id, placement: 'Center' },
      },
    ])
  })

  it('follows again when the listener scrolls back to the playhead', () => {
    const away = run(ready, [
      HeardAudioPosition({ seconds: 21 }),
      ScrolledTranscriptAway(),
      ChangedPlayheadVisibility({
        sectionID: sectionB.id,
        visibility: 'OffScreen',
      }),
    ]).model
    const back = run(away, [
      ChangedPlayheadVisibility({
        sectionID: sectionB.id,
        visibility: 'OnScreen',
      }),
    ]).model
    expect(readyOf(back).follow).toBe('Following')
    expect(isReturnShownOf(readyOf(back))).toBe(false)
  })

  it('ignores visibility reports from a section the transcript no longer follows', () => {
    const atB = run(ready, [
      HeardAudioPosition({ seconds: 21 }),
      ScrolledTranscriptAway(),
    ]).model
    const stale = run(atB, [
      ChangedPlayheadVisibility({
        sectionID: sectionA.id,
        visibility: 'OffScreen',
      }),
    ]).model
    expect(readyOf(stale).playheadVisibility).toBe('OnScreen')
    expect(isReturnShownOf(readyOf(stale))).toBe(false)
  })

  it('scrolls to where the scrubber was let go, even after scrolling away', () => {
    const away = run(ready, [
      HeardAudioPosition({ seconds: 6 }),
      ScrolledTranscriptAway(),
      StartedScrub({ seconds: 6 }),
    ]).model
    const released = commandsOf(away, EndedScrub({ seconds: 21 }))
    expect(readyOf(released.model).follow).toBe('Following')
    expect(released.commands).toEqual([
      { name: 'SeekAudio', args: { seconds: 21 } },
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionB.id, placement: 'Center' },
      },
    ])
  })

  it('moves the view with the playhead when skipping into another section', () => {
    const atA = run(ready, [HeardAudioPosition({ seconds: 6 })]).model
    const skipped = commandsOf(atA, ClickedSkip({ deltaSeconds: 15 }))
    expect(readyOf(skipped.model).positionSeconds).toBe(21)
    expect(skipped.commands).toEqual([
      { name: 'SeekAudio', args: { seconds: 21 } },
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionB.id, placement: 'Center' },
      },
    ])
  })

  it('brings an off-screen playhead into view when Play is pressed', () => {
    const offScreen = run(ready, [
      HeardAudioPosition({ seconds: 21 }),
      ChangedPlayheadVisibility({
        sectionID: sectionB.id,
        visibility: 'OffScreen',
      }),
    ]).model
    expect(run(offScreen, [ClickedPlay()]).commandNames).toEqual([
      'PlayAudio',
      'ScrollToSection',
    ])
  })

  it('names the recording for the system Now Playing once audio plays', () => {
    const playing = commandsOf(ready, HeardAudioPlaying())
    expect(readyOf(playing.model).transport).toBe('Playing')
    expect(playing.commands).toEqual([
      {
        name: 'PublishNowPlaying',
        args: { nowPlaying: { title: 'Recording 018', startedAtMs: 0 } },
      },
    ])
  })

  it('answers the system media controls like the page controls', () => {
    expect(
      run(ready, [HeardMediaSessionAction({ action: MediaSessionPlay() })])
        .commandNames,
    ).toEqual(['PlayAudio'])
    const sought = commandsOf(
      ready,
      HeardMediaSessionAction({ action: MediaSessionSeek({ seconds: 21 }) }),
    )
    expect(readyOf(sought.model).positionSeconds).toBe(21)
    expect(Array.map(sought.commands, command => command.name)).toEqual([
      'SeekAudio',
      'ScrollToSection',
    ])
    const skipped = run(sought.model, [
      HeardMediaSessionAction({
        action: MediaSessionSkip({ deltaSeconds: -15 }),
      }),
    ]).model
    expect(readyOf(skipped).positionSeconds).toBe(6)
  })
})

describe('following a recording in progress at its live edge', () => {
  const sectionC = section(
    '2b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
    2,
    40,
    'Again',
  )
  const sectionD = section(
    '3b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
    3,
    44,
    'More',
  )
  const live = (sections: ReadonlyArray<Section>) =>
    detail({
      summary: { ...detail().summary, activity: 'Recording' },
      audio: UploadingAudio({ byteCount: 0 }),
      sections,
    })

  it('opens at the newest section and keeps it at the live edge as it grows', () => {
    const opening = run(opened(RecordingRoute({ recordingID })), [
      observed(live([sectionA, sectionB])),
    ])
    expect(opening.commandNames).toEqual(['ScrollToSection'])

    const grown = commandsOf(
      opening.model,
      observed(live([sectionA, sectionB, sectionC])),
    )
    expect(grown.commands).toContainEqual({
      name: 'ScrollToSection',
      args: { sectionID: sectionC.id, placement: 'LiveEdge' },
    })

    const longer = commandsOf(
      grown.model,
      observed(
        live([sectionA, sectionB, { ...sectionC, text: 'Again and again' }]),
      ),
    )
    expect(longer.commands).toContainEqual({
      name: 'ScrollToSection',
      args: { sectionID: sectionC.id, placement: 'LiveEdge' },
    })

    const away = run(longer.model, [ScrolledTranscriptAway()]).model
    const newer = commandsOf(
      away,
      observed(live([sectionA, sectionB, sectionC, sectionD])),
    )
    expect(
      Array.filter(
        newer.commands,
        command => command.name === 'ScrollToSection',
      ),
    ).toEqual([])
  })

  it('stays where the listener is when the recording finishes', () => {
    const following = run(opened(RecordingRoute({ recordingID })), [
      observed(live([sectionA, sectionB])),
    ]).model
    const finished = commandsOf(following, observed(detail()))
    expect(finished.commands).toEqual([])
  })

  it('announces finished sections to screen readers at most once per pause', () => {
    const following = run(opened(RecordingRoute({ recordingID })), [
      observed(live([sectionA])),
    ]).model
    const first = commandsOf(following, observed(live([sectionA, sectionB])))
    const firstReady = readyOf(first.model)
    expect(firstReady.maybeAnnouncedText).toEqual(Option.some('World'))
    expect(first.commands).toContainEqual({
      name: 'WaitForAnnouncementPause',
      args: { revision: 1 },
    })

    const during = run(first.model, [
      observed(live([sectionA, sectionB, sectionC])),
      observed(live([sectionA, sectionB, sectionC, sectionD])),
    ])
    expect(readyOf(during.model).maybeAnnouncedText).toEqual(
      Option.some('World'),
    )
    expect(during.commandNames).not.toContain('WaitForAnnouncementPause')

    const afterPause = commandsOf(
      during.model,
      ElapsedAnnouncementPause({ revision: 1 }),
    )
    expect(readyOf(afterPause.model).maybeAnnouncedText).toEqual(
      Option.some('More'),
    )
    expect(afterPause.commands).toEqual([
      { name: 'WaitForAnnouncementPause', args: { revision: 2 } },
    ])

    const quiet = run(afterPause.model, [
      ElapsedAnnouncementPause({ revision: 2 }),
    ]).model
    expect(readyOf(quiet).announcementPause._tag).toBe('ReadyToAnnounce')
  })
})

describe('keyboard shortcuts', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-1' } }),
    AcquiredAudioPlayer(),
  ]).model

  it('offers playback shortcuts only once the audio is ready', () => {
    const loading = run(opened(RecordingRoute({ recordingID })), [
      observed(),
    ]).model
    expect(shortcutContextOf(loading).isPlaybackReady).toBe(false)
    expect(shortcutContextOf(ready)).toEqual({
      isPlaybackReady: true,
      isAwayFromFollowed: false,
      isRecordingOpen: true,
      isFullScreen: false,
      isRecordAvailable: false,
      isCapturing: false,
      isSearchAvailable: false,
      isDialogOpen: false,
    })
  })

  it('plays, pauses, and skips with Space and the arrow keys', () => {
    const playing = run(ready, [
      PressedShortcut({ shortcut: 'TogglePlayback' }),
    ])
    expect(readyOf(playing.model).transport).toBe('Playing')
    expect(playing.commandNames).toEqual(['PlayAudio'])

    const paused = run(playing.model, [
      PressedShortcut({ shortcut: 'TogglePlayback' }),
    ])
    expect(readyOf(paused.model).transport).toBe('Paused')
    expect(paused.commandNames).toEqual(['PauseAudio'])

    const forward = run(paused.model, [
      PressedShortcut({ shortcut: 'SkipForward' }),
    ]).model
    expect(readyOf(forward).positionSeconds).toBe(15)
    const backward = run(forward, [
      PressedShortcut({ shortcut: 'SkipBackward' }),
    ]).model
    expect(readyOf(backward).positionSeconds).toBe(0)
  })

  it('returns to the playhead with L once the listener scrolled it away', () => {
    const away = run(ready, [
      HeardAudioPosition({ seconds: 21 }),
      ScrolledTranscriptAway(),
      ChangedPlayheadVisibility({
        sectionID: sectionB.id,
        visibility: 'OffScreen',
      }),
    ]).model
    expect(shortcutContextOf(away).isAwayFromFollowed).toBe(true)
    const back = run(away, [PressedShortcut({ shortcut: 'ReturnToFollowed' })])
    expect(readyOf(back.model).follow).toBe('Following')
    expect(back.commandNames).toEqual(['ScrollToSection'])
  })

  it('pauses and resumes the recording in progress with P', () => {
    const capturing: Model = evo(ready, {
      capture: () => ({
        state: Capture.Model.Capturing({
          draft: {
            recordingID,
            transcriptionID: 'transcription-1',
            ownerUserID: 'user-1',
            activityClientID: 'client-1',
            startedAtMs: 0,
            title: 'Recording 019',
            deviceIcon: 'laptop',
            maybeBuildInfo: Option.none(),
          },
          transport: 'Recording',
          recordedSeconds: 3,
          levels: Capture.Model.silentLevels(),
          transcriber: 'Live',
          maybeTranscriberNotice: Option.none(),
          maybeWriteProblem: Option.none(),
          progress: Capture.Model.emptyProgress(),
          durationWrittenSeconds: 0,
        }),
      }),
    })
    expect(shortcutContextOf(capturing).isCapturing).toBe(true)
    expect(shortcutContextOf(capturing).isPlaybackReady).toBe(false)
    const paused = run(capturing, [
      PressedShortcut({ shortcut: 'TogglePauseRecording' }),
    ])
    expect(paused.model.capture.state).toMatchObject({ transport: 'Paused' })
    expect(paused.commandNames).toEqual(['PauseCapture'])
    const resumed = run(paused.model, [
      PressedShortcut({ shortcut: 'TogglePauseRecording' }),
    ])
    expect(resumed.model.capture.state).toMatchObject({
      transport: 'Recording',
    })
    expect(resumed.commandNames).toEqual(['ResumeCapture'])
  })

  it('ignores the recording pause shortcut when nothing is recording', () => {
    expect(
      run(ready, [PressedShortcut({ shortcut: 'TogglePauseRecording' })])
        .commandNames,
    ).toEqual([])
  })

  it('stops the recording in progress with its shortcut, as Stop does', () => {
    const capturing: Model = evo(ready, {
      capture: () => ({
        state: Capture.Model.Capturing({
          draft: {
            recordingID,
            transcriptionID: 'transcription-1',
            ownerUserID: 'user-1',
            activityClientID: 'client-1',
            startedAtMs: 0,
            title: 'Recording 019',
            deviceIcon: 'laptop',
            maybeBuildInfo: Option.none(),
          },
          transport: 'Recording',
          recordedSeconds: 3,
          levels: Capture.Model.silentLevels(),
          transcriber: 'Live',
          maybeTranscriberNotice: Option.none(),
          maybeWriteProblem: Option.none(),
          progress: Capture.Model.emptyProgress(),
          durationWrittenSeconds: 0,
        }),
      }),
    })
    const stopped = run(capturing, [
      PressedShortcut({ shortcut: 'StopRecording' }),
    ])
    expect(stopped.model.capture.state._tag).toBe('StoppingCapture')
    expect(stopped.commandNames).toEqual(['RequestFinishCapture'])
    expect(
      run(ready, [PressedShortcut({ shortcut: 'StopRecording' })]).commandNames,
    ).toEqual([])
  })
})

describe('full screen', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    HeardAudioPosition({ seconds: 21 }),
  ]).model

  it('enters and leaves Full Screen, keeping a followed playhead in view', () => {
    const entered = commandsOf(ready, ClickedEnterFullScreen())
    expect(readyOf(entered.model).screenMode).toBe('FullScreen')
    expect(entered.commands).toEqual([
      {
        name: 'ScrollToSection',
        args: { sectionID: sectionB.id, placement: 'Center' },
      },
    ])
    expect(shortcutContextOf(entered.model).isFullScreen).toBe(true)
    const left = run(entered.model, [ClickedExitFullScreen()]).model
    expect(readyOf(left).screenMode).toBe('Standard')
  })

  it('toggles with F and leaves with Escape', () => {
    const toggled = run(ready, [
      PressedShortcut({ shortcut: 'ToggleFullScreen' }),
    ]).model
    expect(readyOf(toggled).screenMode).toBe('FullScreen')
    const escaped = run(toggled, [
      PressedShortcut({ shortcut: 'ExitFullScreen' }),
    ]).model
    expect(readyOf(escaped).screenMode).toBe('Standard')
  })

  it('does not scroll when entering Full Screen away from the playhead', () => {
    const away = run(ready, [ScrolledTranscriptAway()]).model
    expect(run(away, [ClickedEnterFullScreen()]).commandNames).toEqual([])
  })
})

describe('skipping to the player', () => {
  it('moves keyboard focus to the floating player', () => {
    expect(
      run(opened(RecordingRoute({ recordingID })), [ClickedSkipToPlayer()])
        .commandNames,
    ).toEqual(['FocusPlayer'])
  })

  it('moves keyboard focus to the page content, past the top bar and the list', () => {
    expect(
      run(opened(RecordingRoute({ recordingID })), [ClickedSkipToContent()])
        .commandNames,
    ).toEqual(['FocusContent'])
  })
})

describe('searching the list', () => {
  const loaded = run(opened(RecordingListRoute()), [
    ObservedRecordings({
      window: firstRecordingWindow,
      recordings: [detail().summary],
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
      hasOlder: false,
    }),
  ]).model

  it('keeps what the listener types and focuses the field with /', () => {
    const typed = run(loaded, [UpdatedSearchQuery({ query: 'launch' })]).model
    expect(typed.searchQuery).toBe('launch')
    expect(shortcutContextOf(loaded).isSearchAvailable).toBe(true)
    expect(
      run(loaded, [PressedShortcut({ shortcut: 'FocusSearch' })]).commandNames,
    ).toEqual(['FocusSearch'])
  })

  it('keeps the search in the address bar once typing pauses, as one history entry', () => {
    const typing = run(loaded, [
      UpdatedSearchQuery({ query: 'rain' }),
      UpdatedSearchQuery({ query: 'rain barrel' }),
    ])
    expect(typing.commandNames).toEqual([
      'WaitForSearchPause',
      'WaitForSearchPause',
    ])

    const earlierPause = commandsOf(
      typing.model,
      ElapsedSearchPause({ query: 'rain' }),
    )
    expect(earlierPause.commands).toEqual([])
    expect(earlierPause.model.route).toEqual(RecordingListRoute())

    const paused = commandsOf(
      typing.model,
      ElapsedSearchPause({ query: 'rain barrel' }),
    )
    const searchRoute = SearchRecordingsRoute({
      q: Option.some('rain barrel'),
    })
    expect(paused.model.route).toEqual(searchRoute)
    expect(paused.commands).toEqual([
      {
        name: 'ReplaceUrl',
        args: { url: scribeRouteToPath(searchRoute) },
      },
    ])
    expect(shortcutContextOf(paused.model).isSearchAvailable).toBe(true)
  })

  it('keeps newer typing when the address bar catches up with an older search', () => {
    const paused = run(loaded, [
      UpdatedSearchQuery({ query: 'rain' }),
      ElapsedSearchPause({ query: 'rain' }),
      UpdatedSearchQuery({ query: 'rain b' }),
    ]).model
    const olderSearch = SearchRecordingsRoute({ q: Option.some('rain') })
    const echoed = run(paused, [
      ChangedUrl({ url: urlOf(scribeRouteToShareUrl(olderSearch)) }),
    ]).model
    expect(echoed.searchQuery).toBe('rain b')
  })

  it('shows the search a link or Back asks for, and none on the list itself', () => {
    const launchSearch = SearchRecordingsRoute({ q: Option.some('launch') })
    const searched = run(opened(RecordingRoute({ recordingID })), [
      ChangedUrl({ url: urlOf(scribeRouteToShareUrl(launchSearch)) }),
    ]).model
    expect(searched.searchQuery).toBe('launch')

    const listed = run(searched, [
      ChangedUrl({ url: urlOf('https://words.knophy.com/') }),
    ]).model
    expect(listed.searchQuery).toBe('')
  })

  it('keeps the sidebar search while a result is open, without changing the address bar', () => {
    const searched = run(loaded, [UpdatedSearchQuery({ query: 'hello' })]).model
    const result = SectionRoute({
      recordingID,
      sectionID: sectionA.id,
      t: Option.some('4'),
    })
    const openedResult = run(searched, [
      ChangedUrl({ url: urlOf(scribeRouteToShareUrl(result)) }),
    ]).model
    expect(openedResult.searchQuery).toBe('hello')
    expect(
      run(openedResult, [UpdatedSearchQuery({ query: 'world' })]).commandNames,
    ).toEqual([])
  })

  it('leaves the address bar alone for a blank search on the list', () => {
    const cleared = run(loaded, [
      UpdatedSearchQuery({ query: ' ' }),
      ElapsedSearchPause({ query: ' ' }),
    ])
    expect(cleared.commandNames).toEqual(['WaitForSearchPause'])
    expect(cleared.model.route).toEqual(RecordingListRoute())
  })

  it('offers search only on the list once recordings loaded', () => {
    expect(
      shortcutContextOf(opened(RecordingListRoute())).isSearchAvailable,
    ).toBe(false)
    expect(
      shortcutContextOf(opened(RecordingRoute({ recordingID })))
        .isSearchAvailable,
    ).toBe(false)
  })
})

describe('the live clock', () => {
  const savedAtMs = 1_790_000_000_000
  const live: RecordingSummary = {
    ...detail().summary,
    activity: 'Recording',
    durationSeconds: 60,
    maybeUpdatedAtMs: Option.some(savedAtMs),
  }

  it('counts a recording in progress elsewhere up from its last saved length, a few seconds at most', () => {
    expect(liveDurationSecondsOf(live, Option.some(savedAtMs + 3_000))).toBe(63)
    expect(liveDurationSecondsOf(live, Option.some(savedAtMs + 60_000))).toBe(
      66,
    )
    expect(liveDurationSecondsOf(live, Option.some(savedAtMs - 2_000))).toBe(60)
    expect(liveDurationSecondsOf(live, Option.none())).toBe(60)
  })

  it('shows a finished recording, or one with no save time, at its saved length', () => {
    const now = Option.some(savedAtMs + 3_000)
    expect(liveDurationSecondsOf({ ...live, activity: 'Idle' }, now)).toBe(60)
    expect(
      liveDurationSecondsOf({ ...live, maybeUpdatedAtMs: Option.none() }, now),
    ).toBe(60)
  })

  const roomed: RecordingSummary = { ...live, isLiveRoomSet: true }
  const gap = (startedAtMs: number, maybeEndedAtMs: Option.Option<number>) => ({
    startedAtMs,
    maybeEndedAtMs,
  })

  it('counts up to 65 s past the last save while the recording device publishes its beat in a live room', () => {
    expect(liveDurationSecondsOf(roomed, Option.some(savedAtMs + 30_000))).toBe(
      90,
    )
    expect(liveDurationSecondsOf(roomed, Option.some(savedAtMs + 64_000))).toBe(
      124,
    )
    expect(liveDurationSecondsOf(roomed, Option.some(savedAtMs + 90_000))).toBe(
      125,
    )
    expect(liveDurationSecondsOf(live, Option.some(savedAtMs + 30_000))).toBe(
      66,
    )
  })

  it('holds while a capture gap is open, as when the recording pauses', () => {
    const paused: RecordingSummary = {
      ...roomed,
      captureGaps: [gap(savedAtMs + 10_000, Option.none())],
    }
    expect(liveDurationSecondsOf(paused, Option.some(savedAtMs + 10_000))).toBe(
      70,
    )
    expect(liveDurationSecondsOf(paused, Option.some(savedAtMs + 40_000))).toBe(
      70,
    )
  })

  it('counts on from a resume without the time the clock waited', () => {
    const resumed: RecordingSummary = {
      ...roomed,
      captureGaps: [
        gap(savedAtMs - 50_000, Option.some(savedAtMs - 40_000)),
        gap(savedAtMs + 10_000, Option.some(savedAtMs + 30_000)),
        gap(savedAtMs + 20_000, Option.some(savedAtMs + 40_000)),
      ],
    }
    expect(
      liveDurationSecondsOf(resumed, Option.some(savedAtMs + 50_000)),
    ).toBe(80)
  })

  it('stops at the saved length once the recording stops', () => {
    expect(
      liveDurationSecondsOf(
        { ...roomed, activity: 'Idle' },
        Option.some(savedAtMs + 30_000),
      ),
    ).toBe(60)
  })

  it('ticks only while a recording in progress on another device is on screen', () => {
    const listOf = (summary: RecordingSummary) =>
      run(opened(RecordingListRoute()), [
        ObservedRecordings({
          window: firstRecordingWindow,
          recordings: [summary],
          skippedCount: 0,
          maybeSkippedReason: Option.none(),
          hasOlder: false,
        }),
      ]).model
    expect(isCountingLiveOf(listOf(live))).toBe(true)
    expect(isCountingLiveOf(listOf(detail().summary))).toBe(false)

    const openLive = run(opened(RecordingRoute({ recordingID })), [
      observed(detail({ summary: live })),
    ]).model
    expect(isCountingLiveOf(openLive)).toBe(true)

    const ticked = run(openLive, [
      TickedLiveClock({ nowMs: savedAtMs + 2_000 }),
    ]).model
    expect(ticked.maybeLiveClockMs).toEqual(Option.some(savedAtMs + 2_000))
  })
})

describe('the network connection', () => {
  it('records when the browser goes offline and comes back', () => {
    const offline = run(opened(RecordingListRoute()), [
      ChangedConnectivity({ connectivity: 'Offline' }),
    ]).model
    expect(offline.connectivity).toBe('Offline')
    expect(
      run(offline, [ChangedConnectivity({ connectivity: 'Online' })]).model
        .connectivity,
    ).toBe('Online')
  })
})

describe('the scrubber arrows', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-1' } }),
    AcquiredAudioPlayer(),
    HeardAudioPosition({ seconds: 10 }),
  ]).model

  it('moves playback 5 seconds for Left and Right Arrow on the scrubber', () => {
    const forward = commandsOf(ready, PressedScrubberArrow({ arrow: 'Right' }))
    expect(readyOf(forward.model).positionSeconds).toBe(15)
    expect(forward.commands).toEqual([
      { name: 'SeekAudio', args: { seconds: 15 } },
    ])
    const back = run(forward.model, [
      PressedScrubberArrow({ arrow: 'Left' }),
      PressedScrubberArrow({ arrow: 'Left' }),
    ]).model
    expect(readyOf(back).positionSeconds).toBe(5)
  })

  it('stops at the start and at the end of the recording', () => {
    const atStart = run(ready, [
      PressedScrubberArrow({ arrow: 'Left' }),
      PressedScrubberArrow({ arrow: 'Left' }),
      PressedScrubberArrow({ arrow: 'Left' }),
    ]).model
    expect(readyOf(atStart).positionSeconds).toBe(0)
    const atEnd = run(ready, [
      HeardAudioPosition({ seconds: 58 }),
      PressedScrubberArrow({ arrow: 'Right' }),
    ]).model
    expect(readyOf(atEnd).positionSeconds).toBe(60)
  })
})

describe('the live length of a recording in progress elsewhere', () => {
  const savedAtMs = 1_790_000_000_000
  const liveAt = (
    durationSeconds: number,
    updatedAtMs: number,
  ): RecordingSummary => ({
    ...detail().summary,
    activity: 'Recording',
    durationSeconds,
    maybeUpdatedAtMs: Option.some(updatedAtMs),
  })
  const listed = (summary: RecordingSummary) =>
    ObservedRecordings({
      window: firstRecordingWindow,
      recordings: [summary],
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
      hasOlder: false,
    })
  const listedLengthOf = (model: Model): number => {
    if (model.recordings._tag !== 'LoadedRecordings') {
      throw new Error(`Expected LoadedRecordings, got ${model.recordings._tag}`)
    }
    const summary = Option.getOrThrow(Array.head(model.recordings.recordings))
    return displayedLengthOf(model, summary)
  }

  it('keeps counting from the length save when a later save moves the save time but not the length', () => {
    const counted = run(opened(RecordingListRoute()), [
      listed(liveAt(20, savedAtMs)),
      TickedLiveClock({ nowMs: savedAtMs + 3_000 }),
    ]).model
    expect(listedLengthOf(counted)).toBe(23)

    const imageSaved = run(counted, [
      listed(liveAt(20, savedAtMs + 3_000)),
    ]).model
    expect(listedLengthOf(imageSaved)).toBe(23)

    const oneSecondLater = run(imageSaved, [
      TickedLiveClock({ nowMs: savedAtMs + 4_000 }),
    ]).model
    expect(listedLengthOf(oneSecondLater)).toBe(24)

    const lengthSaved = run(oneSecondLater, [
      listed(liveAt(27.5, savedAtMs + 7_500)),
      TickedLiveClock({ nowMs: savedAtMs + 8_000 }),
    ]).model
    expect(listedLengthOf(lengthSaved)).toBe(28)
  })

  it('holds what it showed when a save comes in behind it', () => {
    const counted = run(opened(RecordingListRoute()), [
      listed(liveAt(20, savedAtMs)),
      TickedLiveClock({ nowMs: savedAtMs + 3_000 }),
    ]).model
    const behind = run(counted, [
      listed(liveAt(21, savedAtMs + 3_000)),
      TickedLiveClock({ nowMs: savedAtMs + 3_500 }),
    ]).model
    expect(listedLengthOf(behind)).toBe(23)
  })

  it('counts from the resume after a pause written once a minute', () => {
    const roomedAt = (
      durationSeconds: number,
      updatedAtMs: number,
      captureGaps: RecordingSummary['captureGaps'],
    ): RecordingSummary => ({
      ...liveAt(durationSeconds, updatedAtMs),
      isLiveRoomSet: true,
      captureGaps,
    })
    const pauseStartedAtMs = savedAtMs + 30_000
    const resumedAtMs = savedAtMs + 90_000
    const pausedGap = {
      startedAtMs: pauseStartedAtMs,
      maybeEndedAtMs: Option.none(),
    }
    const closedGap = {
      startedAtMs: pauseStartedAtMs,
      maybeEndedAtMs: Option.some(resumedAtMs),
    }
    const paused = run(opened(RecordingListRoute()), [
      listed(roomedAt(20, savedAtMs, [])),
      TickedLiveClock({ nowMs: savedAtMs + 20_000 }),
      listed(roomedAt(50, pauseStartedAtMs, [pausedGap])),
      TickedLiveClock({ nowMs: savedAtMs + 60_000 }),
    ]).model
    expect(listedLengthOf(paused)).toBe(50)

    const resumed = run(paused, [
      listed(roomedAt(50, resumedAtMs, [closedGap])),
      TickedLiveClock({ nowMs: resumedAtMs + 10_000 }),
    ]).model
    expect(listedLengthOf(resumed)).toBe(60)
  })

  it('counts the open recording the same way, in its live bar', () => {
    const openLive = run(opened(RecordingRoute({ recordingID })), [
      observed(detail({ summary: liveAt(20, savedAtMs) })),
      TickedLiveClock({ nowMs: savedAtMs + 3_000 }),
      observed(detail({ summary: liveAt(20, savedAtMs + 3_000) })),
      TickedLiveClock({ nowMs: savedAtMs + 4_000 }),
    ]).model
    expect(displayedLengthOf(openLive, readyOf(openLive).detail.summary)).toBe(
      24,
    )
  })

  it('shows the saved length once the recording stops', () => {
    const stopped = run(opened(RecordingListRoute()), [
      listed(liveAt(20, savedAtMs)),
      TickedLiveClock({ nowMs: savedAtMs + 5_000 }),
      listed({ ...liveAt(22, savedAtMs + 5_500), activity: 'Idle' }),
    ]).model
    expect(listedLengthOf(stopped)).toBe(22)
  })
})

describe('opening a recording that does not answer', () => {
  const patienceOf = (model: Model) => {
    if (model.playback._tag !== 'OpeningPlayback') {
      throw new Error(`Expected OpeningPlayback, got ${model.playback._tag}`)
    }
    return model.playback.patience
  }

  it('says it is still loading after 8 seconds, and Try Again asks again', () => {
    const opening = opened(RecordingRoute({ recordingID }))
    expect(patienceOf(opening)).toBe('Loading')
    expect(openingWaitOf(opening)).toEqual(
      Option.some({ recordingID, attempt: 0 }),
    )

    const slow = run(opening, [
      ElapsedOpeningPatience({ recordingID, attempt: 0 }),
    ]).model
    expect(patienceOf(slow)).toBe('Slow')
    expect(openingWaitOf(slow)).toEqual(Option.none())

    const retried = run(slow, [ClickedTryOpeningAgain()]).model
    expect(retried.recordingAttempt).toBe(1)
    expect(patienceOf(retried)).toBe('Loading')
    expect(openingWaitOf(retried)).toEqual(
      Option.some({ recordingID, attempt: 1 }),
    )

    const stale = run(retried, [
      ElapsedOpeningPatience({ recordingID, attempt: 0 }),
    ]).model
    expect(patienceOf(stale)).toBe('Loading')

    const answered = run(retried, [observed()]).model
    expect(answered.playback._tag).toBe('ReadyPlayback')
    expect(openingWaitOf(answered)).toEqual(Option.none())
  })

  it('opens a recording that failed to load again on Try Again', () => {
    const failed = run(opened(RecordingRoute({ recordingID })), [
      FailedObserveRecording({
        recordingID,
        reason: 'The recording did not load.',
      }),
    ]).model
    expect(failed.playback._tag).toBe('FailedPlayback')

    const retried = run(failed, [ClickedTryOpeningAgain()]).model
    expect(retried.recordingAttempt).toBe(1)
    expect(retried.playback).toEqual(
      OpeningPlayback({
        recordingID,
        request: {
          maybeStartSeconds: Option.none(),
          maybeFocusSectionID: Option.none(),
          isRouteFocus: false,
        },
        patience: 'Loading',
      }),
    )
  })

  it('starts a new wait when another recording opens', () => {
    const slow = run(opened(RecordingRoute({ recordingID })), [
      ElapsedOpeningPatience({ recordingID, attempt: 0 }),
    ]).model
    const other = run(slow, [
      ChangedUrl({
        url: urlOf(
          scribeRouteToShareUrl(
            RecordingRoute({ recordingID: otherRecordingID }),
          ),
        ),
      }),
    ]).model
    expect(patienceOf(other)).toBe('Loading')
    expect(openingWaitOf(other)).toEqual(
      Option.some({ recordingID: otherRecordingID, attempt: 0 }),
    )
  })
})

describe('recordings shared with this account', () => {
  const viewerID = 'reader-1'
  const signedInAt = (route: Parameters<typeof modelForRoute>[0]) =>
    run(opened(route), [
      ObservedIdentity({
        identity: SignedIn({
          userID: viewerID,
          maybeEmail: Option.some('reader@example.com'),
          isGuest: false,
        }),
      }),
    ]).model
  const shareOf = (
    id: string,
    createdAtMs: number,
  ): Share.Model.RecordingShare => ({
    id,
    recordingID,
    visibility: 'People',
    maybeRecipientEmail: Option.some('reader@example.com'),
    maybeLinkToken: Option.none(),
    firstSegmentIndex: 0,
    lastSegmentIndex: 1,
    startSeconds: 5,
    endSeconds: 22,
    maybeNote: Option.none(),
    maybeSharedBy: Option.some('owner@example.com'),
    createdAtMs,
  })
  const received = (shares: ReadonlyArray<Share.Model.RecordingShare>) =>
    GotShareMessage({ message: Share.reportReceivedShares({ shares }) })
  const othersSummary: RecordingSummary = {
    ...detail().summary,
    maybeOwnerUserID: Option.some('owner-1'),
  }
  const ownSummary: RecordingSummary = {
    ...detail().summary,
    maybeOwnerUserID: Option.some(viewerID),
  }

  it('marks a recording someone else shared, at its newest share', () => {
    const model = run(signedInAt(RecordingListRoute()), [
      ObservedRecordings({
        window: firstRecordingWindow,
        recordings: [othersSummary],
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
        hasOlder: false,
      }),
      received([shareOf('newer', 20), shareOf('older', 10)]),
    ]).model
    expect(
      Option.map(receivedShareOf(model, othersSummary), share => share.id),
    ).toEqual(Option.some('newer'))
    expect(receivedShareOf(model, ownSummary)).toEqual(Option.none())
    expect(
      receivedShareOf(model, { ...othersSummary, id: otherRecordingID }),
    ).toEqual(Option.none())
  })

  it('opens the share in place of the recording page, whichever answer comes first', () => {
    const sharePath = scribeRouteToPath(
      ShareRoute({ recordingID, shareID: 'newer', k: Option.none() }),
    )
    const sharesFirst = run(signedInAt(RecordingRoute({ recordingID })), [
      received([shareOf('newer', 20)]),
      observed(detail({ summary: othersSummary })),
    ])
    expect(sharesFirst.model.route).toEqual(
      ShareRoute({ recordingID, shareID: 'newer', k: Option.none() }),
    )
    expect(sharesFirst.model.playback._tag).toBe('NoPlayback')
    expect(sharesFirst.model.share.sharedRange._tag).toBe('OpeningSharedRange')

    const detailFirst = run(signedInAt(RecordingRoute({ recordingID })), [
      observed(detail({ summary: othersSummary })),
    ]).model
    const [redirected, commands] = update(
      detailFirst,
      received([shareOf('newer', 20)]),
    )
    expect(scribeRouteToPath(redirected.route)).toBe(sharePath)
    expect(
      commands.map(command => ({ name: command.name, args: command.args })),
    ).toContainEqual({ name: 'ReplaceUrl', args: { url: sharePath } })
  })

  it('keeps the recording page for its owner', () => {
    const own = run(signedInAt(RecordingRoute({ recordingID })), [
      received([shareOf('newer', 20)]),
      observed(detail({ summary: ownSummary })),
    ]).model
    expect(own.route._tag).toBe('Recording')
    expect(own.playback._tag).toBe('ReadyPlayback')
  })
})
