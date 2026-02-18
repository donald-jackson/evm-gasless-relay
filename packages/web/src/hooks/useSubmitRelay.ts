import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/config/api";
import type { RelayRequest } from "@/types";

interface SubmitResponse {
  requestId: string;
  status: string;
  estimatedWaitSeconds: number;
}

export function useSubmitRelay() {
  return useMutation({
    mutationFn: (req: RelayRequest) => apiPost<SubmitResponse>("/relay/submit", req),
  });
}
