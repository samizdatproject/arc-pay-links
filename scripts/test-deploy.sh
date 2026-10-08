#!/usr/bin/env bash
# Dry-run tests for scripts/deploy.sh against a throwaway anvil. Uses anvil's public dev key only.
#   scripts/test-deploy.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=8555
RPC=http://127.0.0.1:$PORT
TMP=$(mktemp -d)
anvil --silent --port $PORT >/dev/null 2>&1 &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null; rm -rf "$TMP"' EXIT
for _ in $(seq 50); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.1; done

pass=0; fail=0
check() { # name, expected-exit (0|1), expected-output-regex, command...
  local name=$1 want=$2 re=$3; shift 3
  local out code=0
  out=$("$@" 2>&1) || code=$?
  if [[ $code -eq $want && "$out" =~ $re ]]; then echo "ok   $name"; pass=$((pass+1));
  else echo "FAIL $name (exit $code)"; echo "$out" | sed 's/^/     /'; fail=$((fail+1)); fi
}

# Keystores: the anvil dev account (10,000 USDC, i.e. 1e22 wei > 2^63) and an empty account.
printf 'test-password' > "$TMP/pw"
DEV_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # public anvil key
cast wallet import rich --private-key $DEV_KEY --keystore-dir "$TMP" --unsafe-password test-password >/dev/null
POOR_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d  # public anvil key #1, emptied below
cast wallet import poor --private-key $POOR_KEY --keystore-dir "$TMP" --unsafe-password test-password >/dev/null
POOR=$(cast wallet address --private-key $POOR_KEY)
cast rpc anvil_setBalance "$POOR" 0x0 --rpc-url $RPC >/dev/null
export ETH_PASSWORD="$TMP/pw" ARC_RPC_URL=$RPC

check "script never passes a private key on argv" 1 "^$" grep -nE -- '--private-key|PRIVATE_KEY' "$ROOT/scripts/deploy.sh"
check "chain guard: mainnet mode refuses an anvil RPC" 1 "not 5042 \(mainnet\)" env ETH_KEYSTORE="$TMP/rich" "$ROOT/scripts/deploy.sh" mainnet
check "chain guard: testnet mode refuses an anvil RPC" 1 "not 5042002 \(testnet\)" env ETH_KEYSTORE="$TMP/rich" "$ROOT/scripts/deploy.sh" testnet
check "missing keystore is reported" 1 "No keystore" env ETH_KEYSTORE="$TMP/nope" "$ROOT/scripts/deploy.sh" local
check "balance math: 10,000 USDC (> 2^63 wei) passes" 0 "balance:   10000\.0+ USDC.*dry run: all checks passed" env DRY_RUN=1 ETH_KEYSTORE="$TMP/rich" "$ROOT/scripts/deploy.sh" local
check "balance math: empty deployer is refused" 1 "Balance too low" env DRY_RUN=1 ETH_KEYSTORE="$TMP/poor" "$ROOT/scripts/deploy.sh" local
cast rpc anvil_setBalance "$POOR" 0x2386f26fc10000 --rpc-url $RPC >/dev/null   # 0.01 USDC: more than 2x the ~0.0008 cost at anvil's gas price
check "balance math: 0.01 USDC is enough on anvil" 0 "dry run" env DRY_RUN=1 ETH_KEYSTORE="$TMP/poor" "$ROOT/scripts/deploy.sh" local
cast rpc anvil_setBalance "$POOR" 0x2386f26fc1 --rpc-url $RPC >/dev/null      # ~1.5e-7 USDC
check "balance math: dust is refused" 1 "Balance too low" env DRY_RUN=1 ETH_KEYSTORE="$TMP/poor" "$ROOT/scripts/deploy.sh" local
check "local deploy broadcasts from the keystore" 0 "Deployed ArcPayLinks at 0x[0-9a-fA-F]{40}" env ETH_KEYSTORE="$TMP/rich" "$ROOT/scripts/deploy.sh" local
ADDR=$(jq -r '.transactions[0].contractAddress' "$ROOT/contracts/broadcast/Deploy.s.sol/31337/run-latest.json")
check "deployed contract has code" 0 "^0x[0-9a-f]{100,}" cast code "$ADDR" --rpc-url $RPC
rm -rf "$ROOT/contracts/broadcast/Deploy.s.sol/31337"

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
