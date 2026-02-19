import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { type Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote } from "@/hooks/useQuote";
import { useAuthorizationSignature } from "@/hooks/useAuthorizationSignature";
import { formatUSDC, shortenAddress } from "@/lib/format";
import type { ChainInfo } from "@/hooks/useChains";
import type { RelayQuote } from "@/types";
import { ArrowLeft, Loader2 } from "lucide-react";

interface QuoteCardProps {
  chain: ChainInfo;
  recipient: string;
  amount: string;
  amountRaw: string;
  onConfirm: (quote: RelayQuote, auth: { v: number; r: string; s: string; validAfter: number; validBefore: number; nonce: string }) => void;
  onBack: () => void;
}

export function QuoteCard({
  chain,
  recipient,
  amount,
  amountRaw,
  onConfirm,
  onBack,
}: QuoteCardProps) {
  const { address, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const token = chain.tokens[0];
  const quoteMutation = useQuote();
  const [countdown, setCountdown] = useState<number | null>(null);

  const quote = quoteMutation.data;
  const relayContract = (quote?.relayContract ?? chain.relayContract) as Address;

  const { sign, isPending: isSigning, error: signError, ready } = useAuthorizationSignature({
    chainId: chain.chainId,
    tokenAddress: token.address as Address,
    ownerAddress: address,
    relayContractAddress: relayContract,
    value: quote ? BigInt(quote.totalRequired) : 0n,
  });

  useEffect(() => {
    if (!address || !token) return;
    quoteMutation.mutate({
      chainId: chain.chainId,
      token: token.address,
      amount: amountRaw,
      sender: address,
      recipient,
    });
    // Only fetch once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!quoteMutation.data?.expiresAt) return;
    const expiresAt = new Date(quoteMutation.data.expiresAt).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [quoteMutation.data?.expiresAt]);

  async function handleConfirm() {
    if (!quote) return;

    // Switch chain if needed
    if (walletChainId !== chain.chainId) {
      try {
        await switchChainAsync({ chainId: chain.chainId });
      } catch {
        return; // User rejected chain switch
      }
    }

    const result = await sign();
    if (result) {
      onConfirm(quote, result);
    }
  }

  const needsChainSwitch = walletChainId !== chain.chainId;
  const expired = countdown !== null && countdown <= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <CardTitle>Quote</CardTitle>
            <CardDescription>Review fee breakdown on {chain.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {quoteMutation.isPending && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        )}

        {quoteMutation.error && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Failed to get quote. Please try again.</p>
            <Button variant="outline" onClick={onBack}>
              Go Back
            </Button>
          </div>
        )}

        {quote && (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Send</span>
                <span>{amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To</span>
                <span className="font-mono">{shortenAddress(recipient)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Relay Fee</span>
                <span>{formatUSDC(quote.fee)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas Estimate</span>
                <span>{Number(quote.gasEstimate).toLocaleString()} gas</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total Required</span>
                <span>{formatUSDC(quote.totalRequired)} USDC</span>
              </div>
            </div>

            {countdown !== null && (
              <p className="text-center text-xs text-muted-foreground">
                Quote expires in {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, "0")}
              </p>
            )}

            {signError && (
              <p className="text-sm text-destructive">
                {signError.message.includes("rejected")
                  ? "Signature rejected. Try again when ready."
                  : signError.message}
              </p>
            )}

            <Button
              className="w-full"
              onClick={handleConfirm}
              disabled={expired || isSigning || !ready}
            >
              {isSigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for signature...
                </>
              ) : expired ? (
                "Quote Expired"
              ) : needsChainSwitch ? (
                `Switch to ${chain.name} & Confirm`
              ) : (
                "Confirm & Sign"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
