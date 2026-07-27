import type * as Command from 'foldkit/command'
import { Eth, EthereumSepolia } from 'wallet-core-example'

import {
  AccessClaim,
  AdjudicatorReference,
  ApplicationBinding,
  OpaqueIdentityReference,
  RequestedCapability,
  StakeTerms,
  TapeCommitment,
} from './claim.js'
import { type Message } from './message.js'
import { DraftClaim, type Model } from './model.js'

const issuedAt = 1_785_129_600_000
const expiresAt = issuedAt + 60 * 60 * 1_000
const network = EthereumSepolia.make({})

/** The deterministic public claim used by the Staked Access example. */
export const exampleAccessClaim = AccessClaim.make({
  claimId: 'claim-bafy-staked-access-example',
  protocolVersion: 1,
  application: ApplicationBinding.make({
    applicationId: 'foldkit.staked-access.example',
    signingDomain: 'staked-access.foldkit.example',
  }),
  identityReference: OpaqueIdentityReference.make({
    namespace: 'wallet-account',
    subjectId: 'opaque-subject-7f6d',
    signingAccountId: 'simulated-ethereum-account',
  }),
  tape: TapeCommitment.make({
    contentAddress: 'uuiduri:72af8a74-3177-814e-90f6-0c1ee4290e9f',
    orderedMessageIds: [
      'message-01-created-claim',
      'message-02-accepted-policy',
      'message-03-requested-access',
    ],
    derivedStateHash: 'sha256:derived-state-9b3c',
  }),
  requestedCapabilities: [
    RequestedCapability.make({
      capabilityId: 'ReadProtectedArtifact',
      scope: 'artifact:bafybeigdyr-protected',
    }),
    RequestedCapability.make({
      capabilityId: 'SubmitReview',
      scope: 'review:staked-access-example',
    }),
  ],
  nonce: 'nonce-2026-07-27-0001',
  issuedAt,
  expiresAt,
  stake: StakeTerms.make({
    network,
    asset: Eth.make({ network }),
    amountAtomicUnits: '10000000000000000',
    treasury: 'eip155:11155111:0x2222222222222222222222222222222222222222',
  }),
  adjudicator: AdjudicatorReference.make({
    adjudicatorId: 'adjudicator.foldkit.example',
    policyContentAddress: 'bafybeigdyr-staked-access-policy-v1',
  }),
})

/** Creates the initial draft claim with no side effects. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [DraftClaim.make({ claim: exampleAccessClaim }), []]
