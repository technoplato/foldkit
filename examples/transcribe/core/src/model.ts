import { Schema as S } from "effect"

import { Transcript, Word } from "./catalog.js"

/** Instant is the live source. StaticFallback is used when Instant is missing or unreachable. */
export const CatalogSource = S.Literals(["Instant", "StaticFallback"])
/** Where the visible catalog came from. */
export type CatalogSource = typeof CatalogSource.Type

/** Waiting for the first catalog snapshot. */
export const LoadingCatalog = S.TaggedStruct("LoadingCatalog", {})
/** Latest catalog snapshot. */
export const LoadedCatalog = S.TaggedStruct("LoadedCatalog", {
  jobs: S.Array(Transcript),
})
/** Catalog observation failed. */
export const FailedCatalog = S.TaggedStruct("FailedCatalog", {
  reason: S.String,
})
/** Every catalog observation state. */
export const CatalogState = S.Union([LoadingCatalog, LoadedCatalog, FailedCatalog])
/** Every catalog observation state. */
export type CatalogState = typeof CatalogState.Type

/** Transcript scroller is pinned to the current word. */
export const FollowLive = S.TaggedStruct("FollowLive", {})
/** Transcript scroller was moved away from the current word. */
export const FollowAway = S.TaggedStruct("FollowAway", {})
/** Follow-along scroll mode. */
export const Follow = S.Union([FollowLive, FollowAway])
/** Follow-along scroll mode. */
export type Follow = typeof Follow.Type

/** The Transcribe Program Model. */
export const Model = S.Struct({
  catalog: CatalogState,
  copyNotice: S.String,
  currentTime: S.Number,
  draftUrl: S.String,
  fallbackUrl: S.String,
  follow: Follow,
  mediaUrl: S.String,
  selectedId: S.Option(S.String),
  source: CatalogSource,
  usingFallback: S.Boolean,
  words: S.Array(Word),
})
/** A Transcribe Model value. */
export type Model = typeof Model.Type

/** Idle follow-along fields used by init and tests. */
export const idlePlayback = {
  copyNotice: "",
  currentTime: 0,
  fallbackUrl: "",
  follow: FollowLive.make({}),
  mediaUrl: "",
  usingFallback: false,
  words: [] as ReadonlyArray<Word>,
}
