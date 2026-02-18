import { useChains, type ChainInfo } from "@/hooks/useChains";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const CHAIN_ICONS: Record<number, string> = {
  1: "E",
  8453: "B",
  11155111: "S",
  84532: "BS",
};

interface ChainSelectorProps {
  onSelect: (chain: ChainInfo) => void;
}

export function ChainSelector({ onSelect }: ChainSelectorProps) {
  const { data: chains, isLoading, error } = useChains();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Network</CardTitle>
        <CardDescription>Choose a chain with deployed relay contracts</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            Failed to load chains. Check that the API is reachable.
          </p>
        )}

        {chains && (
          <div className="grid grid-cols-2 gap-3">
            {chains.map((chain) => (
              <button
                key={chain.chainId}
                onClick={() => onSelect(chain)}
                className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {CHAIN_ICONS[chain.chainId] ?? chain.name.charAt(0)}
                </div>
                <span className="text-sm font-medium">{chain.name}</span>
                {(chain.chainId === 11155111 || chain.chainId === 84532) && (
                  <Badge variant="secondary" className="text-[10px]">
                    Testnet
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
