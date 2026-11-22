import {
  Context,
  Duration,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  Stream,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as Command from '../command/index.js'
import * as ManagedResource from '../managedResource/index.js'
import { m } from '../message/public.js'
import * as Host from '../processor/host.js'
import * as RunsOn from '../processor/runsOn.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import * as Subscription from '../subscription/subscription.js'
import { makeProgramRuntime } from './programRuntime.js'
import { start } from './start.js'
import { Memory, makeMemoryStore } from './syncEngine.js'

// A publisher in small: a copy is approved on any device, and one
// Processor claims it. Claiming is the work that must run in one place.

const Approve = m('Approve', { copy: S.String })
const NoticedApprovedCopy = m('NoticedApprovedCopy', { copy: S.String })
const ClaimedCopy = m('ClaimedCopy', { copy: S.String })
const Message = S.Union([Approve, NoticedApprovedCopy, ClaimedCopy])
type Message = typeof Message.Type

const Model = S.Struct({
  approved: S.Array(S.String),
  claimed: S.Array(S.String),
})
type Model = typeof Model.Type

type Claim = Readonly<{ by: string; copy: string }>

class Claims extends Context.Service<
  Claims,
  Readonly<{ claim: (copy: string) => Effect.Effect<void> }>
>()('test/Claims') {}

const claimsBy = (by: string, made: Array<Claim>) =>
  Layer.succeed(Claims, {
    claim: copy =>
      Effect.sync(() => {
        made.push({ by, copy })
      }),
  })

const ClaimCopy = Command.define(
  'ClaimCopy',
  { copy: S.String },
  ClaimedCopy,
)(({ copy }) =>
  Effect.gen(function* () {
    const claims = yield* Claims
    yield* claims.claim(copy)
    return ClaimedCopy({ copy })
  }),
)

const waitingOf = (model: Model): ReadonlyArray<string> =>
  model.approved.filter(copy => !model.claimed.includes(copy))

const subscriptions = Subscription.make<Model, Message>()(entry => ({
  approvedUnclaimed: entry(
    { waiting: S.Array(S.String) },
    {
      runsOn: RunsOn.serverOnly,
      modelToDependencies: model => ({ waiting: waitingOf(model) }),
      dependenciesToStream: ({ waiting }) =>
        Stream.map(Stream.fromIterable(waiting), copy =>
          NoticedApprovedCopy({ copy }),
        ),
    },
  ),
}))

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Claims>>,
]

const Publisher = make({
  id: 'runs-on-publisher',
  version: 1,
  Model,
  Message,
  init: () => [{ approved: [], claimed: [] }, []],
  update: (model: Model, message: Message) =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        Approve: ({ copy }) => [
          { ...model, approved: [...model.approved, copy] },
          [],
        ],
        NoticedApprovedCopy: ({ copy }) => [model, [ClaimCopy({ copy })]],
        ClaimedCopy: ({ copy }) => [
          { ...model, claimed: [...model.claimed, copy] },
          [],
        ],
      }),
    ),
  subscriptions,
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      claimed: current.claimed,
    }),
  },
})

const Synced = compose.sync({
  of: Publisher,
  snapshot: S.Struct({ approved: S.Array(S.String) }).pipe(
    S.decodeTo(
      Model,
      SchemaTransformation.transform({
        decode: row => ({ approved: row.approved, claimed: [] }),
        encode: model => ({ approved: model.approved }),
      }),
    ),
  ),
  message: S.Struct({
    id: S.String,
    body: S.String,
    from: S.String,
    createdAtMs: S.Number,
  }).pipe(
    S.decodeTo(
      S.fromJsonString(Publisher.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
      }),
    ),
  ),
})

const settleAttempts = 400

const settled = <A>(read: () => A, isDone: (value: A) => boolean) =>
  Effect.gen(function* () {
    for (
      let attempt = 0;
      attempt < settleAttempts && !isDone(read());
      attempt += 1
    ) {
      yield* Effect.sleep(Duration.millis(1))
    }
    return read()
  })

// NOTE: Long enough for a Processor that should stay still to have
// claimed, had it been going to.
const quiet = Effect.sleep(Duration.millis(40))

const run = <A>(effect: Effect.Effect<A, unknown, never>) =>
  Effect.runPromise(effect)

