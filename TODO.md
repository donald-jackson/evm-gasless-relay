# Stablecoin Relay — Build Checklist

> Each task is atomic and independently verifiable.
> Mark `[x]` when complete. Do not skip ahead.

---

## 1 · Project Setup

- [x] **1.1** Run `git init`, create `.gitignore` (node_modules, .env, out/, cache/, cdk.out), and make initial commit
- [x] **1.2** Initialise pnpm monorepo: root `package.json` with `pnpm-workspace.yaml` defining `packages/*` and `contracts/*`
- [x] **1.3** Create `packages/shared`, `packages/api`, `packages/worker`, `packages/infra` workspaces each with `package.json` and `tsconfig.json`
- [x] **1.4** Add root-level TypeScript, ESLint, Prettier configs; verify `pnpm lint` runs cleanly across all workspaces
- [x] **1.5** Install Foundry (`foundryup`), scaffold `contracts/` with `forge init --no-git`, verify `forge build` succeeds

## 2 · Smart Contract

- [x] **2.1** Write `src/StablecoinRelay.sol`: `relayWithPermit(address token, address from, address to, uint256 amount, uint256 fee, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` using EIP-2612 `permit` + `transferFrom`
- [x] **2.2** Add `relayWithPermit2(...)` variant accepting Permit2 signatures for tokens without native permit support
- [x] **2.3** Add owner-only `withdrawFees(address token, address to)` and `pause()`/`unpause()` functions
- [x] **2.4** Write Foundry unit tests for `relayWithPermit` happy path (mock ERC20 with permit)
- [x] **2.5** Write Foundry tests for edge cases: expired deadline, invalid signature, paused contract, insufficient balance
- [x] **2.6** Write Foundry test for `relayWithPermit2` using Permit2 mock
- [x] **2.7** Create `script/Deploy.s.sol` deployment script; verify it works with `forge script --dry-run`
- [x] **2.8** Deploy `StablecoinRelay.sol` to Sepolia; record contract address in `packages/shared/src/addresses.ts`

## 3 · Shared Package

- [x] **3.1** Define `ChainConfig` type and export configs for all 10 chains (Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche, Linea, Scroll, Sepolia) with chainId, name, RPC URLs, block explorer, USDC/USDT addresses
- [x] **3.2** Export contract ABIs (auto-generated from Foundry `out/`) and typed ethers contract factories
- [ ] **3.3** Define shared TypeScript types: `RelayRequest`, `RelayQuote`, `RelayStatus`, `PoolWallet`, `TransactionRecord`
- [ ] **3.4** Export constants: fee margin (25%), min/max relay amounts, confirmation block counts, SQS queue names, DynamoDB table names

## 4 · API Handlers

- [ ] **4.1** Create `GET /chains` handler returning supported chains with token lists and contract addresses
- [ ] **4.2** Create `POST /relay/quote` handler: accept `{chainId, token, amount, sender, recipient}`, return estimated fee and expiry
- [ ] **4.3** Create `POST /relay/submit` handler: accept signed permit + relay params, validate signature, enqueue to SQS, return `requestId`
- [ ] **4.4** Create `GET /relay/status/{requestId}` handler: query DynamoDB, return `{status, txHash, fee, timestamps}`
- [ ] **4.5** Create `GET /health` handler returning service status, available relayer count per chain, queue depth
- [ ] **4.6** Add input validation (zod schemas), error handling middleware, and CORS headers to all handlers; verify with unit tests

## 5 · Worker Services

- [ ] **5.1** Implement HD wallet derivation: from seed phrase derive 5 EOAs (indices 0–4) per chain using ethers.js `HDNodeWallet`
- [ ] **5.2** Implement nonce manager: track per-address nonce in DynamoDB with atomic counter updates to prevent collisions
- [ ] **5.3** Implement pool manager: track EOA status (available/busy/cooldown) in DynamoDB, select available wallet for relay
- [ ] **5.4** Implement relay worker: receive SQS message, select EOA, build + sign + send `relayWithPermit` transaction, update status
- [ ] **5.5** Implement transaction confirmation watcher: poll for receipt, update DynamoDB status (pending → confirmed / failed)
- [ ] **5.6** Implement retry logic: on revert or timeout, retry with bumped gas price (up to 3 attempts), then mark failed
- [ ] **5.7** Write unit tests for wallet derivation, nonce manager, and pool manager (mocked DynamoDB)

## 6 · Fee System

- [ ] **6.1** Implement gas price fetcher: query each chain's RPC for current gas price with EIP-1559 support where available
- [ ] **6.2** Implement DEX price oracle: query Uniswap V3 QuoterV2 for ETH/USDC price (PancakeSwap on BSC); cache for 60s
- [ ] **6.3** Implement fee calculator: `fee = (gasEstimate × gasPrice × ethPrice) × (1 + margin)`, with min fee floor
- [ ] **6.4** Implement fee recycler: after relay, compare actual gas used vs estimated, log over/under-charges for monitoring

## 7 · Infrastructure (AWS CDK)

- [ ] **7.1** Initialise CDK app in `packages/infra` with TypeScript; define `StablecoinRelayStack`
- [ ] **7.2** Define DynamoDB tables: `Transactions` (PK: requestId), `WalletPool` (PK: chainId, SK: address), `Nonces` (PK: chainId#address)
- [ ] **7.3** Define API Gateway HTTP API with Lambda integrations for all API handlers; output the API URL
- [ ] **7.4** Define SQS queue `relay-requests` with dead-letter queue; define Lambda consumer for relay worker
- [ ] **7.5** Define Secrets Manager secret for HD wallet seed phrase; grant read access to worker Lambda
- [ ] **7.6** Run `cdk deploy --profile Engineering-Playground/AdministratorAccess` to Sepolia-only stack; verify API Gateway URL responds

## 8 · Multi-Chain Deployment

- [ ] **8.1** Deploy `StablecoinRelay.sol` to all 9 mainnet chains (Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche, Linea, Scroll); record addresses
- [ ] **8.2** Configure RPC endpoints for all chains in Secrets Manager or environment variables
- [ ] **8.3** Fund 5 EOAs on each chain with native gas tokens (ETH, MATIC, BNB, AVAX); verify balances
- [ ] **8.4** Run smoke test: call `GET /chains` and verify all 10 chains listed with correct contract addresses

## 9 · Testing & Polish

- [ ] **9.1** Write E2E integration test on Sepolia: sign a USDC permit, submit via API, wait for confirmation, verify token transfer on-chain
- [ ] **9.2** Add structured JSON logging (request correlation IDs, chain, amount, fee, duration) to all handlers and workers
- [ ] **9.3** Add CloudWatch alarms: failed relays > 5/min, queue depth > 100, wallet balance < threshold
- [ ] **9.4** Add rate limiting (per IP, per sender address) to API Gateway
- [ ] **9.5** Write API documentation with example curl commands for each endpoint
- [ ] **9.6** Final review: run full test suite, lint, verify all deployed contracts and endpoints, commit and tag `v0.1.0`
