import { Array, Option, Schema as S } from 'effect'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AtomicUnits,
  PortfolioSnapshot,
  TransactionRecord,
  WalletProfile,
} from 'wallet-core-example'

import {
  proofEnvNames,
  secretPresent,
  stripeConfigFilePresent,
  stripeConfigRelpaths,
  stripeEnvNames,
  stripeProbeFromPresence,
} from './casinoClient.js'
import { init } from './init.js'
import {
  AppliedDraft,
  ClickedAddQuestion,
  ClickedFundCyclingAgent,
  ClickedHumanity,
  ClickedStripe,
  ClickedWallet,
  ClickedZkIdentity,
  FoundFundCyclingAgentNotConnected,
  FoundHumanityNotConnected,
  FoundStripeConfigured,
  FoundStripeUnconfigured,
  FoundZkNotConnected,
  ObservedIncoming,
  RequestedRemove,
  SucceededLoadPortfolio,
  SucceededZkIdentity,
  TypedDraft,
} from './message.js'
import {
  answerOf,
  creditsOf,
  depositOf,
  emptyModel,
  playerOf,
  stripePhaseOf,
  walletPhaseOf,
  withWalletConnected,
  zkPhaseOf,
} from './model.js'
import { productView } from './product.js'
import { CasinoProgram, casinoScreen, casinoValid } from './program.js'

const sampleWallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1,
  accounts: [
    {
      accountId: 'acct-sol-devnet',
      chainId: 'solana',
      networkId: 'solana:devnet',
      address: 'DevnetReceive111',
      displayName: 'SOL Devnet',
    },
  ],
})

const connectedWallet = (model = emptyModel()) =>
  withWalletConnected(model, {
    accountId: 'acct-sol-devnet',
    address: 'DevnetReceive111',
    wallets: [sampleWallet],
  })

const incomingSol = (status: 'Confirmed' | 'Pending') =>
  TransactionRecord.make({
    recordId: `rec-${status}`,
    transactionId: `tx-${status}`,
    accountId: 'acct-sol-devnet',
    networkId: 'solana:devnet',
    direction: 'Incoming',
    status,
    amount: {
      assetId: 'solana:devnet:sol',
      atomicUnits: S.decodeUnknownSync(AtomicUnits)('1000000000'),
      observedAt: 1,
    },
    counterpartyAddress: 'counterparty',
    normalizedCounterpartyAddress: 'counterparty',
    observedAt: 1,
  })

const commandName = (
  commands: ReadonlyArray<{ readonly name: string }>,
): string | undefined => {
  const maybeCommand = Array.head(commands)
  if (Option.isSome(maybeCommand)) {
    return maybeCommand.value.name
  }
  return undefined
}

describe('CasinoProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const empty = emptyModel()
    expect(CasinoProgram.valid).toBe(casinoValid)
    expect(CasinoProgram.screen).toBe(casinoScreen)
    expect(casinoScreen(empty)).toEqual(productView(empty))
  })

  it('paints title unpaid unproven public-fact branches', () => {
    const tree = productView(emptyModel())
    const text = JSON.stringify(tree)
    expect(text).toContain('Casino')
    expect(text).toContain('None')
    expect(text).toContain('Empty')
    expect(text).toContain('Unproven')
    expect(text).toContain('Locked')
    expect(text).toContain('Stripe')
    expect(text).toContain('Wallet')
    expect(text).toContain('ZkIdentity')
    expect(text).toContain('Humanity')
    expect(text).toContain('FundCyclingAgent')
    expect(text).toContain('stripe')
    expect(text).toContain('not-connected')
  })
})

