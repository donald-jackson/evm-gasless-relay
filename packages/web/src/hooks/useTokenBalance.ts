import { useReadContract } from "wagmi";
import { type Address } from "viem";

const balanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function useTokenBalance(
  tokenAddress: Address | undefined,
  userAddress: Address | undefined,
  chainId?: number,
) {
  return useReadContract({
    address: tokenAddress,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: {
      enabled: !!tokenAddress && !!userAddress,
      refetchInterval: 15_000,
    },
  });
}
