import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CHAIN_CONFIGS,
  RELAY_CONTRACTS,
} from "@stablecoin-relay/shared";
import { jsonResponse } from "../response.js";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const chains = Object.values(CHAIN_CONFIGS).map((chain) => ({
    chainId: chain.chainId,
    name: chain.name,
    nativeToken: chain.nativeToken,
    blockExplorer: chain.blockExplorer,
    relayContract: RELAY_CONTRACTS[chain.chainId] ?? null,
    tokens: Object.values(chain.tokens).map((token) => ({
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
    })),
  }));

  return jsonResponse(200, { chains });
};
