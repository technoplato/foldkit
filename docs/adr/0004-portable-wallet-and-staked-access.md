# Portable Wallet and Staked Access

## Status

Proposed on July 27th, 2026.

## Context

Portable Programs need to model money without granting every host access to
secret keys or privileged settlement. The same wallet behavior should run in a
Foldkit view, React, React Native, Expo, a terminal, a TUI, a raw CLI, and a
server. A host may lack signing authority or network access while still being
able to inspect, preview, simulate, and replay the Program.

Replay links also need a protected mode. Possessing a content address is not
always sufficient authority to read or execute the referenced Program. One
proposed access protocol asks a claimant to identify an exact tape, its ordered
Messages, its derived state, and their own identity, then escrow a stake and
sign the complete claim. Incorrect claims forfeit the stake to a configured
treasury.

## Decision

### One portable wallet capability

The wallet core exposes one typed service. Ethereum, Solana, native assets,
tokens, stablecoins, and later fiat rails are cases of shared Schemas rather
than separate public wallet interfaces. A capability result may state that one
operation is unavailable for a particular network or account.

The core owns:

- public account identities and receiving instructions;
- exact asset amounts in atomic units;
- timestamped balance and fiat-value observations;
- transaction previews, including fees and resulting balances;
- address-book familiarity and recipient warnings;
- submitted and observed transaction facts;
- the visible state of signing, submission, confirmation, and failure.

Injected Effect Layers own:

- private-key custody and wallet-provider access;
- message and transaction signing;
- cryptographic verification;
- RPC and WebSocket connections;
- fee estimation and transaction simulation;
- transaction submission and network confirmation;
- QR rendering and platform sharing.

Private keys, recovery phrases, raw signing capabilities, and secret provider
credentials never enter Model, Message, Command payloads, replay tapes, URIs,
logs, or DevTools. The Program identifies an account through a public key ID and
asks the injected service to sign with that identity.

### Commands and Subscriptions

A finite user request produces a Command. Examples are loading balances,
building a transaction preview, signing a canonical claim, and submitting a
transaction. The request does not complete until its causally produced finite
work has completed.

Live transaction and balance observations are persistent Subscriptions. Chain
Layers use provider-native streams or WebSocket subscriptions. They do not hide
a polling loop behind the portable service contract. Subscription results
re-enter update as factual Messages and become visible Model state without
causing a write-back transaction.

Historical replay uses inert Layers. It applies recorded Messages and never
signs, submits, settles, or opens a live subscription. A live branch acquires a
fresh authorized Layer.

### Initial networks and assets

The first test-network clients target Ethereum Sepolia and Solana Devnet. The
first asset set is Sepolia ETH, Devnet SOL, Ethereum Sepolia USDC, and Solana
Devnet USDC. Contract and mint identifiers are implementation configuration,
not domain conditionals. They are pinned from the networks' authoritative
documentation and verified in adapter tests.

Solana Devnet is selected for application testing and faucet support. Solana
Testnet remains a distinct typed network and is not silently treated as
Devnet.

### Staked access claim

A signed access claim canonically binds:

- a protocol and Message-envelope version;
- a domain separator and target application ID;
- claimant public identity and wallet account ID;
- an embedded tape or verified tape content address;
- the ordered stable IDs of the Messages forming the claimed state;
- the canonical hash of the complete derived state;
- the requested capability set;
- a nonce, issue time, expiry time, network, asset, and stake amount;
- the treasury and adjudication policy identifiers.

A signature alone cannot forfeit funds. The stake must be locked in an escrow
transaction or an equivalent enforceable authorization before adjudication.
The prototype expresses escrow and settlement through an injected service. A
trust-minimized deployment requires a reviewed smart contract or chain-native
program that can refund a valid claim and transfer an invalid claim's stake to
the treasury.

The verifier must independently load or decode the exact tape, verify its
content address, migrate its versioned Messages, replay it with inert Layers,
and recompute both the ordered Message IDs and state hash. A valid signature
over incorrect facts is still an invalid claim.

The Program records public claim, escrow, verification, capability, refund, and
forfeiture facts. Secret signing material and privileged settlement handles
remain in Layers.

## Consequences

Every client can present the same wallet and protected-access Model even when
its Layer only supports inspection or preview. A server can provide privileged
settlement without becoming a different Program. React and native presenters
remain ordinary observers and Message senders.

The host-selected dependency set must be visible in runtime diagnostics and
replay metadata so that a testnet preview cannot be mistaken for a mainnet
submission. The Program itself does not branch on JavaScript runtime, browser,
Node.js, React Native, or server detection.

The initial host-based escrow prototype demonstrates the state machine but does
not make a trustless forfeiture claim. Production settlement remains blocked on
the contract design, threat model, audit, treasury governance, key recovery,
jurisdiction, and regulatory review.

## Open Questions

- Should stable Message IDs be explicit numeric values, namespaced strings, or
  hashes of a versioned canonical declaration?
- Which downgrade migrations are partial because a previous Message version
  cannot represent newer information?
- Is the stake deposited before a challenge is issued, or after the signed claim
  is assembled but before verification begins?
- Which facts may be disclosed in a public claim without exposing personal
  information or making protected tape contents guessable?
- Which chain should host the first enforceable escrow, and what finality is
  required before access is granted?
- Which capabilities are revocable after a successful claim, and which are
  permanently derivable from the signed artifact?
