#!/usr/bin/env bash
# Deploy ArcPayLinks with Foundry. The key comes from the DEPLOYER_PRIVATE_KEY env var
# (or an interactive prompt), never from a command-line argument or a committed file.
#
#   scripts/deploy.sh testnet            # Arc Testnet (chain 5042002)
#   scripts/deploy.sh mainnet            # Arc Mainnet (chain 5042), asks for confirmation
#
# Cost: the contract needs ~399k gas (eth_estimateGas on Arc mainnet). At the 20 gwei
# base-fee floor that is ~0.008 USDC; fund the deployer with 0.1 USDC to be safe.
set -euo pipefail
cd "$(dirname "$0")/../contracts"

case "${1:-}" in
  testnet) RPC=https://rpc.testnet.arc.io; CHAIN=5042002; EXPLORER=https://explorer.testnet.arc.io ;;
  mainnet) RPC=https://rpc.mainnet.arc.io; CHAIN=5042; EXPLORER=https://explorer.arc.io ;;
  *) echo "usage: $0 testnet|mainnet" >&2; exit 2 ;;
esac

FORGE=${FORGE:-forge}
CAST=${CAST:-cast}

[[ "$("$CAST" chain-id --rpc-url "$RPC")" == "$CHAIN" ]] || { echo "RPC $RPC is not chain $CHAIN" >&2; exit 1; }

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  read -r -s -p "Deployer private key (input hidden): " DEPLOYER_PRIVATE_KEY; echo
fi
export DEPLOYER_PRIVATE_KEY
DEPLOYER=$("$CAST" wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
BAL=$("$CAST" balance "$DEPLOYER" --rpc-url "$RPC")
GAS=$("$FORGE" build --silent >/dev/null && "$CAST" estimate --rpc-url "$RPC" --from "$DEPLOYER" --create "$(jq -r .bytecode.object out/ArcPayLinks.sol/ArcPayLinks.json)")
PRICE=$("$CAST" gas-price --rpc-url "$RPC")
echo "network:   $1 (chain $CHAIN)"
echo "deployer:  $DEPLOYER"
echo "balance:   $("$CAST" from-wei "$BAL") USDC"
echo "gas:       $GAS @ $("$CAST" from-wei "$PRICE" gwei) gwei = ~$("$CAST" from-wei $((GAS * PRICE))) USDC"
(( BAL > GAS * PRICE * 2 )) || { echo "Balance too low: fund $DEPLOYER with at least 0.1 USDC on Arc $1." >&2; exit 1; }

if [[ "$1" == mainnet ]]; then
  read -r -p "Type 'deploy mainnet' to broadcast: " OK
  [[ "$OK" == "deploy mainnet" ]] || { echo "aborted"; exit 1; }
fi

"$FORGE" script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
ADDR=$(jq -r '.transactions[0].contractAddress' "broadcast/Deploy.s.sol/$CHAIN/run-latest.json")
TX=$(jq -r '.transactions[0].hash' "broadcast/Deploy.s.sol/$CHAIN/run-latest.json")
echo
echo "Deployed ArcPayLinks at $ADDR"
echo "  tx:       $EXPLORER/tx/$TX"
echo "  contract: $EXPLORER/address/$ADDR"
echo
echo "Next: verify the source (no key needed):"
echo "  $FORGE verify-contract $ADDR src/ArcPayLinks.sol:ArcPayLinks --chain-id $CHAIN --verifier blockscout --verifier-url $EXPLORER/api/"
echo "Then set deployments[$CHAIN] = '$ADDR' in web/src/chains.ts and rebuild the site."