describe('origin probes', () => {
  it('maps Stripe presence onto Configured without printing the secret', () => {
    const envPresent = secretPresent(name => process.env[name], stripeEnvNames)
    const configPresent = stripeConfigFilePresent(
      Array.map(stripeConfigRelpaths, relpath =>
        Path.join(Os.homedir(), relpath),
      ),
      Fs.existsSync,
    )
    const probe = stripeProbeFromPresence({
      envSecretPresent: envPresent,
      configFilePresent: configPresent,
    })
    if (envPresent || configPresent) {
      expect(probe._tag).toBe('Configured')
    } else {
      expect(probe._tag).toBe('Unconfigured')
    }
  })

  it('finds no live proof verifier secret without printing it', () => {
    expect(secretPresentForProofs()).toBe(false)
  })
})

const secretPresentForProofs = (): boolean =>
  secretPresent(name => process.env[name], proofEnvNames)

describe('update', () => {
  it('starts Stripe probing without inhabiting Stripe or Settled', () => {
    const [next, commands] = CasinoProgram.update(emptyModel(), ClickedStripe())
    expect(depositOf(next)._tag).toBe('None')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(next.notice._tag).toBe('None')
    expect(stripePhaseOf(next)).toBe('probing')
    expect(commandName(commands)).toBe('ProbeStripe')
  })

  it('keeps Stripe not-connected when no charge secret is present', () => {
    const [probing] = CasinoProgram.update(emptyModel(), ClickedStripe())
    const [next] = CasinoProgram.update(probing, FoundStripeUnconfigured())
    expect(depositOf(next)._tag).toBe('None')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(stripePhaseOf(next)).toBe('stripe-unconfigured')
    expect(next.notice._tag).toBe('None')
  })

  it('does not inhabit DepositStripe when a secret is present but there is no live charge', () => {
    const [probing] = CasinoProgram.update(emptyModel(), ClickedStripe())
    const [next] = CasinoProgram.update(probing, FoundStripeConfigured())
    expect(depositOf(next)._tag).toBe('None')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(stripePhaseOf(next)).toBe('stripe-configured')
  })

  it('starts a live wallet Command without inhabiting Wallet or Settled', () => {
    const [next, commands] = CasinoProgram.update(emptyModel(), ClickedWallet())
    expect(depositOf(next)._tag).toBe('None')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(next.notice._tag).toBe('None')
    expect(walletPhaseOf(next)).toBe('probing')
    expect(commandName(commands)).toBe('LoadCasinoWallet')
  })

  it('inhabits Wallet only while a live receive session is connected, not Settled', () => {
    const next = connectedWallet()
    expect(depositOf(next)._tag).toBe('Wallet')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(walletPhaseOf(next)).toBe('connected')
  })

  it('does not settle wallet credits on a pending incoming observation', () => {
    const [next] = CasinoProgram.update(
      connectedWallet(),
      ObservedIncoming.make({ transaction: incomingSol('Pending') }),
    )
    expect(depositOf(next)._tag).toBe('Wallet')
    expect(creditsOf(next)._tag).toBe('Empty')
  })

  it('settles credits only after a confirmed Incoming SOL Devnet observation', () => {
    const [next] = CasinoProgram.update(
      connectedWallet(),
      ObservedIncoming.make({ transaction: incomingSol('Confirmed') }),
    )
    expect(depositOf(next)._tag).toBe('Settled')
    expect(creditsOf(next)._tag).toBe('Remaining')
    expect(answerOf(next)._tag).toBe('Locked')
    expect(playerOf(next)._tag).toBe('Unproven')
  })

  it('fail-closes wallet load without a SOL Devnet receive instruction', () => {
    const [probing] = CasinoProgram.update(emptyModel(), ClickedWallet())
    const [next] = CasinoProgram.update(
      probing,
      SucceededLoadPortfolio.make({
        wallets: [sampleWallet],
        portfolio: PortfolioSnapshot.make({
          dataSource: 'Live',
          chains: [{ chainId: 'solana', displayName: 'Solana' }],
          networks: [],
          assets: [],
          accounts: sampleWallet.accounts,
          balanceSnapshot: { observedAt: 1, balances: [] },
          receivingInstructions: [],
        }),
      }),
    )
    expect(depositOf(next)._tag).toBe('None')
    expect(creditsOf(next)._tag).toBe('Empty')
    expect(walletPhaseOf(next)).toBe('not-connected')
  })

  it('starts ZK probing without inhabiting ZkIdentity', () => {
    const [next, commands] = CasinoProgram.update(
      emptyModel(),
      ClickedZkIdentity(),
    )
    expect(playerOf(next)._tag).toBe('Unproven')
    expect(answerOf(next)._tag).toBe('Locked')
    expect(next.notice._tag).toBe('None')
    expect(zkPhaseOf(next)).toBe('probing')
    expect(commandName(commands)).toBe('ProbeZkIdentity')
  })

  it('keeps proofs Unproven when no live verifier is connected', () => {
    const [zk] = CasinoProgram.update(emptyModel(), ClickedZkIdentity())
    const [afterZk] = CasinoProgram.update(zk, FoundZkNotConnected())
    const [humanity] = CasinoProgram.update(afterZk, ClickedHumanity())
    const [afterHumanity] = CasinoProgram.update(
      humanity,
      FoundHumanityNotConnected(),
    )
    const [agent] = CasinoProgram.update(
      afterHumanity,
      ClickedFundCyclingAgent(),
    )
    const [next] = CasinoProgram.update(
      agent,
      FoundFundCyclingAgentNotConnected(),
    )
    expect(playerOf(next)._tag).toBe('Unproven')
    expect(answerOf(next)._tag).toBe('Locked')
    expect(zkPhaseOf(next)).toBe('not-connected')
  })

  it('does not inhabit Humanity without a verifier', () => {
    const [next] = CasinoProgram.update(emptyModel(), ClickedHumanity())
    expect(playerOf(next)._tag).toBe('Unproven')
    expect(answerOf(next)._tag).toBe('Locked')
  })

  it('does not inhabit FundCyclingAgent without a verifier', () => {
    const [next] = CasinoProgram.update(emptyModel(), ClickedFundCyclingAgent())
    expect(playerOf(next)._tag).toBe('Unproven')
    expect(answerOf(next)._tag).toBe('Locked')
  })

  it('opens answering only after settled credits and a live proof', () => {
    const [paid] = CasinoProgram.update(
      connectedWallet(),
      ObservedIncoming.make({ transaction: incomingSol('Confirmed') }),
    )
    expect(answerOf(paid)._tag).toBe('Locked')
    const [proven] = CasinoProgram.update(paid, SucceededZkIdentity())
    expect(playerOf(proven)._tag).toBe('ZkIdentity')
    expect(creditsOf(proven)._tag).toBe('Remaining')
    expect(answerOf(proven)._tag).toBe('Open')
  })

  it('starts origin probes at init without a wallet session', () => {
    const [model, commands] = init()
    expect(depositOf(model)._tag).toBe('None')
    expect(playerOf(model)._tag).toBe('Unproven')
    expect(stripePhaseOf(model)).toBe('probing')
    expect(zkPhaseOf(model)).toBe('probing')
    expect(Array.length(commands)).toBe(4)
  })

  it('adds and removes a public-fact question in the Model', () => {
    const [drafting] = CasinoProgram.update(emptyModel(), ClickedAddQuestion())
    expect(drafting.draft._tag).toBe('Drafting')
    const [typed] = CasinoProgram.update(
      drafting,
      TypedDraft({ text: 'What year was the Declaration signed?' }),
    )
    const [kept] = CasinoProgram.update(typed, AppliedDraft())
    expect(kept.questions._tag).toBe('Populated')
    if (kept.questions._tag !== 'Populated') {
      return
    }
    const maybeFirst = Array.head(kept.questions.items)
    if (Option.isNone(maybeFirst)) {
      return
    }
    const [removed] = CasinoProgram.update(
      kept,
      RequestedRemove({ questionId: maybeFirst.value.id }),
    )
    expect(removed.questions._tag).toBe('Empty')
  })
})
