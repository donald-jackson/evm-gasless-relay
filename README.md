# Stablecoin Relay

Gasless stablecoin transfers across EVM chains. Users sign an off-chain permit; a relayer submits the transaction and pays the gas. The fee is deducted from the token transfer itself — **senders never need native gas tokens**.

## How It Works

```
Sender (has USDC, no ETH)          Relay Contract              Recipient
        |                                |                        |
        |  1. Sign EIP-2612 permit       |                        |
        |  (off-chain, no gas)           |                        |
        |                                |                        |
        |  2. Send signature to relayer  |                        |
        |------------------------------->|                        |
        |                                |                        |
        |     3. Relayer calls           |                        |
        |     relayWithPermit()          |                        |
        |     (relayer pays gas)         |                        |
        |                                |  4. amount -> recipient|
        |                                |----------------------->|
        |                                |                        |
        |                                |  5. fee -> relayer     |
        |                                |                        |
```

1. The sender signs an [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) `permit` approving the relay contract to spend `amount + fee` of their tokens
2. The signature (`v`, `r`, `s`) is sent to a relayer (via API or directly)
3. The relayer calls `relayWithPermit()` on-chain, paying gas
4. The contract calls `permit()` on the token, then transfers `amount` to the recipient and `fee` to the relayer
5. The sender's wallet never needs ETH

## Contract Addresses

The `StablecoinRelay` contract is deployed at the same address on all chains (CREATE from the same deployer + nonce):

```
0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe
```

