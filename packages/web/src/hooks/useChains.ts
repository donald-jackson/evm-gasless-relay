import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/config/api";

export interface ChainInfo {
  chainId: number;
  name: string;
  nativeToken: string;
  blockExplorer: string;
  relayContract: string | null;
  tokens: { symbol: string; address: string; decimals: number }[];
}

interface ChainsResponse {
  chains: ChainInfo[];
}

export function useChains() {
  return useQuery({
    queryKey: ["chains"],
    queryFn: () => apiGet<ChainsResponse>("/chains"),
    staleTime: 5 * 60 * 1000,
    select: (data) => data.chains.filter((c) => c.relayContract !== null),
  });
}
