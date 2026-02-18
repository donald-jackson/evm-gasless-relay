import { useReducer } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChainSelector } from "./ChainSelector";
import { TransferForm } from "./TransferForm";
import { QuoteCard } from "./QuoteCard";
import { StatusTracker } from "./StatusTracker";
import { useSubmitRelay } from "@/hooks/useSubmitRelay";
import type { ChainInfo } from "@/hooks/useChains";
import type { RelayQuote } from "@/types";

type Step =
  | "select-chain"
  | "enter-details"
  | "review-quote"
  | "tracking";

interface FlowState {
  step: Step;
  chain: ChainInfo | null;
  recipient: string;
  amount: string;
  amountRaw: string;
  requestId: string | null;
}

type FlowAction =
  | { type: "SELECT_CHAIN"; chain: ChainInfo }
  | { type: "SET_DETAILS"; recipient: string; amount: string; amountRaw: string }
  | { type: "START_TRACKING" }
  | { type: "SET_TRACKING"; requestId: string }
  | { type: "BACK" }
  | { type: "RESET" };

const initialState: FlowState = {
  step: "select-chain",
  chain: null,
  recipient: "",
  amount: "",
  amountRaw: "",
  requestId: null,
};

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SELECT_CHAIN":
      return { ...state, step: "enter-details", chain: action.chain };
    case "SET_DETAILS":
      return {
        ...state,
        step: "review-quote",
        recipient: action.recipient,
        amount: action.amount,
        amountRaw: action.amountRaw,
      };
    case "START_TRACKING":
      return { ...state, step: "tracking" };
    case "SET_TRACKING":
      return { ...state, step: "tracking", requestId: action.requestId };
    case "BACK": {
      const steps: Step[] = ["select-chain", "enter-details", "review-quote"];
      const idx = steps.indexOf(state.step);
      if (idx > 0) return { ...state, step: steps[idx - 1] };
      return state;
    }
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function RelayFlow() {
  const { isConnected, address } = useAccount();
  const [state, dispatch] = useReducer(reducer, initialState);
  const submitMutation = useSubmitRelay();

  if (!isConnected) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Gasless USDC Transfers</CardTitle>
          <p className="text-sm text-muted-foreground">
            Send USDC without needing native tokens for gas
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Connect your wallet to get started</p>
          <ConnectKitButton />
        </CardContent>
      </Card>
    );
  }

  function handleConfirm(quote: RelayQuote, permit: { v: number; r: string; s: string; deadline: number }) {
    if (!state.chain || !address) return;

    submitMutation.mutate({
      chainId: state.chain.chainId,
      token: quote.token,
      from: address,
      to: state.recipient,
      amount: (BigInt(quote.totalRequired) - BigInt(quote.fee)).toString(),
      fee: quote.fee,
      deadline: permit.deadline,
      v: permit.v,
      r: permit.r,
      s: permit.s,
    });

    dispatch({ type: "START_TRACKING" });
  }

  function handleReset() {
    submitMutation.reset();
    dispatch({ type: "RESET" });
  }

  return (
    <div className="w-full max-w-lg">
      {state.step === "select-chain" && (
        <ChainSelector onSelect={(chain) => dispatch({ type: "SELECT_CHAIN", chain })} />
      )}

      {state.step === "enter-details" && state.chain && (
        <TransferForm
          chain={state.chain}
          onSubmit={(recipient, amount, amountRaw) =>
            dispatch({ type: "SET_DETAILS", recipient, amount, amountRaw })
          }
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}

      {state.step === "review-quote" && state.chain && (
        <QuoteCard
          chain={state.chain}
          recipient={state.recipient}
          amount={state.amount}
          amountRaw={state.amountRaw}
          onConfirm={handleConfirm}
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}

      {state.step === "tracking" && state.chain && (
        <StatusTracker
          chain={state.chain}
          submitMutation={submitMutation}
          requestId={state.requestId}
          onRequestId={(id) => dispatch({ type: "SET_TRACKING", requestId: id })}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
