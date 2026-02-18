import { useState } from "react";
import { useAccount } from "wagmi";
import { type Address, isAddress } from "viem";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { formatUSDC, parseUSDCInput } from "@/lib/format";
import type { ChainInfo } from "@/hooks/useChains";
import { ArrowLeft } from "lucide-react";

interface TransferFormProps {
  chain: ChainInfo;
  onSubmit: (recipient: string, amount: string, amountRaw: string) => void;
  onBack: () => void;
}

export function TransferForm({ chain, onSubmit, onBack }: TransferFormProps) {
  const { address } = useAccount();
  const token = chain.tokens[0];
  const { data: balance } = useTokenBalance(
    token?.address as Address | undefined,
    address,
    chain.chainId,
  );

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ recipient?: string; amount?: string }>({});

  function validate() {
    const errs: typeof errors = {};
    if (!isAddress(recipient)) errs.recipient = "Invalid Ethereum address";
    if (recipient.toLowerCase() === address?.toLowerCase())
      errs.recipient = "Cannot send to yourself";

    const parsed = parseUSDCInput(amount);
    if (!parsed || parsed <= 0n) {
      errs.amount = "Enter a valid amount";
    } else if (parsed < 100_000n) {
      errs.amount = "Minimum 0.10 USDC";
    } else if (balance !== undefined && parsed > balance) {
      errs.amount = "Insufficient balance";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const raw = parseUSDCInput(amount)!;
    onSubmit(recipient, amount, raw.toString());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <CardTitle>Transfer USDC</CardTitle>
            <CardDescription>on {chain.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="font-mono text-sm"
            />
            {errors.recipient && (
              <p className="text-xs text-destructive">{errors.recipient}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Amount (USDC)</Label>
              {balance !== undefined && (
                <button
                  type="button"
                  onClick={() => setAmount(formatUSDC(balance))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Balance: {formatUSDC(balance)} USDC
                </button>
              )}
            </div>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount}</p>
            )}
          </div>

          <Button type="submit" className="w-full">
            Get Quote
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
