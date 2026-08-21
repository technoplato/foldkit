import { Effect, Option } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  FailedIdentity,
  GuestIdentity,
  MemberIdentity,
  NoneIdentity,
} from '../auth/identity.js'
import {
  type InstantSharingClient,
  createShareLink,
  querySharedNote,
  setAudience,
} from './actions.js'
import {
  PrivateAudience,
  PublicAudience,
  UnlistedAudience,
} from './audience.js'
import { InstantFailure, WrongState } from './error.js'
import { Reader } from './link.js'
import { Share, canViewShare, privateShare } from './model.js'

const expectWrongState = (
  error: InstantFailure | WrongState,
  action: string,
  message?: string,
) => {
  expect(error).toBeInstanceOf(WrongState)
  if (error._tag === 'WrongState') {
    expect(error.action).toBe(action)
    if (message !== undefined) {
      expect(error.message).toBe(message)
    }
  }
}

const ownerId = '550e8400-e29b-41d4-a716-446655440000'
const otherId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const noteId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const linkId = '11111111-1111-4111-8111-111111111111'
const secret = 'owner-private-secret'

const guest = GuestIdentity.make({ extra: {}, id: ownerId })
const member = MemberIdentity.make({
  email: 'owner@example.com',
  extra: {},
  id: ownerId,
  linkedGuestIds: [],
})
const unusedClientError = (method: string): Error =>
  new Error(`Instant ${method} should not be called`)

const unusedClient = (): InstantSharingClient => ({
  createLink: () => Promise.reject(unusedClientError('createLink')),
  querySharedNote: () => Promise.reject(unusedClientError('querySharedNote')),
  setAudience: () => Promise.reject(unusedClientError('setAudience')),
})

type RecordedCall = Readonly<{ args: unknown; method: string }>

const recordingClient = (
  handlers: Partial<InstantSharingClient> = {},
): Readonly<{
  calls: Array<RecordedCall>
  client: InstantSharingClient
}> => {
  const calls: Array<RecordedCall> = []
  return {
    calls,
    client: {
      createLink: params => {
        calls.push({ args: params, method: 'createLink' })
        if (handlers.createLink !== undefined) {
          return handlers.createLink(params)
        } else {
          return Promise.resolve({ id: linkId })
        }
      },
      querySharedNote: params => {
        calls.push({ args: params, method: 'querySharedNote' })
        if (handlers.querySharedNote !== undefined) {
          return handlers.querySharedNote(params)
        } else {
          return Promise.resolve(null)
        }
      },
      setAudience: params => {
        calls.push({ args: params, method: 'setAudience' })
        if (handlers.setAudience !== undefined) {
          return handlers.setAudience(params)
        } else {
          return Promise.resolve({})
        }
      },
    },
  }
}

describe('setAudience', () => {
  it.effect('rejects guest public and unlisted with a human sentence', () =>
    Effect.gen(function* () {
      const share = privateShare(noteId)
      const publicError = yield* setAudience(
        unusedClient(),
        guest,
        share,
        PublicAudience.make({}),
      ).pipe(Effect.flip)
      expectWrongState(
        publicError,
        'setAudience',
        'Guest accounts can only keep notes private.',
      )
      const unlistedError = yield* setAudience(
        unusedClient(),
        guest,
        share,
        UnlistedAudience.make({}),
      ).pipe(Effect.flip)
      expect(unlistedError).toEqual(publicError)
    }),
  )

  it.effect('lets a guest keep a note private', () =>
    Effect.gen(function* () {
      const { calls, client } = recordingClient()
      const share = privateShare(noteId)
      const next = yield* setAudience(
        client,
        guest,
        share,
        PrivateAudience.make({}),
      )
      expect(next.audience._tag).toBe('PrivateAudience')
      expect(calls).toEqual([
        {
          args: { audience: 'private', noteId },
          method: 'setAudience',
        },
      ])
    }),
  )

  it.effect('lets a member set unlisted and public', () =>
    Effect.gen(function* () {
      const { client } = recordingClient()
      const share = privateShare(noteId)
      const unlisted = yield* setAudience(
        client,
        member,
        share,
        UnlistedAudience.make({}),
      )
      expect(unlisted.audience._tag).toBe('UnlistedAudience')
      const published = yield* setAudience(
        client,
        member,
        unlisted,
        PublicAudience.make({}),
      )
      expect(published.audience._tag).toBe('PublicAudience')
    }),
  )

  it.effect('rejects signed-out audience changes', () =>
    Effect.gen(function* () {
      const error = yield* setAudience(
        unusedClient(),
        NoneIdentity.make({}),
        privateShare(noteId),
        PrivateAudience.make({}),
      ).pipe(Effect.flip)
      expectWrongState(error, 'setAudience')
    }),
  )
})

