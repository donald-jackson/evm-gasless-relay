# Stablecoin Relay — Deployment Guide

Gasless stablecoin transfer relay using EIP-2612 permit signatures. Users sign a
permit off-chain, the relay submits the transaction on-chain, and the fee is
deducted from the transferred amount. No ETH required by the sender.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Install](#2-clone-and-install)
3. [Build](#3-build)
4. [Run Tests](#4-run-tests)
5. [Deploy Smart Contracts](#5-deploy-smart-contracts)
6. [Deploy AWS Infrastructure](#6-deploy-aws-infrastructure)
7. [Bundle and Deploy Lambda Code](#7-bundle-and-deploy-lambda-code)
8. [Store Wallet Seed Phrase](#8-store-wallet-seed-phrase)
9. [Seed the Wallet Pool](#9-seed-the-wallet-pool)
10. [Fund Relayer Wallets](#10-fund-relayer-wallets)
11. [Verify Deployment](#11-verify-deployment)
12. [Test a Gasless Relay (CLI)](#12-test-a-gasless-relay-cli)
13. [Architecture Reference](#13-architecture-reference)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20 | [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org) |
| pnpm | >= 9 | `npm install -g pnpm` |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| AWS CLI | v2 | [Install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| AWS CDK | >= 2 | `npm install -g aws-cdk` |
| esbuild | (included) | Installed as a dev dependency |

You also need:
- An AWS account with AdministratorAccess (or equivalent permissions for Lambda,
  API Gateway, DynamoDB, SQS, Secrets Manager, CloudWatch, IAM)
- A funded deployer wallet for smart contract deployment (needs native gas tokens
  on each target chain)
- A funded HD wallet for relayer operations (needs native gas tokens on each
  chain where you want to relay)

---

## 2. Clone and Install

```bash
git clone <repository-url>
cd stablecoin-relay
pnpm install
```

The monorepo contains these packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@stablecoin-relay/shared` | `packages/shared` | Types, constants, chain configs, fee calculations, blocklist |
| `@stablecoin-relay/api` | `packages/api` | REST API Lambda handlers (quote, submit, status, chains, health) |
| `@stablecoin-relay/worker` | `packages/worker` | SQS worker Lambda — executes on-chain relay transactions |
| `@stablecoin-relay/infra` | `packages/infra` | AWS CDK infrastructure-as-code |
| contracts | `contracts` | Solidity smart contracts (Foundry) |

---

## 3. Build

```bash
# Build all TypeScript packages
pnpm build

# Build Foundry contracts
cd contracts
forge build
cd ..
```

---

## 4. Run Tests

```bash
# TypeScript tests (all packages)
pnpm test

# Solidity tests
cd contracts
forge test -vvv
```

---

## 5. Deploy Smart Contracts

The `StablecoinRelay.sol` contract must be deployed to each chain you want to
support. The contract uses EIP-2612 permits to relay token transfers gaslessly.

### 5a. Deploy to a single chain

```bash
cd contracts

DEPLOYER_PRIVATE_KEY=0x<your-deployer-private-key> \
  forge script script/Deploy.s.sol:DeployScript \
  --rpc-url <rpc-url> \
  --broadcast \
  -vvv
```

The deployed address will be printed in the output and saved to
`broadcast/Deploy.s.sol/<chainId>/run-latest.json`.

### 5b. Deploy to all mainnet chains

```bash
cd contracts

DEPLOYER_PRIVATE_KEY=0x<your-deployer-private-key> \
  ./script/deploy-all-chains.sh
```

This deploys to: Ethereum (1), Polygon (137), Arbitrum (42161), Optimism (10),
Base (8453), BSC (56), Avalanche (43114), Linea (59144), Scroll (534352).

To deploy to a single chain from the script:

```bash
DEPLOYER_PRIVATE_KEY=0x... ./script/deploy-all-chains.sh 8453  # Base only
```

### 5c. Deploy to testnets

Testnets are not included in `deploy-all-chains.sh`. Deploy manually:

```bash
# Sepolia
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast -vvv

# Base Sepolia
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://sepolia.base.org --broadcast -vvv
```

### 5d. Update contract addresses

After deployment, update `packages/shared/src/addresses.ts` with the deployed
contract addresses:

```typescript
export const RELAY_CONTRACTS: Record<number, string> = {
  1: "0x<ethereum-address>",
  8453: "0x<base-address>",
  11155111: "0x<sepolia-address>",
  84532: "0x<base-sepolia-address>",
  // Add more chains as deployed...
};
```

Then rebuild the shared package:

```bash
pnpm --filter @stablecoin-relay/shared build
```

---

## 6. Deploy AWS Infrastructure

The CDK stack creates all AWS resources: DynamoDB tables, SQS queues, Lambda
functions, API Gateway, Secrets Manager, and CloudWatch alarms.

### 6a. Configure AWS credentials

```bash
# Option 1: AWS SSO
aws sso login --profile <your-profile>

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
export AWS_DEFAULT_REGION=us-east-1
```

### 6b. Bootstrap CDK (first time only)

```bash
npx cdk bootstrap aws://<account-id>/us-east-1 --profile <your-profile>
```

### 6c. Build and deploy

```bash
pnpm --filter @stablecoin-relay/infra build

npx cdk deploy \
  --app "node packages/infra/dist/index.js" \
  --profile <your-profile> \
  --require-approval never
```

Note the outputs:
```
StablecoinRelayStack.ApiUrl = https://<api-id>.execute-api.us-east-1.amazonaws.com
StablecoinRelayStack.QueueUrl = https://sqs.us-east-1.amazonaws.com/<account>/relay-requests
```

Save the `ApiUrl` — you'll need it for testing.

### AWS resources created

| Resource | Name | Purpose |
|----------|------|---------|
| DynamoDB | `StablecoinRelay-Transactions` | Transaction records and status |
| DynamoDB | `StablecoinRelay-WalletPool` | Relayer wallet pool (available/busy/cooldown) |
| DynamoDB | `StablecoinRelay-Nonces` | Atomic nonce counters per wallet per chain |
| SQS | `relay-requests` | Relay job queue (5 min visibility, 3 retries) |
| SQS | `relay-requests-dlq` | Dead letter queue (14 day retention) |
| Secrets Manager | `stablecoin-relay/hd-wallet-seed` | HD wallet seed phrase |
| Lambda | `stablecoin-relay-chains` | GET /chains |
| Lambda | `stablecoin-relay-quote` | POST /relay/quote |
| Lambda | `stablecoin-relay-submit` | POST /relay/submit |
| Lambda | `stablecoin-relay-status` | GET /relay/status/{requestId} |
| Lambda | `stablecoin-relay-health` | GET /health |
| Lambda | `stablecoin-relay-worker` | SQS consumer — executes relay transactions |
| API Gateway | `stablecoin-relay` | HTTP API with CORS and rate limiting |
| CloudWatch | Various alarms | Worker errors, queue depth, DLQ, failed relays |

---

## 7. Bundle and Deploy Lambda Code

The CDK stack creates Lambda functions with placeholder code. You must bundle the
actual handlers with esbuild and upload them.

### 7a. Build all packages

```bash
pnpm build
```

### 7b. Bundle with esbuild

```bash
ESBUILD="./node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/bin/esbuild"
OUT="/tmp/lambda-bundles"
mkdir -p "$OUT"/{chains,quote,submit,status,health,worker}

# API handlers
node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/chains/index.js" packages/api/src/handlers/chains.ts

node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/quote/index.js" packages/api/src/handlers/quote.ts

node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/submit/index.js" packages/api/src/handlers/submit.ts

node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/status/index.js" packages/api/src/handlers/status.ts

node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/health/index.js" packages/api/src/handlers/health.ts

# Worker handler
node $ESBUILD --bundle --platform=node --target=node20 --format=cjs \
  --external:@aws-sdk/client-sqs --external:@aws-sdk/client-dynamodb \
  --external:@aws-sdk/lib-dynamodb --external:@aws-sdk/client-secrets-manager \
  --outfile="$OUT/worker/index.js" packages/worker/src/relay.ts
```

> **Note:** AWS SDK v3 packages are marked as external because the Lambda Node.js
> 20 runtime includes them natively.

### 7c. Zip and deploy

```bash
PROFILE="<your-aws-profile>"
REGION="us-east-1"
OUT="/tmp/lambda-bundles"

# Create zip archives
for fn in chains quote submit status health worker; do
  (cd "$OUT/$fn" && zip -j "$OUT/$fn.zip" index.js)
done

# Deploy to Lambda
for fn in chains quote submit status health worker; do
  aws lambda update-function-code \
    --function-name "stablecoin-relay-$fn" \
    --zip-file "fileb://$OUT/$fn.zip" \
    --profile "$PROFILE" \
    --region "$REGION"
  echo "Deployed: stablecoin-relay-$fn"
done
```

---

## 8. Store Wallet Seed Phrase

The worker Lambda reads the HD wallet seed phrase from AWS Secrets Manager to
derive relayer private keys at runtime. The seed is never stored in code.

```bash
aws secretsmanager put-secret-value \
  --secret-id stablecoin-relay/hd-wallet-seed \
  --secret-string "<your-12-or-24-word-seed-phrase>" \
  --profile <your-profile> \
  --region us-east-1
```

The system derives 5 wallets per chain using BIP-44 path `m/44'/60'/0'/0/{0-4}`.

### Derive wallet addresses

To see the addresses that will be derived from your seed:

```bash
node -e "
const { HDNodeWallet, Mnemonic } = require('ethers');
const mnemonic = Mnemonic.fromPhrase('<your-seed-phrase>');
for (let i = 0; i < 5; i++) {
  const path = \"m/44'/60'/0'/0/\" + i;
  const w = HDNodeWallet.fromMnemonic(mnemonic, path);
  console.log('Index ' + i + ': ' + w.address);
}
"
```

Save these addresses — you'll need them for the next two steps.

---

## 9. Seed the Wallet Pool

The `StablecoinRelay-WalletPool` DynamoDB table tracks which wallets are
available for relaying on each chain. The seed script derives wallets from
your seed phrase, queries each chain's RPC for the on-chain balance and nonce,
and writes entries to both the `WalletPool` and `Nonces` tables.

### 9a. Using a seed phrase from an environment variable

```bash
SEED_PHRASE="<your-12-or-24-word-seed-phrase>" \
  node scripts/seed-wallet-pool.mjs \
  --profile <your-profile>
```

### 9b. Pulling the seed phrase from Secrets Manager

```bash
node scripts/seed-wallet-pool.mjs \
  --from-secrets-manager \
  --profile <your-profile> \
  --region us-east-1
```

### 9c. Seeding specific chains only

By default the script seeds all chains with deployed relay contracts
(Ethereum, Base, Sepolia, Base Sepolia). To seed a subset:

```bash
SEED_PHRASE="..." node scripts/seed-wallet-pool.mjs \
  --chains 84532,11155111 \
  --profile <your-profile>
```

The script prints a summary table showing each wallet's address, on-chain
balance, nonce, and funding status. Wallets with zero balance are flagged as
`NEEDS FUNDING`.

Re-running the seed script is safe — it overwrites existing entries with fresh
on-chain data. This is also how you reset a wallet that ran out of gas: refund
it, then re-run the seed script to update its `balanceWei` in DynamoDB.

---

## 10. Fund Relayer Wallets

Each relayer wallet needs native gas tokens (ETH, MATIC, AVAX, etc.) on every
chain it operates on. The wallet addresses are the same across all EVM chains
(derived from the same HD path).

| Chain | Native Token | Recommended per wallet | Faucet (testnet) |
|-------|-------------|----------------------|------------------|
| Ethereum (1) | ETH | 0.05 ETH | — |
| Base (8453) | ETH | 0.005 ETH | — |
| Sepolia (11155111) | ETH | 0.1 ETH | [sepoliafaucet.com](https://sepoliafaucet.com) |
| Base Sepolia (84532) | ETH | 0.01 ETH | [faucet.quicknode.com](https://faucet.quicknode.com/base/sepolia) |

For testing, you only need to fund wallet index 0 (the first address). The system
will use additional wallets for concurrent relaying under load.

---

## 11. Verify Deployment

Replace `API_URL` with the URL from the CDK output.

### Health check

```bash
curl -s https://<api-id>.execute-api.us-east-1.amazonaws.com/health | jq .
```

Expected: all seeded chains show `available: 5`, queue depth `0`.

### Supported chains

```bash
curl -s https://<api-id>.execute-api.us-east-1.amazonaws.com/chains | jq .
```

### Get a fee quote

```bash
curl -s -X POST https://<api-id>.execute-api.us-east-1.amazonaws.com/relay/quote \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "amount": "1000000",
    "sender": "0x1234567890123456789012345678901234567890",
    "recipient": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  }' | jq .
```

Expected response includes real gas pricing:
```json
{
  "chainId": 11155111,
  "fee": "4519740",
  "gasPriceGwei": "8.04",
  "nativeTokenPriceUsd": "3000.00",
  "expiresAt": "..."
}
```

### Verify sanctioned address blocking

```bash
curl -s -X POST https://<api-id>.execute-api.us-east-1.amazonaws.com/relay/quote \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "amount": "1000000",
    "sender": "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
    "recipient": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  }'
```

Expected: `{"error":"Forbidden"}` with HTTP 403 (generic message, no details).

---

## 12. Test a Gasless Relay (CLI)

A test CLI script is included for end-to-end testing on Base Sepolia.

### 12a. Generate a test wallet

```bash
node scripts/test-relay-cli.mjs generate
```

### 12b. Fund the test wallet with USDC

Go to [Circle Faucet](https://faucet.circle.com/) (select Base Sepolia) and send
test USDC to the generated address. The wallet does NOT need ETH.

### 12c. Check balance

```bash
node scripts/test-relay-cli.mjs balance 0x<test-wallet-address>
```

### 12d. Execute a gasless relay

```bash
SEED_PHRASE="<your-relayer-seed-phrase>" \
  node scripts/test-relay-cli.mjs relay \
  --key 0x<test-wallet-private-key> \
  --to 0x<recipient-address> \
  --amount 0.50
```

The CLI signs an EIP-2612 permit, submits the relay transaction on-chain, and
confirms it. The sender's USDC is transferred without the sender spending any gas.

---

## 13. Architecture Reference

### Transaction flow

```
1.  Client signs EIP-2612 permit off-chain (no gas needed)
2.  POST /relay/submit with permit signature
3.  API validates request, checks OFAC blocklist, stores to DynamoDB
4.  Message enqueued to SQS (relay-requests)
5.  Worker Lambda triggered by SQS event
6.  Worker acquires wallet from pool (status=available AND balanceWei >= gas threshold)
7.  Worker reads seed from Secrets Manager, derives private key
8.  Worker gets nonce (atomic DynamoDB increment)
9.  Worker verifies wallet balance against dynamic gas threshold (gasPrice * 150k * 2)
10. Worker submits relayWithPermit() transaction
11. Worker waits for block confirmations
12. Worker writes post-tx balance back to DynamoDB
13. Transaction status updated in DynamoDB (queued -> pending -> submitted -> confirmed)
14. Wallet released to cooldown pool (5s cooldown prevents nonce collision)
15. Client polls GET /relay/status/{requestId}
```

If submission fails before reaching the RPC (e.g. insufficient balance), the
nonce is rolled back so it is not wasted.

### Wallet pool states

```
available  -->  busy  -->  cooldown  -->  available
   (acquire)       (release)     (5 sec timeout)
```

Wallet acquisition filters by both status and balance: a wallet must be
`available` **and** have a `balanceWei` above the dynamic gas threshold
(`currentGasPrice * DEFAULT_GAS_ESTIMATE * 2`). Wallets that run low on gas
are automatically skipped without needing a manual status change. After each
successful relay the worker writes the post-transaction balance back to
DynamoDB, keeping the pool data current.

To restore a wallet that ran out of gas: refund it on-chain, then re-run
`scripts/seed-wallet-pool.mjs` to update its `balanceWei`.

### Key constants

| Constant | Value | Description |
|----------|-------|-------------|
| `WALLETS_PER_CHAIN` | 5 | HD wallets derived per chain |
| `HD_DERIVATION_BASE_PATH` | `m/44'/60'/0'/0` | BIP-44 derivation path |
| `WALLET_COOLDOWN_MS` | 5,000 ms | Cooldown after relay to prevent nonce collisions |
| `DEFAULT_GAS_ESTIMATE` | 150,000 | Estimated gas units per relay transaction |
| `FEE_MARGIN` | 25% | Margin over gas cost |
| `MIN_FEE_USDC` | 0.01 USDC | Minimum relay fee floor |
| `MIN_RELAY_AMOUNT` | 0.10 USDC | Minimum transfer amount |
| `MAX_RELAY_AMOUNT` | 100,000 USDC | Maximum transfer amount |
| `QUOTE_EXPIRY_MS` | 5 min | Fee quote validity |
| `MAX_RETRY_ATTEMPTS` | 3 | SQS retries before DLQ |
| `GAS_BUMP_PERCENT` | 20% | Gas price bump on retry |
| `PRICE_CACHE_TTL_MS` | 60 sec | Gas price and token price cache |

### Supported chains

| Chain | ID | Native | USDC Address | Relay Contract |
|-------|----|--------|-------------|----------------|
| Ethereum | 1 | ETH | `0xA0b8...eB48` | Deployed |
| Polygon | 137 | MATIC | `0x3c49...3359` | Not yet |
| Arbitrum | 42161 | ETH | `0xaf88...e831` | Not yet |
| Optimism | 10 | ETH | `0x0b2C...Ff85` | Not yet |
| Base | 8453 | ETH | `0x8335...2913` | Deployed |
| Avalanche | 43114 | AVAX | `0xB97E...a6E` | Not yet |
| Linea | 59144 | ETH | `0x1762...1ff` | Not yet |
| Scroll | 534352 | ETH | `0x06eF...3A4` | Not yet |
| Sepolia | 11155111 | ETH | `0x1c7D...7238` | Deployed |
| Base Sepolia | 84532 | ETH | `0x036C...F7e` | Deployed |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chains` | List supported chains and tokens |
| GET | `/health` | Wallet pool status and queue depth |
| POST | `/relay/quote` | Get fee quote for a relay |
| POST | `/relay/submit` | Submit a signed permit for relay |
| GET | `/relay/status/{requestId}` | Check relay transaction status |

---

## 14. Troubleshooting

### CDK deploy fails with "Property validation failure" on RouteSettings

API Gateway V2 HTTP APIs don't support per-route throttle settings. Remove or
comment out the `routeSettings` block in `packages/infra/src/stack.ts`.

### CDK deploy fails with WAF WebACL association error

WAFv2 has compatibility issues with the `$default` stage name on HTTP APIs. As a
workaround, comment out the WAF WebACL and its association in the stack.

### Lambda returns `{"message":"Internal Server Error"}`

Check CloudWatch logs for the specific Lambda function. Common causes:
- Missing IAM permissions (DynamoDB, SQS, Secrets Manager)
- Incorrect handler entry point (should be `index.handler`)
- Missing dependencies in the esbuild bundle

### Worker fails to relay transactions

1. Check the worker Lambda logs in CloudWatch
2. Verify the wallet pool has entries: `aws dynamodb scan --table-name StablecoinRelay-WalletPool`
3. Verify the seed is stored: `aws secretsmanager get-secret-value --secret-id stablecoin-relay/hd-wallet-seed`
4. Check the relayer wallet has gas on the target chain
5. Check the DLQ for failed messages: `aws sqs get-queue-attributes --queue-url <dlq-url> --attribute-names ApproximateNumberOfMessages`

### "No available wallet" errors but wallets exist

The worker skips wallets whose `balanceWei` is below the dynamic gas threshold
(`currentGasPrice * 150,000 * 2`). If all wallets are underfunded:

1. Fund the wallet addresses on-chain
2. Re-run the seed script to update `balanceWei` in DynamoDB:
   ```bash
   node scripts/seed-wallet-pool.mjs --from-secrets-manager --profile <your-profile>
   ```
3. Verify with a DynamoDB scan that `balanceWei` values are now non-zero

### Quote returns stale gas prices

Gas prices and native token prices are cached for 60 seconds. The cache is
per-Lambda-instance, so a cold start will always fetch fresh prices.

### Wallet pool shows all wallets as "busy"

A stuck wallet can happen if a Lambda invocation crashes mid-relay. Wallets in
`busy` state for more than 5 minutes are likely stuck. Reset them:

```bash
aws dynamodb update-item \
  --table-name StablecoinRelay-WalletPool \
  --key '{"chainId":{"N":"<chain-id>"},"address":{"S":"<wallet-address>"}}' \
  --update-expression "SET #s = :a" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":a":{"S":"available"}}' \
  --profile <your-profile> \
  --region us-east-1
```
