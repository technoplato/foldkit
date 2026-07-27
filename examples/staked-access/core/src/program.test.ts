import { Array, Effect, Option, Schema as S } from 'effect'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { AccessClaim } from './claim.js'
import { exampleAccessClaim } from './init.js'
import {
  RequestedClaimSignature,
  RequestedClaimVerification,
  RequestedStakeAuthorization,
} from './message.js'
import { StakedAccessProgram } from './program.js'
import {
  SimulatedGrantStakedAccessResources,
  SimulatedRejectStakedAccessResources,
  type SimulatedStakedAccessResources,
} from './simulated.js'
import { update } from './update.js'

const runProtocol = (
  resources: import('effect').Layer.Layer<SimulatedStakedAccessResources>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Runtime.makeProgramRuntime({
        program: StakedAccessProgram,
        resources,
      })
      yield* runtime.initialization
      yield* runtime.run(RequestedClaimSignature())
      yield* runtime.run(RequestedStakeAuthorization())
      const model = yield* runtime.run(RequestedClaimVerification())
      const tape = runtime.replay.readTape()
      yield* runtime.shutdown
      return { model, tape }
    }),
  )

describe('Staked Access Program', () => {
  it('rejects non-addressed tapes and non-positive stakes', () => {
    expect(() =>
      S.decodeUnknownSync(AccessClaim)({
        ...exampleAccessClaim,
        tape: {
          ...exampleAccessClaim.tape,
          contentAddress: 'lookup-required-tape',
        },
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(AccessClaim)({
        ...exampleAccessClaim,
        stake: { ...exampleAccessClaim.stake, amountAtomicUnits: '0' },
      }),
    ).toThrow()
  })

  it.effect('grants access and refunds the exact locked stake', () =>
    Effect.gen(function* () {
      const { model, tape } = yield* runProtocol(
        SimulatedGrantStakedAccessResources,
      )

      expect(model._tag).toBe('GrantedAccess')
      if (model._tag !== 'GrantedAccess') {
        throw new Error('Expected access to be granted')
      }
      expect(model.receipt._tag).toBe('RefundedStakeReceipt')
      expect(model.lock.claimId).toBe(model.signedClaim.claim.claimId)
      expect(model.lock.terms).toStrictEqual(model.signedClaim.claim.stake)
      expect(model.grant.capabilities).toStrictEqual(
        model.signedClaim.claim.requestedCapabilities,
      )
      expect(
        Array.map(tape.transitions, transition => transition.message._tag),
      ).toStrictEqual([
        'RequestedClaimSignature',
        'SucceededSignAccessClaim',
        'RequestedStakeAuthorization',
        'SucceededAuthorizeAndLockStake',
        'RequestedClaimVerification',
        'SucceededVerifyAccessClaim',
        'SucceededRefundStake',
      ])
    }),
  )

  it.effect('rejects access and forfeits the exact locked stake', () =>
    Effect.gen(function* () {
      const { model, tape } = yield* runProtocol(
        SimulatedRejectStakedAccessResources,
      )

      expect(model._tag).toBe('RejectedAccess')
      if (model._tag !== 'RejectedAccess') {
        throw new Error('Expected access to be rejected')
      }
      expect(model.receipt._tag).toBe('ForfeitedStakeReceipt')
      expect(model.lock.claimId).toBe(model.signedClaim.claim.claimId)
      expect(model.lock.terms).toStrictEqual(model.signedClaim.claim.stake)
      expect(
        Array.map(tape.transitions, transition => transition.message._tag),
      ).toStrictEqual([
        'RequestedClaimSignature',
        'SucceededSignAccessClaim',
        'RequestedStakeAuthorization',
        'SucceededAuthorizeAndLockStake',
        'RequestedClaimVerification',
        'SucceededVerifyAccessClaim',
        'SucceededForfeitStake',
      ])
    }),
  )

  it.effect('keeps historical replay inert and ignores stale results', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { model, tape } = yield* runProtocol(
          SimulatedGrantStakedAccessResources,
        )
        const controller = yield* Runtime.makeReplayController({
          program: StakedAccessProgram,
          resources: SimulatedGrantStakedAccessResources,
          route: Program.replay(tape),
        })
        const frames = Array.makeBy(tape.transitions.length + 1, frame => frame)
        yield* Effect.forEach(frames, frame => controller.seek(frame), {
          discard: true,
        })

        expect(controller.readReplayTape().transitions).toHaveLength(
          tape.transitions.length,
        )
        expect(controller.read().mode).toBe('Inspecting')

        const maybeRefund = Array.findFirst(
          tape.transitions,
          transition => transition.message._tag === 'SucceededRefundStake',
        )
        if (
          Option.isNone(maybeRefund) ||
          maybeRefund.value.message._tag !== 'SucceededRefundStake'
        ) {
          throw new Error('Expected a recorded refund result')
        }
        const [unchangedModel, commands] = update(
          model,
          maybeRefund.value.message,
        )

        expect(unchangedModel).toBe(model)
        expect(commands).toStrictEqual([])
      }),
    ),
  )

  it.effect(
    'keeps secret and signed transaction payloads out of Models and Messages',
    () =>
      Effect.gen(function* () {
        const granted = yield* runProtocol(SimulatedGrantStakedAccessResources)
        const rejected = yield* runProtocol(
          SimulatedRejectStakedAccessResources,
        )
        const encodedGrantTape = yield* Runtime.encodeReplayTape(
          StakedAccessProgram,
          granted.tape,
        )
        const encodedRejectTape = yield* Runtime.encodeReplayTape(
          StakedAccessProgram,
          rejected.tape,
        )
        const grantModels = yield* Effect.forEach(
          Array.makeBy(granted.tape.transitions.length + 1, frame => frame),
          frame =>
            Runtime.replayToFrame(StakedAccessProgram, granted.tape, frame),
        )
        const rejectionModels = yield* Effect.forEach(
          Array.makeBy(rejected.tape.transitions.length + 1, frame => frame),
          frame =>
            Runtime.replayToFrame(StakedAccessProgram, rejected.tape, frame),
        )
        const serializedPublicState = JSON.stringify({
          encodedGrantTape,
          encodedRejectTape,
          grantModels,
          rejectionModels,
        })

        expect(serializedPublicState).not.toMatch(
          /privateKey|secret|signedTransaction|"payload"/i,
        )
      }),
  )
})
