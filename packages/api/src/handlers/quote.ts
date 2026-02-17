import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import {
  getChainConfig,
  SUPPORTED_CHAIN_IDS,
  QUOTE_EXPIRY_MS,
  calculateFee,
  isBlockedAddress,
} from "@stablecoin-relay/shared";
import { logger } from "@stablecoin-relay/shared";
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
  const startTime = Date.now();
  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = quoteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.flatten());
    }

    const { chainId, token, amount, sender, recipient } = parsed.data;

    // OFAC sanctions check
    if (isBlockedAddress(sender) || isBlockedAddress(recipient)) {
      logger.warn("Blocked sanctioned address", { handler: "quote" });
      return errorResponse(403, "Forbidden");
    }

    const chain = getChainConfig(chainId);

    // Verify token is supported on this chain
    const tokenConfig = Object.values(chain.tokens).find(
      (t) => t.address.toLowerCase() === token.toLowerCase(),
    );
    if (!tokenConfig) {
      return errorResponse(400, `Token ${token} not supported on ${chain.name}`);
    }

    const feeData = await calculateFee(chainId, tokenConfig);
    const fee = feeData.fee;

    const totalRequired = BigInt(amount) + fee;
    const expiresAt = new Date(Date.now() + QUOTE_EXPIRY_MS).toISOString();

    logger.info("Quote generated", {
      handler: "quote",
      chainId,
      token,
      amount,
      fee: fee.toString(),
      durationMs: Date.now() - startTime,
    });

    return jsonResponse(200, {
      chainId,
      token,
      fee: fee.toString(),
      totalRequired: totalRequired.toString(),
      gasEstimate: feeData.gasEstimate.toString(),
      gasPriceGwei: feeData.gasPriceGwei,
      nativeTokenPriceUsd: feeData.nativeTokenPriceUsd,
      expiresAt,
    });
  } catch (err) {
    logger.error("Quote handler error", {
      handler: "quote",
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(500, "Internal server error");
  }
};
