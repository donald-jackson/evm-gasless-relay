import type { TransactionRecord } from "../types.js";

export interface FeeRecycleResult {
  requestId: string;
  chainId: number;
  estimatedFee: string;
  actualGasCost: string;
  profit: string;
  overchargePercent: number;
}

export function analyzeFeeAccuracy(
  record: TransactionRecord,
  actualGasUsed: bigint,
  actualGasPriceWei: bigint,
  nativeTokenPrice: number,
  tokenDecimals: number,
): FeeRecycleResult {
  // Calculate actual gas cost in token units
  const actualGasCostWei = actualGasUsed * actualGasPriceWei;
  const actualGasCostInNative = Number(actualGasCostWei) / 1e18;
  const actualGasCostInToken = BigInt(
    Math.ceil(actualGasCostInNative * nativeTokenPrice * 10 ** tokenDecimals),
  );

  const estimatedFee = BigInt(record.fee);
  const profit = estimatedFee - actualGasCostInToken;
  const overchargePercent =
    actualGasCostInToken > 0n
      ? Number((profit * 10000n) / actualGasCostInToken) / 100
      : 0;

  return {
    requestId: record.requestId,
    chainId: record.chainId,
    estimatedFee: estimatedFee.toString(),
    actualGasCost: actualGasCostInToken.toString(),
    profit: profit.toString(),
    overchargePercent,
  };
}
