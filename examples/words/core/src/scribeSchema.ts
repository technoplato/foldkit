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
      updatedAtMs: i.number().indexed(),
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
      firstSegmentID: i.string().indexed(),
      lastSegmentID: i.string().indexed(),
      firstSegmentIndex: i.number().indexed(),
      lastSegmentIndex: i.number().indexed(),
      startSeconds: i.number(),
      endSeconds: i.number(),
      // "people" | "link"
      visibility: i.string().indexed(),
      recipientEmail: i.string().indexed().optional(),
      linkToken: i.string().optional(),
      sharedByDisplayName: i.string().optional(),
      note: i.string().optional(),
      // ADR 0014 section 13.4 (the additive subset ADR 0044 uses): the share's audio clip, the `audioClip` file.
      // "none" | "preparing" | "ready" | "failed".
      audioClipStatus: i.string().optional(),
      audioClipDurationSeconds: i.number().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
      // ADR 0014 section 13 (the share-model module, scripts/schema/share-model-schema.ts in Scribe).
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
      isFinal: i.boolean().indexed(),
      sentToInstantAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
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
    agentThreads: i.entity({
      roomID: i.string().indexed(),
      listenerID: i.string().indexed(),
      sourceSegmentID: i.string().optional().indexed(),
      origin: i.string().indexed(),
      prompt: i.string(),
      status: i.string().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
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
    // ADR 0014 sections 13.4 and 14.1 (the share-model module, scripts/schema/share-model-schema.ts in Scribe).
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
    recordingSegmentShareAudioClip: {
      forward: { on: 'recordingSegmentShares', has: 'one', label: 'audioClip' },
      reverse: { on: '$files', has: 'many', label: 'shareClips' },
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
    // ADR 0014 sections 12, 13.4 and 14.1 (the share-model module).
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
  },
})

type _AppSchema = typeof _schema
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema

export type { AppSchema }
export default schema
