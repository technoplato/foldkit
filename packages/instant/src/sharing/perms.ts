import type { InstantRules } from '@instantdb/core'

/**
 * Instant bind aliases for note view access.
 *
 * Follows Instant docs:
 * - known id: `data.id == ruleParams.knownDocId`
 * - share links: `ruleParams.secret in data.ref('noteLinks.secret')`
 * - public listed: `data.audience == 'public'`
 * - owner via `auth.ref` / account link
 *
 * `hasKnownId` and `hasShareSecret` both require `audience != 'private'`
 * so a private link only opens for the owner.
 */
export const notePermissionBinds = {
  hasKnownId: "data.id == ruleParams.knownDocId && data.audience != 'private'",
  hasShareSecret:
    "ruleParams.secret in data.ref('noteLinks.secret') && data.audience != 'private'",
  isOwner: 'auth.id != null && auth.id in data.ref("account.user.id")',
  isPublic: "data.audience == 'public'",
} as const

const noteLinkOwner =
  'auth.id != null && auth.id in data.ref("note.account.user.id")'

/**
 * InstantRules fragment for `notes` + `noteLinks`. Apps merge this into
 * `instant.perms.ts`. Guest accounts cannot set public/unlisted — Instant
 * cannot reliably see account.kind, so that check stays in the ADT.
 *
 * Deploy with `npx instant-cli push perms` after merging.
 */
export const notePermissionsBind = (): Pick<
  InstantRules,
  'noteLinks' | 'notes'
> => ({
  noteLinks: {
    allow: {
      create: 'isOwner',
      delete: 'isOwner',
      view: 'isOwner || ruleParams.secret == data.secret',
    },
    bind: {
      isOwner: noteLinkOwner,
    },
  },
  notes: {
    allow: {
      create: 'isOwner',
      delete: 'isOwner',
      update: 'isOwner',
      view: 'isOwner || isPublic || hasKnownId || hasShareSecret',
    },
    bind: { ...notePermissionBinds },
  },
})
