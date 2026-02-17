// Fee calculation
export const FEE_MARGIN = 0.25; // 25% margin over gas cost
export const MIN_FEE_USDC = 10_000n; // 0.01 USDC (6 decimals)
export const MIN_RELAY_AMOUNT = 100_000n; // 0.10 USDC minimum transfer
export const MAX_RELAY_AMOUNT = 100_000_000_000n; // 100,000 USDC maximum

// Wallet pool
export const WALLETS_PER_CHAIN = 5;
export const HD_DERIVATION_BASE_PATH = "m/44'/60'/0'/0";
export const WALLET_COOLDOWN_MS = 5_000; // 5 seconds cooldown after relay

// Queue and retry
export const SQS_QUEUE_NAME = "relay-requests";
export const SQS_DLQ_NAME = "relay-requests-dlq";
export const MAX_RETRY_ATTEMPTS = 3;
export const GAS_BUMP_PERCENT = 20; // Bump gas price by 20% on retry

// DynamoDB tables
export const DYNAMODB_TABLE_TRANSACTIONS = "StablecoinRelay-Transactions";
export const DYNAMODB_TABLE_WALLET_POOL = "StablecoinRelay-WalletPool";
export const DYNAMODB_TABLE_NONCES = "StablecoinRelay-Nonces";

// Secrets
export const SECRETS_MANAGER_SEED_KEY = "stablecoin-relay/hd-wallet-seed";

// Price cache
export const PRICE_CACHE_TTL_MS = 60_000; // 60 seconds

// Quote expiry
export const QUOTE_EXPIRY_MS = 300_000; // 5 minutes

// Relay gas estimate (approximate, per-chain adjustments apply)
export const DEFAULT_GAS_ESTIMATE = 150_000n;
