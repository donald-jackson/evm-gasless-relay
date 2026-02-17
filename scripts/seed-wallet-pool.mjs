/**
 * Seeds the DynamoDB WalletPool and Nonces tables with derived HD wallets,
 * querying each chain's RPC for on-chain balance and nonce.
 *
 * Usage:
 *   # From env var (all chains with relay contracts)
 *   SEED_PHRASE="..." node scripts/seed-wallet-pool.mjs
 *
 *   # Specific chains only
 *   SEED_PHRASE="..." node scripts/seed-wallet-pool.mjs --chains 84532,11155111
 *
 *   # From AWS Secrets Manager
 *   node scripts/seed-wallet-pool.mjs --from-secrets-manager --profile MyProfile --region us-east-1
 */
import { parseArgs } from "node:util";
import {
  HDNodeWallet,
  Mnemonic,
  JsonRpcProvider,
  formatEther,
} from "ethers";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

// ── Constants (mirror packages/shared/src/constants.ts) ─────────────────────
const HD_BASE_PATH = "m/44'/60'/0'/0";
const WALLET_COUNT = 5;
const TABLE_WALLET_POOL = "StablecoinRelay-WalletPool";
const TABLE_NONCES = "StablecoinRelay-Nonces";
const SECRETS_KEY = "stablecoin-relay/hd-wallet-seed";

// Chains that have relay contracts deployed (mirror addresses.ts)
const RELAY_CHAIN_IDS = [1, 8453, 11155111, 84532];

const CHAIN_INFO = {
  1:        { name: "Ethereum",      nativeToken: "ETH",  rpcUrl: "https://eth.llamarpc.com" },
  8453:     { name: "Base",          nativeToken: "ETH",  rpcUrl: "https://mainnet.base.org" },
  11155111: { name: "Sepolia",       nativeToken: "ETH",  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" },
  84532:    { name: "Base Sepolia",  nativeToken: "ETH",  rpcUrl: "https://sepolia.base.org" },
};

// ── CLI args ────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    chains:               { type: "string" },
    "from-secrets-manager": { type: "boolean", default: false },
    profile:              { type: "string" },
    region:               { type: "string", default: "us-east-1" },
  },
  strict: false,
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function deriveWallets(seedPhrase) {
  const mnemonic = Mnemonic.fromPhrase(seedPhrase);
  const wallets = [];
  for (let i = 0; i < WALLET_COUNT; i++) {
    const hd = HDNodeWallet.fromMnemonic(mnemonic, `${HD_BASE_PATH}/${i}`);
    wallets.push({ index: i, address: hd.address });
  }
  return wallets;
}

async function getSeedFromSecretsManager(region, profile) {
  const clientOpts = { region };
  if (profile) {
    const { fromIni } = await import("@aws-sdk/credential-providers");
    clientOpts.credentials = fromIni({ profile });
  }
  const client = new SecretsManagerClient(clientOpts);
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: SECRETS_KEY }),
  );
  return result.SecretString;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Resolve seed phrase
  let seedPhrase;
  if (args["from-secrets-manager"]) {
    console.log(`Fetching seed phrase from Secrets Manager (region=${args.region})...`);
    seedPhrase = await getSeedFromSecretsManager(args.region, args.profile);
  } else {
    seedPhrase = process.env.SEED_PHRASE;
  }

  if (!seedPhrase) {
    console.error("Error: No seed phrase. Set SEED_PHRASE env var or use --from-secrets-manager");
    process.exit(1);
  }

  // 2. Determine chains
  const chainIds = args.chains
    ? args.chains.split(",").map(Number)
    : RELAY_CHAIN_IDS;

  for (const cid of chainIds) {
    if (!CHAIN_INFO[cid]) {
      console.error(`Error: Unknown chainId ${cid}`);
      process.exit(1);
    }
  }

  // 3. Derive wallets
  const wallets = deriveWallets(seedPhrase);
  console.log(`\nDerived ${wallets.length} wallets (BIP-44 ${HD_BASE_PATH}/{index}):`);
  for (const w of wallets) {
    console.log(`  [${w.index}] ${w.address}`);
  }

  // 4. DynamoDB client
  const ddbOpts = { region: args.region };
  if (args.profile) {
    const { fromIni } = await import("@aws-sdk/credential-providers");
    ddbOpts.credentials = fromIni({ profile: args.profile });
  }
  const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient(ddbOpts));

  // 5. Seed each chain
  const rows = [];
  for (const chainId of chainIds) {
    const info = CHAIN_INFO[chainId];
    console.log(`\nSeeding ${info.name} (chainId ${chainId})...`);
    const provider = new JsonRpcProvider(info.rpcUrl, chainId);

    for (const wallet of wallets) {
      const [balance, nonce] = await Promise.all([
        provider.getBalance(wallet.address),
        provider.getTransactionCount(wallet.address),
      ]);

      const balanceWei = balance.toString();

      // Write WalletPool entry
      await ddbClient.send(
        new PutCommand({
          TableName: TABLE_WALLET_POOL,
          Item: {
            chainId,
            address: wallet.address,
            status: "available",
            derivationIndex: wallet.index,
            lastUsed: new Date().toISOString(),
            balanceWei,
            currentNonce: nonce,
          },
        }),
      );

      // Write Nonces entry (don't overwrite existing)
      const noncePk = `${chainId}#${wallet.address}`;
      await ddbClient.send(
        new UpdateCommand({
          TableName: TABLE_NONCES,
          Key: { pk: noncePk },
          UpdateExpression: "SET currentNonce = if_not_exists(currentNonce, :nonce)",
          ExpressionAttributeValues: { ":nonce": nonce },
        }),
      );

      const balanceFmt = formatEther(balance);
      const status = balance === 0n ? "NEEDS FUNDING" : "OK";
      rows.push({ index: wallet.index, address: wallet.address, chain: info.name, balance: `${balanceFmt} ${info.nativeToken}`, nonce, status });
    }
  }

  // 6. Print summary
  console.log("\n" + "=".repeat(100));
  console.log("SEED SUMMARY");
  console.log("=".repeat(100));
  console.log(
    "Index".padEnd(7) +
    "Address".padEnd(44) +
    "Chain".padEnd(15) +
    "Balance".padEnd(22) +
    "Nonce".padEnd(7) +
    "Status",
  );
  console.log("-".repeat(100));
  for (const r of rows) {
    console.log(
      String(r.index).padEnd(7) +
      r.address.padEnd(44) +
      r.chain.padEnd(15) +
      r.balance.padEnd(22) +
      String(r.nonce).padEnd(7) +
      r.status,
    );
  }

  const needsFunding = rows.filter((r) => r.status === "NEEDS FUNDING").length;
  if (needsFunding > 0) {
    console.log(`\nWarning: ${needsFunding} wallet(s) need funding before they can relay transactions.`);
  } else {
    console.log("\nAll wallets funded and ready.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
