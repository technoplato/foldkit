# Plan 01a | The dictation CLI, grounded in Scribe

Status: Proposed. Companion to `plans/01-terminal-runtime.md`, which quotes
this plan's Model instead of restating it. Revised after adversarial rounds 1
to 4 (R2-02, R2-26, R2-31, R2-41, R3-01, R3-06, R3-16, R4-04, R4-06,
R4-18). Facts about Scribe come from reading
branch `agent/claude-opus-5.5/integration-2026-09-27` of
`~/Development/instant-scribe-verification/scribe` (tip `705b80f8`,
2026-10-03) without checking it out. The reverse-domain id spelled out in the
dictated message is Scribe's iOS bundle id (ending `scribesharedios`), not a
domain; its `.dev` variant is the Debug build. The web host is
`words.knophy.com`. Scribe's production Instant app is `e7c49961`; examples
write to the dev app (plan 06, decision 2) unless the owner says otherwise.

`examples/dictate` is new, not a rename: `examples/transcribe` publishes
transcript jobs for videos and `examples/transcript-player` plays a finished
transcript; neither captures a microphone.

## What Scribe does that `examples/dictate` must do

| Concern           | Scribe (Swift)                                                                                                                                                                                                              | `examples/dictate` (Foldkit)                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microphone        | `AudioCaptureClient.startCapture` streams 48 kHz mono PCM; `audioLevel`; `stopCapture`                                                                                                                                      | `Microphone` ManagedResource (`holdsDaemon`) provided by a host Layer; `audioLevels` Subscription                                                                                                                                                                                                                |
| Permission        | iOS prompts the app; the app is the responsible process                                                                                                                                                                     | `permission: Unknown \| Granted \| Denied({ since }) \| Restricted` in the Model, asked by a Command, answered by a fact; the capture helper is a signed `.app` with `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`, launched as its own responsible process                           |
| Silence           | No app-side voice detection; the engine ends utterances (Deepgram `endpointing=300`, Apple finalizes on silence, forced roll at 30 s); a silent mic is rebuilt up to 3 times                                                | The engine decides; `HeardSilence` is a fact that triggers the same rebuild Command                                                                                                                                                                                                                              |
| Engines           | `SpeechRecognitionProvider`: `appleSpeechAnalyzer` (on-device, default), `deepgram` (nova-3 WebSocket). No Whisper in Sources                                                                                               | `Recognizer` ManagedResource (`holdsDaemon`) with two host Layers: `AppleSpeech` (the signed helper) and `Deepgram` (a WebSocket from Node with a server-held key). Whisper is out of scope until Scribe ships it                                                                                                |
| Partial and final | One `RecognizedSection { id, words, speaker, startTime, endTime, isFinal }`; a partial is revised under its id until final; the stream is pull-driven and waits for `acknowledgeFinalTranscript`                            | `live: Option<LiveSegment>` (DeviceOwned) is revised by `HeardPartial`; `HeardFinal` appends a `Final` to the session (Domain); `reconcile` clears `live` once the segment it shows is in the session (plan 02); `update` on `HeardFinal` returns `AcknowledgeFinal({ segmentId })`, a Command on the Recognizer |
| Persistence       | `audio.wav` on disk; sections through a durability save queue into Instant SQLite then the server; audio uploaded to `$files` as `scribe/<id>/generation-<ms>/audio.wav`                                                    | `Final` segments are Domain facts on the log; a Projection (plan 06) folds them and writes Scribe's `recordings`, `transcriptions`, `transcriptionSegments` rows through typed table handles; audio upload is a Command with a fact                                                                              |
| Interruptions     | Never pause; open a capture gap and recover on a signal with 0, 1, 2, 4, 8 s backoff; after a kill, the next launch reopens `audio.wav` and continues                                                                       | `Listening({ maybeGap: Option<CaptureGap> })`; recovery is a Subscription gated by the gap; the daemon survives the view, so a kill means `dictate start` again                                                                                                                                                  |
| Sharing           | `recordingSegmentShares` (visibility `people` or `link`, `linkToken`), `shareRecipients`                                                                                                                                    | `Share` is a Fill `{ from, to }` over segment ids; the link is on `words.knophy.com`                                                                                                                                                                                                                             |
| Remote control    | `@RemoteControl` lists actions from the `Action` enum; WebSocket collector on 8767 speaks `agent.hello`, `agent.command`, `agent.result`, `agent.transition`; `scripts/scribe-agent-control sessions\|actions\|state\|send` | The terminal protocol v2 (`Hello`, `Do`, `Applied`, `Event`) is the same shape. Plan 09 makes it one protocol                                                                                                                                                                                                    |
| Observation       | `scribe logs --follow`, `debugLogs` entity, JSONL capture telemetry, `observe-transcription-segments.mjs` with `@instantdb/admin`                                                                                           | `dictate tail`, `dictate daemon status`, telemetry files                                                                                                                                                                                                                                                         |

