import { useCallback, useState } from "react";
import { useSignTypedData, useReadContract } from "wagmi";
import { type Address, parseSignature } from "viem";
import {
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  buildAuthorizationDomain,
  buildAuthorizationMessage,
  generateRandomNonce,
  ERC3009_ABI,
} from "@/lib/authorization";

interface AuthorizationResult {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
}

interface UseAuthorizationSignatureParams {
  chainId: number;
  tokenAddress: Address;
  ownerAddress: Address | undefined;
  relayContractAddress: Address;
  value: bigint;
}

export function useAuthorizationSignature({
  chainId,
  tokenAddress,
  ownerAddress,
  relayContractAddress,
  value,
}: UseAuthorizationSignatureParams) {
  const [result, setResult] = useState<AuthorizationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: ERC3009_ABI,
    functionName: "name",
    chainId,
  });

  const { signTypedDataAsync } = useSignTypedData();

  const sign = useCallback(async () => {
    if (!ownerAddress || !tokenName) {
      setError(new Error("Wallet not connected or contract data not loaded"));
      return null;
    }

    setIsPending(true);
    setError(null);

    try {
      const validAfter = 0n;
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
      const nonce = generateRandomNonce();

      const domain = buildAuthorizationDomain(chainId, tokenAddress, tokenName);
      const message = buildAuthorizationMessage(
        ownerAddress,
        relayContractAddress,
        value,
        validAfter,
        validBefore,
        nonce,
      );

      const signature = await signTypedDataAsync({
        domain,
        types: RECEIVE_WITH_AUTHORIZATION_TYPES,
        primaryType: "ReceiveWithAuthorization",
        message,
      });

      const { v, r, s } = parseSignature(signature);
      const authResult: AuthorizationResult = {
        v: Number(v),
        r,
        s,
        validAfter: Number(validAfter),
        validBefore: Number(validBefore),
        nonce,
      };

      setResult(authResult);
      return authResult;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setIsPending(false);
    }
  }, [ownerAddress, tokenName, chainId, tokenAddress, relayContractAddress, value, signTypedDataAsync]);

  return { sign, result, error, isPending, ready: !!tokenName && !!ownerAddress };
}