describe('createShareLink', () => {
  it.effect('creates a link on a private note', () =>
    Effect.gen(function* () {
      const { calls, client } = recordingClient()
      const share = privateShare(noteId)
      const next = yield* createShareLink(client, guest, share, {
        id: linkId,
        secret,
      })
      expect(next.audience._tag).toBe('PrivateAudience')
      expect(next.links).toHaveLength(1)
      expect(next.links[0]?.secret).toBe(secret)
      expect(calls).toEqual([
        {
          args: { noteId, role: 'reader', secret },
          method: 'createLink',
        },
      ])
    }),
  )

  it.effect('creates a link on unlisted and public notes', () =>
    Effect.gen(function* () {
      const { client } = recordingClient()
      const unlisted = yield* createShareLink(
        client,
        member,
        Share.make({
          audience: UnlistedAudience.make({}),
          links: [],
          subjectId: noteId,
        }),
        { id: linkId, secret },
      )
      expect(unlisted.links).toHaveLength(1)
      const published = yield* createShareLink(
        client,
        member,
        Share.make({
          audience: PublicAudience.make({}),
          links: [],
          subjectId: noteId,
        }),
        { id: linkId, secret: 'public-secret' },
      )
      expect(published.links).toHaveLength(1)
    }),
  )

  it.effect('rejects a link before sign-in', () =>
    Effect.gen(function* () {
      const error = yield* createShareLink(
        unusedClient(),
        FailedIdentity.make({ reason: 'unknown' }),
        privateShare(noteId),
      ).pipe(Effect.flip)
      expectWrongState(error, 'createShareLink')
    }),
  )

  it.effect('wraps an Instant rejection', () =>
    Effect.gen(function* () {
      const { client } = recordingClient({
        createLink: () =>
          Promise.reject({ body: { message: 'permission denied' } }),
      })
      const error = yield* createShareLink(
        client,
        member,
        privateShare(noteId),
        { id: linkId, secret },
      ).pipe(Effect.flip)
      expect(error).toBeInstanceOf(InstantFailure)
      expect(error.message).toBe('permission denied')
    }),
  )
})

describe('canViewShare', () => {
  const linkedPrivate = Share.make({
    audience: PrivateAudience.make({}),
    links: [{ id: linkId, role: Reader.make({}), secret }],
    subjectId: noteId,
  })
  const linkedUnlisted = Share.make({
    audience: UnlistedAudience.make({}),
    links: [{ id: linkId, role: Reader.make({}), secret }],
    subjectId: noteId,
  })
  const listedPublic = Share.make({
    audience: PublicAudience.make({}),
    links: [],
    subjectId: noteId,
  })

  it('lets the owner open a private link', () => {
    expect(
      canViewShare({
        ownerId,
        secret: Option.some(secret),
        share: linkedPrivate,
        viewerId: Option.some(ownerId),
      }),
    ).toBe(true)
  })

  it('denies a different identity a private link, even with the secret', () => {
    expect(
      canViewShare({
        ownerId,
        secret: Option.some(secret),
        share: linkedPrivate,
        viewerId: Option.some(otherId),
      }),
    ).toBe(false)
    expect(
      canViewShare({
        ownerId,
        secret: Option.some(secret),
        share: linkedPrivate,
        viewerId: Option.none(),
      }),
    ).toBe(false)
  })

  it('lets anyone with the secret open an unlisted note', () => {
    expect(
      canViewShare({
        ownerId,
        secret: Option.some(secret),
        share: linkedUnlisted,
        viewerId: Option.some(otherId),
      }),
    ).toBe(true)
  })

  it('lets anyone open a public note', () => {
    expect(
      canViewShare({
        ownerId,
        secret: Option.none(),
        share: listedPublic,
        viewerId: Option.none(),
      }),
    ).toBe(true)
  })
})

describe('querySharedNote', () => {
  const note = {
    audience: 'private' as const,
    body: 'Owner only.',
    id: noteId,
  }

  it.effect('returns the note when Instant yields a row for the owner', () =>
    Effect.gen(function* () {
      const { calls, client } = recordingClient({
        querySharedNote: () => Promise.resolve(note),
      })
      const row = yield* querySharedNote(client, {
        noteId,
        secret,
      })
      expect(row).toEqual(note)
      expect(calls[0]?.args).toEqual({ noteId, secret })
    }),
  )

  it.effect('returns null when Instant denies a different identity', () =>
    Effect.gen(function* () {
      const { client } = recordingClient({
        querySharedNote: () => Promise.resolve(null),
      })
      const row = yield* querySharedNote(client, {
        noteId,
        secret,
      })
      expect(row).toBeNull()
    }),
  )
})
