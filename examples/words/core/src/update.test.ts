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
  SectionRoute,
  scribeRouteToShareUrl,
} from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedConnectivity,
  ChangedPlayheadVisibility,
  ChangedUrl,
  ClickedCopyMomentLink,
  ClickedCopySectionLink,
  ClickedEnterFullScreen,
  ClickedExitFullScreen,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedSkip,
  ClickedSkipToPlayer,
  ClickedWord,
  ConfirmedMissingRecording,
  ElapsedAnnouncementPause,
  ElapsedFocusHighlight,
  EndedScrub,
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
  PressedShortcut,
  ScrolledTranscriptAway,
  StartedScrub,
  UpdatedSearchQuery,
} from './message.js'
import { type Model, type ReadyPlayback, SignedIn } from './model.js'
import {
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  audioSourceOf,
  fileIDsOf,
  followedSectionOf,
  isLiveRecording,
  isReturnShownOf,
  modelForRoute,
  playbackPhaseOf,
  shortcutContextOf,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

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
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
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
        text: `https://words.knophy.com/recording/${recordingID}/section/${sectionB.id}?t=19`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })

  it('copies a link to the current moment', () => {
    const at = run(ready, [HeardAudioPosition({ seconds: 42.7 })]).model
    const [, commands] = update(at, ClickedCopyMomentLink())
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.knophy.com/playback/${recordingID}?t=41`,
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
        recordings: [],
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
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
})

describe('searching the list', () => {
  const loaded = run(opened(RecordingListRoute()), [
    ObservedRecordings({
      recordings: [detail().summary],
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
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
