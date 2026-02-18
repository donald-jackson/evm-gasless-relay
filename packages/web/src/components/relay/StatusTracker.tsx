import { useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRelayStatus } from "@/hooks/useRelayStatus";
import { TransactionLink } from "./TransactionLink";
import type { ChainInfo } from "@/hooks/useChains";
import type { RelayStatusValue } from "@/types";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
interface SubmitMutationState {
  data?: { requestId: string } | null;
  isPending: boolean;
  error: Error | null;
}

interface StatusTrackerProps {
  chain: ChainInfo;
  submitMutation: SubmitMutationState;
  requestId: string | null;
  onRequestId: (id: string) => void;
  onReset: () => void;
}

const STEPS: { key: RelayStatusValue; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "pending", label: "Pending" },
  { key: "submitted", label: "Submitted" },
  { key: "confirmed", label: "Confirmed" },
];

function stepIndex(status: RelayStatusValue): number {
  if (status === "failed") return -1;
  return STEPS.findIndex((s) => s.key === status);
}

export function StatusTracker({
  chain,
  submitMutation,
  requestId,
  onRequestId,
  onReset,
}: StatusTrackerProps) {
  const activeRequestId = requestId ?? submitMutation.data?.requestId ?? null;
  const { data: status } = useRelayStatus(activeRequestId);

  const stableOnRequestId = useCallback(
    (id: string) => onRequestId(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Sync mutation result to parent state
  useEffect(() => {
    if (submitMutation.data?.requestId && !requestId) {
      stableOnRequestId(submitMutation.data.requestId);
    }
  }, [submitMutation.data?.requestId, requestId, stableOnRequestId]);

  const currentStatus = status?.status ?? "queued";
  const currentIdx = stepIndex(currentStatus);
  const isFailed = currentStatus === "failed";
  const isConfirmed = currentStatus === "confirmed";

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>
          {isFailed ? "Transfer Failed" : isConfirmed ? "Transfer Complete" : "Processing Transfer"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {submitMutation.isPending && !activeRequestId && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting to relay...
          </div>
        )}

        {submitMutation.error && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-destructive">
              Failed to submit: {submitMutation.error.message}
            </p>
            <Button variant="outline" onClick={onReset}>
              Start Over
            </Button>
          </div>
        )}

        {activeRequestId && (
          <>
            {/* Step progress */}
            <div className="space-y-3">
              {STEPS.map((step, i) => {
                const isActive = i === currentIdx && !isConfirmed;
                const isDone = i < currentIdx || isConfirmed;

                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center">
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : isActive ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : isFailed && i === 0 ? (
                        <XCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <span
                      className={
                        isDone
                          ? "text-sm text-emerald-400"
                          : isActive
                            ? "text-sm font-medium text-foreground"
                            : "text-sm text-muted-foreground/40"
                      }
                    >
                      {step.label}
                    </span>
                    {isActive && !isFailed && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        In Progress
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {isFailed && status?.error && (
              <p className="text-center text-sm text-destructive">{status.error}</p>
            )}

            {status?.txHash && (
              <div className="text-center">
                <p className="mb-1 text-xs text-muted-foreground">Transaction</p>
                <TransactionLink txHash={status.txHash} blockExplorer={chain.blockExplorer} />
              </div>
            )}

            <div className="text-center text-xs text-muted-foreground">
              Request ID: <span className="font-mono">{activeRequestId}</span>
            </div>

            {(isConfirmed || isFailed) && (
              <Button className="w-full" onClick={onReset}>
                New Transfer
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
