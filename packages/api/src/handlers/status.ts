import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DYNAMODB_TABLE_TRANSACTIONS } from "@stablecoin-relay/shared";
import type { TransactionRecord } from "@stablecoin-relay/shared";
import { jsonResponse, errorResponse } from "../response.js";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const requestId = event.pathParameters?.requestId;
    if (!requestId) {
      return errorResponse(400, "Missing requestId");
    }

    const result = await ddbClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE_TRANSACTIONS,
        Key: { requestId },
      }),
    );

    if (!result.Item) {
      return errorResponse(404, "Request not found");
    }

    const record = result.Item as TransactionRecord;

    return jsonResponse(200, {
      requestId: record.requestId,
      status: record.status,
      chainId: record.chainId,
      txHash: record.txHash ?? null,
      fee: record.fee,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      confirmedAt: record.confirmedAt ?? null,
      error: record.error ?? null,
    });
  } catch (err) {
    return errorResponse(500, "Internal server error");
  }
};
