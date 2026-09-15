import { Array, Effect, Layer, Option, Ref } from 'effect'

import {
  type Account,
  type AppNotification,
  Authenticated,
  type ChatMessage,
  type Finding,
  type RadarJob,
  Snapshot,
  type VaultFile,
  demoAccounts,
  emptySnapshot,
  groundedReply,
  maybeFinding,
  parseEmail,
} from './domain.js'
import { Ledger, LedgerError } from './ledger.js'

type Store = Readonly<{
  snapshot: Snapshot
}>

const newId = (): string => globalThis.crypto.randomUUID()

const now = (): number => Date.now()

const requireAuth = (snapshot: Snapshot) => {
  if (snapshot.session._tag !== 'Authenticated') {
    return Effect.fail(new LedgerError({ reason: 'Sign in first.' }))
  }
  return Effect.succeed(snapshot.session)
}

const replace = (
  store: Ref.Ref<Store>,
  snapshot: Snapshot,
): Effect.Effect<Snapshot> =>
  Ref.set(store, { snapshot }).pipe(Effect.as(snapshot))

/** In-memory Ledger used by tests and the Expo demo host. */
export const layerMemory = Layer.effect(
  Ledger,
  Effect.gen(function* () {
    const store = yield* Ref.make<Store>({ snapshot: emptySnapshot() })
    return {
      restore: Ref.get(store).pipe(Effect.map(state => state.snapshot)),
      currentEmail: Ref.get(store).pipe(
        Effect.map(state =>
          state.snapshot.session._tag === 'Authenticated'
            ? Option.some(state.snapshot.session.email)
            : Option.none(),
        ),
      ),
      login: (email: string) =>
        Effect.gen(function* () {
          const parsed = parseEmail(email)
          if (Option.isNone(parsed)) {
            return yield* Effect.fail(
              new LedgerError({ reason: 'Email is not valid.' }),
            )
          }
          const userId = `mem:${parsed.value}`
          const snapshot = Snapshot.make({
            session: Authenticated.make({
              userId,
              email: parsed.value,
              plan: 'free',
            }),
            accounts: demoAccounts(userId),
            vault: [],
            radar: [],
            chat: [],
            notifications: [],
          })
          return yield* replace(store, snapshot)
        }),
      logout: replace(store, emptySnapshot()),
      addAccount: input =>
        Effect.gen(function* () {
          const state = yield* Ref.get(store)
          yield* requireAuth(state.snapshot)
          if (input.name.trim() === '') {
            return yield* Effect.fail(
              new LedgerError({ reason: 'Account name is required.' }),
            )
          }
          const account: Account = {
            id: newId(),
            name: input.name.trim(),
            institution: input.institution.trim() || 'Manual',
            kind: input.kind,
            currency: 'USD',
            balanceCents: input.balanceCents,
            access: 'read_only',
          }
          return yield* replace(
            store,
            Snapshot.make({
              ...state.snapshot,
              accounts: [...state.snapshot.accounts, account],
            }),
          )
        }),
      addVault: input =>
        Effect.gen(function* () {
          const state = yield* Ref.get(store)
          yield* requireAuth(state.snapshot)
          if (input.title.trim() === '') {
            return yield* Effect.fail(
              new LedgerError({ reason: 'Vault title is required.' }),
            )
          }
          const file: VaultFile = {
            id: newId(),
            title: input.title.trim(),
            origin: input.origin,
            createdAtMs: now(),
          }
          return yield* replace(
            store,
            Snapshot.make({
              ...state.snapshot,
              vault: [...state.snapshot.vault, file],
            }),
          )
        }),
      armRadar: input =>
        Effect.gen(function* () {
          const state = yield* Ref.get(store)
          yield* requireAuth(state.snapshot)
          if (input.question.trim() === '') {
            return yield* Effect.fail(
              new LedgerError({ reason: 'Radar question is required.' }),
            )
          }
          const job: RadarJob = {
            id: newId(),
            question: input.question.trim(),
            cadence: input.cadence,
            everyMinutes: input.everyMinutes,
            status: 'armed',
            lastAnswer: '',
            lastAnswerHash: '',
          }
          return yield* replace(
            store,
            Snapshot.make({
              ...state.snapshot,
              radar: [...state.snapshot.radar, job],
            }),
          )
        }),
      tickRadar: Effect.gen(function* () {
        const state = yield* Ref.get(store)
        yield* requireAuth(state.snapshot)
        const findings: Array<Finding> = []
        const radar = Array.map(state.snapshot.radar, job => {
          if (job.status !== 'armed') {
            return job
          }
          const maybe = maybeFinding(job, state.snapshot.accounts)
          if (Option.isNone(maybe)) {
            return job
          }
          findings.push(maybe.value)
          return {
            ...job,
            lastAnswer: maybe.value.answer,
            lastAnswerHash: maybe.value.hash,
          }
        })
        const notifications: Array<AppNotification> = [
          ...state.snapshot.notifications,
        ]
        for (const finding of findings) {
          notifications.push({
            id: newId(),
            title: 'Radar',
            body: finding.answer,
            channel: 'local',
            status: 'queued',
            createdAtMs: now(),
          })
        }
        const snapshot = yield* replace(
          store,
          Snapshot.make({
            ...state.snapshot,
            radar,
            notifications,
          }),
        )
        return { snapshot, findings }
      }),
      sendChat: input =>
        Effect.gen(function* () {
          const state = yield* Ref.get(store)
          yield* requireAuth(state.snapshot)
          const text = input.text.trim()
          if (text === '') {
            return yield* Effect.fail(
              new LedgerError({ reason: 'Chat text is required.' }),
            )
          }
          const reply = groundedReply(text, state.snapshot.accounts)
          const createdAtMs = now()
          const user: ChatMessage = {
            id: newId(),
            role: 'user',
            body: text,
            createdAtMs,
            citationAccountIds: [],
          }
          const assistant: ChatMessage = {
            id: newId(),
            role: 'assistant',
            body: reply.body,
            createdAtMs: createdAtMs + 1,
            citationAccountIds: reply.citationAccountIds,
          }
          return yield* replace(
            store,
            Snapshot.make({
              ...state.snapshot,
              chat: [...state.snapshot.chat, user, assistant],
            }),
          )
        }),
      enqueueNotification: input =>
        Effect.gen(function* () {
          const state = yield* Ref.get(store)
          yield* requireAuth(state.snapshot)
          const notification: AppNotification = {
            id: newId(),
            title: input.title.trim(),
            body: input.body.trim(),
            channel: input.channel,
            status: 'queued',
            createdAtMs: now(),
          }
          return yield* replace(
            store,
            Snapshot.make({
              ...state.snapshot,
              notifications: [...state.snapshot.notifications, notification],
            }),
          )
        }),
    }
  }),
)