| Chain | Chain ID | Status | Explorer |
|-------|----------|--------|----------|
| Ethereum | 1 | Live | [etherscan.io](https://etherscan.io/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Polygon | 137 | Pending | [polygonscan.com](https://polygonscan.com/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Arbitrum | 42161 | Pending | [arbiscan.io](https://arbiscan.io/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Optimism | 10 | Pending | [optimistic.etherscan.io](https://optimistic.etherscan.io/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Base | 8453 | Live | [basescan.org](https://basescan.org/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Avalanche | 43114 | Pending | [snowtrace.io](https://snowtrace.io/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Linea | 59144 | Pending | [lineascan.build](https://lineascan.build/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Scroll | 534352 | Pending | [scrollscan.com](https://scrollscan.com/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Sepolia | 11155111 | Live | [sepolia.etherscan.io](https://sepolia.etherscan.io/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |
| Base Sepolia | 84532 | Live | [sepolia.basescan.org](https://sepolia.basescan.org/address/0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe) |

## Supported Tokens

All supported tokens use native [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) permit for gasless approvals.

| Chain | USDC |
|-------|------|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Avalanche | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |
| Linea | `0x176211869cA2b568f2A7D4EE941E073a821EE1ff` |
| Scroll | `0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4` |
| Sepolia | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Integration Guide

### Option A: Direct Contract Integration (Recommended)

Call the relay contract directly from your backend. You need a funded relayer wallet to pay gas.

#### Step 1: Sign the EIP-2612 Permit (Client-Side)

The sender signs a typed data message approving the relay contract to spend their tokens. This is off-chain and costs no gas.

```javascript
import { Wallet, Contract, JsonRpcProvider } from "ethers";

const RELAY_CONTRACT = "0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe";

// Connect to the token contract to read permit parameters
const usdc = new Contract(tokenAddress, [
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
], provider);

const [nonce, name, version] = await Promise.all([
  usdc.nonces(sender.address),
  usdc.name(),
  usdc.version(),
]);

const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
const totalApproval = amount + fee; // both in smallest token units (e.g. 6 decimals for USDC)

// EIP-712 typed data
const domain = {
  name,           // e.g. "USD Coin"
  version,        // e.g. "2" (varies by chain — always read from contract)
  chainId,        // e.g. 84532 for Base Sepolia
  verifyingContract: tokenAddress,
};

const types = {
  Permit: [
    { name: "owner",    type: "address" },
    { name: "spender",  type: "address" },
    { name: "value",    type: "uint256" },
    { name: "nonce",    type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const message = {
  owner: sender.address,
  spender: RELAY_CONTRACT,
  value: totalApproval,
  nonce,
  deadline,
};

const signature = await sender.signTypedData(domain, types, message);

// Split into v, r, s
const bytes = Buffer.from(signature.slice(2), "hex");
const r = "0x" + bytes.subarray(0, 32).toString("hex");
const s = "0x" + bytes.subarray(32, 64).toString("hex");
const v = bytes[64];
```

> **Important:** Always read `name()` and `version()` from the token contract at runtime. These values differ between chains and token deployments. Hardcoding them will produce invalid signatures.

#### Step 2: Submit the Relay Transaction (Relayer-Side)

A funded relayer wallet calls `relayWithPermit()` on the contract. The relayer pays gas and receives the fee.

```javascript
const relay = new Contract(RELAY_CONTRACT, [
  "function relayWithPermit(address token, address from, address to, uint256 amount, uint256 fee, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
], relayerWallet); // relayerWallet = Wallet with ETH for gas

const tx = await relay.relayWithPermit(
  tokenAddress,      // USDC contract address
  sender.address,    // token owner who signed the permit
  recipientAddress,  // where tokens are sent
  amount,            // transfer amount (smallest units)
  fee,               // fee amount (smallest units), sent to msg.sender
  deadline,          // from the permit signature
  v, r, s,           // permit signature components
);

const receipt = await tx.wait(1);
console.log("Confirmed:", receipt.hash);
```

#### Step 3: Listen for the Relayed Event

```javascript
const relay = new Contract(RELAY_CONTRACT, [
  "event Relayed(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 fee, address relayer)",
], provider);

relay.on("Relayed", (token, from, to, amount, fee, relayer) => {
  console.log(`Relayed ${amount} of ${token} from ${from} to ${to}, fee ${fee} to ${relayer}`);
});
```

### Option B: Via the REST API

When the API service is deployed, you can submit relay requests over HTTP without running your own relayer.

#### Get a Quote

```bash
curl -X POST https://API_URL/relay/quote \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 84532,
    "token": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "500000",
    "sender": "0xSENDER_ADDRESS",
    "recipient": "0xRECIPIENT_ADDRESS"
  }'
```

Response:
```json
{
  "chainId": 84532,
  "token": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "fee": "10000",
  "totalRequired": "510000",
  "gasEstimate": "150000",
  "gasPriceGwei": "0.005",
  "nativeTokenPriceUsd": "2500.00",
  "expiresAt": "2026-02-17T12:05:00.000Z"
}
```

#### Submit a Relay

Sign the permit (as shown in Step 1 above), then submit:

```bash
curl -X POST https://API_URL/relay/submit \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 84532,
    "token": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "from": "0xSENDER_ADDRESS",
    "to": "0xRECIPIENT_ADDRESS",
    "amount": "500000",
    "fee": "10000",
    "deadline": 1739800000,
    "v": 28,
    "r": "0x...",
    "s": "0x..."
  }'
```

Response:
```json
{
  "requestId": "req_abc123def456",
  "status": "queued",
  "estimatedWaitSeconds": 15
}
```

#### Poll for Status

```bash
curl https://API_URL/relay/status/req_abc123def456
```

Response:
```json
{
  "requestId": "req_abc123def456",
  "status": "confirmed",
  "chainId": 84532,
  "txHash": "0x3152f433...",
  "fee": "10000",
  "createdAt": "2026-02-17T12:00:00.000Z",
  "updatedAt": "2026-02-17T12:00:18.000Z",
  "confirmedAt": "2026-02-17T12:00:18.000Z",
  "error": null
}
```

Status progression: `queued` -> `pending` -> `submitted` -> `confirmed` (or `failed`).

#### List Supported Chains

```bash
curl https://API_URL/chains
```

## Contract ABI

### relayWithPermit

```solidity
function relayWithPermit(
    address token,     // ERC-20 token address
    address from,      // Token owner (permit signer)
    address to,        // Transfer recipient
    uint256 amount,    // Amount to send to recipient (smallest units)
    uint256 fee,       // Fee sent to msg.sender / relayer (smallest units)
    uint256 deadline,  // Permit expiry (unix timestamp)
    uint8 v,           // Signature component
    bytes32 r,         // Signature component
    bytes32 s          // Signature component
) external
```

The contract calls `IERC20Permit(token).permit(from, address(this), amount + fee, deadline, v, r, s)` then executes two `transferFrom` calls: `amount` to `to` and `fee` to `msg.sender`.

### Events

```solidity
event Relayed(
    address indexed token,
    address indexed from,
    address indexed to,
    uint256 amount,
    uint256 fee,
    address relayer      // msg.sender who submitted and received the fee
);
```

### Read Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `owner()` | `address` | Contract owner |
| `paused()` | `bool` | Whether the contract is paused |

## Fee Structure

- Fee is denominated in the transfer token (e.g. USDC), not in native gas tokens
- Minimum fee: **0.01 USDC** (10,000 in 6-decimal units)
- The API calculates fees dynamically: `fee = gasEstimate * gasPrice * nativeTokenPrice * 1.25`
- Transfer limits: **0.10 USDC** minimum, **100,000 USDC** maximum
- When integrating directly (Option A), you set the fee yourself

## Test CLI (Base Sepolia)

A ready-to-use CLI script is included for testing on Base Sepolia.

### Generate a Wallet

```bash
node scripts/test-relay-cli.mjs generate
```

Creates a random wallet with no ETH. Prints the address and private key.

### Check Balances

```bash
node scripts/test-relay-cli.mjs balance 0xYOUR_ADDRESS
```

### Fund with Test USDC

Get free Base Sepolia USDC from the Circle faucet: https://faucet.circle.com/ (select **Base Sepolia**).

No ETH is needed in the sender wallet.

### Send a Gasless Transfer

```bash
node scripts/test-relay-cli.mjs relay \
  --key 0xSENDER_PRIVATE_KEY \
  --to 0xRECIPIENT \
  --amount 0.50
```

This signs a permit, then a relayer wallet (derived from the project's HD seed) submits the transaction and pays gas. The sender pays a 0.01 USDC fee from their token balance.

Example output:

```
  Stablecoin Relay — Base Sepolia
  ----------------------------------------------------------
  Sender:    0x94a160F4838161f730F918936A195e0776942c1d
  Recipient: 0x5DcA85d183A6D1D730992ED93D1A553803f9C661
  Amount:    0.50 USDC
  Fee:       0.01 USDC
  Total:     0.51 USDC
  Relayer:   0x4BAC59ff1950eB92ff875C545E3ac02bbE90D9Eb

  Sender USDC balance: 20.0
  Relayer ETH balance: 0.099996284569437584
  Sender ETH balance:  0.0 (no gas needed!)

  Signing EIP-2612 permit...
  Permit signed successfully.
  Submitting relay transaction...
  TX hash: 0x3152f433581f509e8670420e9c4c2592bea1382b2cddedffe5318a77183bd580
  Explorer: https://sepolia.basescan.org/tx/0x3152f433...
  Waiting for confirmation...
  Confirmed in block 37781524 (gas used: 149570)

  Gasless transfer complete!
```

## Architecture

```
contracts/              Solidity contracts (Foundry)
  src/StablecoinRelay.sol   Core relay contract
  script/Deploy.s.sol       Deployment script

packages/
  shared/               Shared types, chain configs, ABIs, constants
  api/                  API Gateway Lambda handlers (quote, submit, status, chains)
  worker/               SQS consumer — picks up relay jobs, submits on-chain
  infra/                AWS CDK stack (API Gateway, Lambda, SQS, DynamoDB)

scripts/
  test-relay-cli.mjs    Test CLI for Base Sepolia
  check-wallet-balances.mjs  Check relayer wallet balances across all chains
```

## Deployment

Two scripts handle the full AWS deployment lifecycle. Both require an AWS named profile.

### Deploy

```bash
./deploy.sh --profile <aws-profile> [--region us-east-1] [--skip-contracts] [--chains 1,8453,11155111,84532]
```

| Flag | Description |
|------|-------------|
| `--profile` | AWS named profile (required) |
| `--region` | AWS region (default: `us-east-1`) |
| `--skip-contracts` | Skip Foundry contract deployment |
| `--chains` | Comma-separated chain IDs (default: `1,8453,11155111,84532`) |

The script runs 10 steps in order:

1. Validates prerequisites (`node`, `pnpm`, `aws`, `cdk`, and `forge` unless `--skip-contracts`)
2. Installs dependencies and builds all packages
3. Deploys contracts via Foundry (requires `DEPLOYER_PRIVATE_KEY` env var)
4. Bootstraps CDK (idempotent)
5. Deploys the CloudFormation stack (API Gateway, Lambda, SQS, DynamoDB, Secrets Manager)
6. Bundles all 6 Lambda handlers with esbuild
7. Uploads Lambda code and waits for functions to become active
8. Stores HD wallet seed phrase in Secrets Manager (prompts if not already set)
9. Seeds the wallet pool in DynamoDB
10. Verifies `/health` and `/chains` endpoints

Example — deploy infrastructure only (no contracts):

```bash
./deploy.sh --profile Engineering-Playground/AdministratorAccess --skip-contracts
```

### Destroy

```bash
./destroy.sh --profile <aws-profile> [--region us-east-1] [--force]
```

| Flag | Description |
|------|-------------|
| `--profile` | AWS named profile (required) |
| `--region` | AWS region (default: `us-east-1`) |
| `--force` | Skip confirmation prompt |

This tears down all AWS resources: CloudFormation stack (Lambdas, API Gateway, DynamoDB tables, SQS queues, CloudWatch alarms, IAM roles), the Secrets Manager secret, and local Lambda bundles.

On-chain contracts cannot be destroyed — they can only be paused by the contract owner.

```bash
./destroy.sh --profile Engineering-Playground/AdministratorAccess
```

## Security Considerations

- The relay contract is `Ownable` and `Pausable` — the owner can pause relaying and withdraw accumulated fees
- Permit signatures are validated on-chain by the token contract itself — invalid signatures revert
- The `fee` is explicitly part of the permit approval (`value = amount + fee`), so the sender always knows exactly how much they're authorizing
- Relayer wallets are derived from an HD seed phrase stored in AWS Secrets Manager
- The contract does not hold user funds — tokens move directly from sender to recipient and from sender to relayer in the same transaction

## Local Development

```bash
# Install dependencies
pnpm install

# Build contracts
cd contracts && forge build

# Run contract tests
forge test -vvv

# Run TypeScript tests
pnpm test

# Deploy to a testnet
cd contracts
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://sepolia.base.org --broadcast -vvv
```
