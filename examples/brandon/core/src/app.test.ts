import { Duration, Effect, Layer, Option, Schema as S } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { snapshotLogMessageWire } from '@foldkit/instant/snapshot-log'
import { parseMarkdown } from '@foldkit/markdown/vite'

import { startBrandonOn } from './live.js'
import {
  AwardedPoints,
  ChangedSections,
  Message,
  NotedPlayer,
  PointedAtSection,
  ReceivedPage,
} from './message.js'
import { initialModel, rankedPlayers } from './model.js'
import {
  Games,
  MarkdownSection,
  Page,
  SectionKey,
  WalletAddresses,
} from './page.js'
import { BrandonProgram } from './program.js'
import { BrandonServer } from './server.js'
import { makeTestWalletResources } from './testWallet.js'
import { update } from './update.js'
import { MessageWire } from './wire.js'

const apply = (
  model: typeof initialModel,
  ...messages: ReadonlyArray<Parameters<typeof update>[1]>
): typeof initialModel =>
  messages.reduce((current, message) => update(current, message)[0], model)

const award = (eventId: string, name: string, points: number) =>
  AwardedPoints({ eventId, name, points, reason: 'test', awardedBy: 'a test' })

describe('the scoreboard', () => {
  it('sums each player from their points, a correction is another event', () => {
    const model = apply(
      initialModel,
      award('1', 'Claude', 2),
      award('2', 'Michael', 1),
      award('3', 'Claude', -1),
      award('4', 'Michael', 1),
    )
    expect(
      rankedPlayers(model).map(({ name, points }) => [name, points]),
    ).toEqual([
      ['Michael', 2],
      ['Claude', 1],
    ])
  })

  it('counts one event once, whoever sends it twice', () => {
    const model = apply(
      initialModel,
      award('1', 'Claude', 2),
      award('1', 'Claude', 2),
    )
    expect(rankedPlayers(model).map(({ points }) => points)).toEqual([2])
  })

  it('keeps a player a note without changing their points', () => {
    const model = apply(
      initialModel,
      award('1', 'Tyler', 0),
      NotedPlayer({
        name: 'Tyler',
        maybeNote: Option.some('guilty: it is an SVG'),
        isDunce: true,
      }),
    )
    expect(rankedPlayers(model)).toEqual([
      {
        name: 'Tyler',
        points: 0,
        maybeNote: Option.some('guilty: it is an SVG'),
        isDunce: true,
        countedEventIds: ['1'],
      },
    ])
  })
})

describe('what crosses JSON', () => {
  const overJson = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value))

  it('reads a game back from the origin', () => {
    const games = [
      {
        id: '1',
        state: 'Live' as const,
        detail: 'Q2',
        teams: [
          { name: 'Clemson', score: '7', maybeRank: Option.some(9) },
          { name: 'Florida St', score: '3', maybeRank: Option.none() },
        ],
      },
    ]
    expect(
      S.decodeUnknownSync(Games)(overJson(S.encodeSync(Games)(games))),
    ).toEqual(games)
  })

  it('reads a wallet back from the origin', () => {
    const wallets = [
      {
        label: 'Devnet',
        chain: 'Solana' as const,
        network: 'Devnet' as const,
        address: 'a',
        balanceAtomic: '1',
        mirroredAtMs: 1,
        transactions: [
          {
            signature: 's',
            slot: 1,
            maybeBlockTimeMs: Option.none(),
            didSucceed: true,
            maybeChangeAtomic: Option.some('-5'),
          },
        ],
      },
    ]
    expect(
      S.decodeUnknownSync(WalletAddresses)(
        overJson(S.encodeSync(WalletAddresses)(wallets)),
      ),
    ).toEqual(wallets)
  })

  it('reads a note back from the log', () => {
    const notes = [
      NotedPlayer({
        name: 'Tyler',
        maybeNote: Option.some('guilty'),
        isDunce: true,
      }),
      NotedPlayer({ name: 'Tyler', maybeNote: Option.none(), isDunce: false }),
    ]
    for (const note of notes) {
      const row = { id: 'r', from: 'cli', createdAtMs: 1, tag: 'x' }
      const encoded = S.encodeSync(MessageWire)(note)
      expect(
        S.decodeUnknownSync(MessageWire)(
          overJson({ ...row, tag: encoded.tag }),
        ),
      ).toEqual(note)
    }
  })
})

