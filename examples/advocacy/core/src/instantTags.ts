/** Instant originTag values. Same closed set as codec Literals. */
export const InstantOriginTags = ['scheduled', 'impromptu'] as const
/** Instant originTag values. Same closed set as codec Literals. */
export type InstantOriginTag = (typeof InstantOriginTags)[number]

/** Instant preferredTag values. Same closed set as codec Literals. */
export const InstantPreferredTags = ['phone', 'video'] as const
/** Instant preferredTag values. Same closed set as codec Literals. */
export type InstantPreferredTag = (typeof InstantPreferredTags)[number]

/** Instant kindTag values. Same closed set as codec Literals. */
export const InstantKindTags = ['phone', 'video'] as const
/** Instant kindTag values. Same closed set as codec Literals. */
export type InstantKindTag = (typeof InstantKindTags)[number]

/** Instant roleTag values. Same closed set as codec Literals. */
export const InstantRoleTags = [
  'RoleAdvocate',
  'RolePhysician',
  'RolePatient',
] as const
/** Instant roleTag values. Same closed set as codec Literals. */
export type InstantRoleTag = (typeof InstantRoleTags)[number]