Scribe's own CLI (`Sources/ScribeCLI`) has `record` (with `--pipe`, `--say`,
`--sync-instant`), `replay`, `logs --follow`, `health`, `sync-probe`, and
`route-probe`; `list` and `export` print "Not yet implemented"; `record`
builds `SpeechConfig()` whose provider defaults to Apple while demanding a
Deepgram key, so it likely runs Apple Speech under a Deepgram label (not
tested here). The Foldkit version derives every command from the Catalog, so
the gap between "the app can" and "the CLI can" cannot open.

## Actions, in Scribe's words

Ownership decides the category (plan 02): an Action that writes only the
device's `recorder` is Local and never logged; the fact its Command produces
is Domain and is what the log records.

| Scribe verb                                             | `dictate` Action                                                            | Kind, category                   | At                          | Writes                | Produces (Domain fact)          |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- | --------------------------- | --------------------- | ------------------------------- |
| New Recording ("Brainstorm" intent)                     | `Start`                                                                     | Press, Local, mints `sessionId`  | `Library`                   | `recorder`            | `StartedSession({ sessionId })` |
| Pause Recording                                         | `Pause`                                                                     | Press, Local                     | `Session`                   | `recorder`            | `PausedSession`                 |
| Resume Recording                                        | `Resume`                                                                    | Press, Local                     | `Session`                   | `recorder`            | `ResumedSession`                |
| Stop Recording                                          | `Stop`                                                                      | Press, Local                     | `Session`                   | `recorder`            | `StoppedSession`                |
| Try Again                                               | `RestartMicrophone`                                                         | Press, Local                     | `Session`                   | `recorder`            |                                 |
| Change title                                            | `Rename`                                                                    | Fill, Domain                     | `Session`, `Library`        | `sessions[].title`    |                                 |
| Rename speaker                                          | `RenameSpeaker`                                                             | Fill, Domain                     | `Session`                   | `sessions[].speakers` |                                 |
| Copy Transcript (Markdown, Plain, SRT, since last copy) | `Copy`                                                                      | Choose (`format`), Local         | `Session`                   | `copies`              |                                 |
| Share Sections…                                         | `Share`                                                                     | Fill `{ from, to }`, Domain      | `Session`                   | `shares`              |                                 |
| Delete (to Recently Deleted)                            | `Delete`, `Confirm`, `Cancel`                                               | Choose, Press, Press, Navigation | `Library`, `DeleteQuestion` | `navigation`          | `DeletedSession({ sessionId })` |
| Search Recordings                                       | `Search`                                                                    | Fill, Local                      | `Library`                   | `query`               |                                 |
| Play / Pause Playback, ±15 s                            | out of scope for the first cut (needs the `AudioPlayer` service from Books) |                                  |                             |                       |                                 |

Facts the resources and Commands report, declared with `Fact.define` and
named verb-first in the past tense: `StartedSession`, `PausedSession`,
`ResumedSession`, `StoppedSession`, `DeletedSession`, `HeardLevel` (writes
`recorder`, Local), `HeardPartial` (writes `live`, Local), `HeardFinal`
(writes `sessions[].segments`, Domain; `live` is cleared by the Program's
`reconcile` step once the segment is in the session, never by a Domain arm,
R3-01), `AcknowledgedFinal` (Local), `HeardSilence` (Local), `OpenedCaptureGap`
(Local), `ClosedCaptureGap` (Local), `FailedMicrophone` (Local),
`FailedRecognizer` (Local), `AnsweredPermission` (Local), `UploadedAudio`
(Domain).

## Model, as a sum of states

