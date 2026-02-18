import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/config/api";
import type { RelayQuote } from "@/types";

interface QuoteRequest {
  chainId: number;
  token: string;
  amount: string;
  sender: string;
  recipient: string;
}

export function useQuote() {
  return useMutation({
    mutationFn: (req: QuoteRequest) => apiPost<RelayQuote>("/relay/quote", req),
  });
}
