import { Array, Option } from 'effect'
import { Scene } from 'foldkit'
import { passageMenuMount, transcriptMount } from 'foldkit/renderers/html'
import { describe, test } from 'vitest'
import {
  AcquiredAudioPlayer,
  ChangedPlayheadVisibility,
  ClosedSectionMenu,
  CompletedRunPlaybackClock,
  CopyText,
  ElapsedCopyNotice,
  HideCopyNoticeLater,
  type Message,
  type Model,
  ObservedFileUrls,
  ObservedRecording,
  OpenedSectionMenu,
  type RecordingDetail,
  RecordingRoute,
  type Section,
  StoredAudio,
  SucceededCopy,
  modelForRoute,
  update,
} from 'words-core-example'

import { ObserveFollowedSection, RunSpokenWord } from '../mount.js'
import { transcript } from './transcript.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// Made-up words: nothing here is from a real recording.
const sectionOf = (
  index: number,
  startSeconds: number,
  texts: ReadonlyArray<string>,
): Section => ({
  id: `section-${index.toString()}`,
  index,
  startSeconds,
  endSeconds: startSeconds + texts.length * 0.5,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `section-${index.toString()}:${at.toString()}`,
    text,
    startSeconds: startSeconds + at * 0.5,
    endSeconds: startSeconds + at * 0.5 + 0.4,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const detail: RecordingDetail = {
  summary: {
    id: recordingID,
    title: 'The Lantern Keeper',
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
  sections: [
    sectionOf(0, 5, ['The', 'keeper', 'lit', 'the', 'lamp.']),
    { ...sectionOf(1, 12, []), maybeWordsSeal: Option.some('Voice') },
  ],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const openedWith = (messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    [
      ObservedRecording({
        recordingID,
        maybeDetail: Option.some(detail),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
      }),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
      AcquiredAudioPlayer(),
      ...messages,
    ],
    modelForRoute(RecordingRoute({ recordingID })),
    (model: Model, message: Message) => update(model, message)[0],
  )

const transcriptView = (model: Model) => {
  if (model.playback._tag === 'ReadyPlayback') {
    return transcript(model.playback, false, false)
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

// NOTE: the edge only reads the page and tells the Model nothing here;
// each Mount is answered with a Message that changes nothing.
const edgeStarted = Scene.Mount.resolveAll(
  [RunSpokenWord, CompletedRunPlaybackClock()],
  [
    ObserveFollowedSection,
    ChangedPlayheadVisibility({
      sectionID: 'section-0',
      visibility: 'OnScreen',
    }),
  ],
  [transcriptMount<Message>(), CompletedRunPlaybackClock()],
)

const copiedNotice = { text: 'Copied text', isFailure: false, revision: 1 }

const passageMenu = passageMenuMount<Message>('section-0', ClosedSectionMenu())

describe('the words page paints the shared reader (#2494)', () => {
  test('each section is a passage with its time, words that say when they start, and a sealed line as a placeholder', () => {
    Scene.scene(
      { update, view: transcriptView },
      Scene.with(openedWith([])),
      edgeStarted,
      Scene.expect(
        Scene.selector('.fk-passage[data-key="section-0"]'),
      ).toExist(),
      Scene.expect(
        Scene.selector(
          '.fk-word[data-token="section-0:1"][data-start-ms="5500"]',
        ),
      ).toExist(),
      Scene.expect(
        Scene.selector('[data-press="OpenedSectionMenu:section-1"]'),
      ).toExist(),
      Scene.expect(Scene.selector('.fk-passage-sealed')).toExist(),
      Scene.expect(Scene.text('[sealed]')).toExist(),
    )
  })

  test('draws the section menu the Model holds open, and choosing from it closes it', () => {
    Scene.scene(
      { update, view: transcriptView },
      Scene.with(openedWith([OpenedSectionMenu({ sectionID: 'section-0' })])),
      edgeStarted,
      Scene.Mount.resolve(passageMenu, CompletedRunPlaybackClock()),
      Scene.expect(Scene.role('menu', { name: 'Section at 0:05' })).toExist(),
      Scene.expect(Scene.text('Copy Link to This Moment')).toExist(),
      Scene.click(Scene.text('Copy Text')),
      Scene.Command.resolveAll(
        [CopyText, SucceededCopy({ notice: copiedNotice })],
        [HideCopyNoticeLater, ElapsedCopyNotice({ revision: 1 })],
      ),
      Scene.Mount.expectEnded(passageMenu),
      Scene.expect(Scene.role('menu')).not.toExist(),
    )
  })
})
