#!/usr/bin/env bash
# Deploy ArcPayLinks with Foundry from an encrypted keystore. No private key is ever passed on a
# command line (where `ps` would show it) or written to a shell variable.
#
#   One-time setup (prompts for the key and a password; the key is stored encrypted):
#     cast wallet import arc-deployer --interactive
#
#   scripts/deploy.sh testnet     # Arc Testnet (chain 5042002)
#   scripts/deploy.sh mainnet     # Arc Mainnet (chain 5042); asks you to type "deploy mainnet"
#   scripts/deploy.sh local       # anvil on 127.0.0.1:8545 (chain 31337), for testing this script
#
# Env:
#   ETH_KEYSTORE   keystore file (default ~/.foundry/keystores/arc-deployer)
#   ETH_PASSWORD   optional path to a file holding the keystore password (otherwise you are prompted)
#   ARC_RPC_URL    optional RPC override; the chain id is still checked
#   DRY_RUN=1      run every check, then stop before broadcasting
#
# Cost: the contract needs ~399k gas (eth_estimateGas on Arc mainnet). At the 20 gwei
# base-fee floor that is ~0.008 USDC; fund the deployer with 0.1 USDC to be safe.
set -euo pipefail
cd "$(dirname "$0")/../contracts"

case "${1:-}" in
  testnet) RPC=https://rpc.testnet.arc.io; CHAIN=5042002; EXPLORER=https://explorer.testnet.arc.io ;;
  mainnet) RPC=https://rpc.mainnet.arc.io; CHAIN=5042; EXPLORER=https://explorer.arc.io ;;
  local)   RPC=http://127.0.0.1:8545; CHAIN=31337; EXPLORER= ;;
  *) echo "usage: $0 testnet|mainnet|local" >&2; exit 2 ;;
esac
RPC=${ARC_RPC_URL:-$RPC}
FORGE=${FORGE:-forge}
CAST=${CAST:-cast}
export ETH_KEYSTORE=${ETH_KEYSTORE:-$HOME/.foundry/keystores/arc-deployer}

GOT=$("$CAST" chain-id --rpc-url "$RPC")
[[ "$GOT" == "$CHAIN" ]] || { echo "RPC $RPC is chain $GOT, not $CHAIN ($1). Refusing to deploy." >&2; exit 1; }
[[ -f "$ETH_KEYSTORE" ]] || { echo "No keystore at $ETH_KEYSTORE. Run: cast wallet import arc-deployer --interactive" >&2; exit 1; }

DEPLOYER=$("$CAST" wallet address)   # reads ETH_KEYSTORE (and ETH_PASSWORD if set)
BAL=$("$CAST" balance "$DEPLOYER" --rpc-url "$RPC")
"$FORGE" build --silent >/dev/null
GAS=$("$CAST" estimate --rpc-url "$RPC" --from "$DEPLOYER" --create "$(jq -r .bytecode.object out/ArcPayLinks.sol/ArcPayLinks.json)")
PRICE=$("$CAST" gas-price --rpc-url "$RPC")
# Balances are 18-decimal wei and overflow bash's 64-bit integers above ~9.22 USDC: use Python.
read -r COST NEED OK < <(python3 -I -c 'import sys; b,g,p=map(int,sys.argv[1:]); c=g*p; print(c, 2*c, int(b>2*c))' "$BAL" "$GAS" "$PRICE")
echo "network:   $1 (chain $CHAIN, $RPC)"
echo "deployer:  $DEPLOYER"
echo "balance:   $("$CAST" from-wei "$BAL") USDC"
echo "gas:       $GAS @ $("$CAST" from-wei "$PRICE" gwei) gwei = ~$("$CAST" from-wei "$COST") USDC"
[[ "$OK" == 1 ]] || { echo "Balance too low: need more than $("$CAST" from-wei "$NEED") USDC. Fund $DEPLOYER with at least 0.1 USDC on Arc $1." >&2; exit 1; }

if [[ "${DRY_RUN:-}" == 1 ]]; then echo "dry run: all checks passed, not broadcasting"; exit 0; fi

if [[ "$1" == mainnet ]]; then
  read -r -p "Type 'deploy mainnet' to broadcast: " ANSWER
  [[ "$ANSWER" == "deploy mainnet" ]] || { echo "aborted"; exit 1; }
fi

"$FORGE" script script/Deploy.s.sol --rpc-url "$RPC" --keystore "$ETH_KEYSTORE" --sender "$DEPLOYER" --broadcast
RUN="broadcast/Deploy.s.sol/$CHAIN/run-latest.json"
ADDR=$(jq -r '.transactions[0].contractAddress' "$RUN")
TX=$(jq -r '.transactions[0].hash' "$RUN")
echo
echo "Deployed ArcPayLinks at $ADDR"
echo "  tx: $TX"
if [[ -n "$EXPLORER" ]]; then
  echo "  $EXPLORER/tx/$TX"
  echo "  $EXPLORER/address/$ADDR"
  echo
  echo "Next: verify the source (no key needed):"
  echo "  $FORGE verify-contract $ADDR src/ArcPayLinks.sol:ArcPayLinks --chain-id $CHAIN --verifier blockscout --verifier-url $EXPLORER/api/"
  echo "Then set deployments[$CHAIN] = '$ADDR' in web/src/chains.ts and rebuild the site."
fi
