#!/usr/bin/env node
/**
 * Test CLI for the Stablecoin Relay on Base Sepolia.
 *
 * Usage:
 *   node scripts/test-relay-cli.mjs generate
 *     -> Creates a new random wallet, prints address & private key.
 *
 *   node scripts/test-relay-cli.mjs balance <address>
 *     -> Checks USDC and ETH balance on Base Sepolia.
 *
 *   node scripts/test-relay-cli.mjs relay --key <sender-private-key> --to <recipient> --amount <usdc-amount>
 *     -> Signs an EIP-2612 permit and submits a gasless relay via the on-chain contract.
 *        The sender needs USDC but NO ETH. A relayer wallet (from the HD seed) pays gas.
 *
 * Examples:
 *   node scripts/test-relay-cli.mjs generate
 *   node scripts/test-relay-cli.mjs balance 0xAbC...
 *   node scripts/test-relay-cli.mjs relay --key 0xabc... --to 0xdead... --amount 0.50
 */

import {
  Wallet,
  JsonRpcProvider,
  Contract,
  HDNodeWallet,
  Mnemonic,
  formatUnits,
  parseUnits,
  formatEther,
} from "ethers";

// ---------- Config ----------

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;
const RELAY_CONTRACT = "0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe";
const BLOCK_EXPLORER = "https://sepolia.basescan.org";

const DEV_SEED = process.env.SEED_PHRASE;
if (!DEV_SEED) {
  console.error("Error: SEED_PHRASE environment variable must be set");
  process.exit(1);
}
const RELAYER_INDEX = 0; // Use first HD wallet as relayer

const FEE_USDC = parseUnits("0.01", USDC_DECIMALS); // 0.01 USDC flat fee for testing

// ---------- ABIs ----------

const ERC20_PERMIT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function decimals() view returns (uint8)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

const RELAY_ABI = [
  "function relayWithPermit(address token, address from, address to, uint256 amount, uint256 fee, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "event Relayed(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 fee, address relayer)",
];

// ---------- Helpers ----------

function getProvider() {
  return new JsonRpcProvider(BASE_SEPOLIA_RPC, BASE_SEPOLIA_CHAIN_ID);
}

function getRelayerWallet(provider) {
  const mnemonic = Mnemonic.fromPhrase(DEV_SEED);
  const hd = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${RELAYER_INDEX}`);
  return hd.connect(provider);
}

function splitSignature(sig) {
  const bytes = Buffer.from(sig.slice(2), "hex");
  return {
    r: "0x" + bytes.subarray(0, 32).toString("hex"),
    s: "0x" + bytes.subarray(32, 64).toString("hex"),
    v: bytes[64],
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      parsed[key] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

// ---------- Commands ----------

async function cmdGenerate() {
  const wallet = Wallet.createRandom();
  console.log("\n  New Wallet Generated");
  console.log("  " + "-".repeat(58));
  console.log(`  Address:     ${wallet.address}`);
  console.log(`  Private Key: ${wallet.privateKey}`);
  console.log("\n  Next steps:");
  console.log(`  1. Send some USDC to ${wallet.address} on Base Sepolia`);
  console.log(`     USDC contract: ${USDC_ADDRESS}`);
  console.log(`     Faucet: https://faucet.circle.com/ (select Base Sepolia)`);
  console.log("  2. Run the relay command (no ETH needed!):");
  console.log(`     node scripts/test-relay-cli.mjs relay --key ${wallet.privateKey} --to <recipient> --amount 0.50\n`);
}

async function cmdBalance(address) {
  if (!address) {
    console.error("Usage: node scripts/test-relay-cli.mjs balance <address>");
    process.exit(1);
  }

  const provider = getProvider();
  const usdc = new Contract(USDC_ADDRESS, ERC20_PERMIT_ABI, provider);

  const [usdcBalance, ethBalance] = await Promise.all([
    usdc.balanceOf(address),
    provider.getBalance(address),
  ]);

  console.log(`\n  Balances for ${address} on Base Sepolia`);
  console.log("  " + "-".repeat(58));
  console.log(`  USDC: ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC`);
  console.log(`  ETH:  ${formatEther(ethBalance)} ETH`);

  if (usdcBalance === 0n) {
    console.log("\n  No USDC! Get test USDC from https://faucet.circle.com/ (select Base Sepolia)");
  }
  if (ethBalance === 0n) {
    console.log("  No ETH — that's fine! The relay pays gas for you.");
  }
  console.log();
}

