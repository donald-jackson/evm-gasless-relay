/**
 * Derives the 5 relay EOAs from the HD seed phrase and checks their
 * native-token balances across all supported chains.
 *
 * Usage:
 *   node scripts/check-wallet-balances.mjs
 *
 * Set SEED_PHRASE env var to override the default dev seed.
 */
import { HDNodeWallet, Mnemonic, JsonRpcProvider, formatEther } from "ethers";

const HD_BASE_PATH = "m/44'/60'/0'/0";
const WALLET_COUNT = 5;

const DEV_SEED = null; // Set SEED_PHRASE env var

const CHAINS = [
  { chainId: 1, name: "Ethereum", nativeToken: "ETH", rpcUrl: "https://eth.llamarpc.com" },
  { chainId: 137, name: "Polygon", nativeToken: "MATIC", rpcUrl: "https://polygon-rpc.com" },
  { chainId: 42161, name: "Arbitrum", nativeToken: "ETH", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  { chainId: 10, name: "Optimism", nativeToken: "ETH", rpcUrl: "https://mainnet.optimism.io" },
  { chainId: 8453, name: "Base", nativeToken: "ETH", rpcUrl: "https://mainnet.base.org" },
  { chainId: 56, name: "BSC", nativeToken: "BNB", rpcUrl: "https://bsc-dataseed.binance.org" },
  { chainId: 43114, name: "Avalanche", nativeToken: "AVAX", rpcUrl: "https://api.avax.network/ext/bc/C/rpc" },
  { chainId: 59144, name: "Linea", nativeToken: "ETH", rpcUrl: "https://rpc.linea.build" },
  { chainId: 534352, name: "Scroll", nativeToken: "ETH", rpcUrl: "https://rpc.scroll.io" },
  { chainId: 11155111, name: "Sepolia", nativeToken: "ETH", rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" },
];

function deriveWallets(seedPhrase) {
  const mnemonic = Mnemonic.fromPhrase(seedPhrase);
  const wallets = [];
  for (let i = 0; i < WALLET_COUNT; i++) {
    const hd = HDNodeWallet.fromMnemonic(mnemonic, `${HD_BASE_PATH}/${i}`);
    wallets.push({ index: i, address: hd.address });
  }
  return wallets;
}

async function checkChainBalances(chain, wallets) {
  const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId);
  console.log(`\n=== ${chain.name} (chainId ${chain.chainId}) — ${chain.nativeToken} ===`);

  let totalBalance = 0n;
  let funded = 0;
  for (const w of wallets) {
    try {
      const balance = await provider.getBalance(w.address);
      totalBalance += balance;
      const formatted = formatEther(balance);
      const status = balance === 0n ? "⚠ NEEDS FUNDING" : "✓ OK";
      if (balance > 0n) funded++;
      console.log(`  [${w.index}] ${w.address}  ${formatted} ${chain.nativeToken}  ${status}`);
    } catch (err) {
      console.log(`  [${w.index}] ${w.address}  ERROR: ${err.message}`);
    }
  }
  console.log(`  Total: ${formatEther(totalBalance)} ${chain.nativeToken} (${funded}/${WALLET_COUNT} funded)`);
  return { chain: chain.name, funded, total: WALLET_COUNT };
}

async function main() {
  const seed = process.env.SEED_PHRASE;
  if (!seed) {
    console.error("Error: SEED_PHRASE environment variable must be set");
    process.exit(1);
  }
  const wallets = deriveWallets(seed);

  console.log("Relay EOA Addresses (BIP-44 m/44'/60'/0'/0/{index}):");
  console.log("─".repeat(60));
  for (const w of wallets) {
    console.log(`  [${w.index}] ${w.address}`);
  }

  console.log("\nChecking balances across all chains...");

  const results = [];
  for (const chain of CHAINS) {
    const result = await checkChainBalances(chain, wallets);
    results.push(result);
  }

  console.log("\n" + "─".repeat(60));
  console.log("SUMMARY:");
  for (const r of results) {
    const status = r.funded === r.total ? "ALL FUNDED" : `${r.funded}/${r.total} funded`;
    console.log(`  ${r.chain.padEnd(12)} ${status}`);
  }
  console.log("\nRecommended minimum per wallet:");
  console.log("  ETH chains (Ethereum, Arbitrum, Optimism, Base, Linea, Scroll): 0.01 ETH");
  console.log("  Polygon:    0.5 MATIC (POL)");
  console.log("  BSC:        0.01 BNB");
  console.log("  Avalanche:  0.1 AVAX");
  console.log("  Sepolia:    0.1 ETH (testnet, use faucet)");
}

main().catch(console.error);
