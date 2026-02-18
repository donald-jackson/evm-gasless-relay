import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/config/api";
import type { RelayStatus } from "@/types";

export function useRelayStatus(requestId: string | null) {
  return useQuery({
    queryKey: ["relay-status", requestId],
    queryFn: () => apiGet<RelayStatus>(`/relay/status/${requestId}`),
    enabled: !!requestId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "confirmed" || status === "failed") return false;
      return 3000;
    },
  });
}
