import { Option } from 'effect'

import { AskDanger, MintPlay, MovePlay, OpenSim } from './message.js'
import {
  BroadcastDanger,
  ChainSendDanger,
  KeyExfilDanger,
  LiveWalletDanger,
  type Model,
  type Outcome,
  PlayCredits,
  type StepResult,
  liveWalletIsRepresentable,
  playOf,
} from './model.js'
import { update } from './update.js'

/** Why the agent index is the program. */
export const INDEX_WHY =
  'The index is not a README that drifts. It is the program an agent runs. Prebuild mounts the same FoldKit core with no view and no server. One Model, one update, two clients: this page and the compiler. Dangerous things are not `if (live) throw`. LiveWallet is not a variant. You cannot construct what is not in the union. Play credits are a branded ADT. They cannot be added to satoshis because satoshis are not a type here. If the instructions lie, `npm run build` fails. That is why the instructions stay true.'

/** The 16 prebuild steps. */
export const INDEX_STEPS = [
  { id: '01', tag: 'do', title: 'Open sim tortoise' },
  { id: '02', tag: 'do', title: 'Open sim achilles' },
  {
    id: '03',
    tag: 'do',
    title: 'Mint 1428 play to tortoise (14.28 callback, play units)',
  },
  { id: '04', tag: 'do', title: 'Move 428 play tortoise → achilles' },
  { id: '05', tag: 'check', title: 'Tortoise holds 1000' },
  { id: '06', tag: 'check', title: 'Achilles holds 428' },
  { id: '07', tag: 'do', title: 'Ask for a live wallet — must refuse' },
  { id: '08', tag: 'do', title: 'Ask to broadcast a claim — must refuse' },
  { id: '09', tag: 'do', title: 'Ask to send on a chain — must refuse' },
  { id: '10', tag: 'do', title: 'Ask to load key material — must refuse' },
  { id: '11', tag: 'check', title: 'live-wallet was refused' },
  { id: '12', tag: 'check', title: 'broadcast was refused' },
  { id: '13', tag: 'check', title: 'chain-send was refused' },
  { id: '14', tag: 'check', title: 'key-exfil was refused' },
  { id: '15', tag: 'check', title: 'No live wallet is representable' },
  { id: '16', tag: 'check', title: 'Ledger has at least 7 events' },
] as const

/** Prebuild / agent-index receipt. */
export type Receipt = {
  readonly schema: 'orbit.prebuild.v1'
  readonly ok: boolean
  readonly at: string
  readonly why: string
  readonly results: ReadonlyArray<StepResult>
  readonly balances: { readonly tortoise: number; readonly achilles: number }
  readonly seq: number
  readonly liveWallets: number
}

const outcomeJson = (outcome: Outcome | undefined): string => {
  if (outcome === undefined) {
    return 'missing'
  }
  if (outcome._tag === 'ok') {
    return JSON.stringify({ tag: 'ok', line: outcome.line })
  }
  return JSON.stringify({
    tag: 'refuse',
    danger: { tag: outcome.danger._tag },
    why: outcome.why,
  })
}

const lastOutcome = (model: Model): Outcome | undefined =>
  Option.getOrUndefined(model.lastOutcome)

/**
 * Applies the 16 agent-index messages/checks as a pure function.
 * Headless, Foldkit, and tests all call this.
 */
