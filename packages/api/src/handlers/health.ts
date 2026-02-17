import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import {
  DYNAMODB_TABLE_WALLET_POOL,
  SQS_QUEUE_NAME,
  SUPPORTED_CHAIN_IDS,
} from "@stablecoin-relay/shared";
import type { PoolWallet } from "@stablecoin-relay/shared";
import { logger } from "@stablecoin-relay/shared";
import { jsonResponse, errorResponse } from "../response.js";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqsClient = new SQSClient({});

export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    // Get wallet pool status
    const walletResult = await ddbClient.send(
      new ScanCommand({
        TableName: DYNAMODB_TABLE_WALLET_POOL,
      }),
    );

    const wallets = (walletResult.Items ?? []) as PoolWallet[];
    const walletsByChain: Record<number, { available: number; busy: number; cooldown: number }> = {};

    for (const chainId of SUPPORTED_CHAIN_IDS) {
      walletsByChain[chainId] = { available: 0, busy: 0, cooldown: 0 };
    }

    for (const wallet of wallets) {
      const chain = walletsByChain[wallet.chainId];
      if (chain) {
        chain[wallet.status]++;
      }
    }

    // Get queue depth
    let queueDepth = 0;
    try {
      const queueUrl =
        process.env.SQS_QUEUE_URL ??
        `https://sqs.us-east-1.amazonaws.com/000000000000/${SQS_QUEUE_NAME}`;
      const attrs = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["ApproximateNumberOfMessages"],
        }),
      );
      queueDepth = Number(attrs.Attributes?.ApproximateNumberOfMessages ?? 0);
    } catch {
      // Queue may not be available in local testing
    }

    return jsonResponse(200, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      walletPool: walletsByChain,
      queue: {
        depth: queueDepth,
      },
    });
  } catch (err) {
    logger.error("Health check failed", {
      handler: "health",
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(500, "Health check failed");
  }
};
