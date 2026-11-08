import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'

import { Me, Understanding } from './data'
import { Destination } from './route'

// MODEL

/** Who is signed in and what their folder holds: loading, loaded, or failed with why. */
export const MeData = AsyncData.Schema(Me, S.String)

/**
 * The signed-in user's understanding profile. Idle until the origin says
 * who is signed in; then None when their folder holds no profile, so the
 * page says so without asking for one, or the profile as it loads.
 */
export const UnderstandingData = AsyncData.Schema(
  S.Option(Understanding),
  S.String,
)

export const Model = S.Struct({
  destination: Destination,
  me: MeData.schema,
  understanding: UnderstandingData.schema,
})
export type Model = typeof Model.Type
