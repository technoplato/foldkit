import { Effect, Option, Schema as S } from 'effect'
import { Command, Program } from 'foldkit'
import {
  CompletedCopyLink,
  CompletedScrollCurrentWord,
  CompletedSeekVideo,
  FailedCopyLink,
  FailedJobPlayback,
  HeardJobPlayback,
  LoadCatalog,
  type Message,
  type Model,
  TranscribeProgram,
  TranscribeStore,
  Word,
  update as coreUpdate,
  jobShareUrl,
  localMediaUrl,
  modelForHref,
  restore,
  selectedJob,
  subscriptions,
} from 'transcribe-core-example'

const JobPlaybackPayload = S.Struct({
  analysis: S.optionalKey(S.Union([S.Struct({ summary: S.String }), S.Null])),
  id: S.String,
  mediaUrl: S.optionalKey(S.String),
  title: S.String,
  transcript: S.optionalKey(S.Union([S.Struct({ text: S.String }), S.Null])),
  url: S.String,
  words: S.optionalKey(S.Array(Word)),
})

const WordsFilePayload = S.Struct({
  itemId: S.String,
  words: S.Array(Word),
})

const readerVideo = (): HTMLVideoElement | undefined => {
  const element = document.getElementById('transcribe-reader-video')
  return element instanceof HTMLVideoElement ? element : undefined
}

const fetchJson = (url: string, accept: string) =>
  Effect.tryPromise({
    try: () =>
      fetch(url, { headers: { Accept: accept } }).then(async response => {
        if (!response.ok) {
          throw new Error(`request failed ${response.status}`)
        }
        return response.json() as Promise<unknown>
      }),
    catch: () => new Error('request failed'),
  }).pipe(Effect.option)

/** Loads Whisper words and media URLs for the selected job. */
export const LoadJobPlayback = Command.define(
  'LoadJobPlayback',
  { videoId: S.String },
  HeardJobPlayback,
  FailedJobPlayback,
)(({ videoId }) =>
  Effect.gen(function* () {
    const jobJson = yield* fetchJson(`/jobs/${videoId}`, 'application/json')
    const decoded =
      jobJson._tag === 'Some'
        ? S.decodeUnknownOption(JobPlaybackPayload)(jobJson.value)
        : Option.none()
    const fromJob =
      decoded._tag === 'Some' && decoded.value.words !== undefined
        ? decoded.value.words
        : []
    let words = fromJob
    if (words.length === 0) {
      const fileJson = yield* fetchJson(
        `/media/${videoId}.words.json`,
        'application/json',
      )
      if (fileJson._tag === 'Some') {
        const file = S.decodeUnknownOption(WordsFilePayload)(fileJson.value)
        if (file._tag === 'Some') {
          words = file.value.words
        }
      }
    }
    if (decoded._tag === 'None') {
      if (words.length === 0) {
        return FailedJobPlayback.make({})
      }
      return HeardJobPlayback.make({
        analysis: '',
        fallbackUrl: '',
        mediaUrl: localMediaUrl(videoId),
        title: videoId,
        transcriptText: '',
        videoId,
        words,
      })
    }
    const job = decoded.value
    const transcriptText =
      job.transcript === undefined || job.transcript === null
        ? ''
        : job.transcript.text
    const analysis =
      job.analysis === undefined || job.analysis === null
        ? ''
        : job.analysis.summary
    return HeardJobPlayback.make({
      analysis,
      fallbackUrl: job.url,
      mediaUrl: job.mediaUrl ?? localMediaUrl(videoId),
      title: job.title,
      transcriptText,
      videoId,
      words,
    })
  }),
)

/** Seeks the mounted job video element. */
export const SeekVideo = Command.define(
  'SeekVideo',
  { seconds: S.Number },
  CompletedSeekVideo,
)(({ seconds }) =>
  Effect.sync(() => {
    const element = readerVideo()
    if (element !== undefined) {
      element.currentTime = seconds
    }
    return CompletedSeekVideo.make({})
  }),
)

const CopyJobUrl = Command.define(
  'CopyJobUrl',
  { href: S.String },
  CompletedCopyLink,
  FailedCopyLink,
)(({ href }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => navigator.clipboard.writeText(href),
      catch: () => new Error('copy failed'),
    }).pipe(Effect.option)
    return result._tag === 'None'
      ? FailedCopyLink.make({})
      : CompletedCopyLink.make({})
  }),
)

const ScrollFollowLive = Command.define(
  'ScrollFollowLive',
  CompletedScrollCurrentWord,
)(
  Effect.sync(() => {
    document
      .querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'center', inline: 'nearest' })
    return CompletedScrollCurrentWord.make({})
  }),
)

type Result = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, TranscribeStore>>,
]

let lastProgrammaticScrollAt = 0

/** Core update plus host video, copy, and follow-along Commands. */
export const update = (model: Model, message: Message): Result => {
  if (
    message._tag === 'ScrolledAway' &&
    Date.now() - lastProgrammaticScrollAt < 150
  ) {
    return [model, []]
  }
  const [next, commands] = coreUpdate(model, message)
  const extra: Array<Command.Command<Message>> = []
  if (message._tag === 'CompletedScrollCurrentWord') {
    lastProgrammaticScrollAt = Date.now()
  }
  if (message._tag === 'PressedFollowLive') {
    extra.push(ScrollFollowLive())
  }
  if (message._tag === 'PressedSeekWord') {
    extra.push(SeekVideo({ seconds: message.start }))
  }
  if (message._tag === 'PressedCopyLink') {
    extra.push(
      CopyJobUrl({
        href: Option.match(selectedJob(next), {
          onNone: () => jobShareUrl(''),
          onSome: job => jobShareUrl(job.videoId),
        }),
      }),
    )
  }
  if (
    message._tag === 'ClickedJob' ||
    message._tag === 'OpenedHref' ||
    message._tag === 'SubmittedUrl'
  ) {
    const job = selectedJob(next)
    if (Option.isSome(job)) {
      extra.push(LoadJobPlayback({ videoId: job.value.videoId }))
    }
  }
  return [next, [...commands, ...extra]]
}

/** Foldkit host Program: GET /jobs words plus the 50 ms media clock. */
export const TranscribeFoldkitProgram: Program.Program<
  Model,
  Message,
  TranscribeStore
> = Program.make({
  id: TranscribeProgram.id,
  version: TranscribeProgram.version + 1,
  Model: TranscribeProgram.Model,
  Message: TranscribeProgram.Message,
  init: (): Result => {
    const href = typeof window === 'undefined' ? '/' : window.location.href
    const model = modelForHref(href)
    const extra = Option.match(model.selectedId, {
      onNone: () => [],
      onSome: id => [LoadJobPlayback({ videoId: id })],
    })
    return [model, [LoadCatalog(), ...extra]]
  },
  restore,
  update,
  subscriptions,
})
