import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

// DESTINATION

/**
 * Connecting an Audible account: open Amazon's sign-in, then paste the
 * address it lands on. `/books/audible/connect` above the library, and
 * `/books/profile/audible/connect` above the profile.
 */
export const AudibleConnectPage = ts('AudibleConnectPage')
/** Connecting an Audible account. */
export type AudibleConnectPage = typeof AudibleConnectPage.Type

/**
 * The family member's Audible titles, to choose which to import:
 * `/books/audible` above the library, `/books/profile/audible` above the
 * profile.
 */
export const AudibleTitlesPage = ts('AudibleTitlesPage')
/** The family member's Audible titles. */
export type AudibleTitlesPage = typeof AudibleTitlesPage.Type

/** Either page of the Audible import. */
export const AudiblePlace = S.Union([AudibleConnectPage, AudibleTitlesPage])
/** Either page of the Audible import. */
export type AudiblePlace = typeof AudiblePlace.Type

/** True for the Audible sign-in. */
export const isAudibleConnectPage = S.is(AudibleConnectPage)
/** True for the Audible titles. */
export const isAudibleTitlesPage = S.is(AudibleTitlesPage)
/** True for either page of the Audible import. */
export const isAudiblePlace = S.is(AudiblePlace)
