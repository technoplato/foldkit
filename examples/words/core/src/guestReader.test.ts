import { Effect, Layer, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Account from './account/index.js'
import { RecordingRoute, ShareRoute } from './link.js'
import { GotShareMessage } from './message.js'
import {
  CheckingIdentity,
  type IdentityState,
  type Model,
  SignedIn,
  SignedOut,
} from './model.js'
import * as Share from './share/index.js'
import {
  WordsStore,
  WordsStoreError,
  makeStaticWordsResources,
} from './store.js'
import { signInGuestReader, subscriptions } from './subscription.js'
import { guestReaderShareIDOf, modelForRoute } from './update.js'

// #754: a share link opens for a reader with no Cloudflare Access login and no
// Scribe account (Michael, Recording 186 #307: "so that it's accessible in an
// incognito browser window to anybody that clicks the link"). Scribe's rules
// let a link holder read a share's scrubbed copy only when signed in, so the
// page signs such a reader in as an anonymous Instant guest, and only then.

const recordingID = 'recording-1'
const shareID = 'share-1'
const access = {
  email: 'owner@example.com',
  source: 'CloudflareAccess' as const,
  maybeExpiresAtMs: Option.none(),
}

const readerAt = (
  options: Readonly<{
    k?: Option.Option<string>
    identity?: IdentityState
    connection?: Account.Model.Connection
    route?: 'share' | 'recording'
  }> = {},
): Model => {
  const opened = modelForRoute(
    options.route === 'recording'
      ? RecordingRoute({ recordingID })
      : ShareRoute({
          recordingID,
          shareID,
          k: options.k ?? Option.some('the-share-key'),
        }),
  )
  return {
    ...opened,
    identity: options.identity ?? SignedOut(),
    account: {
      ...opened.account,
      connection:
        options.connection ??
        Account.Model.FailedAccountCheck({ reason: 'Failed to fetch' }),
    },
  }
}

const guestReader = subscriptions['guestReader']
const sharedRange = subscriptions['sharedRange']

const storeWith = (signInAsGuest: Effect.Effect<void, WordsStoreError>) => {
  const staticStore = Effect.runSync(
    WordsStore.pipe(
      Effect.provide(
        makeStaticWordsResources(
          SignedOut(),
          {
            recordings: [],
            skipped: { count: 0, maybeFirstReason: Option.none() },
          },
          {},
        ),
      ),
    ),
  )
  return Layer.succeed(WordsStore, { ...staticStore, signInAsGuest })
}

describe('a share link opened by a reader with no login', () => {
  it('signs the reader in as a guest once Access has no login for them', () => {
    expect(guestReaderShareIDOf(readerAt())).toEqual(Option.some(shareID))
    expect(
      guestReaderShareIDOf(
        readerAt({ connection: Account.Model.NoAccessIdentity() }),
      ),
    ).toEqual(Option.some(shareID))
  })

  it('never without the share’s key', () => {
    expect(guestReaderShareIDOf(readerAt({ k: Option.none() }))).toEqual(
      Option.none(),
    )
  })

  it('never while someone is signed in, or before Instant says who is', () => {
    const guest = SignedIn({
      userID: 'guest-1',
      maybeEmail: Option.none(),
      isGuest: true,
    })
    const owner = SignedIn({
      userID: 'owner-1',
      maybeEmail: Option.some('owner@example.com'),
      isGuest: false,
    })
    expect(guestReaderShareIDOf(readerAt({ identity: guest }))).toEqual(
      Option.none(),
    )
    expect(guestReaderShareIDOf(readerAt({ identity: owner }))).toEqual(
      Option.none(),
    )
    expect(
      guestReaderShareIDOf(readerAt({ identity: CheckingIdentity() })),
    ).toEqual(Option.none())
  })

  it('never while Access may still know the reader, so the owner is never made a guest', () => {
    const connections = [
      Account.Model.CheckingAccount(),
      Account.Model.ConnectingAccount({ access }),
      Account.Model.ConnectedAccount({ access }),
      Account.Model.FailedConnect({ access, reason: 'x' }),
      Account.Model.AwaitingIPhone({ access }),
      Account.Model.SignedOutAccount({ access }),
    ]
    connections.forEach(connection =>
      expect(guestReaderShareIDOf(readerAt({ connection }))).toEqual(
        Option.none(),
      ),
    )
  })

  it('never away from a share', () => {
    expect(guestReaderShareIDOf(readerAt({ route: 'recording' }))).toEqual(
      Option.none(),
    )
  })

  it('runs the guest sign-in from the Model, and nothing more when it lands', async () => {
    if (guestReader === undefined) {
      throw new Error('Expected a guestReader Subscription')
    }
    const dependencies = guestReader.modelToDependencies(readerAt())
    expect(dependencies).toEqual({ maybeShareID: Option.some(shareID) })
    let signIns = 0
    const messages = await Effect.runPromise(
      signInGuestReader(dependencies.maybeShareID).pipe(
        Stream.runCollect,
        Effect.provide(
          storeWith(
            Effect.sync(() => {
              signIns += 1
            }),
          ),
        ),
      ),
    )
    expect(signIns).toBe(1)
    expect(messages).toEqual([])
  })

  it('says the share could not open when the guest sign-in fails', async () => {
    if (guestReader === undefined) {
      throw new Error('Expected a guestReader Subscription')
    }
    const dependencies = guestReader.modelToDependencies(readerAt())
    const messages = await Effect.runPromise(
      signInGuestReader(dependencies.maybeShareID).pipe(
        Stream.runCollect,
        Effect.provide(
          storeWith(
            Effect.fail(
              new WordsStoreError({
                operation: 'SignInAsGuest',
                cause: new Error('offline'),
              }),
            ),
          ),
        ),
      ),
    )
    expect(messages).toEqual([
      GotShareMessage({
        message: Share.reportSharedRangeFailure({
          shareID,
          reason: 'Scribe could not open this share for reading.',
        }),
      }),
    ])
  })

  it('reads the share only once the reader has an identity', () => {
    if (sharedRange === undefined) {
      throw new Error('Expected a sharedRange Subscription')
    }
    expect(sharedRange.modelToDependencies(readerAt())).toEqual({
      maybeShare: Option.none(),
    })
    const guest = SignedIn({
      userID: 'guest-1',
      maybeEmail: Option.none(),
      isGuest: true,
    })
    expect(
      sharedRange.modelToDependencies(readerAt({ identity: guest })),
    ).toEqual({
      maybeShare: Option.some({
        shareID,
        maybeLinkToken: Option.some('the-share-key'),
        maybeViewerUserID: Option.some('guest-1'),
      }),
    })
  })
})
