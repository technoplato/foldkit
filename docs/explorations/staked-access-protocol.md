# Staked Access | Portable Skin-in-the-Game Protocol

This exploration defines a renderer-independent Foldkit Program for a
skin-in-the-game access decision. The Program is portable across browser,
native, CLI, and service hosts because the Model, Message protocol, update
function, and Commands contain no renderer APIs.

## Claim commitment

`AccessClaim` is the exact public statement that the wallet signs. Its canonical
challenge digest binds all of these fields:

- protocol version;
- application ID and signing domain;
- opaque identity namespace, subject reference, and signing account ID;
- exact replay-tape content address;
- ordered stable Message IDs;
- derived-state hash;
- requested capabilities and scopes;
- nonce, issue time, and expiry time;
- network, asset, atomic-unit amount, and treasury;
- adjudicator ID and policy content address.

The prototype accepts the current deterministic `uuiduri:<uuid>` tape address
form. The UUID is derived from the exact tape bytes by the replay store. Future
compressed, self-contained tape notation may add other tagged URI forms, but it
must retain deterministic content verification and is intentionally deferred.

The default identity shape is an opaque reference. A host should not place a
name, email address, government identifier, or other raw personally identifying
data in the claim. If an adjudicator needs identity evidence, the claim should
commit to a privacy-preserving reference or content address and keep disclosure
outside the replayable Model.

`ClaimChallengeBuilder` receives the complete claim and must produce a canonical,
domain-separated digest. `SignAccessClaim` passes that challenge to the Wallet
`WalletSigner.signChallenge` capability and verifies the returned public proof
through `WalletCrypto`. Private keys, prepared transactions, signed transaction
payloads, and raw host errors never enter a Model or Message.

The included simulation uses a deterministic non-cryptographic digest. It is
only a test and demonstration Layer. A production challenge builder must use a
reviewed canonical encoding and a cryptographic hash appropriate to the signing
network.

## State machine

The Model is a Schema tagged union. Each row below is a distinct representable
state, so contradictory booleans such as "granted and forfeiting" cannot exist.

| State              | Next fact or Command result   | Next state         |
| ------------------ | ----------------------------- | ------------------ |
| `DraftClaim`       | signature requested           | `SigningClaim`     |
| `SigningClaim`     | verified signature            | `SignedClaim`      |
| `SignedClaim`      | stake authorization requested | `AuthorizingStake` |
| `AuthorizingStake` | exact stake locked            | `StakeLocked`      |
| `StakeLocked`      | verification requested        | `VerifyingClaim`   |
| `VerifyingClaim`   | claim verified                | `RefundingStake`   |
| `RefundingStake`   | exact stake refunded          | `GrantedAccess`    |
| `VerifyingClaim`   | claim rejected                | `ForfeitingStake`  |
| `ForfeitingStake`  | exact stake forfeited         | `RejectedAccess`   |

Every side effect is a named Command backed by injected Effect services:
`SignAccessClaim`, `AuthorizeAndLockStake`, `VerifyAccessClaim`, `RefundStake`,
and `ForfeitStake`. Sanitized failure states preserve the minimum public data
needed for an explicit retry. Hosts provide Layers and project the current Model;
they do not own protocol truth.

## Replay and idempotency

Every Command result repeats the stable claim or escrow identity expected by the
current Model. Stale, duplicate, or mismatched results leave the Model unchanged.
The Program restore function only restarts in-flight work. Escrow and settlement
implementations must therefore treat the claim ID, nonce, escrow ID, grant ID,
and rejection ID as idempotency keys.

Foldkit historical replay applies recorded Messages and discards their Commands.
Seeking through a recorded grant or rejection cannot sign again, lock a second
stake, or settle twice. A live branch may execute new Commands only after the
selected replay frame is settled.

## Trust boundary

The simulated `StakeEscrow` is a deterministic host service. A host service
cannot make forfeiture trustless. The host can lie about authorization, locking,
adjudication, refund, or forfeiture, and it can rewrite its own receipts.

A production deployment that promises trustless forfeiture requires a reviewed
smart contract or chain program that atomically enforces the signed stake terms,
nonce replay protection, adjudicator authority, decision deadline, refund path,
forfeiture path, and settlement uniqueness. The host Layer should be a client for
that on-chain authority and should verify finalized receipts. It must not be the
authority itself.
