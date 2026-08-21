import { Layer } from 'effect'

import { DelayedPhone, ImmediatePhone, Phone } from './phone.js'
import type { AdvocacyInstantClient } from './store.js'
import {
  AdvocacyStore,
  StaticAdvocacyStore,
  makeLiveAdvocacyStore,
} from './store.js'
import { DelayedVideo, ImmediateVideo, Video } from './video.js'

export type AdvocacyResources = Phone | Video | AdvocacyStore

export const ImmediateAdvocacyResources = Layer.mergeAll(
  ImmediatePhone,
  ImmediateVideo,
  StaticAdvocacyStore,
)

export const DelayedAdvocacyResources = Layer.mergeAll(
  DelayedPhone,
  DelayedVideo,
  StaticAdvocacyStore,
)

/** Live Instant resources with delayed mock phone and video. */
export const liveAdvocacyResources = (database: AdvocacyInstantClient) =>
  Layer.mergeAll(DelayedPhone, DelayedVideo, makeLiveAdvocacyStore(database))
