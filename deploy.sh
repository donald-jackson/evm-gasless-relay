#!/usr/bin/env bash
set -euo pipefail

# ─── Stablecoin Relay — Full Deployment Script ──────────────────────────────
#
# Usage:
#   ./deploy.sh --profile <aws-profile> [--region us-east-1] [--skip-contracts] [--chains 1,8453,11155111,84532]
#
# Required:
#   --profile         AWS named profile
#
# Optional:
#   --region          AWS region (default: us-east-1)
#   --skip-contracts  Skip Foundry contract deployment
#   --chains          Comma-separated chain IDs for contract deploy & wallet seeding
#                     (default: 1,8453,11155111,84532)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Defaults ────────────────────────────────────────────────────────────────

PROFILE=""
REGION="us-east-1"
SKIP_CONTRACTS=false
CHAINS="1,8453,11155111,84532"

STACK_NAME="StablecoinRelayStack"
SECRET_NAME="stablecoin-relay/hd-wallet-seed"
BUNDLE_DIR="/tmp/lambda-bundles"

LAMBDA_NAMES=(chains quote submit status health worker)

# RPC URLs — mainnets from contracts/script/deploy-all-chains.sh, testnets from seed script
# Uses case statements instead of associative arrays for macOS Bash 3.2 compatibility
get_rpc_url() {
  case "$1" in
    1)        echo "https://eth.llamarpc.com" ;;
    137)      echo "https://polygon-rpc.com" ;;
    42161)    echo "https://arb1.arbitrum.io/rpc" ;;
    10)       echo "https://mainnet.optimism.io" ;;
    8453)     echo "https://mainnet.base.org" ;;
    56)       echo "https://bsc-dataseed.binance.org" ;;
    43114)    echo "https://api.avax.network/ext/bc/C/rpc" ;;
    59144)    echo "https://rpc.linea.build" ;;
    534352)   echo "https://rpc.scroll.io" ;;
    11155111) echo "https://ethereum-sepolia-rpc.publicnode.com" ;;
    84532)    echo "https://sepolia.base.org" ;;
    *)        echo "" ;;
  esac
}

get_chain_name() {
  case "$1" in
    1)        echo "Ethereum" ;;
    137)      echo "Polygon" ;;
    42161)    echo "Arbitrum" ;;
    10)       echo "Optimism" ;;
    8453)     echo "Base" ;;
    56)       echo "BSC" ;;
    43114)    echo "Avalanche" ;;
    59144)    echo "Linea" ;;
    534352)   echo "Scroll" ;;
    11155111) echo "Sepolia" ;;
    84532)    echo "Base Sepolia" ;;
    *)        echo "Chain $1" ;;
  esac
}

# ─── Parse arguments ────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)    PROFILE="$2"; shift 2 ;;
    --region)     REGION="$2"; shift 2 ;;
    --skip-contracts) SKIP_CONTRACTS=true; shift ;;
    --chains)     CHAINS="$2"; shift 2 ;;
    -h|--help)
      head -17 "$0" | tail -15
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "Error: --profile is required"
  echo "Usage: ./deploy.sh --profile <aws-profile> [--region us-east-1] [--skip-contracts] [--chains 1,8453]"
  exit 1
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

