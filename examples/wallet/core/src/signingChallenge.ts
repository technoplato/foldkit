import { DomainSeparatedDigest, SigningChallenge } from './model.js'

const walletTestChallengeDigestHex =
  '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22'

/** Creates the canonical public test challenge accepted by Wallet signers. */
export const makeWalletTestChallenge = (
  challengeId: string,
  accountId: string,
): SigningChallenge =>
  SigningChallenge.make({
    challengeId,
    accountId,
    digest: DomainSeparatedDigest.make({
      algorithm: 'keccak256',
      domain: 'foldkit.example.wallet',
      digest: walletTestChallengeDigestHex,
      encoding: 'hex',
    }),
  })
