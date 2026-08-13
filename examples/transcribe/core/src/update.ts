import { Array, Effect, Match as M, Option } from "effect"
import { Command } from "foldkit"
import { evo } from "foldkit/struct"

import {
  type Transcript,
  localMediaUrl,
  queuedTranscript,
  requestFromHref,
  seedTranscripts,
  youtubeUrl,
} from "./catalog.js"
import {
  FailedObserveJobs,
  type Message,
  ObservedJobs,
} from "./message.js"
import {
  type CatalogState,
  FailedCatalog,
  FollowAway,
  FollowLive,
  LoadedCatalog,
  type Model,
  idlePlayback,
} from "./model.js"
import { TranscribeStore } from "./store.js"

// COMMAND

/** Loads one catalog snapshot through the injected Transcribe store. */
export const LoadCatalog = Command.define(
  "LoadCatalog",
  ObservedJobs,
  FailedObserveJobs,
)(
  Effect.gen(function* () {
    const store = yield* TranscribeStore
    const snapshot = yield* store.fetch.pipe(Effect.option)
    if (snapshot._tag === "None") {
      return FailedObserveJobs.make({ reason: "catalog failed" })
    }
    return ObservedJobs.make({
      jobs: snapshot.value.jobs,
      source: snapshot.value.source,
    })
  }),
)

// UPDATE

/** Jobs currently visible in the catalog. */
export const visibleJobs = (model: Model): ReadonlyArray<Transcript> =>
  jobsFromCatalog(model.catalog)

/** Jobs from a catalog state, seed jobs while loading or failed. */
export const jobsFromCatalog = (
  catalog: CatalogState,
): ReadonlyArray<Transcript> =>
  M.value(catalog).pipe(
    M.withReturnType<ReadonlyArray<Transcript>>(),
    M.tagsExhaustive({
      LoadingCatalog: () => seedTranscripts,
      LoadedCatalog: ({ jobs }) => jobs,
      FailedCatalog: () => seedTranscripts,
    }),
  )

/** The job matching the current selection, if any. */
export const selectedJob = (model: Model): Option.Option<Transcript> =>
  Option.flatMap(model.selectedId, id =>
    Array.findFirst(
      jobsFromCatalog(model.catalog),
      job => job.id === id || job.videoId === id || job.slug === id,
    ),
  )

const ensureJob = (
  jobs: ReadonlyArray<Transcript>,
  videoId: string,
  url: string,
): ReadonlyArray<Transcript> => {
  const existing = Array.findFirst(
    jobs,
    job => job.videoId === videoId || job.slug === videoId,
  )
  if (Option.isSome(existing)) {
    return jobs
  }
  return [queuedTranscript(videoId, url), ...jobs]
}

const playbackForJob = (job: Transcript) => ({
  copyNotice: () => "",
  currentTime: () => 0,
  fallbackUrl: () => job.url,
  follow: () => FollowLive.make({}),
  mediaUrl: () => localMediaUrl(job.videoId),
  usingFallback: () => false,
  words: () => [] as Model["words"],
})

const applyPlayback = (model: Model, job: Transcript): Model => {
  if (model.mediaUrl === localMediaUrl(job.videoId) && model.words.length > 0) {
    return evo(model, {
      fallbackUrl: () => (model.fallbackUrl === "" ? job.url : model.fallbackUrl),
      mediaUrl: () => model.mediaUrl,
    })
  }
  return evo(model, playbackForJob(job))
}

const applyRequest = (
  model: Model,
  hrefOrUrl: string,
): Model => {
  const request = requestFromHref(hrefOrUrl)
  const videoId = request.videoId
  const nextDraft =
    request.draftUrl !== "" ? request.draftUrl : model.draftUrl
  if (Option.isNone(videoId)) {
    return evo(model, {
      draftUrl: () => nextDraft,
    })
  }
  const id = videoId.value
  const url = nextDraft === "" ? youtubeUrl(id) : nextDraft
  const catalog = M.value(model.catalog).pipe(
    M.withReturnType<CatalogState>(),
    M.tagsExhaustive({
      LoadingCatalog: () =>
        LoadedCatalog.make({ jobs: ensureJob(seedTranscripts, id, url) }),
      LoadedCatalog: ({ jobs }) => LoadedCatalog.make({ jobs: ensureJob(jobs, id, url) }),
      FailedCatalog: () =>
        LoadedCatalog.make({
          jobs: ensureJob(seedTranscripts, id, url),
        }),
    }),
  )
  const next = evo(model, {
    catalog: () => catalog,
    draftUrl: () => url,
    selectedId: () => Option.some(id),
  })
  const job = selectedJob(next)
  return Option.match(job, {
    onNone: () => next,
    onSome: value => applyPlayback(next, value),
  })
}

