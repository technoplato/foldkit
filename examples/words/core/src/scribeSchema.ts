// Docs: https://www.instantdb.com/docs/modeling-data
import { i } from '@instantdb/core'

type SharedSpeaker = {
  id: number
  displayName?: string
  source?:
    | { microphone: Record<string, never> }
    | { systemAudio: { _0: SharedSystemAudioContext } }
}

type SharedSystemAudioContext = {
  platform: 'iPhone' | 'mac' | 'unknown'
  appBundleIdentifier?: string
  appDisplayName?: string
}

type SharedRecognizedWord = {
  id: string
  text: string
  start: number
  end: number
  speaker?: number
}

type SharedRecognizedSection = {
  id: string
  words: SharedRecognizedWord[]
  speaker?: number
  startTime: number
  endTime: number
  isFinal: boolean
}

type SharedClipboardEntry = {
  id: string
  timestamp: number
  truncatedContent: string
  fullContent: string
}

type SharedImageEntry = {
  analysisCaptureContext?: SharedImageCaptureContext
  id: string
  timestamp: number
  fileURL: string
  embeddedDataBase64?: string
  pathExtension?: string
}

type SharedImageSegmentRange = {
  recordingID: string
  firstSegmentID: string
  lastSegmentID: string
  firstSegmentIndex: number
  lastSegmentIndex: number
}

type SharedCapturedApplication = { context: SharedSystemAudioContext }

type SharedVisibleTranscriptEvidence =
  | { noVisibleSegments: Record<string, never> }
  | { range: { _0: SharedImageSegmentRange } }

type SharedReplayKitImageEvidence =
  | { applicationUnavailable: { capturedAtMs: number } }
  | {
      otherApplication: {
        _0: SharedCapturedApplication
        capturedAtMs: number
      }
    }
  | {
      scribe: {
        _0: SharedCapturedApplication
        visibleTranscript: SharedVisibleTranscriptEvidence
        capturedAtMs: number
      }
    }

type SharedImageCaptureContext =
  | {
      notReplayKit: {
        _0:
          | 'clipboardScreenshot'
          | 'droppedFile'
          | 'photoLibrary'
          | 'unknown'
          | 'watchedDirectory'
      }
    }
  | { replayKit: { _0: SharedReplayKitImageEvidence } }

type SharedLinkEntry = {
  id: string
  timestamp: number
  url: string
  title?: string
}

type SharedSystemAudioContextEntry = {
  id: string
  timestamp: number
  context: SharedSystemAudioContext
}

type SharedTimelineEntry =
  | { section: SharedRecognizedSection }
  | { clipboard: SharedClipboardEntry }
  | { image: SharedImageEntry }
  | { link: SharedLinkEntry }
  | { systemAudioContext: SharedSystemAudioContextEntry }

type StoredShortcut = {
  key: string
  command: boolean
  shift: boolean
  option: boolean
  control: boolean
}

type WatchedDirectory = {
  id: string
  title: string
  path: string
  isEnabled: boolean
}

type SharedRealtimeTranscriptionConfiguration = {
  sampleRate: number
  channels: number
  language: string
  diarizationEnabled: boolean
}

type ScribeBuildInfo = {
  branch: string
  builtAtDisplayString?: string
  builtAtISO8601: string
  commit: string
  worktree: string
}

type SharedRecordingMediaAsset = {
  id: string
  kind: 'audio' | 'image'
  streamID?: string
  streamClientID?: string
  storageFileID?: string
  storageName?: string
  contentType?: string
  byteCount: number
  timestampSeconds?: number
  fileExtension: string
}

type SharedRecordingLocation = {
  latitude: number
  longitude: number
  horizontalAccuracy: number
  capturedAt: number
}

// How one member of an account link signed in, recorded by the device that linked it (ADR 0024).
type AccountLinkMember = {
  // How the device that linked this member saw it sign in; absent when it could not tell.
  provider?: 'apple' | 'google' | 'magicCode' | 'guest' | 'refreshToken'
  linkedAtMs: number
  deviceName?: string
}

