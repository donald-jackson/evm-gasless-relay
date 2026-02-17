export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export const RELAY_CONTRACTS: Record<number, string> = {
  // Mainnet — populate after running contracts/script/deploy-all-chains.sh
  // 1: "",        // Ethereum
  // 137: "",      // Polygon
  // 42161: "",    // Arbitrum
  // 10: "",       // Optimism
  // 8453: "",     // Base
  // 56: "",       // BSC
  // 43114: "",    // Avalanche
  // 59144: "",    // Linea
  // 534352: "",   // Scroll

  // Sepolia testnet
  11155111: "0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe",
};