const patchSelectedJob = (
  model: Model,
  videoId: string,
  patch: Readonly<{ analysis: string; title: string; transcriptText: string }>,
): CatalogState =>
  M.value(model.catalog).pipe(
    M.withReturnType<CatalogState>(),
    M.tagsExhaustive({
      LoadingCatalog: () => model.catalog,
      FailedCatalog: () => model.catalog,
      LoadedCatalog: ({ jobs }) =>
        LoadedCatalog.make({
          jobs: jobs.map(job =>
            job.videoId === videoId || job.id === videoId || job.slug === videoId
              ? {
                  ...job,
                  analysis: patch.analysis,
                  status: job.status === "queued" ? "ready" : job.status,
                  title: patch.title,
                  transcriptText: patch.transcriptText,
                }
              : job,
          ),
        }),
    }),
  )

/** Applies one Transcribe Message to the current Model. */
export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message, never, TranscribeStore>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message, never, TranscribeStore>>]
    >(),
    M.tagsExhaustive({
      ObservedJobs: ({ jobs, source }) => {
        const merged = Option.match(model.selectedId, {
          onNone: () => jobs,
          onSome: id => {
            const has = Array.some(
              jobs,
              job => job.id === id || job.videoId === id || job.slug === id,
            )
            if (has) {
              return jobs
            }
            const local = Array.findFirst(
              jobsFromCatalog(model.catalog),
              job => job.id === id || job.videoId === id || job.slug === id,
            )
            return Option.match(local, {
              onNone: () => jobs,
              onSome: job => [job, ...jobs],
            })
          },
        })
        return [
          evo(model, {
            catalog: () => LoadedCatalog.make({ jobs: merged }),
            source: () => source,
          }),
          [],
        ]
      },
      FailedObserveJobs: ({ reason }) => [
        evo(model, {
          catalog: () => FailedCatalog.make({ reason }),
          source: () => "StaticFallback",
        }),
        [],
      ],
      ClickedJob: ({ id }) => {
        const next = evo(model, { selectedId: () => Option.some(id) })
        const job = selectedJob(next)
        return [
          Option.match(job, {
            onNone: () => next,
            onSome: value => applyPlayback(next, value),
          }),
          [],
        ]
      },
      ClosedJob: () => [
        evo(model, {
          selectedId: () => Option.none(),
          copyNotice: () => idlePlayback.copyNotice,
          currentTime: () => idlePlayback.currentTime,
          fallbackUrl: () => idlePlayback.fallbackUrl,
          follow: () => idlePlayback.follow,
          mediaUrl: () => idlePlayback.mediaUrl,
          usingFallback: () => idlePlayback.usingFallback,
          words: () => idlePlayback.words,
        }),
        [],
      ],
      UpdatedDraftUrl: ({ draftUrl }) => [evo(model, { draftUrl: () => draftUrl }), []],
      SubmittedUrl: ({ url }) => [applyRequest(model, url), []],
      OpenedHref: ({ href }) => [applyRequest(model, href), []],
      HeardPlaybackPosition: ({ mediaPosition }) => [
        evo(model, { currentTime: () => mediaPosition }),
        [],
      ],
      HeardMediaError: () => {
        if (model.usingFallback || model.fallbackUrl.length === 0) {
          return [model, []]
        }
        return [evo(model, { usingFallback: () => true }), []]
      },
      PressedSeekWord: ({ start }) => [
        evo(model, { currentTime: () => start, follow: () => FollowLive.make({}) }),
        [],
      ],
      PressedFollowLive: () => [evo(model, { follow: () => FollowLive.make({}) }), []],
      ScrolledAway: () =>
        model.follow._tag === "FollowAway"
          ? [model, []]
          : [evo(model, { follow: () => FollowAway.make({}) }), []],
      CompletedScrollCurrentWord: () => [model, []],
      CompletedSeekVideo: () => [model, []],
      PressedCopyLink: () => [model, []],
      CompletedCopyLink: () => [evo(model, { copyNotice: () => "Copied job URL" }), []],
      FailedCopyLink: () => [evo(model, { copyNotice: () => "Copy failed" }), []],
      HeardJobPlayback: ({
        analysis,
        fallbackUrl,
        mediaUrl,
        title,
        transcriptText,
        videoId,
        words,
      }) => [
        evo(model, {
          catalog: () => patchSelectedJob(model, videoId, { analysis, title, transcriptText }),
          fallbackUrl: () => (fallbackUrl.length > 0 ? fallbackUrl : model.fallbackUrl),
          mediaUrl: () => (mediaUrl.length > 0 ? mediaUrl : model.mediaUrl),
          words: () => words,
        }),
        [],
      ],
      FailedJobPlayback: () => [model, []],
    }),
  )
