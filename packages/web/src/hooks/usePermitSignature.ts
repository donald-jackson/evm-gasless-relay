import { useCallback, useState } from "react";
import { useSignTypedData, useReadContract } from "wagmi";
import { type Address, parseSignature } from "viem";
import {
  PERMIT_TYPES,
  buildPermitDomain,
  buildPermitMessage,
  ERC20_PERMIT_ABI,
} from "@/lib/permit";

interface PermitResult {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
  deadline: number;
}

interface UsePermitSignatureParams {
  chainId: number;
  tokenAddress: Address;
  ownerAddress: Address | undefined;
  spenderAddress: Address;
  value: bigint;
}

export function usePermitSignature({
  chainId,
  tokenAddress,
  ownerAddress,
  spenderAddress,
  value,
}: UsePermitSignatureParams) {
  const [result, setResult] = useState<PermitResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: ERC20_PERMIT_ABI,
    functionName: "name",
    chainId,
  });

  const { data: nonce, refetch: refetchNonce } = useReadContract({
    address: tokenAddress,
    abi: ERC20_PERMIT_ABI,
    functionName: "nonces",
    args: ownerAddress ? [ownerAddress] : undefined,
    chainId,
    query: { enabled: !!ownerAddress, staleTime: 0 },
  });

  const { signTypedDataAsync } = useSignTypedData();

  const sign = useCallback(async () => {
    if (!ownerAddress || nonce === undefined || !tokenName) {
      setError(new Error("Wallet not connected or contract data not loaded"));
      return null;
    }

    setIsPending(true);
    setError(null);

    try {
      // Refetch nonce to ensure it's current (may have changed after previous relay)
      const { data: freshNonce } = await refetchNonce();
      const currentNonce = freshNonce ?? nonce;

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
      const domain = buildPermitDomain(chainId, tokenAddress, tokenName);
      const message = buildPermitMessage(ownerAddress, spenderAddress, value, currentNonce, deadline);

      const signature = await signTypedDataAsync({
        domain,
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message,
      });

      const { v, r, s } = parseSignature(signature);
      const permitResult: PermitResult = {
        v: Number(v),
        r,
        s,
        deadline: Number(deadline),
      };

      setResult(permitResult);
      return permitResult;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setIsPending(false);
    }
  }, [ownerAddress, nonce, tokenName, chainId, tokenAddress, spenderAddress, value, signTypedDataAsync, refetchNonce]);

  return { sign, result, error, isPending, nonceLoaded: nonce !== undefined && !!tokenName };
}
