#!/bin/bash
# Scribe #2134: the held-money claims worker against real node software on this Mac, solana-test-validator, with no public
# network and no money. It runs the worker's own code (runClaim, the real scribe-wallet signer) on claims kept in memory:
# a held account (this Mac's own scribe-wallet account, funded by a local airdrop; on localnet it holds only local coins),
# a fresh destination, and a held list in a temp folder. It proves what fakes cannot: scribe-wallet send --all moves
# everything less the fee and the held account ends at zero, the claim records the amount the chain moved, the same claim
# run again is the same payment and moves nothing more, and an account this Mac does not list is never signed for.
#
#   examples/brandon/server/e2e/claim-local.sh [scribe-wallet binary]     (the installed one by default)
#
# Build the server first (pnpm --filter brandon-server-example build): the harness imports dist/. It refuses to run with
# a scribe-wallet whose send has no --all, and when something already answers on 127.0.0.1:8899. Every check prints PASS
# or FAIL; the exit status is the number of FAILs (3 when it could not start).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WALLET="${1:-$HOME/Scribe/tools/scribe-wallet}"
SOLANA_BIN="${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}"
RPC=http://127.0.0.1:8899
WORK="$(mktemp -d /tmp/held-claims-e2e.XXXXXX)"
validator=""

cleanup() {
  [ -n "$validator" ] && kill "$validator" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

say() { echo "$(date '+%T') claim-local: $*"; }
answers() { curl -s -m 2 "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"ok"'; }

if ! "$WALLET" send --help 2>/dev/null | grep -q -- '--all'; then
  say "REFUSED: $WALLET send has no --all; install the CLI that has it first (realtime-voice scripts/wallet/install-cli.sh)"
  exit 3
fi
if answers; then
  say "REFUSED: something already answers on $RPC; stop that validator first, so this run owns its ledger"
  exit 3
fi

"$SOLANA_BIN/solana-test-validator" --reset --quiet --ledger "$WORK/ledger" --bind-address 127.0.0.1 --rpc-port 8899 \
  >"$WORK/validator.log" 2>&1 &
validator=$!
for _ in $(seq 1 90); do answers && break; sleep 1; done
answers || { say "the validator did not answer within 90 s; see $WORK/validator.log"; exit 3; }

held="$("$WALLET" address --chain solana --json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["accounts"][0]["address"])')"
[ -n "$held" ] || { say "this Mac has no scribe-wallet Solana account to hold local coins with"; exit 3; }
"$SOLANA_BIN/solana" airdrop 2 "$held" --url "$RPC" >"$WORK/airdrop.log" 2>&1 || { say "the local airdrop failed; see $WORK/airdrop.log"; exit 3; }

"$SOLANA_BIN/solana-keygen" new --no-bip39-passphrase --silent --force --outfile "$WORK/destination.json" >/dev/null 2>&1
destination="$("$SOLANA_BIN/solana-keygen" pubkey "$WORK/destination.json")"
[ -n "$destination" ] || { say "could not make a fresh destination"; exit 3; }

say "held ${held:0:6}… on solana:localnet, destination ${destination:0:6}…"
cd "$HERE/.." && SOLANA_BIN="$SOLANA_BIN" node "$HERE/claim-local.mjs" "$WALLET" "$held" "$destination" "$WORK"
