const DEFAULT_RELAY_CONTRACTS: Record<number, string> = {
  // Mainnet
  1: "0x6ccd718cc41951e3ba30713294eaaac128821fc3", // Ethereum
  8453: "0xfba7c2757b2e378a72e7fcfe65978c9a31af86d9", // Base

  // Mainnet — not yet deployed
  // 137: "",      // Polygon
  // 42161: "",    // Arbitrum
  // 10: "",       // Optimism
  // 43114: "",    // Avalanche
  // 59144: "",    // Linea
  // 534352: "",   // Scroll

  // Sepolia testnet
  11155111: "0x46128bb6b1ec3a714e9608cc0321d24b7df214eb",

  // Base Sepolia testnet
  84532: "0xf28394ad1a5a2b53e51b3abAce0B1ce07B88102f",
};

function loadRelayContracts(): Record<number, string> {
  const envJson = typeof process !== "undefined" ? process.env.RELAY_CONTRACTS_JSON : undefined;
  if (!envJson) return DEFAULT_RELAY_CONTRACTS;
  try {
    const parsed = JSON.parse(envJson) as Record<string, string>;
    const result: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      result[Number(k)] = v;
    }
    return result;
  } catch {
    return DEFAULT_RELAY_CONTRACTS;
  }
}

export const RELAY_CONTRACTS: Record<number, string> = loadRelayContracts();
