import { describe, it, expect } from "vitest";
import { isBlockedAddress } from "../blocklist.js";

describe("isBlockedAddress", () => {
  it("returns true for a known Tornado Cash address", () => {
    expect(isBlockedAddress("0x722122dF12D4e14e13Ac3b6895a86e84145b6967")).toBe(true);
  });

  it("returns true for a known Lazarus Group address", () => {
    expect(isBlockedAddress("0x098B716B8Aaf21512996dC57EB0615e2383E2f96")).toBe(true);
  });

  it("returns true for a known Blender.io address", () => {
    expect(isBlockedAddress("0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c")).toBe(true);
  });

  it("is case-insensitive", () => {
    const upper = "0x722122DF12D4E14E13AC3B6895A86E84145B6967";
    const lower = "0x722122df12d4e14e13ac3b6895a86e84145b6967";
    const mixed = "0x722122Df12d4e14E13ac3B6895a86e84145b6967";

    expect(isBlockedAddress(upper)).toBe(true);
    expect(isBlockedAddress(lower)).toBe(true);
    expect(isBlockedAddress(mixed)).toBe(true);
  });

  it("returns false for a clean address", () => {
    expect(isBlockedAddress("0x1234567890123456789012345678901234567890")).toBe(false);
  });

  it("returns false for zero address", () => {
    expect(isBlockedAddress("0x0000000000000000000000000000000000000000")).toBe(false);
  });
});
