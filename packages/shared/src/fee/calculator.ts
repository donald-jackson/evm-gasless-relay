import { FEE_MARGIN, MIN_FEE_USDC, DEFAULT_GAS_ESTIMATE } from "../constants.js";
import { getGasPrice, gasPriceToGwei } from "./gas-price.js";
import { getNativeTokenPrice } from "./price-oracle.js";
import type { TokenConfig } from "../chains.js";

export interface FeeEstimate {
  fee: bigint;
  gasEstimate: bigint;
  gasPriceWei: bigint;
  gasPriceGwei: string;
  nativeTokenPriceUsd: string;
}

export async function calculateFee(
  chainId: number,
  tokenConfig: TokenConfig,
  gasEstimate: bigint = DEFAULT_GAS_ESTIMATE,
): Promise<FeeEstimate> {
  const gasData = await getGasPrice(chainId);
  const nativePrice = await getNativeTokenPrice(chainId);

  const gasPriceWei = gasData.maxFeePerGas ?? gasData.gasPriceWei;

  // gasCostInWei = gasEstimate * gasPriceWei
  // gasCostInEth = gasCostInWei / 1e18
  // gasCostInUsdc = gasCostInEth * nativePrice
  // fee = gasCostInUsdc * (1 + margin)
  const gasCostWei = gasEstimate * gasPriceWei;
  const gasCostInNative = Number(gasCostWei) / 1e18;
  const gasCostInUsdc = gasCostInNative * nativePrice;
  const feeUsdc = gasCostInUsdc * (1 + FEE_MARGIN);

  // Convert to token units
  const feeInTokenUnits = BigInt(Math.ceil(feeUsdc * 10 ** tokenConfig.decimals));

  // Apply minimum fee floor
  const fee = feeInTokenUnits < MIN_FEE_USDC ? MIN_FEE_USDC : feeInTokenUnits;

  return {
    fee,
    gasEstimate,
    gasPriceWei,
    gasPriceGwei: gasPriceToGwei(gasPriceWei),
    nativeTokenPriceUsd: nativePrice.toFixed(2),
  };
}
