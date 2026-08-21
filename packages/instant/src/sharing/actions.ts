import { Effect, Option } from 'effect'

import { type Identity, identityId } from '../auth/identity.js'
import {
  type Audience,
  type AudienceLiteral,
  audienceLiteral,
} from './audience.js'
import {
  InstantFailure,
  WrongState,
  instantFailureFromUnknown,
} from './error.js'
import {
  type ShareLink,
  type ShareRole,
  type ShareRoleLiteral,
  createShareSecret,
  shareRoleFromLiteral,
  shareRoleLiteral,
} from './link.js'
import { Share, type SharedNoteRecord } from './model.js'
import { noteViewRuleParams } from './path.js'

/**
 * Host Instant sharing surface used by Share helpers. Do not import a
 * concrete Instant database type; adapt the host client to this port.
 */
export type InstantSharingClient = Readonly<{
  createLink: (
    params: Readonly<{
      noteId: string
      role: ShareRoleLiteral
      secret: string
    }>,
  ) => Promise<unknown>
  querySharedNote: (
    params: Readonly<{
      noteId: string
      secret?: string
    }>,
  ) => Promise<SharedNoteRecord | null>
  setAudience: (
    params: Readonly<{
      audience: AudienceLiteral
      noteId: string
    }>,
  ) => Promise<unknown>
}>

const tryInstant = <A>(
  run: () => Promise<A>,
): Effect.Effect<A, InstantFailure> =>
  Effect.tryPromise({
    try: run,
    catch: instantFailureFromUnknown,
  })

const isGuest = (identity: Identity): boolean =>
  identity._tag === 'GuestIdentity'

const isMember = (identity: Identity): boolean =>
  identity._tag === 'MemberIdentity'

const nextLinkId = (): string => {
  const cryptoRef = globalThis.crypto
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  } else {
    return '00000000-0000-4000-8000-000000000000'
  }
}

const wrongStateForSetAudience = (
  identity: Identity,
  audience: Audience,
): Option.Option<WrongState> => {
  if (Option.isNone(identityId(identity))) {
    return Option.some(
      new WrongState({
        action: 'setAudience',
        message: "Can't change note audience before signing in.",
      }),
    )
  }
  if (isGuest(identity) && audienceLiteral(audience) !== 'private') {
    return Option.some(
      new WrongState({
        action: 'setAudience',
        message: 'Guest accounts can only keep notes private.',
      }),
    )
  }
  if (!isGuest(identity) && !isMember(identity)) {
    return Option.some(
      new WrongState({
        action: 'setAudience',
        message:
          "Can't change note audience until a signed-in account is observed.",
      }),
    )
  } else {
    return Option.none()
  }
}

const wrongStateForCreateShareLink = (
  identity: Identity,
): Option.Option<WrongState> => {
  if (Option.isNone(identityId(identity))) {
    return Option.some(
      new WrongState({
        action: 'createShareLink',
        message: "Can't create a share link before signing in.",
      }),
    )
  }
  if (!isGuest(identity) && !isMember(identity)) {
    return Option.some(
      new WrongState({
        action: 'createShareLink',
        message:
          "Can't create a share link until a signed-in account is observed.",
      }),
    )
  } else {
    return Option.none()
  }
}

/**
 * Sets Instant `notes.audience`. Guests may only keep notes private.
 * Member/owner may set private, unlisted, or public. Existing links are kept.
 */
export const setAudience = (
  client: InstantSharingClient,
  identity: Identity,
  share: Share,
  audience: Audience,
): Effect.Effect<Share, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForSetAudience(identity, audience)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    yield* tryInstant(() =>
      client.setAudience({
        audience: audienceLiteral(audience),
        noteId: share.subjectId,
      }),
    )
    return Share.make({
      audience,
      links: share.links,
      subjectId: share.subjectId,
    })
  })

/**
 * Creates an Instant `noteLinks` row. Legal on private, unlisted, and public.
 * Guests may create a private link to their own note. The secret still only
 * opens for the owner when audience is private.
 */
export const createShareLink = (
  client: InstantSharingClient,
  identity: Identity,
  share: Share,
  params: Readonly<{
    id?: string
    role?: ShareRole
    secret?: string
  }> = {},
): Effect.Effect<Share, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForCreateShareLink(identity)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    const secret =
      params.secret === undefined || params.secret === ''
        ? createShareSecret()
        : params.secret
    const role = params.role ?? shareRoleFromLiteral('reader')
    const linkId = params.id ?? nextLinkId()
    yield* tryInstant(() =>
      client.createLink({
        noteId: share.subjectId,
        role: shareRoleLiteral(role),
        secret,
      }),
    )
    const link: ShareLink = {
      id: linkId,
      role,
      secret,
    }
    return Share.make({
      audience: share.audience,
      links: [...share.links, link],
      subjectId: share.subjectId,
    })
  })

/**
 * Queries one note with Instant `ruleParams` (`knownDocId`, `secret`).
 * Instant perms deny a private note to anyone but the owner, even when the
 * secret is present. Returns null when Instant yields no row.
 */
export const querySharedNote = (
  client: InstantSharingClient,
  params: Readonly<{
    noteId: string
    secret?: Option.Option<string> | string
  }>,
): Effect.Effect<SharedNoteRecord | null, InstantFailure> => {
  const ruleParams =
    params.secret === undefined
      ? noteViewRuleParams({ subjectId: params.noteId })
      : noteViewRuleParams({
          secret: params.secret,
          subjectId: params.noteId,
        })
  return tryInstant(() =>
    client.querySharedNote({
      noteId: params.noteId,
      ...(ruleParams.secret === '' ? {} : { secret: ruleParams.secret }),
    }),
  )
}

export { noteViewRuleParams }
