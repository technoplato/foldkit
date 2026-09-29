import { Array, Effect, Layer, Option, Ref, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { segmentIDOf, transcriptionIDOf } from '../ids.js'
import {
  AcquiredCaptureSession,
  ClickedPauseRecording,
  ClickedRetrySaveRecording,
  ClickedStartRecording,
  ClickedStopRecording,
  FailedAcquireCaptureSession,
  FailedSaveRecording,
  HeardCaptureEnded,
  HeardCaptureProgress,
  HeardTranscript,
  type Message,
  PreparedCapture,
  SucceededSaveRecording,
} from './message.js'
import {
  type CaptureDraft,
  type CapturedWord,
  type Model,
  emptyProgress,
  init,
} from './model.js'
import {
  applyTranscriptResult,
  settleOpenSegment,
  wordsJSONOf,
} from './segments.js'
import { CaptureEnvironment, CaptureSession } from './session.js'
import {
  type CaptureContext,
  PrepareCapture,
  SaveRecording,
  recordingTitleOf,
  update,
} from './update.js'
import {
  makeAcceptingRecordingWriter,
  webTranscriptionConfiguration,
} from './writer.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

const word = (
  text: string,
  startSeconds: number,
  maybeSpeaker: Option.Option<number> = Option.some(0),
): CapturedWord => ({
  text,
  startSeconds,
  endSeconds: startSeconds + 0.4,
  maybeSpeaker,
})

const draft: CaptureDraft = {
  recordingID,
  transcriptionID: 'transcription-1',
  ownerUserID: 'user-1',
  activityClientID: 'client-1',
  startedAtMs: 1_790_000_000_000,
  title: 'Recording 019 — Sep 28, 2026',
  deviceIcon: 'laptop',
  maybeBuildInfo: Option.none(),
}

const signedIn: CaptureContext = {
  maybeOwnerUserID: Option.some('user-1'),
  maybeNextTitleNumber: Option.some(19),
}

const run = (
  model: Model,
  messages: ReadonlyArray<Message>,
  context: CaptureContext = signedIn,
) =>
  Array.reduce(
    messages,
    {
      model,
      commandNames: Array.empty<string>(),
      outMessageTags: Array.empty<string>(),
    },
    (state, message) => {
      const [next, commands, maybeOutMessage] = update(
        state.model,
        message,
        context,
      )
      return {
        model: next,
        commandNames: [
          ...state.commandNames,
          ...commands.map(command => command.name),
        ],
        outMessageTags: [
          ...state.outMessageTags,
          ...Option.toArray(Option.map(maybeOutMessage, out => out._tag)),
        ],
      }
    },
  )

describe('sections, as the iPhone writes them', () => {
  it('opens a section on the first interim result and links it to the recording once', () => {
    const first = applyTranscriptResult(recordingID, emptyProgress(), {
      isFinal: false,
      words: [word('Hello', 0)],
    })
    expect(first.writes).toEqual([
      {
        id: segmentIDOf(recordingID, 0),
        index: 0,
        words: [word('Hello', 0)],
        isFinal: false,
        isFirstWrite: true,
      },
    ])

    const second = applyTranscriptResult(recordingID, first.progress, {
      isFinal: false,
      words: [word('Hello', 0), word('from', 0.5)],
    })
    expect(Array.map(second.writes, write => write.isFirstWrite)).toEqual([
      false,
    ])
  })

  it('settles the section under the same id, counts it, and opens the next one', () => {
    const interim = applyTranscriptResult(recordingID, emptyProgress(), {
      isFinal: false,
      words: [word('Hello', 0)],
    })
    const settled = applyTranscriptResult(recordingID, interim.progress, {
      isFinal: true,
      words: [word('Hello', 0), word('world.', 0.5, Option.some(1))],
    })
    expect(settled.writes).toEqual([
      {
        id: segmentIDOf(recordingID, 0),
        index: 0,
        words: [word('Hello', 0), word('world.', 0.5, Option.some(1))],
        isFinal: true,
        isFirstWrite: false,
      },
    ])
    expect(settled.progress.finalSegmentCount).toBe(1)
    expect(settled.progress.finalWordCount).toBe(2)
    expect(settled.progress.speakerIDs).toEqual([0, 1])

    const next = applyTranscriptResult(recordingID, settled.progress, {
      isFinal: false,
      words: [word('Next', 2)],
    })
    expect(Array.map(next.writes, write => [write.index, write.id])).toEqual([
      [1, segmentIDOf(recordingID, 1)],
    ])
  })

  it('writes a final result with no interim before it as one first write', () => {
    const settled = applyTranscriptResult(recordingID, emptyProgress(), {
      isFinal: true,
      words: [word('Quick', 0)],
    })
    expect(
      Array.map(settled.writes, write => [write.isFinal, write.isFirstWrite]),
    ).toEqual([[true, true]])
  })

  it('settles the open section with the words shown when the recording stops', () => {
    const interim = applyTranscriptResult(recordingID, emptyProgress(), {
      isFinal: false,
      words: [word('Almost', 0)],
    })
    const stopped = settleOpenSegment(recordingID, interim.progress)
    expect(
      Array.map(stopped.writes, write => [write.isFinal, write.words.length]),
    ).toEqual([[true, 1]])
    expect(settleOpenSegment(recordingID, stopped.progress).writes).toEqual([])
  })

  it('ignores an empty interim result', () => {
    expect(
      applyTranscriptResult(recordingID, emptyProgress(), {
        isFinal: false,
        words: [],
      }).writes,
    ).toEqual([])
  })

  it('stores words JSON exactly like the iPhone: sorted keys end, start, text', () => {
    expect(
      wordsJSONOf([
        {
          text: 'so',
          startSeconds: 12.48,
          endSeconds: 12.8,
          maybeSpeaker: Option.some(0),
        },
      ]),
    ).toBe('[{"end":12.8,"start":12.48,"text":"so"}]')
  })
})

describe('recording on the web', () => {
  it('asks the listener to sign in before recording', () => {
    const { model, commandNames } = run(init(), [ClickedStartRecording()], {
      maybeOwnerUserID: Option.none(),
      maybeNextTitleNumber: Option.some(1),
    })
    expect(model.state._tag).toBe('FailedStart')
    expect(commandNames).toEqual([])
  })

  it('waits for the recording list, so a title number is never reused', () => {
    const early = run(init(), [ClickedStartRecording()], {
      maybeOwnerUserID: Option.some('user-1'),
      maybeNextTitleNumber: Option.none(),
    })
    expect(early.model.state._tag).toBe('FailedStart')
    expect(early.commandNames).toEqual([])
  })

  it('writes nothing until the browser opens the microphone', () => {
    const refused = run(init(), [
      ClickedStartRecording(),
      PreparedCapture({ draft }),
      FailedAcquireCaptureSession({ reason: 'Permission denied' }),
    ])
    expect(refused.commandNames).toEqual(['PrepareCapture'])
    expect(refused.model.state._tag).toBe('FailedStart')
  })

  it('creates the recording once the microphone opens, then opens its page', () => {
    const started = run(init(), [
      ClickedStartRecording(),
      PreparedCapture({ draft }),
      AcquiredCaptureSession(),
    ])
    expect(started.model.state._tag).toBe('Capturing')
    expect(started.commandNames).toEqual(['PrepareCapture', 'CreateRecording'])
    expect(started.outMessageTags).toEqual(['StartedRecording'])
  })

  it('writes sections as they are heard and the length every five seconds', () => {
    const started = run(init(), [
      ClickedStartRecording(),
      PreparedCapture({ draft }),
      AcquiredCaptureSession(),
    ])
    const live = run(started.model, [
      HeardCaptureProgress({ recordedSeconds: 1.2, level: 0.4 }),
      HeardTranscript({
        result: { isFinal: false, words: [word('Hello', 0.2)] },
      }),
      HeardCaptureProgress({ recordedSeconds: 5.1, level: 0.3 }),
      HeardCaptureProgress({ recordedSeconds: 5.2, level: 0.3 }),
      HeardTranscript({
        result: { isFinal: true, words: [word('Hello', 0.2)] },
      }),
      ClickedPauseRecording(),
    ])
    expect(live.commandNames).toEqual([
      'WriteSegment',
      'WriteDuration',
      'WriteSegment',
      'PauseCapture',
    ])
  })

  it('finishes the transcript, settles the open section, and saves', () => {
    const started = run(init(), [
      ClickedStartRecording(),
      PreparedCapture({ draft }),
      AcquiredCaptureSession(),
      HeardTranscript({
        result: { isFinal: false, words: [word('Last', 3)] },
      }),
    ])
    const stopping = run(started.model, [ClickedStopRecording()])
    expect(stopping.model.state._tag).toBe('StoppingCapture')
    expect(stopping.commandNames).toEqual(['RequestFinishCapture'])

    const saving = run(stopping.model, [
      HeardCaptureEnded({ recordedSeconds: 4.5 }),
    ])
    expect(saving.commandNames).toEqual(['SaveRecording'])
    if (saving.model.state._tag !== 'SavingCapture') {
      throw new Error(`Expected SavingCapture, got ${saving.model.state._tag}`)
    }
    expect(saving.model.state.save.durationSeconds).toBe(4.5)
    expect(
      Option.map(
        saving.model.state.save.maybeFinalWrite,
        write => write.isFinal,
      ),
    ).toEqual(Option.some(true))

    const saved = run(saving.model, [SucceededSaveRecording({ byteCount: 10 })])
    expect(saved.model.state._tag).toBe('NotCapturing')
    expect(saved.outMessageTags).toEqual(['SavedRecording'])
  })

  it('keeps the audio after a failed save so the save can be retried', () => {
    const saving = run(init(), [
      ClickedStartRecording(),
      PreparedCapture({ draft }),
      AcquiredCaptureSession(),
      ClickedStopRecording(),
      HeardCaptureEnded({ recordedSeconds: 2 }),
    ])
    const failed = run(saving.model, [
      FailedSaveRecording({ reason: 'UploadAudio: offline' }),
    ])
    expect(failed.model.state._tag).toBe('FailedSave')
    expect(
      run(failed.model, [ClickedRetrySaveRecording()]).commandNames,
    ).toEqual(['SaveRecording'])
  })
})

describe('recorder Commands', () => {
  const environment = Layer.succeed(CaptureEnvironment, {
    now: Effect.succeed(1_790_000_000_000),
    newRecordingID: Effect.succeed(recordingID),
    deviceIcon: Effect.succeed('laptop'),
    titleDateLabel: () => Effect.succeed('Sep 28, 2026'),
    maybeBuildInfo: Effect.succeed(Option.none()),
    guardPageClose: Stream.empty,
  })

  it('titles a web recording like the iPhone and derives its transcription id', async () => {
    const result = await Effect.runPromise(
      PrepareCapture({ ownerUserID: 'user-1', titleNumber: 19 }).effect.pipe(
        Effect.provide(
          Layer.merge(environment, makeAcceptingRecordingWriter()),
        ),
      ),
    )
    if (result._tag !== 'PreparedCapture') {
      throw new Error(`Expected PreparedCapture, got ${result._tag}`)
    }
    expect(result.draft.title).toBe('Recording 019 — Sep 28, 2026')
    expect(result.draft.transcriptionID).toBe(
      transcriptionIDOf(
        recordingID,
        'Deepgram',
        'default',
        webTranscriptionConfiguration,
      ),
    )
    expect(recordingTitleOf(7, 'Oct 1, 2026')).toBe(
      'Recording 007 — Oct 1, 2026',
    )
  })

  it('saves the last section and the WAV the session recorded', async () => {
    const written: Array<string> = []
    const wav = new Blob([new Uint8Array(44 + 32)], { type: 'audio/wav' })
    const session = Layer.effect(
      CaptureSession._tag,
      Ref.make(
        Option.some({
          events: Stream.empty,
          pause: Effect.void,
          resume: Effect.void,
          finish: Effect.void,
          recordedAudio: Effect.succeed({ wav, durationSeconds: 1 }),
          close: Effect.void,
        }),
      ),
    )
    const result = await Effect.runPromise(
      SaveRecording({
        draft,
        save: {
          durationSeconds: 1,
          maybeFinalWrite: Option.none(),
          counts: { segmentCount: 0, wordCount: 0, speakerIDs: [] },
          isKeepingAudio: true,
        },
      }).effect.pipe(
        Effect.provide(
          Layer.merge(session, makeAcceptingRecordingWriter(written)),
        ),
      ),
    )
    expect(result).toEqual(SucceededSaveRecording({ byteCount: wav.size }))
    expect(written).toEqual(['saveRecording 1'])
  })
})
