import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  getChainConfig,
  SUPPORTED_CHAIN_IDS,
  SQS_QUEUE_NAME,
  DYNAMODB_TABLE_TRANSACTIONS,
  MIN_RELAY_AMOUNT,
  MAX_RELAY_AMOUNT,
  isBlockedAddress,
} from "@stablecoin-relay/shared";
import type { TransactionRecord } from "@stablecoin-relay/shared";
import { logger } from "@stablecoin-relay/shared";
import { jsonResponse, errorResponse } from "../response.js";

const submitRequestSchema = z.object({
  chainId: z.number().refine((id) => SUPPORTED_CHAIN_IDS.includes(id), {
    message: "Unsupported chainId",
  }),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+$/),
  fee: z.string().regex(/^\d+$/),
  deadline: z.number().int().positive(),
  v: z.number().int().min(0).max(255),
  r: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  s: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const sqsClient = new SQSClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext?.requestId ?? "unknown";
  const startTime = Date.now();

  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = submitRequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn("Validation failed", { handler: "submit", correlationId });
      return errorResponse(400, "Invalid request", parsed.error.flatten());
    }

    const { chainId, token, from, to, amount, fee, deadline, v, r, s } = parsed.data;

    // OFAC sanctions check
    if (isBlockedAddress(from) || isBlockedAddress(to)) {
      logger.warn("Blocked sanctioned address", { handler: "submit", correlationId });
      return errorResponse(403, "Forbidden");
    }

    // Validate chain + token
    const chain = getChainConfig(chainId);
    const tokenConfig = Object.values(chain.tokens).find(
      (t) => t.address.toLowerCase() === token.toLowerCase(),
    );
    if (!tokenConfig) {
      return errorResponse(400, `Token ${token} not supported on ${chain.name}`);
    }

    // Validate amount bounds
    const amountBn = BigInt(amount);
    if (amountBn < MIN_RELAY_AMOUNT) {
      return errorResponse(400, "Amount below minimum relay amount");
    }
    if (amountBn > MAX_RELAY_AMOUNT) {
      return errorResponse(400, "Amount exceeds maximum relay amount");
    }

    // Validate deadline is in the future
    if (deadline <= Math.floor(Date.now() / 1000)) {
      return errorResponse(400, "Deadline has already passed");
    }

    const requestId = `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    // Store transaction record
    const record: TransactionRecord = {
      requestId,
      chainId,
      token,
      from,
      to,
      amount,
      fee,
      status: "queued",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await ddbClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE_TRANSACTIONS,
        Item: record,
      }),
    );

    // Enqueue to SQS
    const queueUrl = process.env.SQS_QUEUE_URL ?? `https://sqs.us-east-1.amazonaws.com/000000000000/${SQS_QUEUE_NAME}`;
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          requestId,
          chainId,
          token,
          from,
          to,
          amount,
          fee,
          deadline,
          v,
          r,
          s,
        }),
      }),
    );

    const durationMs = Date.now() - startTime;
    logger.info("Relay request queued", {
      handler: "submit",
      requestId,
      chainId,
      token,
      from,
      to,
      amount,
      fee: fee.toString(),
      durationMs,
      correlationId,
    });

    return jsonResponse(200, {
      requestId,
      status: "queued",
      estimatedWaitSeconds: 15,
    });
  } catch (err) {
    logger.error("Submit handler error", {
      handler: "submit",
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(500, "Internal server error");
  }
};