```ts
export const Permission = S.Union([
  Unknown(),
  Granted(),
  Denied({ since: Millis }),
  Restricted(),
])

export const Recorder = S.Union([
  Idle(),
  Listening({
    sessionId: SessionId,
    since: Millis,
    level: Level,
    maybeGap: S.Option(CaptureGap),
  }),
  Paused({ sessionId: SessionId, since: Millis }),
  Finishing({ sessionId: SessionId, awaiting: S.Int }), // finals still to acknowledge
])

export const CaptureGap = S.Struct({
  since: Millis,
  attempt: S.Int,
  because: GapCause,
})
export const GapCause = S.Literals([
  'Interrupted',
  'MediaServicesReset',
  'SilentMicrophone',
  'Background',
])

export const LiveSegment = S.Struct({
  segmentId: SegmentId,
  words: S.Array(Word),
  speaker: Speaker,
  startedAt: Millis,
})
export const Final = S.Struct({
  segmentId: SegmentId,
  words: S.Array(Word),
  speaker: Speaker,
  startedAt: Millis,
  endedAt: Millis,
})

export const Session = S.Struct({
  sessionId: SessionId,
  title: Title,
  speakers: Keyed.array(Speaker, 'speakerId'),
  segments: Keyed.array(Final, 'segmentId'),
  startedAt: Millis,
})

const Fields = S.Struct({
  permission: Permission,
  recorder: Recorder,
  live: S.Option(LiveSegment),
  sessions: Keyed.array(Session, 'sessionId'),
  copies: Keyed.array(Copy, 'copyId'),
  shares: Keyed.array(Share, 'shareId'),
  query: Query,
  navigation: Navigation.NavigationStack(Destination),
})

export const Model = Ownership.declare(Fields, {
  deviceOwned: ['permission', 'recorder', 'live', 'copies', 'query'],
  navigation: ['navigation'],
})
```

Scribe still holds six lifecycle booleans in `Recording.swift`
(`hasStartedCapturePipeline`, `isPipelineTeardownInFlight`,
`speechTranscriptStreamFinished`, `hasCompletedLocalStopDrain`,
`isTranscriptSessionCleanupInFlight`, `isSavingBehind`). `Recorder` above
replaces them with one sum; `Finishing({ awaiting })` is the drain.

The live partial transcript lives in `live`, a device-owned field, so a
refold or a peer's row never erases what this device is hearing (R2-02);
`sessions` holds only finals.

## Why this needs the daemon

`dictate start` returns at once. The microphone, the recognizer session, and
the acknowledgement loop keep running in the daemon. `dictate tail` in a
second terminal prints each `HeardFinal` with its change lines as it lands.
`dictate stop` moves the recorder to `Finishing`, the recognizer flushes, the
last finals land and are acknowledged, `StoppedSession` is logged, the
resources release, liveness goes `Idle`, and the daemon exits after the
grace. A one-shot process would have killed the microphone the moment `start`
printed.

## What a spike must prove before this plan is accepted

1. A detached Node daemon can launch a signed capture helper that is its own
   responsible process, so macOS attributes the microphone permission to it,
   and the Program sees `Denied` as a fact instead of silent buffers.
2. Apple Speech from that helper and Deepgram from Node both deliver partials
   and finals through the Recognizer service with the acknowledgment Command.
3. The Projection writes Scribe's dev tables from two devices without a
   duplicate or a reorder, with the settle window of plan 06, upserts keyed
   by segment id, which is the Projection's whole fence, since Scribe's rows
   carry no epoch and no shared-schema change is asked for one (R3-06,
   R4-06).

## Interoperating with Scribe

The Program's truth is its Message log; Scribe reads entity tables. The
Projection in plan 06, run by one leased server Processor, writes Scribe's
rows from Domain facts, so a session dictated from the terminal shows up in
the Scribe app and on `words.knophy.com` without Scribe learning Foldkit's
log. The reverse (a Scribe recording appearing in `dictate`) is a `serverOnly`
Subscription over Scribe's entities that emits facts, so it has one writer.
Both are server work, so `DictateApp` declares `server: Server.needed` (plan
06, R4-18), and the App signs in as a person (`Identity.interactive`) so its
rows have an owner on a shared engine (R4-04). Writing only entities and
dropping the Message log loses `tail`, replay, and the static graph, so it is
not proposed.
