#!/usr/bin/env bash
set -euo pipefail

# Deploy StablecoinRelay.sol to all mainnet chains
# Usage: DEPLOYER_PRIVATE_KEY=0x... ./script/deploy-all-chains.sh [chain_id]
# If chain_id is provided, deploy only to that chain.

export PATH="$HOME/.foundry/bin:$PATH"

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "Error: DEPLOYER_PRIVATE_KEY must be set"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Ordered chain IDs and their RPC URLs
CHAIN_IDS=(1 137 42161 10 8453 56 43114 59144 534352)

declare -A RPC_URLS=(
  [1]="https://eth.llamarpc.com"
  [137]="https://polygon-rpc.com"
  [42161]="https://arb1.arbitrum.io/rpc"
  [10]="https://mainnet.optimism.io"
  [8453]="https://mainnet.base.org"
  [56]="https://bsc-dataseed.binance.org"
  [43114]="https://api.avax.network/ext/bc/C/rpc"
  [59144]="https://rpc.linea.build"
  [534352]="https://rpc.scroll.io"
)

declare -A CHAIN_NAMES=(
  [1]="Ethereum"
  [137]="Polygon"
  [42161]="Arbitrum"
  [10]="Optimism"
  [8453]="Base"
  [56]="BSC"
  [43114]="Avalanche"
  [59144]="Linea"
  [534352]="Scroll"
)

TARGET_CHAIN="${1:-}"

echo "=== StablecoinRelay Multi-Chain Deployment ==="
echo ""

for CHAIN_ID in "${CHAIN_IDS[@]}"; do
  if [ -n "$TARGET_CHAIN" ] && [ "$TARGET_CHAIN" != "$CHAIN_ID" ]; then
    continue
  fi

  RPC_URL="${RPC_URLS[$CHAIN_ID]}"
  CHAIN_NAME="${CHAIN_NAMES[$CHAIN_ID]}"

  echo "--- Deploying to ${CHAIN_NAME} (chainId: ${CHAIN_ID}) ---"
  echo "RPC: ${RPC_URL}"

  if forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "${RPC_URL}" \
    --broadcast \
    -vvv; then
    echo "--- ${CHAIN_NAME} deployment SUCCEEDED ---"
  else
    echo "WARNING: Deployment to ${CHAIN_NAME} FAILED (may need gas funding)"
  fi
  echo ""
done

echo "=== Deployment complete ==="
echo "Addresses are in broadcast/Deploy.s.sol/<chainId>/run-latest.json"
echo "Update packages/shared/src/addresses.ts with deployed addresses"
