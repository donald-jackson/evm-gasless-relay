import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import {
  getChainConfig,
  SUPPORTED_CHAIN_IDS,
  QUOTE_EXPIRY_MS,
  FEE_MARGIN,
  MIN_FEE_USDC,
  DEFAULT_GAS_ESTIMATE,
} from "@stablecoin-relay/shared";
import { jsonResponse, errorResponse } from "../response.js";

const quoteRequestSchema = z.object({
  chainId: z.number().refine((id) => SUPPORTED_CHAIN_IDS.includes(id), {
    message: "Unsupported chainId",
  }),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+$/),
  sender: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = quoteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.flatten());
    }

    const { chainId, token, amount } = parsed.data;
    const chain = getChainConfig(chainId);

    // Verify token is supported on this chain
    const tokenConfig = Object.values(chain.tokens).find(
      (t) => t.address.toLowerCase() === token.toLowerCase(),
    );
    if (!tokenConfig) {
      return errorResponse(400, `Token ${token} not supported on ${chain.name}`);
    }

    // Simplified fee calculation (real implementation calls gas price oracle + DEX quoter)
    // For now, use defaults — fee system (section 6) will provide real values
    const gasEstimate = DEFAULT_GAS_ESTIMATE;
    const gasPriceGwei = "30"; // placeholder
    const nativeTokenPriceUsd = "3000.00"; // placeholder

    // fee = gasEstimate * gasPrice * nativePrice * (1 + margin), converted to token units
    const gasCostWei = gasEstimate * BigInt(gasPriceGwei) * 1_000_000_000n;
    const gasCostUsd =
      (Number(gasCostWei) / 1e18) * Number(nativeTokenPriceUsd);
    const feeUsd = gasCostUsd * (1 + FEE_MARGIN);
    const feeInTokenUnits = BigInt(
      Math.ceil(feeUsd * 10 ** tokenConfig.decimals),
    );
    const fee = feeInTokenUnits < MIN_FEE_USDC ? MIN_FEE_USDC : feeInTokenUnits;

    const totalRequired = BigInt(amount) + fee;
    const expiresAt = new Date(Date.now() + QUOTE_EXPIRY_MS).toISOString();

    return jsonResponse(200, {
      chainId,
      token,
      fee: fee.toString(),
      totalRequired: totalRequired.toString(),
      gasEstimate: gasEstimate.toString(),
      gasPriceGwei,
      nativeTokenPriceUsd,
      expiresAt,
    });
  } catch (err) {
    return errorResponse(500, "Internal server error");
  }
};
