import { JsonRpcProvider } from "ethers";
import { PRICE_CACHE_TTL_MS } from "../constants.js";
import { CHAIN_CONFIGS } from "../chains.js";

interface CachedGasPrice {
  gasPriceWei: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  fetchedAt: number;
}

const gasPriceCache = new Map<number, CachedGasPrice>();

// Chains that support EIP-1559
const EIP1559_CHAINS = new Set([1, 137, 42161, 10, 8453, 59144, 534352, 11155111]);

export async function getGasPrice(chainId: number): Promise<CachedGasPrice> {
  const cached = gasPriceCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached;
  }

  const chain = CHAIN_CONFIGS[chainId];
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);

  const provider = new JsonRpcProvider(chain.rpcUrl, chainId);

  let result: CachedGasPrice;

  if (EIP1559_CHAINS.has(chainId)) {
    const feeData = await provider.getFeeData();
    result = {
      gasPriceWei: feeData.gasPrice ?? 0n,
      maxFeePerGas: feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
      fetchedAt: Date.now(),
    };
  } else {
    const feeData = await provider.getFeeData();
    result = {
      gasPriceWei: feeData.gasPrice ?? 0n,
      fetchedAt: Date.now(),
    };
  }

  gasPriceCache.set(chainId, result);
  return result;
}

export function gasPriceToGwei(gasPriceWei: bigint): string {
  return (Number(gasPriceWei) / 1e9).toFixed(2);
}