export const runIndex = (
  model: Model,
): { readonly model: Model; readonly receipt: Receipt } => {
  let current = model
  const results: Array<StepResult> = []
  const refused: Record<string, boolean> = {}

  const apply = (
    message: Parameters<typeof update>[1],
  ): Outcome | undefined => {
    const [next] = update(current, message)
    current = next
    return lastOutcome(next)
  }

  const record = (id: string, title: string, ok: boolean, detail: string) => {
    results.push({ id, title, ok, detail })
  }

  const o1 = apply(OpenSim.make({ role: 'tortoise' }))
  record(
    '01',
    INDEX_STEPS[0].title,
    o1?._tag === 'ok' && current.sims.tortoise._tag === 'sim',
    outcomeJson(o1),
  )

  const o2 = apply(OpenSim.make({ role: 'achilles' }))
  record(
    '02',
    INDEX_STEPS[1].title,
    o2?._tag === 'ok' && current.sims.achilles._tag === 'sim',
    outcomeJson(o2),
  )

  const o3 = apply(
    MintPlay.make({ role: 'tortoise', amount: PlayCredits.make(1428) }),
  )
  record(
    '03',
    INDEX_STEPS[2].title,
    o3?._tag === 'ok' && playOf(current.sims.tortoise) === 1428,
    outcomeJson(o3),
  )

  const o4 = apply(
    MovePlay.make({
      from: 'tortoise',
      to: 'achilles',
      amount: PlayCredits.make(428),
    }),
  )
  record(
    '04',
    INDEX_STEPS[3].title,
    o4?._tag === 'ok' && playOf(current.sims.tortoise) === 1000,
    outcomeJson(o4),
  )

  const tortoiseBal = playOf(current.sims.tortoise)
  record(
    '05',
    INDEX_STEPS[4].title,
    tortoiseBal === 1000,
    `tortoise bal=${tortoiseBal} want=1000`,
  )

  const achillesBal = playOf(current.sims.achilles)
  record(
    '06',
    INDEX_STEPS[5].title,
    achillesBal === 428,
    `achilles bal=${achillesBal} want=428`,
  )

  const o7 = apply(AskDanger.make({ danger: LiveWalletDanger.make({}) }))
  const liveRefused = o7?._tag === 'refuse' && o7.danger._tag === 'live-wallet'
  refused['live-wallet'] = liveRefused
  record('07', INDEX_STEPS[6].title, liveRefused, outcomeJson(o7))

  const o8 = apply(AskDanger.make({ danger: BroadcastDanger.make({}) }))
  const broadcastRefused =
    o8?._tag === 'refuse' && o8.danger._tag === 'broadcast'
  refused['broadcast'] = broadcastRefused
  record('08', INDEX_STEPS[7].title, broadcastRefused, outcomeJson(o8))

  const o9 = apply(AskDanger.make({ danger: ChainSendDanger.make({}) }))
  const chainRefused = o9?._tag === 'refuse' && o9.danger._tag === 'chain-send'
  refused['chain-send'] = chainRefused
  record('09', INDEX_STEPS[8].title, chainRefused, outcomeJson(o9))

  const o10 = apply(AskDanger.make({ danger: KeyExfilDanger.make({}) }))
  const keyRefused = o10?._tag === 'refuse' && o10.danger._tag === 'key-exfil'
  refused['key-exfil'] = keyRefused
  record('10', INDEX_STEPS[9].title, keyRefused, outcomeJson(o10))

  record(
    '11',
    INDEX_STEPS[10].title,
    refused['live-wallet'] === true,
    'refused live-wallet',
  )
  record(
    '12',
    INDEX_STEPS[11].title,
    refused['broadcast'] === true,
    'refused broadcast',
  )
  record(
    '13',
    INDEX_STEPS[12].title,
    refused['chain-send'] === true,
    'refused chain-send',
  )
  record(
    '14',
    INDEX_STEPS[13].title,
    refused['key-exfil'] === true,
    'refused key-exfil',
  )

  record(
    '15',
    INDEX_STEPS[14].title,
    liveWalletIsRepresentable === false,
    'union has no live variant',
  )

  record(
    '16',
    INDEX_STEPS[15].title,
    current.seq >= 7,
    `seq=${current.seq} min=7`,
  )

  const withSteps: Model = {
    ...current,
    steps: results,
  }

  const receipt: Receipt = {
    schema: 'orbit.prebuild.v1',
    ok: results.every(step => step.ok),
    at: new Date().toISOString(),
    why: INDEX_WHY,
    results,
    balances: {
      tortoise: playOf(withSteps.sims.tortoise),
      achilles: playOf(withSteps.sims.achilles),
    },
    seq: withSteps.seq,
    liveWallets: 0,
  }

  return { model: withSteps, receipt }
}
