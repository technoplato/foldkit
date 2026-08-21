import { Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { FailedObserveSnap, type Message, ObservedSnap } from './message.js'
import {
  type Danger,
  type Model,
  OkEffect,
  PlayCredits,
  RefuseEffect,
  type Role,
  SimWallet,
} from './model.js'
import { OrbitStore } from './store.js'

const whyFor = (danger: Danger): string =>
  M.value(danger).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      'live-wallet': () => 'no live wallets',
      broadcast: () => 'no broadcasts',
      'chain-send': () => 'no chain',
      'key-exfil': () => 'no keys in source',
    }),
  )

const commitOk = (model: Model, line: string, sims: Model['sims']): Model => {
  const seq = model.seq + 1
  return evo(model, {
    sims: () => sims,
    seq: () => seq,
    log: events => [...events, { seq, line }],
    lastOutcome: () => Option.some(OkEffect.make({ line })),
  })
}

const commitRefuse = (model: Model, danger: Danger, why: string): Model => {
  const seq = model.seq + 1
  const line = `refuse ${danger._tag}`
  return evo(model, {
    seq: () => seq,
    log: events => [...events, { seq, line }],
    lastOutcome: () => Option.some(RefuseEffect.make({ danger, why })),
  })
}

const openSim = (model: Model, role: Role): Model => {
  const current = model.sims[role]
  const nextWallet =
    current._tag === 'sim'
      ? current
      : SimWallet.make({ role, play: PlayCredits.make(0) })
  return commitOk(model, `opened sim ${role}`, {
    ...model.sims,
    [role]: nextWallet,
  })
}

// COMMAND

/** Loads one snap through the injected Orbit store. */
export const LoadSnap = Command.define(
  'LoadSnap',
  ObservedSnap,
  FailedObserveSnap,
)(
  Effect.gen(function* () {
    const store = yield* OrbitStore
    const snapshot = yield* store.fetch.pipe(Effect.option)
    if (snapshot._tag === 'None') {
      return FailedObserveSnap.make({ reason: 'snap failed' })
    }
    return ObservedSnap.make({
      seq: snapshot.value.seq,
      modelJson: snapshot.value.modelJson,
      source: snapshot.value.source,
    })
  }),
)

/** Applies one Orbit Message to the current Model. */
export const update = (
  model: Model,
  message: Message,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, OrbitStore>>,
] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [
        Model,
        ReadonlyArray<Command.Command<Message, never, OrbitStore>>,
      ]
    >(),
    M.tagsExhaustive({
      OpenSim: ({ role }) => [openSim(model, role), []],
      MintPlay: ({ role, amount }) => {
        const opened =
          model.sims[role]._tag === 'sim' ? model : openSim(model, role)
        const wallet = opened.sims[role]
        if (wallet._tag !== 'sim') {
          return [opened, []]
        }
        const next = SimWallet.make({
          role,
          play: PlayCredits.make(wallet.play + amount),
        })
        return [
          commitOk(opened, `mint ${amount} play → ${role}`, {
            ...opened.sims,
            [role]: next,
          }),
          [],
        ]
      },
      MovePlay: ({ from, to, amount }) => {
        const src = model.sims[from]
        const dst = model.sims[to]
        if (src._tag !== 'sim' || dst._tag !== 'sim' || src.play < amount) {
          return [model, []]
        }
        const nextSrc = SimWallet.make({
          role: from,
          play: PlayCredits.make(src.play - amount),
        })
        const nextDst = SimWallet.make({
          role: to,
          play: PlayCredits.make(dst.play + amount),
        })
        return [
          commitOk(model, `move ${amount} ${from} → ${to}`, {
            ...model.sims,
            [from]: nextSrc,
            [to]: nextDst,
          }),
          [],
        ]
      },
      AskDanger: ({ danger }) => [
        commitRefuse(model, danger, whyFor(danger)),
        [],
      ],
      ObservedSnap: ({ source }) => [evo(model, { source: () => source }), []],
      FailedObserveSnap: () => [
        evo(model, { source: () => 'StaticFallback' }),
        [],
      ],
      ClickedTool: ({ id }) => [
        evo(model, { selectedToolId: () => Option.some(id) }),
        [],
      ],
      ClosedTool: () => [
        evo(model, { selectedToolId: () => Option.none() }),
        [],
      ],
    }),
  )
