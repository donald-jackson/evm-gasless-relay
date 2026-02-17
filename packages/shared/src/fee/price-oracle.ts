import { Contract, JsonRpcProvider } from "ethers";
import { CHAIN_CONFIGS } from "../chains.js";
import { PRICE_CACHE_TTL_MS } from "../constants.js";

// Minimal QuoterV2 ABI for quoteExactInputSingle
const QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

// WETH/WBNB/WAVAX addresses per chain (used as tokenIn for price queries)
const WRAPPED_NATIVE: Record<number, string> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
  10: "0x4200000000000000000000000000000000000006", // WETH
  8453: "0x4200000000000000000000000000000000000006", // WETH
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX
  59144: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f", // WETH
  534352: "0x5300000000000000000000000000000000000004", // WETH
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // WETH Sepolia
};

// Pool fee tier to use for price queries (0.3% = 3000)
const DEFAULT_POOL_FEE = 3000;
// Query 1 ETH worth for price
const ONE_ETH = 1_000_000_000_000_000_000n;

interface CachedPrice {
  nativeTokenPriceInUsdc: number; // e.g., 3200.50 (in human-readable USDC)
  fetchedAt: number;
}

const priceCache = new Map<number, CachedPrice>();

export async function getNativeTokenPrice(chainId: number): Promise<number> {
  const cached = priceCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.nativeTokenPriceInUsdc;
  }

  const chain = CHAIN_CONFIGS[chainId];
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);

  const wNative = WRAPPED_NATIVE[chainId];
  if (!wNative) throw new Error(`No wrapped native token for chainId: ${chainId}`);

  // Find USDC on this chain
  const usdc = chain.tokens["USDC"];
  if (!usdc) throw new Error(`No USDC on chainId: ${chainId}`);

  const provider = new JsonRpcProvider(chain.rpcUrl, chainId);
  const quoter = new Contract(chain.dex.quoterV2Address, QUOTER_V2_ABI, provider);

  try {
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: wNative,
      tokenOut: usdc.address,
      amountIn: ONE_ETH,
      fee: DEFAULT_POOL_FEE,
      sqrtPriceLimitX96: 0n,
    });

    const amountOut = result[0] as bigint;
    const price = Number(amountOut) / 10 ** usdc.decimals;

    priceCache.set(chainId, {
      nativeTokenPriceInUsdc: price,
      fetchedAt: Date.now(),
    });

    return price;
  } catch {
    // Fallback to cached or default price on failure
    const fallback = priceCache.get(chainId);
    if (fallback) return fallback.nativeTokenPriceInUsdc;

    // Hardcoded fallback prices for reliability
    const fallbackPrices: Record<number, number> = {
      1: 3000,
      137: 0.5,
      42161: 3000,
      10: 3000,
      8453: 3000,
      56: 600,
      43114: 35,
      59144: 3000,
      534352: 3000,
      11155111: 3000,
    };
    return fallbackPrices[chainId] ?? 3000;
  }
}
