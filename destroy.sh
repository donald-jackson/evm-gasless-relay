#!/usr/bin/env bash
set -euo pipefail

# ─── Stablecoin Relay — Full Teardown Script ────────────────────────────────
#
# Usage:
#   ./destroy.sh --profile <aws-profile> [--region us-east-1] [--force]
#
# Required:
#   --profile   AWS named profile
#
# Optional:
#   --region    AWS region (default: us-east-1)
#   --force     Skip confirmation prompt

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Defaults ────────────────────────────────────────────────────────────────

PROFILE=""
REGION="us-east-1"
FORCE=false

STACK_NAME="StablecoinRelayStack"
SECRET_NAME="stablecoin-relay/hd-wallet-seed"
BUNDLE_DIR="/tmp/lambda-bundles"

# ─── Parse arguments ────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region)  REGION="$2"; shift 2 ;;
    --force)   FORCE=true; shift ;;
    -h|--help)
      head -13 "$0" | tail -11
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "Error: --profile is required"
  echo "Usage: ./destroy.sh --profile <aws-profile> [--region us-east-1] [--force]"
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

# ─── Step 1: Confirmation ───────────────────────────────────────────────────

if [[ "$FORCE" == false ]]; then
  echo ""
  echo "This will DESTROY the following AWS resources in $REGION (profile: $PROFILE):"
  echo ""
  echo "  CloudFormation stack:   $STACK_NAME"
  echo "  Lambda functions:       stablecoin-relay-{chains,quote,submit,status,health,worker}"
  echo "  API Gateway:            stablecoin-relay"
  echo "  DynamoDB tables:        StablecoinRelay-{Transactions,WalletPool,Nonces}"
  echo "  SQS queues:             relay-requests, relay-requests-dlq"
  echo "  CloudWatch alarms:      stablecoin-relay-{worker-errors,queue-depth,dlq-messages,failed-relays}"
  echo "  IAM roles:              (all stack-managed roles)"
  echo "  Secrets Manager:        $SECRET_NAME"
  echo "  Local bundles:          $BUNDLE_DIR"
  echo ""
  echo "  NOTE: On-chain contracts CANNOT be destroyed (only paused via contract owner)."
  echo ""
  read -r -p "  Type 'yes' to confirm destruction: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "  Aborted."
    exit 0
  fi
fi

# ─── Step 2: CDK destroy ────────────────────────────────────────────────────

step "CDK destroy"

echo "  Destroying stack $STACK_NAME..."
npx cdk destroy "$STACK_NAME" \
  --force \
  --profile "$PROFILE" \
  2>&1 | tail -10
ok "CDK stack destroyed"

# ─── Step 3: Force-delete Secrets Manager secret ────────────────────────────

step "Delete Secrets Manager secret"

echo "  Deleting secret: $SECRET_NAME"
if aws secretsmanager delete-secret \
    --secret-id "$SECRET_NAME" \
    --force-delete-without-recovery \
    --profile "$PROFILE" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null 2>&1; then
  ok "Secret deleted (immediate, no recovery)"
else
  echo "  [WARN] Secret may already be deleted or not found — continuing"
fi

# ─── Step 4: Clean up local bundles ─────────────────────────────────────────

step "Clean up local bundles"

if [[ -d "$BUNDLE_DIR" ]]; then
  rm -rf "$BUNDLE_DIR"
  ok "Removed $BUNDLE_DIR"
else
  ok "$BUNDLE_DIR does not exist — nothing to clean"
fi

# ─── Step 5: Summary ────────────────────────────────────────────────────────

step "Summary"

echo ""
echo "  All AWS resources have been destroyed."
echo ""
echo "  Destroyed:"
echo "    - CloudFormation stack ($STACK_NAME)"
echo "    - 6 Lambda functions"
echo "    - API Gateway (stablecoin-relay)"
echo "    - 3 DynamoDB tables"
echo "    - 2 SQS queues"
echo "    - 4 CloudWatch alarms"
echo "    - IAM roles & policies"
echo "    - Secrets Manager secret ($SECRET_NAME)"
echo "    - Local Lambda bundles"
echo ""
echo "  NOT destroyed (cannot be destroyed on-chain):"
echo "    - Deployed smart contracts (StablecoinRelay.sol)"
echo "    - These can only be paused by the contract owner"
echo ""
echo "  Verify with:"
echo "    aws cloudformation describe-stacks --stack-name $STACK_NAME --profile $PROFILE --region $REGION"
echo ""