describe('the log', () => {
  const overJson = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value))

  it('reads only its own facts, never what the origin sends one person', () => {
    const anyMessageWire = snapshotLogMessageWire(Message)
    const forged = S.encodeSync(anyMessageWire)(
      ReceivedPage({
        page: {
          displayName: 'Brandon',
          sections: [
            MarkdownSection({
              key: SectionKey.make('hello'),
              title: 'Hello',
              column: 'Main',
              document: parseMarkdown('Send your SOL to 9xQeWv.'),
            }),
          ],
        },
      }),
    )
    const row = overJson({
      id: 'r',
      from: 'intruder',
      createdAtMs: 1,
      tag: forged.tag,
    })

    expect(Option.isNone(S.decodeUnknownOption(MessageWire)(row))).toBe(true)
  })
})

describe('the facts that ask for a fresh read', () => {
  it('moves the page revision on a section change', () => {
    expect(apply(initialModel, ChangedSections({ atMs: 5 })).pageRevision).toBe(
      initialModel.pageRevision + 1,
    )
  })

  it('keeps the newest pointer', () => {
    const sectionKey = SectionKey.make('the-riddle')
    const model = apply(initialModel, PointedAtSection({ sectionKey, atMs: 9 }))
    expect(model.maybePointer).toEqual(Option.some({ sectionKey, atMs: 9 }))
  })
})

const started: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const settleAttempts = 400

const eventually = async <A>(
  read: () => A,
  isDone: (value: A) => boolean,
): Promise<A> => {
  for (
    let attempt = 0;
    attempt < settleAttempts && !isDone(read());
    attempt += 1
  ) {
    await Effect.runPromise(Effect.sleep(Duration.millis(2)))
  }
  return read()
}

const emptyPage = Page.make({ displayName: 'Brandon', sections: [] })

const startReader = (
  store: Runtime.MemoryStore,
  processor: string,
  loads: { count: number },
) => {
  const server = Layer.succeed(BrandonServer, {
    loadPage: Effect.sync(() => {
      loads.count += 1
      return emptyPage
    }),
    loadFootball: Effect.succeed([]),
    loadWallets: Effect.succeed([]),
    scrollToSection: () => Effect.void,
    reloadPage: Effect.void,
    nowMs: Effect.succeed(0),
  })
  const handle = startBrandonOn(
    Runtime.Memory({ processor, store }),
    Layer.merge(server, makeTestWalletResources()),
    Processor.Host.Foldkit(),
  )
  started.push(handle)
  return handle
}

const readyPlayers = (
  model: ReturnType<ReturnType<typeof startReader>['readModel']>,
) => (model._tag === 'Ready' ? rankedPlayers(model).length : 0)

describe('Brandon dot on the log', () => {
  it('shows a point written on one Processor on every other, and reads its page once a change', async () => {
    const store = Runtime.makeMemoryStore()
    const loads = { count: 0 }
    const writer = startReader(store, 'cli-writer', { count: 0 })
    const reader = startReader(store, 'foldkit-reader', loads)
    await eventually(reader.readModel, model => model._tag === 'Ready')
    await eventually(writer.readModel, model => model._tag === 'Ready')
    await eventually(
      () => loads.count,
      count => count === 1,
    )

    writer.send(award('1', 'Claude', 2))
    writer.send(ChangedSections({ atMs: 1 }))

    const seen = await eventually(
      reader.readModel,
      model => readyPlayers(model) === 1,
    )
    expect(readyPlayers(seen)).toBe(1)
    expect(
      await eventually(
        () => loads.count,
        count => count === 2,
      ),
    ).toBe(2)
  })
})

describe('BrandonProgram', () => {
  it('never writes what a server sent this person to the log', () => {
    const isLocalOnly = BrandonProgram.synchronization?.isLocalOnly
    expect(isLocalOnly?.(ReceivedPage({ page: emptyPage }))).toBe(true)
    expect(isLocalOnly?.(award('1', 'Claude', 1))).toBe(false)
  })

  it('keeps the page when the log refolds', () => {
    const keepOnRefold = BrandonProgram.synchronization?.keepOnRefold
    const current = apply(initialModel, ReceivedPage({ page: emptyPage }))
    expect(keepOnRefold?.(current, initialModel).page).toEqual(current.page)
  })
})
