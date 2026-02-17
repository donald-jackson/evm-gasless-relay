export interface RelayRequest {
  chainId: number;
  token: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

export interface RelayQuote {
  chainId: number;
  token: string;
  fee: string;
  totalRequired: string;
  gasEstimate: string;
  gasPriceGwei: string;
  nativeTokenPriceUsd: string;
  expiresAt: string;
}

export type RelayStatusValue = "queued" | "pending" | "submitted" | "confirmed" | "failed";

export interface RelayStatus {
  requestId: string;
  status: RelayStatusValue;
  chainId: number;
  txHash?: string;
  fee?: string;
  createdAt: string;
  updatedAt: string;
  confirmations?: number;
  error?: string;
}

export type PoolWalletStatus = "available" | "busy" | "cooldown";

export interface PoolWallet {
  chainId: number;
  address: string;
  status: PoolWalletStatus;
  lastUsed?: string;
  derivationIndex: number;
  balanceWei?: string;
  currentNonce?: number;
}

export interface TransactionRecord {
  requestId: string;
  chainId: number;
  token: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  status: RelayStatusValue;
  relayerAddress?: string;
  txHash?: string;
  gasUsed?: string;
  gasPrice?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  error?: string;
}