const _schema = i.schema({
  entities: {
    $users: i.entity({}),
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    debugLogs: i.entity({
      timestampMs: i.number().indexed(),
      timestampLocal: i.string().optional(),
      level: i.string().indexed(),
      subsystem: i.string(),
      category: i.string().indexed(),
      name: i.string().indexed(),
      message: i.string(),
      metadataJSON: i.string(),
      sessionID: i.string().indexed(),
      platform: i.string().indexed(),
      deviceName: i.string(),
      appVersion: i.string(),
      buildCommit: i.string(),
      buildBranch: i.string().indexed().optional(),
      buildIsDirty: i.boolean().indexed().optional(),
      contributingPathsJSON: i.string().optional(),
      issueReferencesJSON: i.string().optional(),
      projectName: i.string().indexed().optional(),
      fileID: i.string(),
      function: i.string(),
      sourceLine: i.number(),
    }),
    sharedRecordings: i.entity({
      title: i.string().indexed(),
      buildInfo: i.json<ScribeBuildInfo>().optional(),
      transcriptText: i.string().optional(),
      createdAtMs: i.number().indexed(),
      durationSeconds: i.number(),
      audioFileURL: i.string().optional(),
      location: i.json<SharedRecordingLocation>().optional(),
      locationRoute: i.json<SharedRecordingLocation[]>().optional(),
      speakers: i.json<SharedSpeaker[]>(),
      timeline: i.json<SharedTimelineEntry[]>(),
      updatedAtMs: i.number().indexed(),
    }),
    // One row per account (scope "user:<id>", ADR 0005 amendment). Builds up to 68 wrote one row, scope
    // "default", that every user shared; the rules keep it write-only for them.
    sharedSettings: i.entity({
      scope: i.string().unique().indexed(),
      ownerUserID: i.string().indexed().optional(),
      copyMarkdownShortcut: i.json<StoredShortcut>(),
      copyPlainTextShortcut: i.json<StoredShortcut>(),
      copySinceLastCopyShortcut: i.json<StoredShortcut>(),
      copySRTShortcut: i.json<StoredShortcut>(),
      watchedDirectories: i.json<WatchedDirectory[]>(),
      updatedAtMs: i.number().indexed(),
    }),
    recordings: i.entity({
      title: i.string().indexed(),
      buildInfo: i.json<ScribeBuildInfo>().optional(),
      // Optional until legacy rows are backfilled; new writes always stamp it.
      ownerUserID: i.string().indexed().optional(),
      // Device-kind icon (phone/tablet/laptop/…) stamped at create time.
      // Optional until legacy rows are backfilled; new writes always stamp it.
      deviceIcon: i.string().optional(),
      startedAtMs: i.number().indexed(),
      durationSeconds: i.number(),
      audioFileURL: i.string().optional(),
      location: i.json<SharedRecordingLocation>().optional(),
      locationRoute: i.json<SharedRecordingLocation[]>().optional(),
      clipboardEntries: i.json<SharedClipboardEntry[]>().optional(),
      speakers: i.json<SharedSpeaker[]>().optional(),
      systemAudioContextEntries: i
        .json<SharedSystemAudioContextEntry[]>()
        .optional(),
      media: i.json<SharedRecordingMediaAsset[]>().optional(),
      // Product activity ADT (ADR 0015 / #155): kind + Instant client id.
      // Idle = both absent. Kind raw values: "active" | "playback".
      activityKind: i.string().optional(),
      activityClientID: i.string().optional(),
      // ADR 0034: the stretches the recording clock waited (pauses, microphone outages, capture restarts, the app closed), a JSON array of {cause, endedAtMs?, holder?, id, offsetSeconds, startedAtMs}; readers map a recording-clock offset to the wall clock through it.
      captureGapsJSON: i.string().optional(),
      // ADR 0038 (#430): when the recording moved to Recently Deleted; absent while it is in the list. Only a manager sets or clears it.
      deletedAtMs: i.number().indexed().optional(),
      updatedAtMs: i.number().indexed(),
      // @generated-begin live-room-attributes: scripts/schema/generate.ts writes this part from scripts/schema/live-room-schema.ts (ADR 0094).
      // ADR 0094 (#1097): the live recording's room id, a random lowercase UUID its recording device sets once.
      // The room the recording device publishes its 5 s beat in; set once, read by managers only.
      liveRoomKey: i.string().optional(),
      // @generated-end live-room-attributes
    }),
    recordingTitleSequences: i.entity({
      scope: i.string().unique().indexed(),
      highWater: i.number(),
      lastReservationID: i.string().optional(),
    }),
    recordingAttachments: i.entity({
      analysisCaptureContextJSON: i.string().optional(),
      // Optional until legacy rows are backfilled; new writes always stamp it.
      ownerUserID: i.string().indexed().optional(),
      recordingID: i.string().indexed(),
      kind: i.string().indexed(),
      // Optional only for rows written before lifecycle-scoped media identities shipped.
      // Every new Scribe write stamps this immutable recording-generation key.
      lifecycleID: i.string().indexed().optional(),
      timestampSeconds: i.number().optional(),
      fileExtension: i.string().indexed(),
      contentType: i.string().optional(),
      byteCount: i.number(),
      streamID: i.string().optional(),
      streamClientID: i.string().optional(),
      storageFileID: i.string().optional(),
      storageName: i.string().optional(),
      // ADR 0034: when the image or file was captured, by the wall clock; timestampSeconds stays on the recording clock.
      capturedAtMs: i.number().optional(),
      updatedAtMs: i.number().indexed(),
    }),
    // #083: bounded, append-only route storage. Active capture rewrites only one
    // open chunk; sealed/terminal chunks are immutable causal history.
    recordingRouteChunks: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      formatVersion: i.number(),
      chunkKey: i.string().unique().indexed(),
      chunkIndex: i.number().indexed(),
      firstSampleIndex: i.number(),
      sampleCount: i.number(),
      samplesJSON: i.string(),
      lifecycle: i.string().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // #440 (ADR 0036, sounds): one sustained sound the recording's device heard with Apple's on-device classifier,
    // such as a vacuum or running water. Typed, so the graph can ask for every vacuum across recordings.
    recordingSounds: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      formatVersion: i.number(),
      // The classifier's identifier, for example "vacuum_cleaner" (SoundAnalysis, version1).
      soundClass: i.string().indexed(),
      // Which classifier heard it: "version1".
      classifier: i.string(),
      // Seconds into the recording at the first confident window's start and the last one's end.
      startOffsetSeconds: i.number().indexed(),
      endOffsetSeconds: i.number(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number(),
      peakConfidence: i.number(),
      averageConfidence: i.number(),
      windowCount: i.number(),
      // True while the sound lasts; it only ever turns false.
      isOngoing: i.boolean(),
      updatedAtMs: i.number().indexed(),
    }),
    // #533 (docs/plans/live-audio-upload.md): one stretch of a recording's audio.wav, uploaded while the recording runs
    // so the Mac has the audio before Stop. A chunk is a contiguous range of the WAV's PCM data, normally 60 s; its file
    // is a standalone WAV at storageName. Only the recording's owners read or write it: a chunk is the whole recording's
    // audio, and a share recipient hears only the share's clip.
    recordingAudioChunks: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The recording generation, as attachments carry it.
      lifecycleID: i.string().indexed(),
      // 0, 1, 2, ... in startByte order.
      chunkIndex: i.number().indexed(),
      // Offset into the WAV's PCM data, and the PCM bytes in this chunk (the file adds a 44-byte header).
      startByte: i.number(),
      byteCount: i.number(),
      // Recording clock: startByte / (sampleRate * 2 * channelCount).
      startSeconds: i.number().indexed(),
      endSeconds: i.number(),
      sampleRate: i.number(),
      channelCount: i.number(),
      // Lowercase hex SHA-256 of the PCM bytes, so the Mac checks what it assembles.
      sha256: i.string(),
      // Why the chunk closed: "interval" | "share" | "stop".
      reason: i.string(),
      // scribe/<recording>/<generation>/audio-chunks/<chunkIndex, 6 digits>.wav
      storageName: i.string(),
      // Nil until the upload links it.
      storageFileID: i.string().optional(),
      // When a link or share first covered this chunk; such a chunk uploads at once on any network.
      sharedAtMs: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0017 and ADR 0036 (#368 #406): one row per runtime event on a recording's timeline (devices,
    // power, network, broadcasts, in-app moments, recognized songs, the weather). Rows are immutable after
    // create, except a song heard again (its payload gains a hearing) and a linked-guest merge (only
    // ownerUserID moves).
    recordingRuntimeEvents: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      formatVersion: i.number(),
      // RuntimeEvent.Kind's stable raw value (Swift), for example "audioRoute", "song", "weather".
      kind: i.string().indexed(),
      // Seconds into the recording: the clock playback, sections, and route points use.
      timestampSeconds: i.number().indexed(),
      capturedAtMs: i.number().indexed(),
      // The typed event (RuntimeEventEntry.event), JSON-encoded, at most 8 KiB.
      payloadJSON: i.string(),
      // An end's link to its start (RuntimeEventEntry.span). Absent for starts, moments, and ends whose
      // start came before the recording.
      spanStartID: i.string().optional(),
      spanDurationSeconds: i.number().optional(),
      updatedAtMs: i.number().indexed(),
      // @generated-begin context-events-attributes: scripts/schema/generate.ts writes this part from scripts/schema/context-events-schema.ts (ADR 0076).
      // ADR 0076 (#714): the device that wrote the row; absent on the recording device's rows written before it.
      // iphone, ipad, mac, watch, or vision.
      device: i.string().optional(),
      // @generated-end context-events-attributes
    }),
    // ADR 0044 (#478) and ADR 0048 (books, #551): one row per owner and real-world thing, the node a recording's moments
    // link to. ADR 0044 writes kind "video" with key "youtube:<11-char video id>" (case kept); the row id is a version-5
    // style UUID from SHA-256 of "scribe-thing|<ownerUserID lowercased>|<key as is>". ownerUserID is the recording
    // owner's. Every active thing keeps at least one live link back to a recording moment (a listening span, a
    // comment, or a recognition). Attributes as ADR 0048 section 5 drafts them.
    things: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      kind: i.string().indexed(),
      key: i.string().indexed(),
      // "catalog" for a thing found in a catalog (YouTube's own record of the video).
      identification: i.string().indexed(),
      title: i.string().optional(),
      // For a video: the channel's name.
      subtitle: i.string().optional(),
      imageURL: i.string().optional(),
      url: i.string().optional(),
      siteName: i.string().optional(),
      summary: i.string().optional(),
      // For a video: {"youtubeVideo": "<id>"}.
      externalIDsJSON: i.string().optional(),
      // For a video: {"channelName", "channelID", "durationSeconds", "license"}.
      metadataJSON: i.string().optional(),
      // "active" | "merged"
      status: i.string().indexed(),
      mergedIntoThingID: i.string().optional(),
      firstRecognizedAtMs: i.number().indexed(),
      lastRecognizedAtMs: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // ADR 0048 Amendment 2 (#613, Recording 208 #857: "where we discovered the book"): the moment that first brought
      // the thing up, pinned to the discovery link. Absent on rows written before it.
      discoveryRecognitionID: i.string().optional(),
      // Amendment 2 (Recording 208 #1018-1019: "...I also want all this to be private to me."): "world" | "personal";
      // absent means world. Personal rows (his own people, his items) are read by his own sign-ins only. Never changes.
      scope: i.string().indexed().optional(),
    }),
    // ADR 0044: one row per listening span and recording: one continuous play of one video, in both clocks. The start
    // creates the row; the end sets endSeconds, videoEndSeconds, endedAtMs, and endReason once.
    youtubeListens: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      videoID: i.string().indexed(),
      formatVersion: i.number(),
      title: i.string().optional(),
      channelName: i.string().optional(),
      startSeconds: i.number(),
      endSeconds: i.number().optional(),
      videoStartSeconds: i.number(),
      videoEndSeconds: i.number().optional(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      playbackRate: i.number(),
      // "safari", or the system-audio app's bundle id (com.google.ios.youtube).
      player: i.string(),
      // "safari" (the tab said) | "alignment" (the recording's words matched the video's).
      source: i.string().indexed(),
      confidence: i.number().optional(),
      endReason: i.string().optional(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0044: one row per comment Michael asked for. Status moves forward only: awaitingConfirmation, then confirmed or
    // cancelled; confirmed, then posting; posting, then posted, failed, or publicationUnknown; posted, then deleted (or
    // deleteRequested by a device, then deleted by the Mac once YouTube deleted it); a failed comment may be confirmed
    // again. Private to the owner until it is posted.
    youtubeComments: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      videoID: i.string().indexed(),
      listenID: i.string().optional(),
      formatVersion: i.number(),
      videoTitle: i.string().optional(),
      // His words, as he said them (an Edit replaces them).
      text: i.string(),
      // The video's time code the comment names, and the recording range he spoke it in.
      videoSeconds: i.number(),
      startSeconds: i.number(),
      endSeconds: i.number(),
      firstSegmentID: i.string().optional(),
      lastSegmentID: i.string().optional(),
      // The unlisted range share the comment links to (ADR 0014); absent while it is held for personal information.
      shareID: i.string().optional(),
      clipNote: i.string().optional(),
      status: i.string().indexed(),
      // The exact text sent to YouTube, and the channel it posts as.
      postedText: i.string().optional(),
      channelID: i.string().optional(),
      attemptID: i.string().optional(),
      decidedAtMs: i.number().optional(),
      decisionDevice: i.string().optional(),
      youtubeCommentID: i.string().optional(),
      youtubeCommentURL: i.string().optional(),
      postedAtMs: i.number().optional(),
      failure: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0044 section 9: the YouTube settings, one row per sign-in (id: v5-style bits on SHA-256 of
    // "scribe-youtube-settings|<identity lowercased>"); the Mac companion acts on the newest row among the account's
    // sign-ins (ADR 0024). Absent values mean the defaults: follow YouTube on, post comments automatically off, share a
    // clip with each comment on.
    youtubeCompanionSettings: i.entity({
      ownerUserID: i.string().unique().indexed(),
      followsYouTube: i.boolean().optional(),
      postsCommentsAutomatically: i.boolean().optional(),
      sharesClips: i.boolean().optional(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0040 (#435): one row per play of another recording during a recording, the edge that links the two. The
    // play's start creates it; its end sets endSeconds, playedEndSeconds, and endedAtMs once.
    recordingPlaybacks: i.entity({
      ownerUserID: i.string().indexed(),
      // The live recording.
      recordingID: i.string().indexed(),
      // The recording that played.
      playedRecordingID: i.string().indexed(),
      formatVersion: i.number(),
      // The span on the live recording's clock, in seconds.
      startSeconds: i.number(),
      endSeconds: i.number().optional(),
      // The span on the played recording's clock, in seconds.
      playedStartSeconds: i.number(),
      playedEndSeconds: i.number().optional(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      // The Instant client id of the install that played it, and the device's name.
      deviceID: i.string().indexed(),
      deviceName: i.string(),
      updatedAtMs: i.number().indexed(),
    }),
    imageAnalysisPrompts: i.entity({
      promptID: i.string().indexed(),
      name: i.string().indexed(),
      version: i.number().indexed(),
      instructions: i.string(),
      contentHash: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    imageAnalyses: i.entity({
      recordingID: i.string().indexed(),
      imageAttachmentID: i.string().indexed(),
      promptID: i.string().indexed(),
      kind: i.string().indexed(),
      status: i.string().indexed(),
      modelProvider: i.string().indexed(),
      modelIdentifier: i.string().indexed(),
      modelExecution: i.string().indexed(),
      modelJSON: i.string(),
      promptReferenceJSON: i.string(),
      lifecycleJSON: i.string(),
      captureContextJSON: i.string(),
      resultText: i.string().optional(),
      errorMessage: i.string().optional(),
      startedAtMs: i.number().optional().indexed(),
      completedAtMs: i.number().optional().indexed(),
      durationMilliseconds: i.number().optional(),
      idempotencyKey: i.string().unique().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    imageVisibleSegmentRanges: i.entity({
      recordingID: i.string().indexed(),
      analysisID: i.string().indexed(),
      segmentRangeID: i.string().indexed(),
      firstSegmentID: i.string().indexed(),
      lastSegmentID: i.string().indexed(),
      firstSegmentIndex: i.number().indexed(),
      lastSegmentIndex: i.number().indexed(),
      capturedAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    screenStreamSessions: i.entity({
      destination: i.string().indexed(),
      errorMessage: i.string().optional(),
      expiresAtMs: i.number().indexed(),
      publisherToken: i.string().optional(),
      relayErrorMessage: i.string().optional(),
      relayStatus: i.string().indexed(),
      requestedAtMs: i.number().indexed(),
      requestedByDeviceID: i.string().indexed(),
      requestedByDeviceName: i.string(),
      responderDeviceID: i.string().optional().indexed(),
      roomName: i.string().optional().indexed(),
      serverURL: i.string().optional(),
      status: i.string().indexed(),
      updatedAtMs: i.number().indexed(),
      youtubeBroadcastURL: i.string().optional(),
    }),
    // A range share (ADR 0014): one recipient or one secret link per row. The range is fixed when shared.
    recordingSegmentShares: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The envelope: the first section of the first block to the last section of the last block. Optional since ADR 0014
      // section 13.4 (#718): a whole-recording share (scope "recording") has none; the rules require it on every other row.
      firstSegmentID: i.string().indexed().optional(),
      lastSegmentID: i.string().indexed().optional(),
      firstSegmentIndex: i.number().indexed().optional(),
      lastSegmentIndex: i.number().indexed().optional(),
      startSeconds: i.number().optional(),
      endSeconds: i.number().optional(),
      // "people" | "link" | "public" (ADR 0014 section 13.4: "public" only on a row with a scope)
      visibility: i.string().indexed(),
      recipientEmail: i.string().indexed().optional(),
      linkToken: i.string().optional(),
      sharedByDisplayName: i.string().optional(),
      note: i.string().optional(),
      // ADR 0014 section 13.4 (the additive subset ADR 0044 uses): the share's audio clip, the `audioClip` file.
      // "none" | "preparing" | "ready" | "failed".
      audioClipStatus: i.string().optional(),
      audioClipDurationSeconds: i.number().optional(),
      // ADR 0044 section 8 (a proposal for ADR 0014 section 13): the record of the personal-information gate this share
      // passed (publicCheckJSON) and when (publicClearedAtMs), readable like the share. Its public face is publicShares.
      publicCheckJSON: i.string().optional(),
      publicClearedAtMs: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // @generated-begin share-model-attributes: scripts/schema/generate.ts writes this part from scripts/schema/share-model-schema.ts (ADR 0014).
      // ADR 0014 section 13.4 (#389, #718): absent on a legacy single range. "sections": blocksJSON holds the blocks, the segments links are exactly the picked sections, and the envelope is the first block's start to the last block's end. "recording": the whole recording through `wholeRecording`, no envelope.
      scope: i.string().indexed().optional(),
      // [{firstSegmentID, lastSegmentID, firstSegmentIndex, lastSegmentIndex, startSeconds, endSeconds}], in order.
      blocksJSON: i.string().optional(),
      scrubStatus: i.string().indexed().optional(),
      // Why withheld, in words that quote nothing of the share.
      scrubReason: i.string().optional(),
      scrubbedAtMs: i.number().indexed().optional(),
      // The gate's record: versions and counts, never a word of the share.
      scrubCheckJSON: i.string().optional(),
      // The recording's title, scrubbed: readers cannot read the recording.
      scrubbedTitle: i.string().optional(),
      // The owner's note, scrubbed: readers cannot read `note`.
      scrubbedNote: i.string().optional(),
      // @generated-end share-model-attributes
    }),
    // ADR 0044 section 8 (a proposal for ADR 0014 section 13): the public page's only data, one row per cleared link
    // share, with the share's id and secret. Rules have no field-level reads, so what a signed-out link holder may see is
    // its own entity: the cleared words with times relative to the clip, the video's title and moment, and the sharer's
    // channel name; no owner, recording, or time of day. Written by the owner's companion only with a passed gate.
    publicShares: i.entity({
      formatVersion: i.number(),
      linkToken: i.string(),
      videoTitle: i.string().optional(),
      videoMomentSeconds: i.number(),
      videoLink: i.string(),
      sharedBy: i.string(),
      // [{ "text", "startSeconds", "endSeconds" }], seconds from the clip's start, in transcript order.
      wordsJSON: i.string(),
      // "none" | "preparing" | "ready" | "failed"
      clipStatus: i.string(),
      clipDurationSeconds: i.number().optional(),
    }),
    // Recipient history for autocomplete (ADR 0014): one row per (sharer, email), deterministic id.
    shareRecipients: i.entity({
      ownerUserID: i.string().indexed(),
      email: i.string().indexed(),
      displayName: i.string().optional(),
      lastSharedAtMs: i.number().indexed(),
      shareCount: i.number(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    transcriptions: i.entity({
      // Optional until legacy rows are backfilled; new writes always stamp it.
      ownerUserID: i.string().indexed().optional(),
      recordingID: i.string().indexed(),
      buildInfo: i.json<ScribeBuildInfo>().optional(),
      provider: i.string().indexed(),
      configurationName: i.string().indexed(),
      configurationJSON: i.json<SharedRealtimeTranscriptionConfiguration>(),
      startedAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      segmentCount: i.number(),
      wordCount: i.number(),
      // Still present on server; optional until ADR 0006 fully retires dual transcript projection.
      transcriptText: i.string().optional(),
    }),
    transcriptionSegments: i.entity({
      // Optional until legacy rows are backfilled; new writes always stamp it.
      ownerUserID: i.string().indexed().optional(),
      recordingID: i.string().indexed(),
      transcriptionID: i.string().indexed(),
      segmentIndex: i.number().indexed(),
      startTimeSeconds: i.number().indexed(),
      endTimeSeconds: i.number().indexed(),
      wallClockStartedAtMs: i.number().indexed(),
      wallClockEndedAtMs: i.number().indexed(),
      text: i.string(),
      speaker: i.number().optional(),
      wordCount: i.number(),
      // ADR 0015 / #155 S5: words as JSON blob on the segment (start/end/text).
      // Not Instant word entities — optional until legacy rows backfill.
      wordsJSON: i.string().optional(),
      // #539 (ADR 0056): when the Mac's later final first replaces a segment's words in place, the phone keeps the words
      // it replaced here, with who wrote them, and names the corrector. Never written on live writes; readers ignore them.
      originalWordsJSON: i.string().optional(),
      originalWordsProvider: i.string().optional(),
      correctedBy: i.string().optional(),
      isFinal: i.boolean().indexed(),
      sentToInstantAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // @generated-begin provenance-attributes: scripts/schema/generate.ts writes this part from scripts/schema/provenance-schema.ts (ADR 0064).
      // ADR 0064 section 8: a retired line stays (no delete) and every reader skips it; it names the kept line (supersededBy), and an edges row (segment duplicates segment) keeps the decision.
      // When the line was retired; null while it is a line. Readers skip a retired line, and its # is not missing.
      retiredAtMs: i.number().indexed().optional(),
      // Why, in a sentence ("Recording 208's live copy of #2460 (#662)"): set exactly when retiredAtMs is.
      retiredReason: i.string().optional(),
      // @generated-end provenance-attributes
    }),
    transcriptionWords: i.entity({
      // Optional until legacy rows are backfilled; new writes always stamp it.
      ownerUserID: i.string().indexed().optional(),
      recordingID: i.string().indexed(),
      transcriptionID: i.string().indexed(),
      segmentID: i.string().indexed(),
      segmentIndex: i.number().indexed(),
      wordIndex: i.number().indexed(),
      absoluteWordIndex: i.number().indexed(),
      startTimeSeconds: i.number().indexed(),
      endTimeSeconds: i.number().indexed(),
      wallClockStartedAtMs: i.number().indexed(),
      wallClockEndedAtMs: i.number().indexed(),
      text: i.string(),
      speaker: i.number().optional(),
      sentToInstantAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    instantToolsIssues: i.entity({
      attachmentCount: i.number(),
      attachmentIdsJson: i.string(),
      issueID: i.string().unique().indexed(),
      payloadJson: i.string(),
      priority: i.string().indexed(),
      productId: i.string().indexed(),
      projectId: i.string().indexed(),
      status: i.string().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    instantToolsLogs: i.entity({
      category: i.string().indexed(),
      level: i.string().indexed(),
      name: i.string().indexed(),
      payloadJson: i.string(),
      timestampMs: i.number().indexed(),
    }),
    // Read-only compatibility for logs written before the plural namespace migration.
    instantToolLogs: i.entity({
      category: i.string().indexed(),
      level: i.string().indexed(),
      name: i.string().indexed(),
      payloadJSON: i.string(),
      timestampMs: i.number().indexed(),
    }),
    instantToolsLogIssueLinks: i.entity({
      category: i.string().indexed(),
      contributingPathsJSON: i.string(),
      issueID: i.string().indexed(),
      level: i.string().indexed(),
      logID: i.string().indexed(),
      logNamespace: i.string().indexed(),
      message: i.string(),
      name: i.string().indexed(),
      timestampMs: i.number().indexed(),
      viewerURL: i.string(),
    }),
    instantToolsCorrections: i.entity({
      agentScope: i.string().indexed(),
      fingerprint: i.string().indexed(),
      lastObservedAtMs: i.number().indexed(),
      occurrenceCount: i.number().indexed(),
      payloadJSON: i.string(),
      status: i.string().indexed(),
    }),
    instantToolsPreferences: i.entity({
      agentScope: i.string().indexed(),
      fingerprint: i.string().indexed(),
      lastObservedAtMs: i.number().indexed(),
      occurrenceCount: i.number().indexed(),
      payloadJSON: i.string(),
      status: i.string().indexed(),
    }),
    agentResponseArtifactsV1: i.entity({
      contractVersion: i.number().indexed(),
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      transcriptionID: i.string().indexed(),
      sourceSelfConsistencyDigest: i.string().indexed(),
      triggerKind: i.string().indexed(),
      lifecycle: i.string().indexed(),
      triggerPolicyVersion: i.string().indexed(),
      artifactJSON: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    agentRooms: i.entity({
      recordingID: i.string().unique().indexed(),
      title: i.string(),
      status: i.string().indexed(),
      policyJSON: i.json<{
        allowsAutomaticSpeech: boolean
        maximumResponseCharacters: number
        responseMode: 'complementary-passive'
        userIsSoleFocus: boolean
      }>(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    agentListeners: i.entity({
      roomID: i.string().indexed(),
      agentID: i.string().indexed(),
      displayName: i.string(),
      model: i.string(),
      reasoningEffort: i.string(),
      status: i.string().indexed(),
      capabilitiesJSON: i.json<string[]>(),
      startedAtMs: i.number().indexed(),
      heartbeatAtMs: i.number().indexed(),
      stoppedAtMs: i.number().optional(),
    }),
    agentTools: i.entity({
      roomID: i.string().optional().indexed(),
      name: i.string().indexed(),
      summary: i.string(),
      inputSchemaJSON: i.string(),
      target: i.string().indexed(),
      requiresExplicitRequest: i.boolean(),
      isEnabled: i.boolean().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A thread, a person's or an agent's (ADR draft 0030, #392). The attributes after updatedAtMs are optional: rows
    // written before that model have none and read as an agent's. A person's thread has origin "person", listenerID
    // "person", and status "open".
    agentThreads: i.entity({
      roomID: i.string().indexed(),
      listenerID: i.string().indexed(),
      sourceSegmentID: i.string().optional().indexed(),
      origin: i.string().indexed(),
      prompt: i.string(),
      status: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // The recording, lowercased: the rules' key (the room id is a hash of it).
      recordingID: i.string().optional().indexed(),
      // "person" | "agent"
      authorKind: i.string().optional().indexed(),
      authorUserID: i.string().optional().indexed(),
      // A person's email or an agent's name, as it was when the row was written; labels only, never access.
      authorName: i.string().optional(),
      // "segment" (sourceSegmentID) | "range" (sourceSegmentID to anchorEndSegmentID) | "recording" (no line)
      anchorKind: i.string().optional(),
      anchorEndSegmentID: i.string().optional(),
      anchorStartSeconds: i.number().optional(),
      anchorEndSeconds: i.number().optional(),
    }),
    // A message in a thread: a person's comment, an agent's answer, or an agent's status line (ADR draft 0030). The
    // attributes after updatedAtMs are optional, as on agentThreads. A person's comment has status "posted",
    // listenerID "person", and kind "comment".
    agentResponses: i.entity({
      roomID: i.string().indexed(),
      threadID: i.string().indexed(),
      listenerID: i.string().indexed(),
      text: i.string(),
      status: i.string().indexed(),
      visibility: i.string().indexed(),
      speechStatus: i.string().indexed(),
      providerResponseID: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      recordingID: i.string().optional().indexed(),
      authorKind: i.string().optional().indexed(),
      authorUserID: i.string().optional().indexed(),
      authorName: i.string().optional(),
      // "comment" | "answer" | "status"; without it, status says (ready = answer; working or failed = status).
      kind: i.string().optional().indexed(),
      // The line the message's thread hangs on, so a range share's readers can be checked without following an id.
      anchorSegmentID: i.string().optional().indexed(),
      // ADR 0023 section 3b: the quote, embedded in the quoting message (at most 2 KB), and the quoted message's id.
      quoteJSON: i.string().optional(),
      quotedMessageID: i.string().optional().indexed(),
      // #665 (plan 2026-10-10-flags-and-topics): a card the answer carries, embedded as the quote is (at most 2 KB): a
      // flag, idea, topic, project, or issue with its title, topic path, his line, status, and where a tap goes.
      cardJSON: i.string().optional(),
    }),
    agentActions: i.entity({
      roomID: i.string().indexed(),
      threadID: i.string().indexed(),
      responseID: i.string().indexed(),
      listenerID: i.string().indexed(),
      toolName: i.string().indexed(),
      argumentsJSON: i.string(),
      status: i.string().indexed(),
      resultMessage: i.string().optional(),
      handledBy: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    agentEvents: i.entity({
      roomID: i.string().indexed(),
      responseID: i.string().optional().indexed(),
      actionID: i.string().optional().indexed(),
      kind: i.string().indexed(),
      displayText: i.string(),
      occurredAtMs: i.number().indexed(),
    }),
    // Invisible context markers for remote stream listeners: current screen,
    // which transcript portion is on screen, open agent thread, recent apps,
    // and ReplayKit / system-audio session state.
    agentFenceposts: i.entity({
      recordingID: i.string().indexed(),
      roomID: i.string().optional().indexed(),
      kind: i.string().indexed(),
      payloadJSON: i.string(),
      occurredAtMs: i.number().indexed(),
    }),
    // Always-on Stream Companion LaunchAgent presence (Instant heartbeat).
    // Owner-scoped only — see instant.perms.ts. Not world-readable.
    agentCompanionListeners: i.entity({
      ownerUserID: i.string().indexed(),
      displayName: i.string(),
      status: i.string().indexed(),
      capabilitiesJSON: i.string(),
      startedAtMs: i.number().indexed(),
      heartbeatAtMs: i.number().indexed(),
      stoppedAtMs: i.number().optional(),
    }),
    // Hot-word wake → claim → terminal connect. Same Instant user as phone.
    agentCompanionRequests: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      roomID: i.string().indexed(),
      harness: i.string().indexed(),
      purpose: i.string().optional(),
      matchedHotWord: i.string().optional(),
      status: i.string().indexed(),
      requestedAtMs: i.number().indexed(),
      claimedAtMs: i.number().optional(),
      claimedByListenerID: i.string().optional().indexed(),
      error: i.string().optional(),
    }),
    // One person's sign-ins joined into one account (ADR 0024, #361): Apple, Google, email code, and guests. Each
    // member reads, writes, and shares every member's recordings and their linked guests' recordings. An identity
    // joins only by linking itself (`members`): the creator in the transaction that creates the row, anyone else
    // while it is the row's unexpired invite. Ownership never moves; unlinking removes the access and nothing else.
    accountLinks: i.entity({
      createdByUserID: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // The one identity invited to join, until it joins or the invite expires.
      inviteUserID: i.string().optional().indexed(),
      inviteExpiresAtMs: i.number().optional(),
      // userID -> how that member signed in and when it was linked; labels only, never access.
      membersJSON: i.json<Record<string, AccountLinkMember>>().optional(),
    }),
    // ADR 0029 section 8: the devices an agent's answer is pushed to (APNs), one row per device token.
    agentPushDevices: i.entity({
      ownerUserID: i.string().indexed(),
      token: i.string().unique().indexed(),
      platform: i.string().indexed(), // ios | ipados | macos | visionos
      environment: i.string().indexed(), // development | production (APNs sandbox or production)
      bundleID: i.string().indexed(), // the apns-topic
      enabled: i.boolean().indexed(), // the mirror turns a token off on 410 Unregistered
      updatedAtMs: i.number().indexed(),
      // While Scribe runs and posts its own notification for an answer, the mirror skips that device (no double alert).
      runningUntilMs: i.number().optional(),
    }),
    // ---- Library: the Foldkit Books reader (books.knophy.com), ADR 0052 ----------------------------------------
    // One owner's library, migrated from books-knophy (b02684ea) with its ids kept. Catalog rows (books, authors,
    // narrators, chapters, renditions, files, word-timed segments, shelf items, shelves) are read by their owners and the
    // members they invite (appMemberships, app "library"); notes, progress, bookmarks, and preferences are each person's own.
    libraryBooks: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      title: i.string().indexed(),
      subtitle: i.string().optional(),
      description: i.string().optional(),
      identifiersJSON: i.string(),
      isbn13: i.string().indexed().optional(),
      bindingKind: i.string(),
      publishedKind: i.string(),
      publishedYear: i.number().optional(),
      explicitKind: i.string(),
      matchKind: i.string(),
      matchProvider: i.string().optional(),
      matchValue: i.string().optional(),
      seriesIndex: i.string().optional(),
      language: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    libraryAuthors: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      name: i.string().indexed(),
      sortName: i.string().indexed(),
      description: i.string().optional(),
    }),
    libraryNarrators: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      name: i.string().indexed(),
      sortName: i.string().indexed(),
    }),
    libraryChapters: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      index: i.number().indexed(),
      title: i.string(),
      startMs: i.number().indexed(),
      endMs: i.number(),
      bindingKind: i.string(),
    }),
    libraryRenditions: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      bodyKind: i.string().indexed(),
      originKind: i.string().indexed(),
      language: i.string().indexed(),
      title: i.string().optional(),
      durationMs: i.number().optional(),
      length: i.number().optional(),
      volumeKind: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    libraryFiles: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      name: i.string(),
      path: i.string().indexed(),
      size: i.number(),
      presenceKind: i.string().indexed(),
      bodyKind: i.string().indexed(),
      durationMs: i.number().optional(),
      index: i.number().optional(),
      discKind: i.string().optional(),
      discNumber: i.number().optional(),
      textFormat: i.string().optional(),
      textLength: i.number().optional(),
      addedAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    librarySegments: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      index: i.number().indexed(),
      isFinal: i.boolean().indexed(),
      relativeStartMs: i.number().indexed(),
      relativeEndMs: i.number(),
      wallStartMs: i.number(),
      wallEndMs: i.number(),
      wordsJSON: i.string(),
    }),
    libraryItems: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      preferredKind: i.string().indexed(),
      presenceKind: i.string().indexed(),
      addedAtMs: i.number().indexed(),
    }),
    libraryShelves: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      name: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    libraryPreferences: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      speechRate: i.number(),
      updatedAtMs: i.number(),
    }),
    libraryNotes: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      anchorKind: i.string().indexed(),
      audience: i.string().indexed(),
      body: i.string(),
      relativeMs: i.number().optional(),
      textOffset: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    libraryProgress: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      relativeMs: i.number(),
      finishedKind: i.string().indexed(),
      hiddenKind: i.string(),
      finishedAtMs: i.number().optional(),
      startedAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    libraryBookmarks: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      markKind: i.string(),
      relativeMs: i.number().optional(),
      textOffset: i.number().optional(),
      createdAtMs: i.number().indexed(),
    }),
    // ADR 0052: who may read and write whose data, app by app. One row per app, owner, and member (an invite from the
    // owner). grantKey is "<app>|<ownerUserID>|<role>" while life is "on" and empty otherwise, so a rule tests a grant
    // with one lookup: ("library|" + data.ownerUserID + "|viewer") in auth.ref('$user.appMemberships.grantKey').
    appMemberships: i.entity({
      app: i.string().indexed(),
      ownerUserID: i.string().indexed(),
      memberUserID: i.string().indexed(),
      formatVersion: i.number(),
      // "viewer" | "editor" | "admin"
      role: i.string(),
      // "on" | "off" | "locked"
      life: i.string(),
      grantKey: i.string().indexed(),
      // The app's own finer grants, for example the library's download, upload, and explicit; at most 2 KiB.
      grantsJSON: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0052: shares and comments in a library. A share is its owner's: a moment of one of their own books, anchored
    // on a chapter and an offset or on one of their own notes, seen by the members they invited. "public" only marks a
    // share for the PII-gated public projection that comes later (as YouTube shares have); these rules never show a
    // share to anyone else. A note anchored by its owner's share becomes visible to that owner's members.
    libraryShares: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // "chapter" | "note"
      anchorKind: i.string().indexed(),
      // "members" | "public"
      audience: i.string().indexed(),
      relativeMs: i.number().optional(),
      textOffset: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    // A comment's owner is its author. libraryOwnerUserID is the library it lives in: its share's or its note's owner.
    libraryComments: i.entity({
      ownerUserID: i.string().indexed(),
      libraryOwnerUserID: i.string().indexed(),
      formatVersion: i.number(),
      body: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number(),
    }),
    // ADR 0052: Foldkit's append-only program log (session and navigation sync), one row per Message, shared by every
    // Foldkit app and scoped by app. Its shape is @foldkit/instant's programMessage plus ownerUserID; the owner alone
    // reads and appends; a re-sent write of a saved row passes only unchanged, and nobody deletes.
    programMessage: i.entity({
      ownerUserID: i.string().indexed(),
      app: i.string().indexed(),
      programVersion: i.number(),
      tag: i.string(),
      payload: i.json<Record<string, unknown>>(),
      from: i.string().indexed(),
      createdAtMs: i.number().indexed(),
    }),
    // ADR 0048: one row per range of a recording where Scribe connected a thing: a reading, a mention, a scan, a sung
    // line. The recording link is pinned to recordingID and cascades with it; the thing link is pinned to thingID.
    recordingRecognitions: i.entity({
      ownerUserID: i.string().indexed(),
      recordingID: i.string().indexed(),
      thingID: i.string().indexed(),
      // The thing's kind, so "every book read" is one top-level query.
      thingKind: i.string().indexed(),
      formatVersion: i.number(),
      // The recording clock, then the wall clock; the end is absent while the moment lasts.
      startSeconds: i.number().indexed(),
      endSeconds: i.number().optional(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      // Only turns false.
      isOngoing: i.boolean(),
      // The range inside the thing: first and last page, or the video's seconds. "page" | "second"
      thingRangeStart: i.number().optional(),
      thingRangeEnd: i.number().optional(),
      thingRangeUnit: i.string().optional(),
      // "spoken" | "sung" | "scan" | "photo" | "copiedLink" | "manual"
      source: i.string().indexed(),
      // "exact" | "likely" | "candidate"; only rises
      certainty: i.string().indexed(),
      // Michael's: "confirmed" | "rejected"
      review: i.string().optional(),
      // At most 8 KiB each: the lines, identifiers as heard, checksum, lookup, and who decided; page marks.
      evidenceJSON: i.string(),
      detailJSON: i.string().optional(),
      // "mirror:<agent name>" | "device:<device name>"
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // ADR 0048 Amendment 2 (#613, Recording 208 #643: "as fine grained relative and relational as we can"): a page
      // visit's reading (another recognition of this recording) and its page (a thingParts row), each pinned to its
      // link. Absent on readings, mentions, and rows written before it.
      readingID: i.string().indexed().optional(),
      partID: i.string().indexed().optional(),
      // "world" | "personal" (absent means world): a personal moment is never read by a shared recording's readers.
      scope: i.string().indexed().optional(),
    }),
    // ---- The things graph (ADR 0048 Amendment 2, plan 2026-10-10-things-graph, #613) -----------------------------------
    // One row per owner and edge between two things: who wrote, illustrated, designed, or published a book; where a
    // person studied, worked, or lived as the source printed it; where a place is; what a book references. Years and
    // timing are qualifiers on the edge, never things. The subject and object links are pinned to subjectID and
    // objectID and cascade with either thing; the moments are the lines that carried it. Owner-only, like things.
    thingRelations: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      subjectID: i.string().indexed(),
      // The two things' kinds, so the rules can hold each predicate to the kinds it joins.
      subjectKind: i.string().indexed(),
      // A closed set (ThingPredicate): "authorOf", "studiedAt", "locatedIn", ...
      predicate: i.string().indexed(),
      objectID: i.string().indexed(),
      objectKind: i.string().indexed(),
      // At most 4 KiB: role, degree, scope, pointInTime, startTime, endTime, asOf (ISO dates as precise as the source),
      // durationYears, approximate, recurrence.
      qualifiersJSON: i.string().optional(),
      // "printed" (a source printed it) | "said" (Michael said it) | "catalog" (Open Library or Wikidata)
      basis: i.string().indexed(),
      // The thing that printed it (a book), pinned to the source link, and where in it ("aboutTheAuthors").
      sourceThingID: i.string().indexed().optional(),
      section: i.string().optional(),
      // "world" | "personal" (absent means world); his relations to people exist only in the personal scope.
      scope: i.string().indexed().optional(),
      // "exact" | "likely" | "candidate"; only rises
      certainty: i.string().indexed(),
      // Michael's: "confirmed" | "rejected"
      review: i.string().optional(),
      // "active" | "retracted"; only moves forward
      status: i.string().indexed(),
      // At most 8 KiB: the lines, the names as heard, the lookups, and who decided.
      evidenceJSON: i.string(),
      // "mirror:<agent name>" | "device:<device name>"
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0048 Amendment 1 (#544) and Amendment 2 (#613): one row per owner, thing, and part (a page of a book). Every
    // visited page is a node; its sorted word bag (never text in reading order) comes only from lines the agent marked
    // as read there, so it is optional. The mirror writes it; the phone never queries the word bags.
    thingParts: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      thingID: i.string().indexed(),
      // "page"
      rangeUnit: i.string(),
      rangeStart: i.number().indexed(),
      rangeEnd: i.number(),
      // The page as he said it, like "9-10"; at most 24 characters.
      label: i.string(),
      // Sorted [word, count] pairs, at most 8 KiB; sorted keyed hashes of pairs and triples, at most 16 KiB.
      wordBagJSON: i.string().optional(),
      fingerprintsJSON: i.string().optional(),
      fingerprintKeyID: i.string().optional(),
      wordCount: i.number(),
      readingCount: i.number(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ---- Reminders (plan 2026-10-04-reminders-in-scribe, ADR 0054, #525) -------------------------------------------
    // Michael's reminders: lists, items, tags, and the moments in recordings where he said them. Owner-scoped. The
    // reminders package (Packages/swift-reminders) reads and writes them, Scribe shows them inside recordings, and the
    // listener adds them through scribe-mirror. An item made from a recording keeps a moment that leads home.
    remindersLists: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // 1 to 200 characters.
      title: i.string(),
      // "#RRGGBB"
      color: i.string(),
      position: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // Recently Deleted, as recordings have it (ADR 0038).
      deletedAtMs: i.number().indexed().optional(),
      // #664 (Recording 208 #2862-2921): a list can be a trigger list, shown when something happens, such as "Back at
      // the Mac", shown when Michael returns to the Mac. "ordinary" | "trigger"; absent reads ordinary.
      kind: i.string().indexed().optional(),
      // "returnedToMac": when a trigger list shows. Set exactly when kind is "trigger".
      triggerEvent: i.string().optional(),
      // The list's address label, a DNS label (back-at-the-mac): /lists/back-at-the-mac and
      // back-at-the-mac.reminders.pisspoursoftware.xyz. Unique per owner set by the writers, not app-wide.
      slug: i.string().indexed().optional(),
      // "off" | "snoozed"; absent is on. Only on a trigger list (Recording 208 #2920-2921).
      triggerPause: i.string().optional(),
      // Present exactly when triggerPause is "snoozed": the trigger is on again from this time.
      triggerSnoozedUntilMs: i.number().optional(),
    }),
    remindersItems: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The list link's target, so a list's reminders are one top-level query.
      listID: i.string().indexed(),
      // 1 to 500 characters.
      title: i.string(),
      // At most 8 KiB.
      notes: i.string().optional(),
      // https, at most 2,048 characters.
      url: i.string().optional(),
      isCompleted: i.boolean().indexed(),
      completedAtMs: i.number().indexed().optional(),
      isFlagged: i.boolean().indexed(),
      // 1 low, 2 medium, 3 high: Reminders V3's ranks.
      priority: i.number().optional(),
      dueAtMs: i.number().indexed().optional(),
      // "date" (a day, no hour) | "dateTime"
      dueKind: i.string().optional(),
      // An IANA name, so a repeat keeps its hour across daylight saving.
      dueTimeZone: i.string().optional(),
      // An RFC 5545 RRULE subset (FREQ, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL), at most 256 characters.
      recurrenceRule: i.string().optional(),
      // "due" | "completion": the next one counts from either.
      recurrenceAnchor: i.string().optional(),
      // A done occurrence's repeating reminder.
      seriesID: i.string().indexed().optional(),
      position: i.number().indexed(),
      // "app" | "listener" | "cli" | "apple" | "things"
      origin: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // Recently Deleted, as recordings have it (ADR 0038).
      deletedAtMs: i.number().indexed().optional(),
      // #664: the name of an action in the Mac helper's own allowlist on the Mac (claude-usage-keychain), which Run
      // starts there. Never a command: the command lives only in that file, and the helper refuses any other name.
      macAction: i.string().optional(),
      // @generated-begin reminders-work-attributes: scripts/schema/generate.ts writes this part from scripts/schema/reminders-work-schema.ts (ADR 0054).
      // ADR 0054 amendment 2 (#815, #823): when the work started, and the moment he means to do it in.
      // When the work started: the line he said so at, or the tap. Absent until then.
      startedAtMs: i.number().optional(),
      // In his words, at most 200 characters: "during Wren's nap", "when I'm back at the Mac".
      context: i.string().optional(),
      // @generated-end reminders-work-attributes
    }),
    remindersTags: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // Lowercased, without "#", 1 to 64 characters. The id derives from the owner and the title, so a title is unique
      // per owner without an app-wide unique attribute.
      title: i.string().indexed(),
      // "area" | "project" | "person" | "place" | "activity"
      facet: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One row per moment of a recording where a reminder was made, mentioned again, or done: the links home.
    remindersMoments: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      reminderID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The line: a transcriptionSegments id, as agentThreads.sourceSegmentID names it (ADR 0030).
      segmentID: i.string().indexed().optional(),
      // The last line, for a range.
      endSegmentID: i.string().optional(),
      // The recording clock, then the wall clock.
      startSeconds: i.number().indexed(),
      endSeconds: i.number().optional(),
      startedAtMs: i.number().indexed(),
      // "created" | "mentioned" | "completed"
      kind: i.string().indexed(),
      // "listener" | "app" | "cli"
      source: i.string(),
      // "mirror:<agent>" | "device:<device name>"
      writer: i.string(),
      // Michael's "rejected" (Not a Reminder).
      review: i.string().optional(),
      // At most 4 KiB: his words as heard, and the agent's reason.
      evidenceJSON: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // @generated-begin reminders-work-attributes: scripts/schema/generate.ts writes this part from scripts/schema/reminders-work-schema.ts (ADR 0054).
      // ADR 0054 amendment 2 (#815, #823): a mention's more exact kind; builds before 110 read it as a mention.
      // started, progress, or nudged; only on kind "mentioned".
      mentionKind: i.string().optional(),
      // @generated-end reminders-work-attributes
    }),
    // One row per sign-in, in youtubeCompanionSettings' shape; the newest row of the account wins. Absent means on.
    remindersSettings: i.entity({
      ownerUserID: i.string().unique().indexed(),
      listenerAddsReminders: i.boolean().optional(),
      updatedAtMs: i.number().indexed(),
    }),
    // ---- ADR 0055: Scribe's settings in Instant (#551) ----------------------------------------------------------------
    // One row per person. ownerUserID is chosen once, at creation (the smallest of the account's identities then), and
    // devices find the row by membership. An account setting is a typed optional attribute; absent = the default in code.
    settingsAccounts: i.entity({
      ownerUserID: i.string().unique().indexed(),
      formatVersion: i.number(),
      recognizesSongs: i.boolean().optional(),
      // ADR 0062 (#635): Michael's words for transcription, a JSON string of at most 16 KiB; absent = the suggested words.
      vocabulary: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One row per device of the person: its exceptions (typed, optional; absent = the account's value) and what it uses.
    settingsDevices: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // A lowercase UUID the device keeps in its Keychain.
      deviceID: i.string().indexed(),
      // iphone | ipad | mac | watch | vision | tv
      platform: i.string().indexed(),
      // At most 120 characters.
      name: i.string(),
      // At most 64 characters, for example "0.1 (92) 1a2b3c4d".
      build: i.string(),
      lastSeenAtMs: i.number().indexed(),
      // At most 16 KiB: each managed setting's value on this device and where it comes from, and facts (ADR 0055 Q13).
      reportedJSON: i.string(),
      recognizesSongs: i.boolean().optional(),
      // Indexed: a device finds its own row oldest first (ScribeSettingsDeviceRow.deviceRowQuery orders by it), and the
      // server orders only by indexed, typed attributes (#551).
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // Append-only: one row per settings change. A change is undone by a later change that names it.
    settingsChanges: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      key: i.string().indexed(),
      // account | device
      scope: i.string(),
      // The device whose exception changed (device scope), or the device that made an account change.
      deviceID: i.string().optional().indexed(),
      // JSON, at most 1 KiB each; absent = the value was missing (the default).
      oldValueJSON: i.string().optional(),
      newValueJSON: i.string().optional(),
      // app | voice | agent | migration
      source: i.string().indexed(),
      // The agent's or the device's name; at most 120 characters.
      sourceName: i.string(),
      recordingID: i.string().optional().indexed(),
      segmentIndex: i.number().optional(),
      threadID: i.string().optional(),
      undoesChangeID: i.string().optional().indexed(),
      changedAtMs: i.number().indexed(),
    }),
    // ---- Michael's ideas: topics, ideas, projects, flags, the issues they name, and where each came from ------------
    // (plan 2026-10-10-flags-and-topics, #665; shared entities with no prefix, ADR 0052 section 2). Recording 208
    // #3037-3056 (2026-10-10): flags "for any time I say plant a flag" and on "Unfinished ideas"; "a kind of recursive"
    // categorization, "Maybe 5 to 7" "values per layer", "kind of like the Dewey decimal system"; "everything cross
    // referenced". #3124-3125: every one of them queryable by the recording and line it came from (sourceMoments).
    // Owner set only. The shapes and closed lists live in scripts/scribe-mirror/ideas-schema.ts.
    // One node of his topic tree: at most 7 children; its number (3.1.4) is derived from positions, never stored.
    topics: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // a-z, 0-9, dashes; 1 to 48.
      slug: i.string().indexed(),
      // 1 to 80 characters.
      title: i.string(),
      // At most 500 characters.
      summary: i.string().optional(),
      // The slugs from the root joined by "/": the words URL (/topics/<path>). Changes when a topic moves; the id does not.
      path: i.string().indexed(),
      // 0 for a root.
      depth: i.number(),
      // 1 to 7 among its siblings.
      position: i.number().indexed(),
      // "active" | "retired"
      status: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // An idea of his: ~/Development/brainstorming/ideas/<slug>.md, or one he said.
    ideas: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      slug: i.string().indexed(),
      title: i.string(),
      // At most 2 KiB.
      summary: i.string().optional(),
      // "seedling" | "exploring" | "prototyping" | "building" | "shelved" | "done"
      status: i.string().indexed(),
      // Where it is written, "brainstorming/ideas/acaga.md".
      file: i.string().optional(),
      lastDiscussedAtMs: i.number().indexed().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    projects: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      slug: i.string().indexed(),
      title: i.string(),
      summary: i.string().optional(),
      // "active" | "paused" | "done" | "archived"
      status: i.string().indexed(),
      // The tracker's product id ("scribe", "foldkit").
      trackerProductID: i.string().indexed().optional(),
      // Our own page for it (https), never an outside site.
      url: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A tracker issue his ideas name, as last seen (the tracker is app 28c98cc4 until ADR 0052 moves it here).
    issueRefs: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The tracker's number as text, "665".
      issueID: i.string().indexed(),
      title: i.string(),
      // The tracker's status words (instant-tools' allowedIssueStatuses).
      status: i.string().indexed(),
      // "P0" to "P4"
      priority: i.string().optional(),
      productID: i.string().indexed().optional(),
      seenAtMs: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A flag: one he asked to plant ("explicit"), or one a listener planted on an idea he left open ("unfinished").
    flags: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // "explicit" | "unfinished"
      kind: i.string().indexed(),
      // "open" | "closed" (he came back and closed the loop) | "dismissed"
      status: i.string().indexed(),
      // What to come back to, in his words: 1 to 200 characters.
      title: i.string(),
      // What was left open, the listener's reading: at most 2 KiB.
      note: i.string().optional(),
      // The anchor's recording and wall clock (its origin moment holds the lines).
      recordingID: i.string().indexed(),
      startedAtMs: i.number().indexed(),
      closedAtMs: i.number().indexed().optional(),
      // "listener" | "app" | "cli" | "import"
      source: i.string().indexed(),
      // "mirror:<agent>" | "device:<name>"
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-begin provenance-entities: scripts/schema/generate.ts writes this region from scripts/schema/provenance-schema.ts (ADR 0064). Change the Effect Schemas there, then run it with --write.
    // Where a flag, idea, topic, project, issue, reminder, or agent run came from: the moment he said, typed, or saw it
    // (ADR 0064 section 1; #665 made it, Recording 208 #3124-3125). A said moment holds a recording and his lines, a typed
    // one a chatMessages row, a seen one an image or a line. The deep link derives from the recording, the first line, and
    // startSeconds.
    sourceMoments: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // "flag" | "idea" | "topic" | "project" | "issue" | "reminder" | "agentRun" | "question" | "questionAnswer"; the
      // link of that kind is set.
      subjectKind: i.string().indexed(),
      subjectID: i.string().indexed(),
      // "introduced" | "refined" | "asked" | "decided" | "reported" | "answered" (ADR 0064 section 1.1).
      role: i.string().indexed(),
      // Said and seen: the recording. Optional since ADR 0064 (a typed moment has none).
      recordingID: i.string().indexed().optional(),
      // The first line and, for a range, the last (transcriptionSegments ids).
      segmentID: i.string().indexed().optional(),
      endSegmentID: i.string().optional(),
      // The lines' #numbers, for labels.
      firstLineIndex: i.number().indexed().optional(),
      lastLineIndex: i.number().optional(),
      // The recording clock, then the wall clock.
      startSeconds: i.number().optional(),
      endSeconds: i.number().optional(),
      startedAtMs: i.number().indexed(),
      // His words exactly as the transcript or the chat has them; for seen, what was on screen: at most 4 KiB.
      quote: i.string(),
      // The listener's reading: at most 1 KiB.
      why: i.string().optional(),
      source: i.string().indexed(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // "said" | "typed" | "seen"; absent on a row written before ADR 0064 means said.
      kind: i.string().indexed().optional(),
      // Typed: the chatMessages row.
      chatMessageID: i.string().indexed().optional(),
      // Seen: the recordingAttachments row he saw.
      imageID: i.string().indexed().optional(),
    }),
    // A message Michael typed to an agent, verbatim: a source like a line of a recording (ADR 0064 section 1.3). Id:
    // stableUUID("scribe-chat-message", harness, sessionID, messageID). Link text: <harness>://session/<sessionID>/message/<messageID>.
    chatMessages: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      harness: i.string().indexed(),
      sessionID: i.string().indexed(),
      messageID: i.string().indexed(),
      author: i.string(),
      // His words exactly: at most 32 KiB.
      text: i.string(),
      sentAtMs: i.number().indexed(),
      folder: i.string().optional(),
      sessionTitle: i.string().optional(),
      url: i.string().optional(),
      source: i.string(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One thing about two rows, with a closed predicate (ADR 0064 section 2): issue fixedIn commit, issue shippedIn build,
    // issue claimedBy agentRun, idea refines issue, ... The ends are kind and id; the moment that justifies it is a link.
    // Id: stableUUID("scribe-edge", ...), so writing it twice is one row. thingRelations stays the ACAGA subtype.
    edges: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      subjectKind: i.string().indexed(),
      subjectID: i.string().indexed(),
      predicate: i.string().indexed(),
      objectKind: i.string().indexed(),
      objectID: i.string().indexed(),
      basis: i.string().indexed(),
      // "active" | "retracted"; only moves forward (a released claim is a retracted claimedBy).
      status: i.string().indexed(),
      // At most 1 KiB; for shippedIn, the build's "You can..." line (WHATS-NEW.md is generated from it).
      note: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // The issue tracker's issues, moved into the one schema (ADR 0064 section 4; ADR 0052: "the issue tracker moves into the
    // universal app"). An issue keeps its tracker row's id and its number. The JSON fields keep the rest of the tracker's
    // issue exactly. Its moments, criteria, work log, mentions, and status changes are rows; claims are claimedBy edges.
    issues: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The tracker's number: #689 is 689.
      number: i.number().unique().indexed(),
      title: i.string(),
      details: i.string(),
      status: i.string().indexed(),
      priority: i.string().indexed(),
      issueType: i.string().indexed().optional(),
      area: i.string().optional(),
      productID: i.string().indexed(),
      productKind: i.string(),
      productName: i.string(),
      // The tracker's projectId.
      projectKey: i.string().indexed().optional(),
      complexity: i.string().optional(),
      reportedDate: i.string().optional(),
      nightlyEligible: i.boolean(),
      // The current claim; each claim is also a claimedBy edge.
      claimantID: i.string().indexed().optional(),
      attachmentsJSON: i.string().optional(),
      evidenceLogQueriesJSON: i.string().optional(),
      sourceDocumentJSON: i.string().optional(),
      // The tracker's other fields (relatedIssueIds, observed, expected, files, ...), kept exactly; relatedIssueIds
      // are also relatesTo edges.
      extraJSON: i.string().optional(),
      source: i.string(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One success criterion of an issue (the tracker's successCriteria).
    issueCriteria: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The issues row.
      issueID: i.string().indexed(),
      // The tracker's own id for it.
      key: i.string(),
      position: i.number(),
      outcome: i.string(),
      // The tracker's requiredEvidence list.
      requiredEvidenceJSON: i.string(),
      isSatisfied: i.boolean(),
      satisfiedAtMs: i.number().optional(),
      // The tracker criterion's other fields (evidence, description, ...), kept exactly.
      extraJSON: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One work-log entry of an issue (the tracker's workLog), linked to its commit and agent run when known.
    issueWorkLogs: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The issues row.
      issueID: i.string().indexed(),
      // The tracker's own id for it.
      key: i.string(),
      occurredAtMs: i.number().indexed(),
      agentID: i.string().indexed().optional(),
      state: i.string().optional(),
      summary: i.string().optional(),
      commitSha: i.string().indexed().optional(),
      durationSeconds: i.number().optional(),
      extraJSON: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One tracker mention kept whole, with a link to its moment when the backfill resolves one (ADR 0064 section 4.1).
    issueMentions: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The issues row.
      issueID: i.string().indexed(),
      // The tracker's own id for it.
      key: i.string(),
      capturedAtMs: i.number().indexed().optional(),
      quote: i.string().optional(),
      note: i.string().optional(),
      sourceKind: i.string().indexed(),
      sourceJSON: i.string(),
      relatedJSON: i.string().optional(),
      reporterJSON: i.string().optional(),
      // The tracker mention's other fields (relayContext, context, ...), kept exactly.
      extraJSON: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // An issue's status history: one row per change. The copy writes one ("imported with status X"); nothing earlier is invented.
    issueStatusChanges: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The issues row.
      issueID: i.string().indexed(),
      // The tracker's own id for it.
      key: i.string(),
      fromStatus: i.string().optional(),
      toStatus: i.string().indexed(),
      changedAtMs: i.number().indexed(),
      by: i.string(),
      reason: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A build of an app: Scribe 0.1 (98) is key "scribe|98". Its issues are shippedIn edges; WHATS-NEW.md is generated from them.
    builds: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      key: i.string().unique().indexed(),
      app: i.string().indexed(),
      number: i.number().indexed(),
      marketingVersion: i.string(),
      commitSha: i.string().indexed(),
      branch: i.string().optional(),
      configuration: i.string(),
      lane: i.string().indexed(),
      builtAtMs: i.number().indexed(),
      dirty: i.boolean(),
      host: i.string().optional(),
      status: i.string().indexed(),
      notes: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A build on one device: the device's settingsDevices row when it has one.
    buildInstalls: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      buildID: i.string().indexed(),
      platform: i.string().indexed(),
      deviceName: i.string(),
      deviceID: i.string().indexed().optional(),
      installedAtMs: i.number().indexed(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // A commit: sha and repository. Edges say what it implements, fixes, and ships in.
    commits: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      sha: i.string().unique().indexed(),
      // "technoplato/scribe"
      repo: i.string().indexed(),
      branch: i.string().indexed().optional(),
      subject: i.string(),
      authoredAtMs: i.number().indexed(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // One agent's run: harness, session, model, worktree, branch, status, and who started it. handoff.md's agent list is
    // generated from these rows; the issues it claims are claimedBy edges.
    agentRuns: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // <harness>|<session>|<agent id>, or a tracker claimant id.
      key: i.string().unique().indexed(),
      harness: i.string().indexed(),
      sessionID: i.string().indexed().optional(),
      agentID: i.string().indexed(),
      name: i.string().indexed(),
      model: i.string().optional(),
      task: i.string().optional(),
      worktree: i.string().optional(),
      branch: i.string().indexed().optional(),
      status: i.string().indexed(),
      startedAtMs: i.number().indexed().optional(),
      endedAtMs: i.number().optional(),
      logPath: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end provenance-entities
    // @generated-begin listener-control-entities: scripts/schema/generate.ts writes this region from scripts/schema/listener-control-schema.ts (ADR 0070). Change the Effect Schemas there, then run it with --write.
    // ADR 0070 (#698): one row per daemon (the mirror on one Mac, for one mirror folder). The daemon writes its heartbeat
    // every heartbeatEveryMs and the listener as it sees it; a reader calls a beat older than twice that unknown.
    agentDaemons: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // scribe-mirror|<the Mac's hardware UUID>|<the mirror folder>; the row id is stableUUID("agent-daemon",
      // daemonKey).
      daemonKey: i.string().indexed(),
      kind: i.string(),
      machineName: i.string(),
      root: i.string(),
      state: i.string(),
      startedAtMs: i.number(),
      lastHeartbeatMs: i.number().indexed(),
      heartbeatEveryMs: i.number(),
      version: i.string().optional(),
      pid: i.number().optional(),
      listenerState: i.string(),
      listenerSessionID: i.string().optional(),
      listenerName: i.string().optional(),
      listenerHost: i.string().optional(),
      listenerPane: i.string().optional(),
      listenerPid: i.number().optional(),
      listenerStartedAtMs: i.number().optional(),
      listenerStartedBy: i.string().optional(),
      listenerRecordingID: i.string().optional(),
      listenerCursor: i.number().optional(),
      listenerLastLineIndex: i.number().optional(),
      listenerLastReadAtMs: i.number().optional(),
      listenerChangedAtMs: i.number(),
      lastError: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0070 (#698): one row per command to a daemon (start, stop, or restart the listener, or report now), written
    // queued by a device or the Mac and taken and finished by the daemon; and one status row per listener change the
    // daemon saw. Each carries its moment: tapped, said, typed, terminal, or observed (ADR 0070 section 5).
    agentCommands: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The agentDaemons row this command is for.
      daemonID: i.string().indexed(),
      kind: i.string(),
      state: i.string().indexed(),
      issuedAtMs: i.number().indexed(),
      issuedFrom: i.string(),
      issuedFromDevice: i.string().optional(),
      takenAtMs: i.number().optional(),
      finishedAtMs: i.number().optional(),
      result: i.string().optional(),
      resultSessionID: i.string().optional(),
      resultPane: i.string().optional(),
      sourceKind: i.string(),
      // His words verbatim (said, typed), the control he tapped, the command line, or what the daemon saw.
      sourceQuote: i.string(),
      sourceRecordingID: i.string().indexed().optional(),
      sourceSegmentID: i.string().optional(),
      sourceLineIndex: i.number().optional(),
      sourceOffsetSeconds: i.number().optional(),
      sourceChatSessionID: i.string().optional(),
      sourceChatMessageID: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end listener-control-entities
    // @generated-begin live-lines-entities: scripts/schema/generate.ts writes this region from scripts/schema/live-lines-schema.ts (ADR 0069). Change the Effect Schemas there, then run it with --write.
    // ADR 0069 (#694): the line a live recording is still speaking. One row per line in progress, its words replaced in
    // place by each interim; the line's final writes its transcriptionSegments row once (segmentID, segmentIndex) and
    // deletes this row. Stop and the launch sweep delete what is left. Readers show it as the newest, unfinished line.
    liveLines: i.entity({
      // The recording's owner, as on its lines.
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      // The transcriptionSegments id this line takes when it is final.
      segmentID: i.string(),
      transcriptionID: i.string(),
      // The index the line takes when it is final.
      segmentIndex: i.number().indexed(),
      startTimeSeconds: i.number(),
      endTimeSeconds: i.number(),
      wallClockStartedAtMs: i.number(),
      wallClockEndedAtMs: i.number(),
      text: i.string(),
      speaker: i.number().optional(),
      wordCount: i.number(),
      wordsJSON: i.string(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end live-lines-entities
    // @generated-begin speakers-entities: scripts/schema/generate.ts writes this region from scripts/schema/speakers-schema.ts (ADR 0072). Change the Effect Schemas there, then run it with --write.
    // ADR 0072 (#699): a person whose voice is in recordings (and, #877, in podcast episodes and videos). Named in
    // playback, or the account holder the Mac's voice print recognized. Renaming the row renames the person in every
    // recording and episode. Owner-only; the voice print itself never leaves the Mac.
    speakers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      name: i.string().indexed(),
      // The account holder's own voice: the only person a voice match names without asking.
      isAccountHolder: i.boolean(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0072 (#699): a recording's diarized speaker (the number its lines carry in transcriptionSegments.speaker) is
    // this person (speakerID, a speakers row). One row per recording and number, its id derived from them; source says
    // how: named in Scribe, automatic (the account holder's voice print), or suggested (another print, unconfirmed).
    recordingSpeakers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      speakerNumber: i.number().indexed(),
      // The speakers row: the person this recording's speaker is.
      speakerID: i.string().indexed(),
      source: i.string(),
      // The voice print's cosine similarity, for automatic and suggested rows.
      similarity: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0072 amendment F (#740): one line (a transcriptionSegments row) belongs to another of its recording's speakers
    // than the number it carries: the line shows under that speaker, and that speaker's person is its person. The line
    // itself never changes. One row per line, its id derived from the line; deleting the row puts the line back.
    lineSpeakers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      // The line: a transcriptionSegments id.
      segmentID: i.string().indexed(),
      // The recording speaker the line belongs to now (a recordingSpeakers number).
      speakerNumber: i.number(),
      source: i.string(),
      // The line's voice's cosine similarity, for an automatic move.
      similarity: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0072 amendment I (#877): a podcast episode's or video's diarized speaker (the number its lines carry in
    // mediaTranscriptSegments.speaker) is this person (speakerID, a speakers row). One row per transcript and number, its
    // id derived from them; source says how: named in Scribe Videos or Scribe, automatic (a voice print, e.g. Matt's or
    // Shane's), or suggested (a print, unconfirmed). seconds is how long that number speaks in the item (the speaker index).
    mediaSpeakers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The mediaTranscripts row whose lines carry the number.
      mediaTranscriptID: i.string().indexed(),
      // Its mediaItems row: the episode or video, for the speaker index.
      mediaItemID: i.string().indexed(),
      speakerNumber: i.number().indexed(),
      // The speakers row: the person this item's speaker is.
      speakerID: i.string().indexed(),
      source: i.string(),
      // The voice print's cosine similarity, for automatic and suggested rows.
      similarity: i.number().optional(),
      // How long this number speaks in the item: the sum of its lines' spans.
      seconds: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0072 amendment J (#881): one line of a media transcript (a mediaTranscriptSegments row, by its segmentIndex)
    // shows under another of its transcript's speaker numbers than the one it carries: its own voice is that number's
    // person (automatic: the mini's per-line voice check, for a host inside a number the diarizer mixed with a guest), or he
    // moved it (named). The line itself never changes. One row per line, its id derived from the transcript and the index;
    // deleting the row puts the line back.
    mediaLineSpeakers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The mediaTranscripts row the line is on.
      mediaTranscriptID: i.string().indexed(),
      // Its mediaItems row: the episode or video.
      mediaItemID: i.string().indexed(),
      // The line: its mediaTranscriptSegments segmentIndex.
      segmentIndex: i.number().indexed(),
      // The number the line shows under now (a mediaSpeakers number of the same transcript; 1,000 and up is a person's
      // own).
      speakerNumber: i.number(),
      source: i.string(),
      // The line's voice's cosine similarity to the person's print, for an automatic move.
      similarity: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0088 (#861): one edit to a recording's speakers, never edited: a speaker named or unnamed, a person renamed or
    // merged, a line moved to another speaker or put back. It keeps the rows before and after, who made it (Scribe, an
    // agent, his voice) and the moment he asked (his line, or the message he typed). Its id derives from the command
    // (requestID) and its place in it; a command's rows share the requestID. undoesChangeID names the change it undoes.
    speakerChanges: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      kind: i.string().indexed(),
      // The recording edited (every kind but a person's rename or merge).
      recordingID: i.string().indexed().optional(),
      // The speaker named or unnamed, or the speaker a line moved to.
      speakerNumber: i.number().optional(),
      // The line moved or put back: a transcriptionSegments id.
      segmentID: i.string().indexed().optional(),
      // That line's number (#index), for people reading the row.
      lineIndex: i.number().optional(),
      // The person the speaker or the line is now, the person renamed, or the one a merge keeps.
      personID: i.string().indexed().optional(),
      // The name given.
      name: i.string().optional(),
      // The rows the edit touched, before it: what Undo puts back.
      beforeJSON: i.string().optional(),
      // The same rows after it.
      afterJSON: i.string().optional(),
      // The command: every row one command wrote shares it.
      requestID: i.string().indexed(),
      // The row's place in its command, from 0.
      position: i.number(),
      // The speakerChanges row this edit undoes.
      undoesChangeID: i.string().indexed().optional(),
      source: i.string().indexed(),
      // Who made it: the agent's name (claude-code/cli-edit-861@ld), or the device's.
      by: i.string(),
      // What wrote it: the tool and its build (scribe-edit 0.1 (110) 65f0df1a).
      writer: i.string(),
      momentKind: i.string(),
      // Said: the recording he said it in.
      momentRecordingID: i.string().indexed().optional(),
      // Said: the first line he said it in (the deep link's section).
      momentSegmentID: i.string().optional(),
      momentFirstLine: i.number().optional(),
      momentLastLine: i.number().optional(),
      // Said: seconds into that recording (the deep link's t).
      momentStartSeconds: i.number().optional(),
      // Typed: the harness and session he typed it in.
      momentSession: i.string().optional(),
      // When he said or typed it.
      momentAtMs: i.number().optional(),
      // His words, exactly as the transcript or the chat has them.
      momentQuote: i.string(),
      // The thread the agent answered him in, if any.
      threadID: i.string().optional(),
      changedAtMs: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end speakers-entities
    // @generated-begin mac-server-entities: scripts/schema/generate.ts writes this region from scripts/schema/mac-server-schema.ts (ADR 0073). Change the Effect Schemas there, then run it with --write.
    // ADR 0073 (#701): one row per owner and Mac transcription server, rewritten every 15 s while it runs. A reader calls
    // a beat older than 40 s a server that stopped. The row id is the server's version 8 UUID of owner and server name.
    macServerHeartbeats: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The server's name: "mini".
      server: i.string().indexed(),
      version: i.string(),
      startedAtMs: i.number(),
      beatAtMs: i.number().indexed(),
      streams: i.number(),
      modelsLoaded: i.boolean(),
      soundFeatures: i.string().optional(),
      cpuPercent: i.number(),
      footprintMB: i.number(),
      // What the Mac can hand out without compressing or swapping: free + file cache + purgeable + reusable (#888).
      availableMB: i.number().optional(),
      swapUsedMB: i.number().optional(),
      // Pages swapped out since the Mac started: a rise between beats is swapping now.
      swapouts: i.number().optional(),
      memoryPressure: i.string().optional(),
      // The beat that read the memory: a reader trusts it only while fresh, so an older build's numbers left in the
      // row never read as now.
      memoryAtMs: i.number().optional(),
      // The custom catalogs' own process (#887), while it runs.
      catalogHostFootprintMB: i.number().optional(),
    }),
    // @generated-end mac-server-entities
    // @generated-begin redaction-ledger-entities: scripts/schema/generate.ts writes this region from scripts/schema/redaction-ledger-schema.ts (ADR 0078). Change the Effect Schemas there, then run it with --write.
    // ADR 0078 (#720): one redacted thing (a person, phone, card, SSN, email, address, place, face, or voice). Its id is
    // keyed (HMAC of kind and value under his ledger key), so the same value is the same row in every share; the value
    // itself is only in sealedValue (AES-256-GCM, the key never in Instant). Owner-only.
    redactionEntities: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // Which ledger key made the id and the seal.
      keyID: i.string().indexed(),
      kind: i.string().indexed(),
      // base64 of nonce, ciphertext and tag: {value, display}.
      sealedValue: i.string(),
      // The speakers row when the entity is a named voice.
      speakerID: i.string().indexed().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0078 (#720): one redaction a reader of a share saw: its token (a commitment to the entity within that share),
    // its label ("Person 1"), and where it was (a line's characters and seconds, a picture's box, a clip's seconds, a
    // speaker). Id: UUID v5 of "scribe-redaction-mark:<share>:<source>:<place>". Owner-only.
    redactionMarks: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      keyID: i.string().indexed(),
      entityID: i.string().indexed(),
      shareID: i.string().indexed(),
      recordingID: i.string().indexed(),
      token: i.string().indexed(),
      label: i.string(),
      kind: i.string().indexed(),
      source: i.string().indexed(),
      detector: i.string(),
      segmentID: i.string().indexed().optional(),
      charStart: i.number().optional(),
      charEnd: i.number().optional(),
      attachmentID: i.string().indexed().optional(),
      // {x, y, w, h} in the picture's pixels.
      boxJSON: i.string().optional(),
      // The recording's clock.
      startSeconds: i.number().optional(),
      endSeconds: i.number().optional(),
      createdAtMs: i.number().indexed(),
    }),
    // @generated-end redaction-ledger-entities
    // @generated-begin share-model-entities: scripts/schema/generate.ts writes this region from scripts/schema/share-model-schema.ts (ADR 0014). Change the Effect Schemas there, then run it with --write.
    // ADR 0014 section 13.4 (#389, #718): one person a share names, by the email they sign in with. One link opens for
    // every named person; removing one person deletes one row. The id is derived from the share and the email
    // (stableUUID "scribe-share-recipient-grant:<shareID>:<email>"), so the same person twice is one row. The person
    // sees only their own row, never another recipient's email.
    recordingShareRecipients: i.entity({
      // The share's owner, stamped when the row is made.
      ownerUserID: i.string().indexed(),
      shareID: i.string().indexed(),
      recordingID: i.string().indexed(),
      email: i.string().indexed(),
      createdAtMs: i.number().indexed(),
    }),
    // ADR 0014 section 14.1 (#597, #718): one shared line as a reader sees it, after the scrubber: names and other personal
    // details replaced by their type ("[a person]"), the words' times kept for the clip. The only text of a share a
    // reader reads, and only once "passed". Id: UUID v5 of "scribe-share-scrubbed-line:<shareID>:<segmentID>". Written
    // by the scrubber as the owner; deleted with its share.
    shareScrubbedLines: i.entity({
      ownerUserID: i.string().indexed(),
      shareID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The original section (the line's final row); readers cannot read it.
      segmentID: i.string().indexed(),
      segmentIndex: i.number().indexed(),
      startSeconds: i.number(),
      endSeconds: i.number(),
      status: i.string().indexed(),
      // The scrubbed text; empty when withheld.
      text: i.string(),
      // [{text, start, end}]: a redaction is one word spanning the muted time.
      wordsJSON: i.string(),
      redactions: i.number(),
      checkedAtMs: i.number().indexed(),
    }),
    // ADR 0014 section 14.1 (#597): one image in a share's blocks as a reader sees it: faces and personal text filled solid
    // black, drawn into a new JPEG with no metadata, at scribe/<recording>/share-scrubbed/<share>/<attachment>.jpg (its
    // `file`). Readers see it only once "passed"; a failure withholds it. Id: UUID v5 of
    // "scribe-share-scrubbed-image:<shareID>:<attachmentID>".
    shareScrubbedImages: i.entity({
      ownerUserID: i.string().indexed(),
      shareID: i.string().indexed(),
      recordingID: i.string().indexed(),
      attachmentID: i.string().indexed(),
      offsetSeconds: i.number().indexed(),
      status: i.string().indexed(),
      // Why withheld, quoting nothing of the image.
      reason: i.string().optional(),
      width: i.number().optional(),
      height: i.number().optional(),
      faces: i.number(),
      textBoxes: i.number(),
      checkedAtMs: i.number().indexed(),
    }),
    // @generated-end share-model-entities
    // @generated-begin browsing-entities: scripts/schema/generate.ts writes this region from scripts/schema/browsing-schema.ts (ADR 0075). Change the Effect Schemas there, then run it with --write.
    // ADR 0075 (#713): a page Michael opened in Safari (iPhone, iPad, Mac, Vision Pro) while a recording was live, at its
    // moment on that recording's clock. Written by the app from the Safari extension's App Group inbox; owner-only.
    browsingVisits: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      // The page's address, with secret-looking query values REDACTED.
      url: i.string(),
      host: i.string().indexed(),
      // The page's title; a page that sets it after it loads may change it once.
      title: i.string().optional(),
      visitedAtMs: i.number().indexed(),
      // Seconds into the recording, through its capture clock (ADR 0034).
      offsetSeconds: i.number().indexed(),
      browser: i.string(),
      device: i.string(),
      deviceName: i.string().optional(),
      // Safari's tab id in that browser session: visits in one tab share it.
      tabID: i.number().optional(),
      navigation: i.string().optional(),
      referrerHost: i.string().optional(),
      siteName: i.string().optional(),
      // The page's meta description, cut to 500 characters.
      summary: i.string().optional(),
      canonicalURL: i.string().optional(),
      imageURL: i.string().optional(),
      language: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end browsing-entities
    // @generated-begin context-events-entities: scripts/schema/generate.ts writes this region from scripts/schema/context-events-schema.ts (ADR 0076). Change the Effect Schemas there, then run it with --write.
    // @generated-end context-events-entities
    // @generated-begin triage-entities: scripts/schema/generate.ts writes this region from scripts/schema/triage-schema.ts (ADR 0079). Change the Effect Schemas there, then run it with --write.
    // ADR 0079 (#721): one triage of one recording's lines: who (the listener live, an after-the-fact triage agent, the
    // sweep's model, or Michael), with its harness and model, the line range, start and end, and what it found (counts).
    // A line in the range with no triageVerdicts row was read and needed nothing (verdict none).
    triageRuns: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // <role>|<agent>|<recording>|<startedAtMs>: the same run imported twice is one row.
      key: i.string().unique().indexed(),
      role: i.string().indexed(),
      // An agent's run: claude-code, codex, cursor, grok, chatgpt, other. Michael's own has none.
      harness: i.string().indexed().optional(),
      // "grok-4.6", "claude-opus-5-5", "haiku".
      model: i.string().optional(),
      effort: i.string().optional(),
      // The name it posts and logs as: "grok-4.6", "claude-code/scribe-6d-triage-schema".
      agentName: i.string().indexed(),
      // ADR 0064's agentRuns row, when the run recorded one.
      agentRunID: i.string().indexed().optional(),
      sessionID: i.string().optional(),
      recordingID: i.string().indexed(),
      // The number in the recording's title when triaged (it can be renamed).
      recordingNumber: i.number().optional(),
      mode: i.string().indexed(),
      firstLineIndex: i.number(),
      lastLineIndex: i.number(),
      firstSegmentID: i.string().optional(),
      lastSegmentID: i.string().optional(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      status: i.string().indexed(),
      // A stopped run's next line: where the next run resumes.
      stoppedAtLineIndex: i.number().optional(),
      linesRead: i.number().optional(),
      bugsFiled: i.number().optional(),
      bugsMentioned: i.number().optional(),
      asksAnswered: i.number().optional(),
      asksOpen: i.number().optional(),
      ideas: i.number().optional(),
      reminders: i.number().optional(),
      flags: i.number().optional(),
      books: i.number().optional(),
      imagesSeen: i.number().optional(),
      briefPath: i.string().optional(),
      reportPath: i.string().optional(),
      // The ledger entry as the triager wrote it (~/Scribe/triage/triaged.json), kept exactly.
      sourceJSON: i.string().optional(),
      source: i.string(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): a run's verdict on a line or a run of lines: bug, ask, idea, reminder, flag, book, song, routine,
    // none, or not his; what it became (an issue by number, or a thread, reminder, flag, recognition, or idea by id); for
    // an ask, whether it was answered; and the ADR 0064 moment it wrote, when it wrote one.
    triageVerdicts: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      runID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The first line (transcriptionSegments id); endSegmentID the last, for a range.
      segmentID: i.string().indexed(),
      endSegmentID: i.string().optional(),
      firstLineIndex: i.number().indexed(),
      lastLineIndex: i.number(),
      // The first line's recording clock: the deep link's t.
      startSeconds: i.number(),
      verdict: i.string().indexed(),
      becameKind: i.string().indexed().optional(),
      // The row it became (a thread, reminder, flag, recognition, idea, or the issues row).
      becameID: i.string().indexed().optional(),
      // The issue's number: what the tracker and the issues site know it by.
      becameIssueNumber: i.number().indexed().optional(),
      issueAction: i.string().optional(),
      askState: i.string().indexed().optional(),
      notHisReason: i.string().optional(),
      // The sourceMoments row this verdict wrote (ADR 0064): the issue's mention, the flag's origin, ...
      momentID: i.string().indexed().optional(),
      confidence: i.number().optional(),
      // The triager's reading, at most 1 KiB.
      why: i.string().optional(),
      // His words exactly as the transcript has them.
      quote: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): one line's labels from one labeler: its topic path (as labeled, and the topics row it resolves to),
    // its faceted tags (as labeled, and linked), and who was talking. One row per line per labeler (model:<harness>/<model>,
    // or michael); readers take Michael's row when there is one, else the newest model row.
    lineLabels: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      segmentID: i.string().indexed(),
      lineIndex: i.number().indexed(),
      // The line's recording clock: with recordingID and segmentID, its deep link.
      startSeconds: i.number(),
      // "michael", or "model:<harness>/<model>" ("model:grok/grok-4.6").
      labeler: i.string().indexed(),
      appliedBy: i.string().indexed(),
      // The triage run that wrote it last (a model's label).
      runID: i.string().indexed().optional(),
      // One to three titles from the root, as labeled: ["Scribe", "Sharing", "Share sheet"].
      topicPathJSON: i.string(),
      // The topics row the labeled path resolves to, once the tree has it; `topics` links it and the line's other
      // topics.
      topicID: i.string().indexed().optional(),
      // The tags as labeled, after the private names became roles.
      tagsJSON: i.string(),
      speakerKind: i.string().indexed(),
      // A role from the private people map ("son", "self"), never a name.
      speakerRole: i.string().optional(),
      // The recording's diarized speaker (transcriptionSegments.speaker).
      speakerNumber: i.number().optional(),
      // The speakers row (ADR 0072), when known.
      speakerID: i.string().optional(),
      confidence: i.number().optional(),
      // The label line's other fields, kept exactly.
      extraJSON: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): a tag, by facet: area (work, home), project, place, person (a role or a speakers row, never a name),
    // activity (walk, dishes, chores, driving), or mood. One row per facet and slug; merged tags link where they went.
    tags: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      facet: i.string().indexed(),
      slug: i.string().indexed(),
      title: i.string(),
      summary: i.string().optional(),
      status: i.string().indexed(),
      // A project tag's projects row (#665).
      projectID: i.string().indexed().optional(),
      // A person tag's speakers row (ADR 0072).
      speakerID: i.string().indexed().optional(),
      source: i.string(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): one node of a proposed topic tree (Grok's topic-tree.json): its path, title, level (0 to 2), and
    // position (1 to 7). Pending until he decides: mapped onto a topic he has, accepted as a new topic, or rejected. His
    // topics stay the one tree (`scribe topics`); a proposal never shows there.
    topicProposals: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The proposal it belongs to: "<proposer>|<date>".
      proposalKey: i.string().indexed(),
      proposer: i.string(),
      harness: i.string().optional(),
      model: i.string().optional(),
      path: i.string().indexed(),
      parentPath: i.string().optional(),
      title: i.string(),
      summary: i.string().optional(),
      depth: i.number(),
      position: i.number(),
      status: i.string().indexed(),
      topicID: i.string().indexed().optional(),
      decidedAtMs: i.number().optional(),
      decidedBy: i.string().optional(),
      // The node as proposed, without its children, kept exactly.
      sourceJSON: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): one change to one of his topics, never edited: created (from a proposal, or by him), renamed, moved,
    // merged into another (topics.mergedInto says the same), retired, or restored. A topic's id never changes, so labels
    // keep pointing at it; its history says what it was called when.
    topicChanges: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      topicID: i.string().indexed(),
      kind: i.string().indexed(),
      fromTitle: i.string().optional(),
      toTitle: i.string().optional(),
      fromPath: i.string().optional(),
      toPath: i.string().optional(),
      fromParentID: i.string().optional(),
      toParentID: i.string().optional(),
      // A merge: the topic it went into.
      intoTopicID: i.string().indexed().optional(),
      // The topicProposals row it came from.
      proposalID: i.string().optional(),
      // His line or message that decided it (an ADR 0064 moment).
      momentID: i.string().optional(),
      changedAtMs: i.number().indexed(),
      // "michael", or the agent that made the change.
      by: i.string(),
      reason: i.string().optional(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0079 (#721): one entry of his day: a stay at a place (with the weather), an activity (walk, dishes, time with his
    // son), a book read aloud, a song, or a sound (the sink, the vacuum). Each at its moment: the recording, its clock, and
    // the lines when there are any; refKind and refID name the row it was read from. days/<date>.md stays his prose.
    dayEntries: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The local date in his time zone (America/New_York).
      day: i.string().indexed(),
      kind: i.string().indexed(),
      // A plain fact: "dishes", "Little Blue Truck", "Water tap, faucet".
      title: i.string(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      recordingID: i.string().indexed().optional(),
      startSeconds: i.number().optional(),
      endSeconds: i.number().optional(),
      segmentID: i.string().optional(),
      endSegmentID: i.string().optional(),
      firstLineIndex: i.number().optional(),
      lastLineIndex: i.number().optional(),
      placeName: i.string().optional(),
      weather: i.string().optional(),
      refKind: i.string().optional(),
      refID: i.string().indexed().optional(),
      runID: i.string().indexed().optional(),
      confidence: i.number().optional(),
      source: i.string(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end triage-entities
    // @generated-begin media-entities: scripts/schema/generate.ts writes this region from scripts/schema/media-schema.ts (ADR 0081). Change the Effect Schemas there, then run it with --write.
    // ADR 0081 (#864): a show, the thing that groups media items: a podcast (Matt and Shane's Secret Podcast, every feed
    // of it), a YouTube channel (#863), or another series. Owner-only; the id is stableUUID of the owner and the slug.
    mediaShows: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      kind: i.string(),
      // matt-and-shanes-secret-podcast: the show's folder in ~/Scribe/media.
      slug: i.string().indexed(),
      title: i.string(),
      author: i.string().optional(),
      // The show's public feed. Never a URL that carries a secret (a Patreon token): the writer refuses one.
      feedURL: i.string().optional(),
      websiteURL: i.string().optional(),
      artworkURL: i.string().optional(),
      description: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0081 (#864): one thing with words to listen to or watch: a podcast episode, a video (#863), an audiobook or other
    // audio (#842). The id is stableUUID of the owner and mediaKey (podcast:<show>:<episode key>, youtube:<video id>).
    mediaItems: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      kind: i.string(),
      // podcast:matt-and-shanes-secret-podcast:ep-001 or youtube:<id>: also #765's mediaPlays key.
      mediaKey: i.string().indexed(),
      showID: i.string().indexed().optional(),
      // The feed's guid for the episode.
      guid: i.string().indexed().optional(),
      title: i.string(),
      // #924: who wrote its words (a text link's byline or its feed's author, a paper's authors), shown as theirs
      // wherever it plays; absent when unknown, and its show (the site) stands for them.
      author: i.string().optional(),
      episodeNumber: i.number().indexed().optional(),
      // A part of the show's run: old-testament, main, patreon.
      series: i.string().optional(),
      publishedAtMs: i.number().indexed().optional(),
      durationSeconds: i.number().optional(),
      // A YouTube video's id (#863).
      videoID: i.string().indexed().optional(),
      // Where its audio came from: a feed's enclosure, our own archive's file.
      enclosureURL: i.string().optional(),
      enclosureBytes: i.number().optional(),
      webpageURL: i.string().optional(),
      artworkURL: i.string().optional(),
      description: i.string().optional(),
      // #922: a reading's recording, which its audio was cut from.
      recordingID: i.string().indexed().optional(),
      // #922: the reading (recordingRecognitions) it is.
      recognitionID: i.string().indexed().optional(),
      // #922: the book read (things); a reading he says was another book moves.
      thingID: i.string().indexed().optional(),
      // #922: where in the recording its audio starts, so a second of it is a second of the recording.
      recordingStartSeconds: i.number().optional(),
      // #922: its audio's $files id, beside the audioFile link.
      audioFileID: i.string().optional(),
      // #974: a clip under five minutes kept as video (ready), or why not (failed, videoFailure); absent for anything
      // longer.
      videoStatus: i.string().optional(),
      // #974: why the Mac could not keep the clip's video, in yt-dlp's own words (a site that wants a login).
      videoFailure: i.string().optional(),
      // #974: its video's $files id, beside the videoFile link.
      videoFileID: i.string().optional(),
      // #974: its video's storage path, an mp4 under library/<owner>/clips/.
      videoPath: i.string().optional(),
      // #974: its video's size, in bytes.
      videoBytes: i.number().optional(),
      // #974: its picture's width as it shows (turned upright), in pixels.
      videoWidth: i.number().optional(),
      // #974: its picture's height as it shows, in pixels.
      videoHeight: i.number().optional(),
      // #974: when the Mac kept the video, or found it could not.
      videoPreparedAtMs: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0081 (#864): one transcript of a media item: our own speech recognition (Parakeet on the Mac mini) or the item's
    // own captions. The id is stableUUID of the item and the engine, so a newer engine makes a second transcript.
    mediaTranscripts: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      mediaItemID: i.string().indexed(),
      source: i.string(),
      // parakeet-tdt-0.6b-v3, or the captions' kind (youtube-auto-captions).
      engine: i.string(),
      runtime: i.string().optional(),
      // What labeled the speakers; absent when nothing did.
      diarizer: i.string().optional(),
      language: i.string().optional(),
      machine: i.string().optional(),
      jobVersion: i.string().optional(),
      audioSeconds: i.number().optional(),
      wordCount: i.number(),
      segmentCount: i.number(),
      speakerCount: i.number().optional(),
      transcribedAtMs: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0081 (#864): one read-along line of a media transcript: its time in the item, its speaker, its text, and its
    // words as the recordings' wordsJSON ([{start, end, text}], ADR 0015 S5). A line breaks at a new speaker, a pause, or
    // a sentence, and never runs past twenty seconds.
    mediaTranscriptSegments: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      mediaTranscriptID: i.string().indexed(),
      mediaItemID: i.string().indexed(),
      segmentIndex: i.number().indexed(),
      startSeconds: i.number().indexed(),
      endSeconds: i.number(),
      text: i.string(),
      // The diarizer's number for the voice within this item; absent when no turn covers the line.
      speaker: i.number().optional(),
      wordsJSON: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0081 section 6 (#864): one chapter of a media transcript: where it starts and ends in the item (a line's start,
    // the next chapter's start), its title and one-line summary, and what made it. The id is stableUUID of the transcript
    // and the chapter's number, so making them again replaces them.
    mediaChapters: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      mediaTranscriptID: i.string().indexed(),
      mediaItemID: i.string().indexed(),
      chapterIndex: i.number().indexed(),
      startSeconds: i.number().indexed(),
      endSeconds: i.number(),
      // The transcript line it starts on.
      startSegmentIndex: i.number().optional(),
      // The transcript line it ends on.
      endSegmentIndex: i.number().optional(),
      title: i.string(),
      summary: i.string().optional(),
      // What made it: grok-4.7 at high reasoning effort (media_chapters.py), checked by code.
      model: i.string().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // #768: one media item in one of our ShazamKit custom catalogs, so the Mac server recognizes it second by second when it
    // plays near a recording: the catalog, where the item came from, its signature, and our own metadata. Every match
    // carries this row's id. The id is stableUUID of the item and the catalog.
    mediaCatalogEntries: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      mediaItemID: i.string().indexed(),
      // The item's mediaKey, also on the catalog item as customProperty:mediaKey.
      mediaKey: i.string().indexed(),
      catalog: i.string().indexed(),
      state: i.string(),
      source: i.string(),
      // The item's own page: the video's or the episode's.
      canonicalURL: i.string().optional(),
      // What the audio was read from: the link he sent, a feed's enclosure, the book's file.
      sourceURL: i.string().optional(),
      signatureSeconds: i.number().optional(),
      signatureBytes: i.number().optional(),
      signatureSHA256: i.string().optional(),
      machine: i.string().optional(),
      // Our own metadata for the item, whatever we attach.
      metadataJSON: i.string().optional(),
      catalogedAtMs: i.number().indexed().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // #924: one figure of a text link Scribe Playback reads aloud: a picture with its caption or alt text, a table, a code
    // block or an equation, shown after the transcript line it follows. A picture's file is in his Instant storage under
    // library/<owner>/documents/. The id is stableUUID of the transcript and the figure's number, so reading it again
    // replaces them.
    mediaFigures: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The document's own transcript (source document) whose lines it sits between.
      mediaTranscriptID: i.string().indexed(),
      mediaItemID: i.string().indexed(),
      figureIndex: i.number().indexed(),
      kind: i.string(),
      // The line it follows; absent when it comes before the first line.
      afterSegmentIndex: i.number().optional(),
      // Where it sits in the audio: the end of the line it follows.
      startSeconds: i.number().indexed(),
      caption: i.string().optional(),
      // A picture's alt text, as the page wrote it.
      alt: i.string().optional(),
      // A table's cells (one row a line, cells joined by |), a code block, an equation.
      text: i.string().optional(),
      // Where the picture came from: the page's own image address. Never one that carries a secret.
      sourceURL: i.string().optional(),
      // Its picture's $files id, beside the imageFile link.
      imageFileID: i.string().optional(),
      // Its picture's storage path, under library/<owner>/documents/.
      imagePath: i.string().optional(),
      // The picture's width in pixels.
      width: i.number().optional(),
      height: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end media-entities
    // @generated-begin agent-status-entities: scripts/schema/generate.ts writes this region from scripts/schema/agent-status-schema.ts (ADR 0080). Change the Effect Schemas there, then run it with --write.
    // ADR 0080 (#819): one row per agent and recording room, written by the Mac's mirror when the agent's work changes and
    // at least once a minute while it runs. A reader calls a heartbeat older than 2 minutes a Mac that stopped publishing.
    // The row id is stableUUID("scribe-mirror", "agent-work", roomID, agentKey). Client work is never written here.
    agentStatuses: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The recording's room: roomIDForRecording(recordingID), as the room's other agent rows.
      roomID: i.string().indexed(),
      recordingID: i.string().indexed(),
      // The agent: its Claude Code session id, or its agents-registry.json row's id.
      agentKey: i.string().indexed(),
      // The name a person knows it by: status-819, claude-code-2.
      name: i.string(),
      harness: i.string(),
      // The Claude account's handle (strangelearning, halfjew22); never an address.
      account: i.string().optional(),
      // The Mac it runs on.
      host: i.string(),
      state: i.string().indexed(),
      // The issue it works on first, in issues.pisspoursoftware.xyz.
      issueNumber: i.number().indexed().optional(),
      startedAtMs: i.number().optional(),
      heartbeatAtMs: i.number().indexed(),
      // When it finished, or left this room for a newer recording's.
      stoppedAtMs: i.number().optional(),
      // AgentWork v1 (scripts/scribe-mirror/agent-work.ts), at most 4 KiB.
      workJSON: i.string(),
    }),
    // @generated-end agent-status-entities
    // @generated-begin video-queue-entities: scripts/schema/generate.ts writes this region from scripts/schema/video-queue-schema.ts (ADR 0082). Change the Effect Schemas there, then run it with --write.
    // #863: a YouTube video in Scribe Videos' queue, in his order (rank), with where to resume it, his speed, and the
    // audio the Mac prepared for the screen off (library/<owner>/videos/<videoID>.m4a). Owner-only.
    videoQueueItems: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // A video's YouTube id; an episode has none.
      videoID: i.string().indexed().optional(),
      // video, podcastEpisode, webMedia or document (#924, a text link read aloud); absent on a row from before
      // episodes (a video).
      kind: i.string().optional(),
      // Its media library key (ADR 0081): where its words are.
      mediaKey: i.string().indexed().optional(),
      // An episode's own audio file (its feed's enclosure); the phone downloads it.
      audioURL: i.string().optional(),
      // A web link's page (webMedia), which the Mac's yt-dlp fetches; a text link's page or PDF (document, #924),
      // which the Mac reads aloud.
      sourceURL: i.string().optional(),
      artworkURL: i.string().optional(),
      // #908: an episode's video (HLS or MP4), streamed on the phone and never kept; never an address that carries a
      // secret.
      videoURL: i.string().optional(),
      // #908: an episode's web page, what Open opens.
      pageURL: i.string().optional(),
      // YouTube's title, from oEmbed or yt-dlp; filled once.
      title: i.string().optional(),
      channelName: i.string().optional(),
      // #924: who wrote a text link's words, as the Mac read them (its byline, its feed's author, a paper's authors);
      // filled once, with its title.
      author: i.string().optional(),
      // The queue is sorted by rank; a move gives one row a rank between its neighbours.
      rank: i.number().indexed(),
      addedAtMs: i.number().indexed(),
      addedFrom: i.string(),
      // Where to resume, in seconds into the video.
      positionSeconds: i.number(),
      positionUpdatedAtMs: i.number().optional(),
      // His speed for this video; absent plays at the app's default.
      playbackRate: i.number().optional(),
      // Played to its end; cleared when he plays it again past its start.
      finishedAtMs: i.number().optional(),
      durationSeconds: i.number().optional(),
      audioStatus: i.string().indexed(),
      // Why the Mac could not get the audio, in yt-dlp's own words.
      audioFailure: i.string().optional(),
      // The audio's $files id, beside the audioFile link (as recordingID beside recording): the phone downloads by it.
      audioFileID: i.string().optional(),
      audioBytes: i.number().optional(),
      audioPreparedAtMs: i.number().optional(),
      createdAtMs: i.number().indexed(),
      // When a writer last changed the row. A stamp, not a gate: the phone (often offline) and the Mac write on two
      // clocks, and a forward-only updatedAtMs would refuse a resume point saved behind the Mac's clock.
      changedAtMs: i.number().indexed(),
    }),
    // #905: one of his named playlists in Scribe Videos, in his order among them (rank). Its items are
    // videoPlaylistEntries rows; the queue itself stays videoQueueItems' own order. Owner-only.
    videoPlaylists: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // His name for it.
      name: i.string(),
      // His playlists are sorted by rank; a move gives one row a rank between its neighbours.
      rank: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      // When a writer last changed the row: a stamp, not a gate (the phone and the CLI write on two clocks).
      changedAtMs: i.number().indexed(),
    }),
    // #905: one queue item (videoQueueItems, by id) in one playlist (videoPlaylists, by id), at its place there (rank).
    // An item in three playlists has three entries. Owner-only.
    videoPlaylistEntries: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The videoPlaylists row.
      playlistID: i.string().indexed(),
      // The videoQueueItems row.
      itemID: i.string().indexed(),
      // The playlist's items are sorted by rank.
      rank: i.number().indexed(),
      addedAtMs: i.number().indexed(),
      createdAtMs: i.number().indexed(),
      // When a writer last changed the row: a stamp, not a gate.
      changedAtMs: i.number().indexed(),
    }),
    // @generated-end video-queue-entities
    // @generated-begin media-plays-entities: scripts/schema/generate.ts writes this region from scripts/schema/media-plays-schema.ts (ADR 0036). Change the Effect Schemas there, then run it with --write.
    // ADR 0036 addendum-played-ranges (#768): one stretch of one thing that played during a recording: a song's hearing, a
    // YouTube span, an episode or a book an app played, an item one of our catalogs recognized. Both clocks (the
    // recording's seconds and the media's), how it was known, and the link that opens the media where the stretch began.
    mediaPlays: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      recordingID: i.string().indexed(),
      kind: i.string().indexed(),
      // youtube:<id>, podcast:<show>:<episode>, audiobook:books:<slug>, shazam:<id>, isrc:<code>,
      // song:<title>|<artist>.
      mediaKey: i.string().indexed(),
      // The media library's row (mediaItems) when the item is in it.
      mediaItemID: i.string().indexed().optional(),
      // The catalog entry (mediaCatalogEntries) whose signature one of our catalogs matched (#768).
      catalogEntryID: i.string().indexed().optional(),
      title: i.string().optional(),
      // The artist, the channel, or the show.
      subtitle: i.string().optional(),
      source: i.string().indexed(),
      // The catalog that knew it: shazam, or one of ours (scribe-videos).
      catalog: i.string().optional(),
      // The app that played it, when known: a bundle id, or safari.
      player: i.string().optional(),
      // Where the stretch starts on the recording's clock.
      startSeconds: i.number().indexed(),
      // Where it ends on the recording's clock; while it plays, the last second it was known to play.
      endSeconds: i.number().indexed(),
      // False while it may still be playing (no end written yet).
      ended: i.boolean().indexed(),
      startedAtMs: i.number().indexed(),
      endedAtMs: i.number().optional(),
      // Where in the media the stretch starts; absent when the catalog gave no position.
      mediaStartSeconds: i.number().optional(),
      mediaEndSeconds: i.number().optional(),
      mediaLengthSeconds: i.number().optional(),
      // Its playback rate: 1 is normal speed.
      rate: i.number().optional(),
      // 0 to 1.
      confidence: i.number().optional(),
      // The song's artwork or the video's thumbnail.
      artworkURL: i.string().optional(),
      // Opens the media where the stretch began: youtu.be/<id>?t=<s>, scribevideos://play?..., the song's page.
      openURL: i.string().optional(),
      endReason: i.string().optional(),
      fromEntity: i.string(),
      // The row it comes from: the song's runtime event, the youtubeListens span, the play's start event.
      fromID: i.string().indexed(),
      // The stretch it is evidence of (#903): the rows that saw one stretch of one medium share it, each with its own
      // source. The app's own row's id, else the earliest row's.
      stretchID: i.string().indexed().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end media-plays-entities
    // @generated-begin reminders-work-entities: scripts/schema/generate.ts writes this region from scripts/schema/reminders-work-schema.ts (ADR 0054). Change the Effect Schemas there, then run it with --write.
    // @generated-end reminders-work-entities
    // @generated-begin progressive-media-entities: scripts/schema/generate.ts writes this region from scripts/schema/progressive-media-schema.ts (ADR 0091). Change the Effect Schemas there, then run it with --write.
    // ADR 0091 (#1012): a recording generation's compressed copy (AAC-LC, 24 kHz, 32 kbps, in 6 s fragmented MP4
    // segments): its format, its initialization segment's storage path, and how far it is stored. The library rewrites the
    // whole row with each segment; only state, segmentCount, durationSeconds and updatedAtMs change.
    progressiveMediaStreams: i.entity({
      ownerUserID: i.string().indexed(),
      // RFC 6381's codecs value: mp4a.40.2 is AAC-LC.
      codecs: i.string(),
      sampleRate: i.number(),
      channelCount: i.number(),
      bitRate: i.number(),
      // The length the segmenter cuts at; the last segment may be shorter.
      segmentSeconds: i.number(),
      initializationPath: i.string(),
      state: i.string().indexed(),
      // Segments 0..<segmentCount are stored and listed.
      segmentCount: i.number(),
      // The end of the last listed segment.
      durationSeconds: i.number(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0091 (#1012): one stored segment of a compressed copy, written once its file is stored. Its id comes from its
    // stream's id and its index, so a replayed write restates the same row; nothing of it changes.
    progressiveMediaSegments: i.entity({
      ownerUserID: i.string().indexed(),
      streamID: i.string().indexed(),
      index: i.number().indexed(),
      startSeconds: i.number(),
      durationSeconds: i.number(),
      byteCount: i.number(),
      path: i.string(),
      createdAtMs: i.number().indexed(),
    }),
    // @generated-end progressive-media-entities
    // @generated-begin list-preview-entities: scripts/schema/generate.ts writes this region from scripts/schema/list-preview-schema.ts (Instant ADR 0015 Q34). Change the Effect Schemas there, then run it with --write.
    // @generated-end list-preview-entities
    // @generated-begin live-room-entities: scripts/schema/generate.ts writes this region from scripts/schema/live-room-schema.ts (ADR 0094). Change the Effect Schemas there, then run it with --write.
    // @generated-end live-room-entities
    // @generated-begin questions-entities: scripts/schema/generate.ts writes this region from scripts/schema/questions-schema.ts (ADR 0095). Change the Effect Schemas there, then run it with --write.
    // ADR 0095 (#1176): a question he asked (or an agent asked him, #1048), kept to learn from: one plain sentence, who asked,
    // a learning mark, its topics. His words are its moments (sourceMoments, subject "question": one per stretch, disjoint
    // and across recordings); its answers are questionAnswers. Id: his first asked line's (QuestionIDs).
    questions: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // The question as one plain sentence he could be asked again; his own words are its moments' quotes.
      text: i.string(),
      // "michael" | "agent" (Recording 208 #2795: "Who asked?").
      askedBy: i.string().indexed(),
      // The agent's name when an agent asked (#1048).
      askerName: i.string().optional(),
      // He wants to learn about it (Recording 297 #91): the review set.
      learning: i.boolean().indexed(),
      // "open" | "answered" | "dismissed" (not a question to keep; nothing is deleted).
      status: i.string().indexed(),
      // The recording of its first asked moment; absent for a typed question.
      recordingID: i.string().indexed().optional(),
      // The first asked line's wall clock: "last week" is one range query.
      askedAtMs: i.number().indexed(),
      // The thread an agent posed it in (#1048): its moment, as an answer's (ADR 0064 section 1.2).
      threadID: i.string().indexed().optional(),
      // The listener's reading: what he wanted to know, and why it is (or is not) a learning question.
      note: i.string().optional(),
      // Tracker issues it led to or that answer it, by number ([1176]), until the tracker moves in (ADR 0064 section
      // 4.3).
      issueNumbersJSON: i.string().optional(),
      source: i.string().indexed(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // ADR 0095 (#1176): one answer to a question: who answered (Recording 208 #2794: "your answer is recorded as who you
    // are"), the answer word for word, and where it was given: a thread's message (its line is its moment, ADR 0064 section
    // 1.2) or its own moments (sourceMoments, subject "questionAnswer", role "answered").
    questionAnswers: i.entity({
      ownerUserID: i.string().indexed(),
      formatVersion: i.number(),
      // Its question (and the question link).
      questionID: i.string().indexed(),
      // "agent" | "michael" | "person" | "source".
      answeredBy: i.string().indexed(),
      // The agent's name, Michael, a person as he names them, or the source's title.
      answererName: i.string(),
      // The answer as given; a thread's answer word for word.
      text: i.string(),
      // The thread it was given in (agentThreads).
      threadID: i.string().indexed().optional(),
      // The message that holds it (agentResponses); a message names its thread.
      responseID: i.string().indexed().optional(),
      // A source it cites.
      url: i.string().optional(),
      answeredAtMs: i.number().indexed(),
      source: i.string().indexed(),
      writer: i.string(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    // @generated-end questions-entities
  },
  links: {
    agentResponseArtifactOwner: {
      forward: {
        on: 'agentResponseArtifactsV1',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'agentResponseArtifactsV1',
      },
    },
    agentResponseArtifactRecording: {
      forward: {
        on: 'agentResponseArtifactsV1',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordings',
        has: 'many',
        label: 'agentResponseArtifacts',
      },
    },
    agentResponseArtifactTranscription: {
      forward: {
        on: 'agentResponseArtifactsV1',
        has: 'one',
        label: 'transcription',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'transcriptions',
        has: 'many',
        label: 'agentResponseArtifacts',
      },
    },
    imageAnalysisImage: {
      forward: {
        on: 'recordingAttachments',
        has: 'many',
        label: 'analyses',
      },
      reverse: {
        on: 'imageAnalyses',
        has: 'one',
        label: 'image',
        onDelete: 'cascade',
      },
    },
    imageAnalysisPrompt: {
      forward: {
        on: 'imageAnalysisPrompts',
        has: 'many',
        label: 'analyses',
      },
      reverse: {
        on: 'imageAnalyses',
        has: 'one',
        label: 'prompt',
      },
    },
    imageAnalysisVisibleSegmentRange: {
      forward: {
        on: 'imageVisibleSegmentRanges',
        has: 'one',
        label: 'analysis',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'imageAnalyses',
        has: 'one',
        label: 'visibleSegmentRange',
      },
    },
    imageRangeFirstSegment: {
      forward: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'startingImageRanges',
      },
      reverse: {
        on: 'imageVisibleSegmentRanges',
        has: 'one',
        label: 'firstSegment',
        onDelete: 'cascade',
      },
    },
    imageRangeLastSegment: {
      forward: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'endingImageRanges',
      },
      reverse: {
        on: 'imageVisibleSegmentRanges',
        has: 'one',
        label: 'lastSegment',
        onDelete: 'cascade',
      },
    },
    recordingOwner: {
      forward: {
        on: 'recordings',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'recordings',
      },
    },
    recordingReaders: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'readers',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'readableRecordings',
      },
    },
    recordingWriters: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'writers',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'writableRecordings',
      },
    },
    recordingSegmentShareOwner: {
      forward: {
        on: 'recordingSegmentShares',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'ownedRecordingSegmentShares',
      },
    },
    recordingSegmentShareReaders: {
      forward: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'readers',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'readableSegmentShares',
      },
    },
    sharedSettingsOwner: {
      forward: {
        on: 'sharedSettings',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'ownedSettings',
      },
    },
    shareRecipientOwner: {
      forward: {
        on: 'shareRecipients',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'shareRecipients',
      },
    },
    recordingSegmentShareRecording: {
      forward: {
        on: 'recordingSegmentShares',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordings',
        has: 'many',
        label: 'segmentShares',
      },
    },
    recordingSegmentShareSegments: {
      forward: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'segments',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'segmentShares',
      },
    },
    recordingTranscriptions: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'transcriptions',
      },
      reverse: {
        on: 'transcriptions',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    // ADR 0015 / #155 S1: reverse includes for list multi-bag
    // (segments limit 2 + attachments for thumbs). Dual-write graph refs
    // from Swift alongside string recordingID FKs.
    recordingSegments: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'segments',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    // Recording-list preview slots. Segment n occupies slot n % 2, so the two slots hold the two
    // latest final segments. The server applies `limit` only at the top level, so the list must
    // not include `segments` (it would receive every segment); a has-one link is bounded.
    recordingPreviewSegmentA: {
      forward: {
        on: 'recordings',
        has: 'one',
        label: 'previewSegmentA',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'previewOfRecordingsA',
      },
    },
    recordingPreviewSegmentB: {
      forward: {
        on: 'recordings',
        has: 'one',
        label: 'previewSegmentB',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'previewOfRecordingsB',
      },
    },
    recordingHasAttachments: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'attachments',
      },
      reverse: {
        on: 'recordingAttachments',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    recordingHasRouteChunks: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'routeChunks',
      },
      reverse: {
        on: 'recordingRouteChunks',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    // ADR 0044: a recording's listening spans and comments go with it; the video's thing stays.
    recordingYouTubeListens: {
      forward: { on: 'recordings', has: 'many', label: 'youtubeListens' },
      reverse: {
        on: 'youtubeListens',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    thingYouTubeListens: {
      forward: { on: 'things', has: 'many', label: 'youtubeListens' },
      reverse: { on: 'youtubeListens', has: 'one', label: 'thing' },
    },
    recordingYouTubeComments: {
      forward: { on: 'recordings', has: 'many', label: 'youtubeComments' },
      reverse: {
        on: 'youtubeComments',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    thingYouTubeComments: {
      forward: { on: 'things', has: 'many', label: 'youtubeComments' },
      reverse: { on: 'youtubeComments', has: 'one', label: 'thing' },
    },
    youtubeListenComments: {
      forward: { on: 'youtubeListens', has: 'many', label: 'comments' },
      reverse: { on: 'youtubeComments', has: 'one', label: 'listen' },
    },
    youtubeCommentShare: {
      forward: { on: 'youtubeComments', has: 'one', label: 'share' },
      reverse: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'youtubeComments',
      },
    },
    // ADR 0014 section 13.4: a share's audio clip.
    recordingSegmentShareAudioClip: {
      forward: { on: 'recordingSegmentShares', has: 'one', label: 'audioClip' },
      reverse: { on: '$files', has: 'many', label: 'shareClips' },
    },
    // ADR 0044 section 8: a public projection goes with its share. It has no owner link: a forward has-one link is
    // returned as an attribute of the row (measured on bd40c50a, 2026-10-03), which would show a signed-out reader the
    // owner's user id; its rules reach the owner through the share instead. The share link shows only the row's own id.
    publicShareSource: {
      forward: {
        on: 'publicShares',
        has: 'one',
        label: 'share',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordingSegmentShares',
        has: 'one',
        label: 'publicShare',
      },
    },
    publicShareClip: {
      forward: { on: 'publicShares', has: 'one', label: 'audioClip' },
      reverse: { on: '$files', has: 'many', label: 'publicShareClips' },
    },
    // #533: a recording's live audio chunks go with it.
    recordingHasAudioChunks: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'audioChunks',
      },
      reverse: {
        on: 'recordingAudioChunks',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    recordingHasSounds: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'sounds',
      },
      reverse: {
        on: 'recordingSounds',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    recordingHasRuntimeEvents: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'runtimeEvents',
      },
      reverse: {
        on: 'recordingRuntimeEvents',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    // ADR 0040: the live recording's plays of other recordings, deleted with it.
    recordingHasPlaybacks: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'playbacks',
      },
      reverse: {
        on: 'recordingPlaybacks',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
    },
    // ADR 0040: where a recording was played. The row stays when the played recording goes.
    recordingPlayedInPlaybacks: {
      forward: {
        on: 'recordings',
        has: 'many',
        label: 'playedIn',
      },
      reverse: {
        on: 'recordingPlaybacks',
        has: 'one',
        label: 'playedRecording',
      },
    },
    transcriptionSegmentsLink: {
      forward: {
        on: 'transcriptions',
        has: 'many',
        label: 'segments',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'one',
        label: 'transcription',
        onDelete: 'cascade',
      },
    },
    transcriptionSegmentWords: {
      forward: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'words',
      },
      reverse: {
        on: 'transcriptionWords',
        has: 'one',
        label: 'segment',
        onDelete: 'cascade',
      },
    },
    issueFiles: {
      forward: {
        on: 'instantToolsIssues',
        has: 'many',
        label: 'files',
      },
      reverse: {
        on: '$files',
        has: 'many',
        label: 'issues',
      },
    },
    // ADR 0024: an identity belongs to at most one account link. The rules read it as
    // auth.ref('$user.accountLink.members.id').
    accountLinkMembers: {
      forward: {
        on: 'accountLinks',
        has: 'many',
        label: 'members',
      },
      reverse: {
        on: '$users',
        has: 'one',
        label: 'accountLink',
      },
    },
    agentPushDeviceOwner: {
      forward: {
        on: 'agentPushDevices',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: { on: '$users', has: 'many', label: 'agentPushDevices' },
    },
    libraryItemsBook: {
      forward: {
        on: 'libraryItems',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryBooks', has: 'many', label: 'items' },
    },
    libraryItemsShelf: {
      forward: { on: 'libraryItems', has: 'one', label: 'shelf' },
      reverse: { on: 'libraryShelves', has: 'many', label: 'items' },
    },
    libraryItemsPreferredAudio: {
      forward: { on: 'libraryItems', has: 'one', label: 'preferredAudio' },
      reverse: {
        on: 'libraryRenditions',
        has: 'many',
        label: 'preferredByAudio',
      },
    },
    libraryItemsPreferredText: {
      forward: { on: 'libraryItems', has: 'one', label: 'preferredText' },
      reverse: {
        on: 'libraryRenditions',
        has: 'many',
        label: 'preferredByText',
      },
    },
    libraryBooksAuthors: {
      forward: { on: 'libraryBooks', has: 'many', label: 'authors' },
      reverse: { on: 'libraryAuthors', has: 'many', label: 'books' },
    },
    libraryBooksNarrators: {
      forward: { on: 'libraryBooks', has: 'many', label: 'narrators' },
      reverse: { on: 'libraryNarrators', has: 'many', label: 'books' },
    },
    libraryBooksCover: {
      forward: { on: 'libraryBooks', has: 'one', label: 'cover' },
      reverse: { on: 'libraryFiles', has: 'one', label: 'coverFor' },
    },
    libraryChaptersBook: {
      forward: {
        on: 'libraryChapters',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryBooks', has: 'many', label: 'chapters' },
    },
    libraryRenditionsBook: {
      forward: {
        on: 'libraryRenditions',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryBooks', has: 'many', label: 'renditions' },
    },
    libraryFilesRendition: {
      forward: {
        on: 'libraryFiles',
        has: 'one',
        label: 'rendition',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryRenditions', has: 'many', label: 'files' },
    },
    librarySegmentsRendition: {
      forward: {
        on: 'librarySegments',
        has: 'one',
        label: 'rendition',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryRenditions', has: 'many', label: 'segments' },
    },
    librarySegmentsChapter: {
      forward: { on: 'librarySegments', has: 'one', label: 'chapter' },
      reverse: { on: 'libraryChapters', has: 'many', label: 'segments' },
    },
    libraryNotesItem: {
      forward: {
        on: 'libraryNotes',
        has: 'one',
        label: 'item',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryItems', has: 'many', label: 'notes' },
    },
    libraryNotesRendition: {
      forward: { on: 'libraryNotes', has: 'one', label: 'rendition' },
      reverse: { on: 'libraryRenditions', has: 'many', label: 'notes' },
    },
    libraryNotesChapter: {
      forward: { on: 'libraryNotes', has: 'one', label: 'chapter' },
      reverse: { on: 'libraryChapters', has: 'many', label: 'notes' },
    },
    libraryProgressItem: {
      forward: {
        on: 'libraryProgress',
        has: 'one',
        label: 'item',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryItems', has: 'many', label: 'progress' },
    },
    libraryProgressRendition: {
      forward: { on: 'libraryProgress', has: 'one', label: 'rendition' },
      reverse: { on: 'libraryRenditions', has: 'many', label: 'progress' },
    },
    libraryProgressChapter: {
      forward: { on: 'libraryProgress', has: 'one', label: 'chapter' },
      reverse: { on: 'libraryChapters', has: 'many', label: 'progress' },
    },
    libraryBookmarksItem: {
      forward: {
        on: 'libraryBookmarks',
        has: 'one',
        label: 'item',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryItems', has: 'many', label: 'bookmarks' },
    },
    libraryBookmarksRendition: {
      forward: { on: 'libraryBookmarks', has: 'one', label: 'rendition' },
      reverse: { on: 'libraryRenditions', has: 'many', label: 'bookmarks' },
    },
    libraryBookmarksChapter: {
      forward: { on: 'libraryBookmarks', has: 'one', label: 'chapter' },
      reverse: { on: 'libraryChapters', has: 'many', label: 'bookmarks' },
    },
    appMembershipsMember: {
      forward: { on: 'appMemberships', has: 'one', label: 'member' },
      reverse: { on: '$users', has: 'many', label: 'appMemberships' },
    },
    librarySharesBook: {
      forward: {
        on: 'libraryShares',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryBooks', has: 'many', label: 'shares' },
    },
    librarySharesChapter: {
      forward: {
        on: 'libraryShares',
        has: 'one',
        label: 'chapter',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryChapters', has: 'many', label: 'shares' },
    },
    librarySharesNote: {
      forward: {
        on: 'libraryShares',
        has: 'one',
        label: 'note',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryNotes', has: 'many', label: 'shares' },
    },
    libraryCommentsShare: {
      forward: {
        on: 'libraryComments',
        has: 'one',
        label: 'share',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryShares', has: 'many', label: 'comments' },
    },
    libraryCommentsNote: {
      forward: {
        on: 'libraryComments',
        has: 'one',
        label: 'note',
        onDelete: 'cascade',
      },
      reverse: { on: 'libraryNotes', has: 'many', label: 'comments' },
    },
    // A library file's bytes in Instant storage, at library/<ownerUserID>/...: covers, and audio that streams from Instant.
    libraryFilesBlob: {
      forward: { on: 'libraryFiles', has: 'one', label: 'blob' },
      reverse: { on: '$files', has: 'one', label: 'libraryFile' },
    },
    recordingHasRecognitions: {
      forward: {
        on: 'recordingRecognitions',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'recognitions' },
    },
    thingHasRecognitions: {
      forward: { on: 'recordingRecognitions', has: 'one', label: 'thing' },
      reverse: { on: 'things', has: 'many', label: 'recognitions' },
    },
    // ADR 0052: a library book and the thing for its ISBN-13, so the reader shows every moment it was read aloud.
    libraryBooksThing: {
      forward: { on: 'libraryBooks', has: 'one', label: 'thing' },
      reverse: { on: 'things', has: 'many', label: 'libraryBooks' },
    },
    // ADR 0048 Amendment 2 (#613): an edge goes with either of its things; its source is the book that printed it; its
    // moments are the recognitions (mentions, readings) whose lines carried it.
    thingRelationsSubject: {
      forward: {
        on: 'thingRelations',
        has: 'one',
        label: 'subject',
        onDelete: 'cascade',
      },
      reverse: { on: 'things', has: 'many', label: 'relationsOut' },
    },
    thingRelationsObject: {
      forward: {
        on: 'thingRelations',
        has: 'one',
        label: 'object',
        onDelete: 'cascade',
      },
      reverse: { on: 'things', has: 'many', label: 'relationsIn' },
    },
    thingRelationsSource: {
      forward: { on: 'thingRelations', has: 'one', label: 'source' },
      reverse: { on: 'things', has: 'many', label: 'sourcedRelations' },
    },
    thingRelationsMoments: {
      forward: { on: 'thingRelations', has: 'many', label: 'moments' },
      reverse: { on: 'recordingRecognitions', has: 'many', label: 'relations' },
    },
    // The moment that discovered a thing (#857).
    thingDiscovery: {
      forward: { on: 'things', has: 'one', label: 'discovery' },
      reverse: {
        on: 'recordingRecognitions',
        has: 'many',
        label: 'discovered',
      },
    },
    // A page visit's reading, its page, and every moment's lines (#643).
    recognitionReading: {
      forward: { on: 'recordingRecognitions', has: 'one', label: 'reading' },
      reverse: {
        on: 'recordingRecognitions',
        has: 'many',
        label: 'pageVisits',
      },
    },
    recognitionPart: {
      forward: { on: 'recordingRecognitions', has: 'one', label: 'part' },
      reverse: { on: 'thingParts', has: 'many', label: 'visits' },
    },
    recognitionLines: {
      forward: { on: 'recordingRecognitions', has: 'many', label: 'lines' },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'recognitions',
      },
    },
    // A thing's pages go with it.
    thingPartsThing: {
      forward: {
        on: 'thingParts',
        has: 'one',
        label: 'thing',
        onDelete: 'cascade',
      },
      reverse: { on: 'things', has: 'many', label: 'parts' },
    },
    // ADR 0054 (#525): a list's reminders go with it; tags are many to many; a moment goes with its reminder and with
    // its recording. Deleting a recording never deletes a reminder.
    remindersItemsList: {
      forward: {
        on: 'remindersItems',
        has: 'one',
        label: 'list',
        onDelete: 'cascade',
      },
      reverse: { on: 'remindersLists', has: 'many', label: 'items' },
    },
    remindersItemsTags: {
      forward: { on: 'remindersItems', has: 'many', label: 'tags' },
      reverse: { on: 'remindersTags', has: 'many', label: 'items' },
    },
    remindersMomentsReminder: {
      forward: {
        on: 'remindersMoments',
        has: 'one',
        label: 'reminder',
        onDelete: 'cascade',
      },
      reverse: { on: 'remindersItems', has: 'many', label: 'moments' },
    },
    remindersMomentsRecording: {
      forward: {
        on: 'remindersMoments',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'reminderMoments' },
    },
    // #665: the topic tree, everything cross-referenced, and each row's sources. A moment goes with its subject and with
    // its recording; deleting a recording never deletes a flag, idea, topic, project, or issue reference.
    topicsParent: {
      forward: { on: 'topics', has: 'one', label: 'parent' },
      reverse: { on: 'topics', has: 'many', label: 'children' },
    },
    ideasTopics: {
      forward: { on: 'ideas', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'ideas' },
    },
    projectsTopics: {
      forward: { on: 'projects', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'projects' },
    },
    flagsTopics: {
      forward: { on: 'flags', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'flags' },
    },
    issueRefsTopics: {
      forward: { on: 'issueRefs', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'issues' },
    },
    ideasProjects: {
      forward: { on: 'ideas', has: 'many', label: 'projects' },
      reverse: { on: 'projects', has: 'many', label: 'ideas' },
    },
    issueRefsIdeas: {
      forward: { on: 'issueRefs', has: 'many', label: 'ideas' },
      reverse: { on: 'ideas', has: 'many', label: 'issues' },
    },
    issueRefsProjects: {
      forward: { on: 'issueRefs', has: 'many', label: 'projects' },
      reverse: { on: 'projects', has: 'many', label: 'issues' },
    },
    flagsIdea: {
      forward: { on: 'flags', has: 'one', label: 'idea' },
      reverse: { on: 'ideas', has: 'many', label: 'flags' },
    },
    flagsIssue: {
      forward: { on: 'flags', has: 'one', label: 'issue' },
      reverse: { on: 'issueRefs', has: 'many', label: 'flags' },
    },
    sourceMomentsRecording: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'sourceMoments' },
    },
    sourceMomentsLines: {
      forward: { on: 'sourceMoments', has: 'many', label: 'lines' },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'sourceMoments',
      },
    },
    sourceMomentsFlag: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'flag',
        onDelete: 'cascade',
      },
      reverse: { on: 'flags', has: 'many', label: 'moments' },
    },
    sourceMomentsIdea: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'idea',
        onDelete: 'cascade',
      },
      reverse: { on: 'ideas', has: 'many', label: 'moments' },
    },
    sourceMomentsTopic: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'topic',
        onDelete: 'cascade',
      },
      reverse: { on: 'topics', has: 'many', label: 'moments' },
    },
    sourceMomentsProject: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'project',
        onDelete: 'cascade',
      },
      reverse: { on: 'projects', has: 'many', label: 'moments' },
    },
    sourceMomentsIssue: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'issue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issueRefs', has: 'many', label: 'moments' },
    },
    // @generated-begin provenance-links: scripts/schema/generate.ts writes this region from scripts/schema/provenance-schema.ts (ADR 0064). Change the Effect Schemas there, then run it with --write.
    // ADR 0064: a typed moment's message; the moment goes with it. Forward on the moment, the row made with the link
    // (section 6's link rule).
    sourceMomentsChatMessage: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'chatMessage',
        onDelete: 'cascade',
      },
      reverse: { on: 'chatMessages', has: 'many', label: 'moments' },
    },
    // A seen moment's image.
    sourceMomentsImage: {
      forward: { on: 'sourceMoments', has: 'one', label: 'image' },
      reverse: {
        on: 'recordingAttachments',
        has: 'many',
        label: 'sourceMoments',
      },
    },
    // A reminder's typed or seen moment (its said moments stay in remindersMoments, ADR 0054).
    sourceMomentsReminder: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'reminder',
        onDelete: 'cascade',
      },
      reverse: { on: 'remindersItems', has: 'many', label: 'sourceMoments' },
    },
    // The moment that justifies an edge.
    edgesMoment: {
      forward: { on: 'edges', has: 'one', label: 'moment' },
      reverse: { on: 'sourceMoments', has: 'many', label: 'edges' },
    },
    // ADR 0064 section 4.4: issueRefs becomes real links (trackedIssue, trackedIssues).
    issuesProject: {
      forward: { on: 'issues', has: 'one', label: 'project' },
      reverse: { on: 'projects', has: 'many', label: 'trackedIssues' },
    },
    issuesTopics: {
      forward: { on: 'issues', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'trackedIssues' },
    },
    issuesIdeas: {
      forward: { on: 'issues', has: 'many', label: 'ideas' },
      reverse: { on: 'ideas', has: 'many', label: 'trackedIssues' },
    },
    flagsTrackedIssue: {
      forward: { on: 'flags', has: 'one', label: 'trackedIssue' },
      reverse: { on: 'issues', has: 'many', label: 'flags' },
    },
    // An issue's moments go with it.
    sourceMomentsTrackedIssue: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'trackedIssue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issues', has: 'many', label: 'moments' },
    },
    issueCriteriaIssue: {
      forward: {
        on: 'issueCriteria',
        has: 'one',
        label: 'issue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issues', has: 'many', label: 'criteria' },
    },
    issueWorkLogsIssue: {
      forward: {
        on: 'issueWorkLogs',
        has: 'one',
        label: 'issue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issues', has: 'many', label: 'workLogs' },
    },
    issueWorkLogsCommit: {
      forward: { on: 'issueWorkLogs', has: 'one', label: 'commit' },
      reverse: { on: 'commits', has: 'many', label: 'workLogs' },
    },
    issueWorkLogsAgentRun: {
      forward: { on: 'issueWorkLogs', has: 'one', label: 'agentRun' },
      reverse: { on: 'agentRuns', has: 'many', label: 'workLogs' },
    },
    issueMentionsIssue: {
      forward: {
        on: 'issueMentions',
        has: 'one',
        label: 'issue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issues', has: 'many', label: 'mentions' },
    },
    issueMentionsMoment: {
      forward: { on: 'issueMentions', has: 'one', label: 'moment' },
      reverse: { on: 'sourceMoments', has: 'many', label: 'issueMentions' },
    },
    issueStatusChangesIssue: {
      forward: {
        on: 'issueStatusChanges',
        has: 'one',
        label: 'issue',
        onDelete: 'cascade',
      },
      reverse: { on: 'issues', has: 'many', label: 'statusChanges' },
    },
    buildsCommit: {
      forward: { on: 'builds', has: 'one', label: 'commit' },
      reverse: { on: 'commits', has: 'many', label: 'builds' },
    },
    buildInstallsBuild: {
      forward: {
        on: 'buildInstalls',
        has: 'one',
        label: 'build',
        onDelete: 'cascade',
      },
      reverse: { on: 'builds', has: 'many', label: 'installs' },
    },
    buildInstallsDevice: {
      forward: { on: 'buildInstalls', has: 'one', label: 'device' },
      reverse: { on: 'settingsDevices', has: 'many', label: 'buildInstalls' },
    },
    // Who started the run.
    agentRunsParent: {
      forward: { on: 'agentRuns', has: 'one', label: 'parent' },
      reverse: { on: 'agentRuns', has: 'many', label: 'children' },
    },
    // ADR 0064 section 8: a retired line names the line that is kept (no delete; readers skip it).
    transcriptionSegmentsSupersededBy: {
      forward: {
        on: 'transcriptionSegments',
        has: 'one',
        label: 'supersededBy',
      },
      reverse: {
        on: 'transcriptionSegments',
        has: 'many',
        label: 'supersedes',
      },
    },
    // Where he asked for the work.
    sourceMomentsAgentRun: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'agentRun',
        onDelete: 'cascade',
      },
      reverse: { on: 'agentRuns', has: 'many', label: 'moments' },
    },
    // ADR 0095 (#1176): a question's lines, one moment per stretch (disjoint, and across recordings); they go with it.
    sourceMomentsQuestion: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'question',
        onDelete: 'cascade',
      },
      reverse: { on: 'questions', has: 'many', label: 'moments' },
    },
    // ADR 0095 (#1176): where an answer was said, typed, or seen; they go with it.
    sourceMomentsQuestionAnswer: {
      forward: {
        on: 'sourceMoments',
        has: 'one',
        label: 'questionAnswer',
        onDelete: 'cascade',
      },
      reverse: { on: 'questionAnswers', has: 'many', label: 'moments' },
    },
    // @generated-end provenance-links
    // @generated-begin redaction-ledger-links: scripts/schema/generate.ts writes this region from scripts/schema/redaction-ledger-schema.ts (ADR 0078). Change the Effect Schemas there, then run it with --write.
    // ADR 0078: a mark's entity; deleting the entity deletes its marks.
    redactionMarkEntity: {
      forward: {
        on: 'redactionMarks',
        has: 'one',
        label: 'entity',
        onDelete: 'cascade',
      },
      reverse: { on: 'redactionEntities', has: 'many', label: 'marks' },
    },
    // @generated-end redaction-ledger-links
    // @generated-begin share-model-links: scripts/schema/generate.ts writes this region from scripts/schema/share-model-schema.ts (ADR 0014). Change the Effect Schemas there, then run it with --write.
    // ADR 0014 section 13.4: a named person's row and its share. Deleting the share deletes its people.
    recordingShareRecipientShare: {
      forward: {
        on: 'recordingShareRecipients',
        has: 'one',
        label: 'share',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'recipients',
      },
    },
    // ADR 0014 section 14.1: a scrubbed line and its share. Deleting the share deletes its scrubbed copy.
    shareScrubbedLineShare: {
      forward: {
        on: 'shareScrubbedLines',
        has: 'one',
        label: 'share',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'scrubbedLines',
      },
    },
    // ADR 0014 section 14.1: a scrubbed image and its share.
    shareScrubbedImageShare: {
      forward: {
        on: 'shareScrubbedImages',
        has: 'one',
        label: 'share',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'recordingSegmentShares',
        has: 'many',
        label: 'scrubbedImages',
      },
    },
    // ADR 0014 section 14.1: the scrubbed image's own JPEG, at
    // scribe/<recording>/share-scrubbed/<share>/<attachment>.jpg.
    shareScrubbedImageFile: {
      forward: { on: 'shareScrubbedImages', has: 'one', label: 'file' },
      reverse: { on: '$files', has: 'many', label: 'shareScrubbedImages' },
    },
    // ADR 0014 section 12: a whole-recording share's recording, sections recorded later included. Written only for
    // scope "recording", so a rule sees whole-recording shares apart from section shares.
    recordingSegmentShareWholeRecording: {
      forward: {
        on: 'recordingSegmentShares',
        has: 'one',
        label: 'wholeRecording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'wholeRecordingShares' },
    },
    // @generated-end share-model-links
    // @generated-begin browsing-links: scripts/schema/generate.ts writes this region from scripts/schema/browsing-schema.ts (ADR 0075). Change the Effect Schemas there, then run it with --write.
    // ADR 0075 (#713): a recording's Safari pages, deleted with it.
    recordingHasBrowsingVisits: {
      forward: {
        on: 'browsingVisits',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'browsingVisits' },
    },
    // @generated-end browsing-links
    // @generated-begin triage-links: scripts/schema/generate.ts writes this region from scripts/schema/triage-schema.ts (ADR 0079). Change the Effect Schemas there, then run it with --write.
    // ADR 0079: a verdict's run; the verdicts go with it.
    triageVerdictsRun: {
      forward: {
        on: 'triageVerdicts',
        has: 'one',
        label: 'run',
        onDelete: 'cascade',
      },
      reverse: { on: 'triageRuns', has: 'many', label: 'verdicts' },
    },
    // The run that wrote a model's label last.
    lineLabelsRun: {
      forward: { on: 'lineLabels', has: 'one', label: 'run' },
      reverse: { on: 'triageRuns', has: 'many', label: 'labels' },
    },
    // A label's topics: its path's, and any its tags name; a line can carry several (Rec 243 #519-520). Scribe filters
    // by them.
    lineLabelsTopics: {
      forward: { on: 'lineLabels', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'lineLabels' },
    },
    // A label's tags: Scribe shows them on the line and filters a recording by them.
    lineLabelsTags: {
      forward: { on: 'lineLabels', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'lineLabels' },
    },
    // A tag merged into another (it is retired; readers follow the link).
    tagsMergedInto: {
      forward: { on: 'tags', has: 'one', label: 'mergedInto' },
      reverse: { on: 'tags', has: 'many', label: 'mergedFrom' },
    },
    dayEntriesTags: {
      forward: { on: 'dayEntries', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'dayEntries' },
    },
    dayEntriesRun: {
      forward: { on: 'dayEntries', has: 'one', label: 'run' },
      reverse: { on: 'triageRuns', has: 'many', label: 'dayEntries' },
    },
    // The topic a proposal was mapped onto or became.
    topicProposalsTopic: {
      forward: { on: 'topicProposals', has: 'one', label: 'topic' },
      reverse: { on: 'topics', has: 'many', label: 'proposals' },
    },
    // A topic's history, oldest first by changedAtMs.
    topicChangesTopic: {
      forward: { on: 'topicChanges', has: 'one', label: 'topic' },
      reverse: { on: 'topics', has: 'many', label: 'changes' },
    },
    // A topic merged into another: retired, with its labels read as the other's (a topicChanges row keeps when and
    // why).
    topicsMergedInto: {
      forward: { on: 'topics', has: 'one', label: 'mergedInto' },
      reverse: { on: 'topics', has: 'many', label: 'mergedFrom' },
    },
    // @generated-end triage-links
    // @generated-begin media-links: scripts/schema/generate.ts writes this region from scripts/schema/media-schema.ts (ADR 0081). Change the Effect Schemas there, then run it with --write.
    // ADR 0081 (#864): a show's items. An item outlives its show's row (no cascade): a pasted video may have none.
    mediaShowHasItems: {
      forward: { on: 'mediaItems', has: 'one', label: 'show' },
      reverse: { on: 'mediaShows', has: 'many', label: 'items' },
    },
    // ADR 0081 (#864): an item's transcripts, deleted with it.
    mediaItemHasTranscripts: {
      forward: {
        on: 'mediaTranscripts',
        has: 'one',
        label: 'item',
        onDelete: 'cascade',
      },
      reverse: { on: 'mediaItems', has: 'many', label: 'transcripts' },
    },
    // ADR 0081 (#864): a transcript's read-along lines, deleted with it.
    mediaTranscriptHasSegments: {
      forward: {
        on: 'mediaTranscriptSegments',
        has: 'one',
        label: 'transcript',
        onDelete: 'cascade',
      },
      reverse: { on: 'mediaTranscripts', has: 'many', label: 'segments' },
    },
    // #768: an item's entries in our ShazamKit catalogs, deleted with it.
    mediaItemHasCatalogEntries: {
      forward: {
        on: 'mediaCatalogEntries',
        has: 'one',
        label: 'item',
        onDelete: 'cascade',
      },
      reverse: { on: 'mediaItems', has: 'many', label: 'catalogEntries' },
    },
    // #922: a book reading's audio, cut from its recording, in Instant storage. Deleting the item leaves the file.
    mediaItemAudioFile: {
      forward: { on: 'mediaItems', has: 'one', label: 'audioFile' },
      reverse: { on: '$files', has: 'many', label: 'mediaItems' },
    },
    // #974: a short clip's own video in Instant storage. Deleting the item leaves the file.
    mediaItemVideoFile: {
      forward: { on: 'mediaItems', has: 'one', label: 'videoFile' },
      reverse: { on: '$files', has: 'many', label: 'mediaItemVideos' },
    },
    // #924: a text link's figures, after the lines of its own transcript; deleted with it.
    mediaTranscriptHasFigures: {
      forward: {
        on: 'mediaFigures',
        has: 'one',
        label: 'transcript',
        onDelete: 'cascade',
      },
      reverse: { on: 'mediaTranscripts', has: 'many', label: 'figures' },
    },
    // #924: a figure's picture in Instant storage. Deleting the figure leaves the file.
    mediaFigureImageFile: {
      forward: { on: 'mediaFigures', has: 'one', label: 'imageFile' },
      reverse: { on: '$files', has: 'many', label: 'mediaFigures' },
    },
    // ADR 0081 section 6 (#864): a transcript's chapters, deleted with it.
    mediaTranscriptHasChapters: {
      forward: {
        on: 'mediaChapters',
        has: 'one',
        label: 'transcript',
        onDelete: 'cascade',
      },
      reverse: { on: 'mediaTranscripts', has: 'many', label: 'chapters' },
    },
    // @generated-end media-links
    // @generated-begin video-queue-links: scripts/schema/generate.ts writes this region from scripts/schema/video-queue-schema.ts (ADR 0082). Change the Effect Schemas there, then run it with --write.
    // #863: the audio of a queued video, prepared by the Mac in Instant storage.
    videoQueueItemAudioFile: {
      forward: { on: 'videoQueueItems', has: 'one', label: 'audioFile' },
      reverse: { on: '$files', has: 'many', label: 'videoQueueItems' },
    },
    // @generated-end video-queue-links
    // @generated-begin media-plays-links: scripts/schema/generate.ts writes this region from scripts/schema/media-plays-schema.ts (ADR 0036). Change the Effect Schemas there, then run it with --write.
    // ADR 0036 addendum-played-ranges (#768): what played during a recording, deleted with it.
    recordingHasMediaPlays: {
      forward: {
        on: 'mediaPlays',
        has: 'one',
        label: 'recording',
        onDelete: 'cascade',
      },
      reverse: { on: 'recordings', has: 'many', label: 'mediaPlays' },
    },
    // #768: each time an item of the media library played during a recording. A play outlives its item's row.
    mediaItemHasPlays: {
      forward: { on: 'mediaPlays', has: 'one', label: 'item' },
      reverse: { on: 'mediaItems', has: 'many', label: 'plays' },
    },
    // @generated-end media-plays-links
    // @generated-begin list-preview-links: scripts/schema/generate.ts writes this region from scripts/schema/list-preview-schema.ts (Instant ADR 0015 Q34). Change the Effect Schemas there, then run it with --write.
    // Instant ADR 0015 Q34 (#1100): the recording's audio row, linked in the transaction that writes it.
    recordingAudioAttachment: {
      forward: { on: 'recordings', has: 'one', label: 'audioAttachment' },
      reverse: {
        on: 'recordingAttachments',
        has: 'many',
        label: 'audioOfRecordings',
      },
    },
    // Instant ADR 0015 Q34 (#1100): the recording's newest image (the map's pin), linked with each image it writes.
    recordingPreviewImage: {
      forward: { on: 'recordings', has: 'one', label: 'previewImage' },
      reverse: {
        on: 'recordingAttachments',
        has: 'many',
        label: 'previewOfRecordings',
      },
    },
    // @generated-end list-preview-links
    // @generated-begin questions-links: scripts/schema/generate.ts writes this region from scripts/schema/questions-schema.ts (ADR 0095). Change the Effect Schemas there, then run it with --write.
    // ADR 0095: a question's answers; an answer goes with its question.
    questionAnswersQuestion: {
      forward: {
        on: 'questionAnswers',
        has: 'one',
        label: 'question',
        onDelete: 'cascade',
      },
      reverse: { on: 'questions', has: 'many', label: 'answers' },
    },
    // ADR 0095: a question's topics, from his tree (several per question); the words page filters by them.
    questionsTopics: {
      forward: { on: 'questions', has: 'many', label: 'topics' },
      reverse: { on: 'topics', has: 'many', label: 'questions' },
    },
    // @generated-end questions-links
  },
})

type _AppSchema = typeof _schema
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema

export type { AppSchema }
export default schema
