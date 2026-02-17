import { describe, it, expect } from "vitest";
import { deriveWallets } from "../wallet.js";

const TEST_SEED = "assault pepper guess recipe alter emerge hungry catalog damage drift expire erase";

describe("wallet derivation", () => {
  it("derives 5 wallets by default", () => {
    const wallets = deriveWallets(TEST_SEED);
    expect(wallets).toHaveLength(5);
  });

  it("each wallet has unique address and private key", () => {
    const wallets = deriveWallets(TEST_SEED);
    const addresses = wallets.map((w) => w.address);
    const keys = wallets.map((w) => w.privateKey);

    expect(new Set(addresses).size).toBe(5);
    expect(new Set(keys).size).toBe(5);
  });

  it("addresses are valid Ethereum addresses", () => {
    const wallets = deriveWallets(TEST_SEED);
    for (const wallet of wallets) {
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  });

  it("produces deterministic results", () => {
    const wallets1 = deriveWallets(TEST_SEED);
    const wallets2 = deriveWallets(TEST_SEED);

    for (let i = 0; i < wallets1.length; i++) {
      expect(wallets1[i].address).toBe(wallets2[i].address);
      expect(wallets1[i].privateKey).toBe(wallets2[i].privateKey);
    }
  });

  it("derives correct first address from known seed", () => {
    const wallets = deriveWallets(TEST_SEED);
    // This is the address derived from index 0 of the test seed
    expect(wallets[0].address).toBe("0x4BAC59ff1950eB92ff875C545E3ac02bbE90D9Eb");
  });

  it("respects custom count parameter", () => {
    const wallets = deriveWallets(TEST_SEED, 3);
    expect(wallets).toHaveLength(3);
  });

  it("indices are sequential starting from 0", () => {
    const wallets = deriveWallets(TEST_SEED);
    for (let i = 0; i < wallets.length; i++) {
      expect(wallets[i].index).toBe(i);
    }
  });
});
