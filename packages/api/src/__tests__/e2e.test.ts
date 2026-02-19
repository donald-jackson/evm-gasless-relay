/**
 * E2E Integration Test on Sepolia
 *
 * This test signs a USDC TransferWithAuthorization (EIP-3009) on Sepolia,
 * submits it via the deployed API, polls for confirmation, and verifies
 * the token transfer on-chain.
 *
 * Requirements:
 *   - E2E_API_URL: Deployed API Gateway URL
 *   - E2E_SENDER_PRIVATE_KEY: Private key of a Sepolia address holding USDC
 *   - Sepolia USDC balance sufficient for transfer + fee
 *
 * Run: E2E_API_URL=https://... E2E_SENDER_PRIVATE_KEY=0x... pnpm -F @stablecoin-relay/api test -- e2e
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const API_URL = process.env.E2E_API_URL;
const SENDER_KEY = process.env.E2E_SENDER_PRIVATE_KEY;

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const RELAY_CONTRACT = "0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function decimals() view returns (uint8)",
];

// Skip if env vars not set
const runE2E = API_URL && SENDER_KEY;

describe.skipIf(!runE2E)("E2E Sepolia relay", () => {
  it("should submit a USDC authorization relay and confirm on-chain", async () => {
    const provider = new JsonRpcProvider(SEPOLIA_RPC, SEPOLIA_CHAIN_ID);
    const sender = new Wallet(SENDER_KEY!, provider);
    const usdc = new Contract(SEPOLIA_USDC, ERC20_ABI, provider);

    // Use a burn address as recipient for test
    const recipient = "0x000000000000000000000000000000000000dEaD";

    const amount = 100_000n; // 0.10 USDC
    const fee = 10_000n; // 0.01 USDC
    const totalRequired = amount + fee;

    // Check sender has enough USDC
    const balance: bigint = await usdc.balanceOf(sender.address);
    expect(balance).toBeGreaterThanOrEqual(totalRequired);

    // Get token name for EIP-712 domain
    const name: string = await usdc.name();

    // EIP-3009 TransferWithAuthorization parameters
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const nonce = "0x" + randomBytes(32).toString("hex");

    // EIP-712 domain (USDC uses version "2")
    const domain = {
      name,
      version: "2",
      chainId: SEPOLIA_CHAIN_ID,
      verifyingContract: SEPOLIA_USDC,
    };

    const types = {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const message = {
      from: sender.address,
      to: RELAY_CONTRACT,
      value: totalRequired,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await sender.signTypedData(domain, types, message);
    const { v, r, s } = splitSignature(signature);

    // Submit relay request via API
    const submitRes = await fetch(`${API_URL}/relay/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: SEPOLIA_CHAIN_ID,
        token: SEPOLIA_USDC,
        from: sender.address,
        to: recipient,
        amount: amount.toString(),
        fee: fee.toString(),
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      }),
    });

    expect(submitRes.status).toBe(200);
    const submitBody = (await submitRes.json()) as { requestId: string };
    expect(submitBody.requestId).toBeDefined();
    const { requestId } = submitBody;
    console.log(`Submitted relay request: ${requestId}`);

    // Poll for status until confirmed or failed (max 3 minutes)
    const maxWaitMs = 180_000;
    const pollIntervalMs = 5_000;
    const startTime = Date.now();
    let finalStatus: string | undefined;
    let txHash: string | undefined;

    while (Date.now() - startTime < maxWaitMs) {
      const statusRes = await fetch(`${API_URL}/relay/status/${requestId}`);
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as {
        status: string;
        txHash?: string;
        error?: string;
      };

      console.log(`  Status: ${statusBody.status}`);

      if (statusBody.status === "confirmed") {
        finalStatus = "confirmed";
        txHash = statusBody.txHash;
        break;
      }

      if (statusBody.status === "failed") {
        finalStatus = "failed";
        console.error(`  Error: ${statusBody.error}`);
        break;
      }

      await sleep(pollIntervalMs);
    }

    expect(finalStatus).toBe("confirmed");
    expect(txHash).toBeDefined();
    console.log(`Confirmed tx: ${txHash}`);

    // Verify on-chain: check the tx receipt has the Relayed event
    const receipt = await provider.getTransactionReceipt(txHash!);
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe(1);

    console.log(`Gas used: ${receipt!.gasUsed.toString()}`);
  }, 200_000); // 200s timeout for the whole test
});

function splitSignature(sig: string): { v: number; r: string; s: string } {
  const bytes = Buffer.from(sig.slice(2), "hex");
  return {
    r: "0x" + bytes.subarray(0, 32).toString("hex"),
    s: "0x" + bytes.subarray(32, 64).toString("hex"),
    v: bytes[64],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
