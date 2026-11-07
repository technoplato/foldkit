import { Option, Schema as S } from 'effect'
import { fromString } from 'foldkit/url'

import { Me, Understanding } from './data'
import { MeData, type Model, UnderstandingData } from './model'
import { type Destination, urlToDestination } from './route'

export const encodedUnderstanding = {
  schemaVersion: 1,
  generatedAt: '2026-11-07T02:51:42-05:00',
  source: 'profile.md',
  method:
    "Counted from your profile: each area's newest rating is where you stand now.",
  count: { _tag: 'Measured', proficient: 2, areas: 3 },
  list: [
    {
      name: 'Area one',
      level: 'undergraduate',
      score: 6,
      proficient: true,
      ratedAt: '2026-11-07T09:00-05:00',
      by: 'agent-two',
      ratings: 2,
      evidence: ['claude-code://session/s/message/m2'],
    },
    {
      name: 'Area two',
      level: 'professional',
      score: 8,
      proficient: true,
      ratedAt: '2026-11-06T22:46-05:00',
      by: 'agent-one',
      ratings: 1,
      evidence: [],
    },
    {
      name: 'Area three',
      level: 'high school',
      score: 2,
      proficient: false,
      ratedAt: '2026-11-07T09:00-05:00',
      by: 'agent-two',
      ratings: 1,
      evidence: ['claude-code://session/s/message/m3'],
    },
  ],
  history: [
    { at: '2026-11-06T22:46-05:00', proficient: 1, areas: 2 },
    { at: '2026-11-07T09:00-05:00', proficient: 2, areas: 3 },
  ],
  problems: [],
}

export const sampleUnderstanding =
  S.decodeUnknownSync(Understanding)(encodedUnderstanding)

export const unmeasuredUnderstanding = S.decodeUnknownSync(Understanding)({
  ...encodedUnderstanding,
  count: { _tag: 'NotMeasured', reason: 'no profile on the laptop' },
  list: [],
  history: [],
})

/** The owner: signed in, with an understanding profile in their folder. */
export const ownerMe = S.decodeUnknownSync(Me)({
  schemaVersion: 1,
  email: 'owner@example.com',
  files: ['understanding'],
})

/** Anyone else Access lets in: signed in, with nothing in their folder yet. */
export const friendMe = S.decodeUnknownSync(Me)({
  schemaVersion: 1,
  email: 'friend@example.com',
  files: [],
})

const destinationOf = (path: string): Destination =>
  urlToDestination(Option.getOrThrow(fromString(`https://me.example${path}`)))

/** The owner's page at a path, with who they are and their profile loaded. */
export const ownerModelAt = (path: string): Model => ({
  destination: destinationOf(path),
  me: MeData.Success({ data: ownerMe }),
  understanding: UnderstandingData.Success({
    data: Option.some(sampleUnderstanding),
  }),
})

/** Another user's page at a path: who they are, and no profile. */
export const friendModelAt = (path: string): Model => ({
  destination: destinationOf(path),
  me: MeData.Success({ data: friendMe }),
  understanding: UnderstandingData.Success({ data: Option.none() }),
})

/** The page before the origin has said who is signed in. */
export const loadingModelAt = (path: string): Model => ({
  destination: destinationOf(path),
  me: MeData.Loading(),
  understanding: UnderstandingData.Idle(),
})