describe('a Subscription that runs on the Server only', () => {
  it('is run by the Server Processor and by no other, when what it watches arrives from another device', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const made: Array<Claim> = []
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.ExpoIos(), store }),
            resources: claimsBy('phone', made),
          })
          yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Server(), store }),
            resources: claimsBy('server', made),
          })
          yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Cli(), store }),
            resources: claimsBy('cli', made),
          })

          yield* phone.run(Approve({ copy: 'a' }))
          yield* settled(
            () => made.length,
            count => count > 0,
          )
          yield* quiet
          expect(made).toEqual([{ by: 'server', copy: 'a' }])
        }),
      ),
    )
  })

  it('acts on what was already in the log when the Server starts', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const made: Array<Claim> = []
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.ExpoIos(), store }),
            resources: claimsBy('phone', made),
          })
          yield* phone.run(Approve({ copy: 'a' }))
          yield* quiet
          expect(made).toEqual([])

          yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Server(), store }),
            resources: claimsBy('server', made),
          })
          yield* settled(
            () => made.length,
            count => count > 0,
          )
          yield* quiet
          expect(made).toEqual([{ by: 'server', copy: 'a' }])
        }),
      ),
    )
  })

  it('acts once on a copy that reaches the Server by a refold of its log', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const made: Array<Claim> = []
          const engine = Memory({ processor: Host.Server(), store })
          const server = yield* start({
            program: Synced,
            sync: engine,
            resources: claimsBy('server', made),
          })
          yield* server.run(Approve({ copy: 'a' }))
          yield* settled(
            () => made.length,
            count => count > 0,
          )

          engine.injectMessage({
            id: 'approved-earlier',
            body: JSON.stringify({ _tag: 'Approve', copy: 'b' }),
            from: 'expo-ios-late',
            createdAtMs: Date.now() - 60_000,
          })
          yield* settled(
            () => made.length,
            count => count > 1,
          )
          yield* quiet
          expect(made).toEqual([
            { by: 'server', copy: 'a' },
            { by: 'server', copy: 'b' },
          ])
        }),
      ),
    )
  })

  it('does not run on a Headless Processor, so a test on Memory never starts vendor work', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const made: Array<Claim> = []
          const headless = yield* start({
            program: Synced,
            sync: Memory({ store: makeMemoryStore() }),
            resources: claimsBy('headless', made),
          })
          yield* headless.run(Approve({ copy: 'a' }))
          yield* quiet
          expect(made).toEqual([])
        }),
      ),
    )
  })

  it('keeps what it says through compose.sync', () => {
    const lifted = Option.fromNullishOr(
      Synced.subscriptions?.['approvedUnclaimed'],
    )
    expect(Option.map(lifted, subscription => subscription.runsOn)).toEqual(
      Option.some(RunsOn.serverOnly),
    )
  })

  it('keeps what it says through Subscription.lift', () => {
    const lifted = Subscription.lift(subscriptions)<
      Readonly<{ publisher: Model }>,
      Message
    >({
      toChildModel: parent => parent.publisher,
      toParentMessage: message => message,
    })
    expect(lifted.approvedUnclaimed.runsOn).toEqual(RunsOn.serverOnly)
  })
})

describe('a Program runtime that is told its Host', () => {
  it('runs server-only work when the Host is the Server, and not when it is another or not said', async () => {
    const claimedOn = (host: Host.Host | undefined) =>
      run(
        Effect.scoped(
          Effect.gen(function* () {
            const made: Array<Claim> = []
            const runtime = yield* makeProgramRuntime({
              program: Publisher,
              resources: claimsBy('here', made),
              ...(host === undefined ? {} : { host }),
            })
            yield* runtime.initialization
            yield* runtime.run(Approve({ copy: 'a' }))
            yield* settled(
              () => made.length,
              count => count > 0,
            )
            return made
          }),
        ),
      )
    expect(await claimedOn(Host.Server())).toEqual([{ by: 'here', copy: 'a' }])
    expect(await claimedOn(Host.React())).toEqual([])
    expect(await claimedOn(undefined)).toEqual([])
  }, 20_000)
})

describe('a ManagedResource that runs on the Server only', () => {
  const Opened = m('Opened')
  const Closed = m('Closed')
  const FailedOpen = m('FailedOpen')
  const VaultMessage = S.Union([Opened, Closed, FailedOpen])
  type VaultMessage = typeof VaultMessage.Type
  const VaultModel = S.Struct({ vault: S.Literals(['Shut', 'Open']) })
  type VaultModel = typeof VaultModel.Type
  const Vault = ManagedResource.tag<Readonly<{ id: string }>>()('Vault')

  const vaultOn = (host: Host.Host) =>
    run(
      Effect.scoped(
        Effect.gen(function* () {
          const opened: Array<string> = []
          const managedResources = ManagedResource.make<
            VaultModel,
            VaultMessage
          >()(entry => ({
            vault: entry(S.Option(S.Null), {
              runsOn: RunsOn.serverOnly,
              resource: Vault,
              modelToMaybeRequirements: () => Option.some(null),
              acquire: () =>
                Effect.sync(() => {
                  opened.push('vault')
                  return { id: 'vault' }
                }),
              release: () => Effect.void,
              onAcquired: () => Opened(),
              onReleased: () => Closed(),
              onAcquireError: () => FailedOpen(),
            }),
          }))
          const Keeper = make({
            id: 'runs-on-keeper',
            version: 1,
            Model: VaultModel,
            Message: VaultMessage,
            init: () => [{ vault: 'Shut' }, []],
            update: (model: VaultModel, message: VaultMessage) =>
              M.value(message).pipe(
                M.withReturnType<readonly [VaultModel, ReadonlyArray<never>]>(),
                M.tagsExhaustive({
                  Opened: () => [{ vault: 'Open' }, []],
                  Closed: () => [{ vault: 'Shut' }, []],
                  FailedOpen: () => [model, []],
                }),
              ),
            managedResources,
          })
          const runtime = yield* makeProgramRuntime({
            program: Keeper,
            resources: Layer.empty,
            host,
          })
          yield* runtime.initialization
          yield* settled(
            () => opened.length,
            count => count > 0,
          )
          return { opened, vault: runtime.readModel().vault }
        }),
      ),
    )

  it('is acquired on the Server Host and stays released on another', async () => {
    expect(await vaultOn(Host.Server())).toEqual({
      opened: ['vault'],
      vault: 'Open',
    })
    expect(await vaultOn(Host.Cli())).toEqual({ opened: [], vault: 'Shut' })
  }, 20_000)
})
