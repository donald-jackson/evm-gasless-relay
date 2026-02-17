import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CHAIN_CONFIGS,
  RELAY_CONTRACTS,
  PERMIT2_ADDRESS,
} from "@stablecoin-relay/shared";
import { jsonResponse } from "../response.js";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const chains = Object.values(CHAIN_CONFIGS).map((chain) => ({
    chainId: chain.chainId,
    name: chain.name,
    nativeToken: chain.nativeToken,
    blockExplorer: chain.blockExplorer,
    relayContract: RELAY_CONTRACTS[chain.chainId] ?? null,
    permit2: PERMIT2_ADDRESS,
    tokens: Object.values(chain.tokens).map((token) => ({
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
      hasNativePermit: token.hasNativePermit,
    })),
  }));

  return jsonResponse(200, { chains });
};