step=0
step() {
  step=$((step + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Step $step: $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

ok()   { echo "  [OK] $1"; }
fail() { echo "  [FAIL] $1"; exit 1; }

# ─── Step 1: Validate prerequisites ─────────────────────────────────────────

step "Validate prerequisites"

for cmd in node pnpm aws; do
  command -v "$cmd" &>/dev/null || fail "$cmd is not on PATH"
  ok "$cmd found: $(command -v "$cmd")"
done

# Verify CDK is available via npx
npx cdk --version &>/dev/null || fail "npx cdk is not available (run: pnpm add -D aws-cdk)"
ok "cdk found: $(npx cdk --version)"

if [[ "$SKIP_CONTRACTS" == false ]]; then
  command -v forge &>/dev/null || fail "forge is not on PATH (required for contract deployment; use --skip-contracts to skip)"
  ok "forge found: $(forge --version | head -1)"
fi

# ─── Step 2: Install & build ────────────────────────────────────────────────

step "Install dependencies & build"

echo "  Running pnpm install..."
pnpm install --frozen-lockfile
ok "Dependencies installed"

echo "  Running pnpm build..."
pnpm build
ok "Build complete"

# ─── Step 3: Deploy contracts (unless --skip-contracts) ─────────────────────

if [[ "$SKIP_CONTRACTS" == false ]]; then
  step "Deploy contracts"

  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
    fail "DEPLOYER_PRIVATE_KEY env var must be set for contract deployment"
  fi

  echo "  Building contracts..."
  (cd contracts && forge build)
  ok "Contracts compiled"

  IFS=',' read -ra CHAIN_ARRAY <<< "$CHAINS"
  for CHAIN_ID in "${CHAIN_ARRAY[@]}"; do
    RPC="$(get_rpc_url "$CHAIN_ID")"
    NAME="$(get_chain_name "$CHAIN_ID")"
    if [[ -z "$RPC" ]]; then
      echo "  [WARN] No RPC URL for chain $CHAIN_ID — skipping"
      continue
    fi

    echo "  Deploying to $NAME (chainId: $CHAIN_ID)..."
    if (cd contracts && forge script script/Deploy.s.sol:DeployScript \
        --rpc-url "$RPC" \
        --broadcast \
        -vvv); then
      ok "$NAME deployment succeeded"
    else
      echo "  [WARN] $NAME deployment FAILED (may need gas funding)"
    fi
  done

  echo ""
  echo "  Addresses: contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json"
  echo "  NOTE: Update packages/shared/src/addresses.ts if addresses changed"
else
  echo ""
  echo "  Skipping contract deployment (--skip-contracts)"
fi

# ─── Step 4: CDK bootstrap (idempotent) ─────────────────────────────────────

step "CDK bootstrap"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query 'Account' --output text) \
  || fail "Could not resolve AWS account ID — check your --profile"
echo "  Account: $ACCOUNT_ID  Region: $REGION"

echo "  Bootstrapping CDK..."
npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" --profile "$PROFILE" 2>&1 | tail -5
ok "CDK bootstrapped"

# ─── Step 5: CDK deploy ─────────────────────────────────────────────────────

step "CDK deploy"

echo "  Deploying $STACK_NAME..."
CDK_OUTPUT=$(npx cdk deploy "$STACK_NAME" \
  --require-approval never \
  --profile "$PROFILE" \
  --outputs-file /tmp/cdk-outputs.json \
  2>&1) || {
    echo "$CDK_OUTPUT"
    fail "CDK deploy failed"
  }

echo "$CDK_OUTPUT" | tail -10
ok "CDK deploy complete"

# Extract outputs
API_URL=""
WEB_BUCKET=""
CF_DISTRIBUTION_ID=""
CF_URL=""
if [[ -f /tmp/cdk-outputs.json ]]; then
  API_URL=$(node -e "
    const out = require('/tmp/cdk-outputs.json');
    const stack = out['$STACK_NAME'] || {};
    console.log(stack.ApiUrl || '');
  ")
  WEB_BUCKET=$(node -e "
    const out = require('/tmp/cdk-outputs.json');
    const stack = out['$STACK_NAME'] || {};
    console.log(stack.WebBucketName || '');
  ")
  CF_DISTRIBUTION_ID=$(node -e "
    const out = require('/tmp/cdk-outputs.json');
    const stack = out['$STACK_NAME'] || {};
    console.log(stack.CloudFrontDistributionId || '');
  ")
  CF_URL=$(node -e "
    const out = require('/tmp/cdk-outputs.json');
    const stack = out['$STACK_NAME'] || {};
    console.log(stack.CloudFrontUrl || '');
  ")
fi

if [[ -n "$API_URL" ]]; then
  ok "API URL: $API_URL"
else
  echo "  [WARN] Could not extract ApiUrl from stack outputs"
fi

# ─── Step 6: Bundle Lambdas ─────────────────────────────────────────────────

step "Bundle Lambdas with esbuild"

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

ESBUILD_EXTERNALS=(
  "@aws-sdk/client-sqs"
  "@aws-sdk/client-dynamodb"
  "@aws-sdk/lib-dynamodb"
  "@aws-sdk/client-secrets-manager"
)
EXTERNAL_FLAGS=""
for ext in "${ESBUILD_EXTERNALS[@]}"; do
  EXTERNAL_FLAGS="$EXTERNAL_FLAGS --external:$ext"
done

# API handlers
for handler in chains quote submit status health; do
  ENTRY="packages/api/src/handlers/${handler}.ts"
  OUT_DIR="$BUNDLE_DIR/$handler"
  mkdir -p "$OUT_DIR"

  echo "  Bundling $handler..."
  npx esbuild "$ENTRY" \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile="$OUT_DIR/index.js" \
    $EXTERNAL_FLAGS \
    --minify \
    --sourcemap
  ok "$handler bundled"
done

# Worker handler
WORKER_ENTRY="packages/worker/src/relay.ts"
WORKER_OUT_DIR="$BUNDLE_DIR/worker"
mkdir -p "$WORKER_OUT_DIR"

echo "  Bundling worker..."
npx esbuild "$WORKER_ENTRY" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$WORKER_OUT_DIR/index.js" \
  $EXTERNAL_FLAGS \
  --minify \
  --sourcemap
ok "worker bundled"

# ─── Step 7: Zip and upload Lambdas ─────────────────────────────────────────

step "Zip & upload Lambda function code"

for handler in "${LAMBDA_NAMES[@]}"; do
  FUNC_NAME="stablecoin-relay-${handler}"
  ZIP_FILE="$BUNDLE_DIR/${handler}.zip"
  SRC_DIR="$BUNDLE_DIR/$handler"

  echo "  Zipping $handler..."
  (cd "$SRC_DIR" && zip -qr "$ZIP_FILE" .)

  echo "  Uploading $FUNC_NAME..."
  aws lambda update-function-code \
    --function-name "$FUNC_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --profile "$PROFILE" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null

  ok "$FUNC_NAME code uploaded"
done

echo "  Waiting for all functions to become active..."
for handler in "${LAMBDA_NAMES[@]}"; do
  FUNC_NAME="stablecoin-relay-${handler}"
  aws lambda wait function-updated \
    --function-name "$FUNC_NAME" \
    --profile "$PROFILE" \
    --region "$REGION"
done
ok "All Lambda functions updated and active"

# ─── Step 8: Store seed phrase in Secrets Manager ────────────────────────────

step "Store HD wallet seed phrase"

# Check if secret already has a value
EXISTING_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text 2>/dev/null || echo "")

if [[ -n "$EXISTING_SECRET" && "$EXISTING_SECRET" != "None" && "$EXISTING_SECRET" != "" ]]; then
  ok "Seed phrase already stored in Secrets Manager"
else
  echo "  No seed phrase found in Secrets Manager."
  echo ""
  echo "  Enter your HD wallet seed phrase (BIP-39 mnemonic):"
  read -r -s SEED_INPUT
  echo ""

  if [[ -z "$SEED_INPUT" ]]; then
    fail "Seed phrase cannot be empty"
  fi

  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SEED_INPUT" \
    --profile "$PROFILE" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null

  ok "Seed phrase stored in Secrets Manager"
fi

# ─── Step 9: Seed wallet pool ───────────────────────────────────────────────

step "Seed wallet pool"

echo "  Seeding wallets for chains: $CHAINS"
if node scripts/seed-wallet-pool.mjs \
  --from-secrets-manager \
  --profile "$PROFILE" \
  --region "$REGION" \
  --chains "$CHAINS"; then
  ok "Wallet pool seeded"
else
  echo "  [WARN] Wallet seeding failed (RPC may be rate-limited). You can re-run manually:"
  echo "         node scripts/seed-wallet-pool.mjs --from-secrets-manager --profile $PROFILE --region $REGION --chains $CHAINS"
fi

# ─── Step 10: Build & deploy SPA ───────────────────────────────────────────

step "Build & deploy SPA"

if [[ -n "$WEB_BUCKET" ]]; then
  echo "  Building web SPA..."
  VITE_API_URL="" pnpm --filter @stablecoin-relay/web build
  ok "SPA build complete"

  echo "  Syncing to S3: $WEB_BUCKET"
  aws s3 sync packages/web/dist "s3://$WEB_BUCKET" \
    --delete \
    --profile "$PROFILE" \
    --region "$REGION"
  ok "S3 sync complete"

  if [[ -n "$CF_DISTRIBUTION_ID" ]]; then
    echo "  Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
      --distribution-id "$CF_DISTRIBUTION_ID" \
      --paths "/*" \
      --profile "$PROFILE" \
      --no-cli-pager \
      > /dev/null
    ok "CloudFront invalidation created"
  fi
else
  echo "  [WARN] No WebBucketName in stack outputs — skipping SPA deploy"
fi

# ─── Step 11: Verify ────────────────────────────────────────────────────────

step "Verify deployment"

if [[ -z "$API_URL" ]]; then
  echo "  [WARN] No API URL — skipping health checks"
else
  echo "  Checking /health ..."
  HEALTH_RESP=$(curl -sf "${API_URL}/health" 2>&1) && {
    echo "  $HEALTH_RESP" | head -5
    ok "/health check passed"
  } || {
    echo "  [WARN] /health returned non-200 (Lambda may still be initializing)"
  }

  echo ""
  echo "  Checking /chains ..."
  CHAINS_RESP=$(curl -sf "${API_URL}/chains" 2>&1) && {
    echo "  $CHAINS_RESP" | head -5
    ok "/chains check passed"
  } || {
    echo "  [WARN] /chains returned non-200"
  }
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "$API_URL" ]]; then
  echo "  API:      $API_URL"
fi
if [[ -n "$CF_URL" ]]; then
  echo "  Web:      $CF_URL"
fi
echo "  Profile:  $PROFILE"
echo "  Region:   $REGION"
echo "  Stack:    $STACK_NAME"
echo "  Chains:   $CHAINS"
echo ""
