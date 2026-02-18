import { useAccount, useSwitchChain } from "wagmi";
import { type Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermitSignature } from "@/hooks/usePermitSignature";
import type { ChainInfo } from "@/hooks/useChains";
import { ArrowLeft, Loader2 } from "lucide-react";

interface SignPermitProps {
  chain: ChainInfo;
  quote: { totalRequired: string };
  recipient: string;
  onSigned: (permit: { v: number; r: string; s: string; deadline: number }) => void;
  onBack: () => void;
}

export function SignPermit({ chain, quote, onSigned, onBack }: SignPermitProps) {
  const { address, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const token = chain.tokens[0];
  const spender = chain.relayContract as Address;

  const { sign, isPending, error, nonceLoaded } = usePermitSignature({
    chainId: chain.chainId,
    tokenAddress: token.address as Address,
    ownerAddress: address,
    spenderAddress: spender,
    value: BigInt(quote.totalRequired),
  });

  async function handleSign() {
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
      onSigned(result);
    }
  }

  const needsChainSwitch = walletChainId !== chain.chainId;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <CardTitle>Sign Permit</CardTitle>
            <CardDescription>
              Approve gasless transfer via EIP-2612 signature
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
          <p>
            You&apos;ll sign a typed message in your wallet. This does <strong>not</strong>{" "}
            submit a transaction or cost any gas. The relay will use this signature to
            transfer USDC on your behalf.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">
            {error.message.includes("rejected")
              ? "Signature rejected. Try again when ready."
              : error.message}
          </p>
        )}

        <Button
          className="w-full"
          onClick={handleSign}
          disabled={isPending || !nonceLoaded}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Waiting for signature...
            </>
          ) : needsChainSwitch ? (
            `Switch to ${chain.name} & Sign`
          ) : (
            "Sign Permit"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