async function cmdRelay(args) {
  const opts = parseArgs(args);
  const senderKey = opts.key;
  const recipient = opts.to;
  const amountStr = opts.amount;

  if (!senderKey || !recipient || !amountStr) {
    console.error("Usage: node scripts/test-relay-cli.mjs relay --key <private-key> --to <recipient> --amount <usdc>");
    console.error("Example: node scripts/test-relay-cli.mjs relay --key 0xabc... --to 0xdead... --amount 0.50");
    process.exit(1);
  }

  const provider = getProvider();
  const sender = new Wallet(senderKey, provider);
  const relayer = getRelayerWallet(provider);
  const usdc = new Contract(USDC_ADDRESS, ERC20_PERMIT_ABI, provider);
  const relay = new Contract(RELAY_CONTRACT, RELAY_ABI, relayer);

  const amount = parseUnits(amountStr, USDC_DECIMALS);
  const totalRequired = amount + FEE_USDC;

  console.log("\n  Stablecoin Relay — Base Sepolia");
  console.log("  " + "-".repeat(58));
  console.log(`  Sender:    ${sender.address}`);
  console.log(`  Recipient: ${recipient}`);
  console.log(`  Amount:    ${amountStr} USDC`);
  console.log(`  Fee:       ${formatUnits(FEE_USDC, USDC_DECIMALS)} USDC`);
  console.log(`  Total:     ${formatUnits(totalRequired, USDC_DECIMALS)} USDC`);
  console.log(`  Relayer:   ${relayer.address}`);

  // Check sender USDC balance
  const balance = await usdc.balanceOf(sender.address);
  console.log(`\n  Sender USDC balance: ${formatUnits(balance, USDC_DECIMALS)}`);
  if (balance < totalRequired) {
    console.error(`\n  ERROR: Insufficient USDC. Need ${formatUnits(totalRequired, USDC_DECIMALS)}, have ${formatUnits(balance, USDC_DECIMALS)}`);
    console.error("  Get test USDC from https://faucet.circle.com/ (select Base Sepolia)");
    process.exit(1);
  }

  // Check relayer ETH balance
  const relayerEth = await provider.getBalance(relayer.address);
  console.log(`  Relayer ETH balance: ${formatEther(relayerEth)}`);
  if (relayerEth === 0n) {
    console.error("\n  ERROR: Relayer has no ETH for gas. Fund the relayer first.");
    process.exit(1);
  }

  // Check sender ETH (just for display — should be 0!)
  const senderEth = await provider.getBalance(sender.address);
  console.log(`  Sender ETH balance:  ${formatEther(senderEth)} ${senderEth === 0n ? "(no gas needed!)" : ""}`);

  // --- Build EIP-2612 permit signature ---
  console.log("\n  Signing EIP-2612 permit...");

  const [nonce, tokenName, tokenVersion] = await Promise.all([
    usdc.nonces(sender.address),
    usdc.name(),
    usdc.version(),
  ]);

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    verifyingContract: USDC_ADDRESS,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    owner: sender.address,
    spender: RELAY_CONTRACT,
    value: totalRequired,
    nonce,
    deadline,
  };

  const signature = await sender.signTypedData(domain, types, message);
  const { v, r, s } = splitSignature(signature);
  console.log("  Permit signed successfully.");

  // --- Submit relay transaction ---
  console.log("  Submitting relay transaction...");

  const tx = await relay.relayWithPermit(
    USDC_ADDRESS,
    sender.address,
    recipient,
    amount,
    FEE_USDC,
    deadline,
    v,
    r,
    s,
  );

  console.log(`  TX hash: ${tx.hash}`);
  console.log(`  Explorer: ${BLOCK_EXPLORER}/tx/${tx.hash}`);
  console.log("  Waiting for confirmation...");

  const receipt = await tx.wait(1);
  console.log(`  Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`);

  // Verify final balances
  const [senderFinal, recipientBalance] = await Promise.all([
    usdc.balanceOf(sender.address),
    usdc.balanceOf(recipient),
  ]);

  console.log("\n  Result");
  console.log("  " + "-".repeat(58));
  console.log(`  Sender USDC:    ${formatUnits(balance, USDC_DECIMALS)} -> ${formatUnits(senderFinal, USDC_DECIMALS)}`);
  console.log(`  Recipient USDC: ${formatUnits(recipientBalance, USDC_DECIMALS)}`);
  console.log(`  Fee (to relayer): ${formatUnits(FEE_USDC, USDC_DECIMALS)} USDC`);
  console.log(`\n  Gasless transfer complete!\n`);
}

// ---------- Main ----------

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "generate":
    cmdGenerate();
    break;
  case "balance":
    cmdBalance(rest[0]);
    break;
  case "relay":
    cmdRelay(rest);
    break;
  default:
    console.log(`
  Stablecoin Relay Test CLI (Base Sepolia)

  Commands:
    generate                          Create a new wallet
    balance <address>                 Check USDC & ETH balance
    relay --key <key> --to <addr> --amount <usdc>
                                      Send USDC gaslessly via relay

  The sender needs USDC but NO ETH. A relayer wallet pays the gas.
`);
}
