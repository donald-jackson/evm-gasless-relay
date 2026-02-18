export function formatUSDC(amount: bigint | string): string {
  const raw = typeof amount === "string" ? BigInt(amount) : amount;
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (fracStr === "") return `${whole.toLocaleString()}.00`;
  return `${whole.toLocaleString()}.${fracStr.padEnd(2, "0")}`;
}

export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function parseUSDCInput(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || isNaN(Number(trimmed))) return null;
  const parts = trimmed.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(frac);
}
