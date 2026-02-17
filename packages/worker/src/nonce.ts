import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DYNAMODB_TABLE_NONCES } from "@stablecoin-relay/shared";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function getAndIncrementNonce(chainId: number, address: string): Promise<number> {
  const pk = `${chainId}#${address}`;

  const result = await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_NONCES,
      Key: { pk },
      UpdateExpression: "SET currentNonce = if_not_exists(currentNonce, :zero) + :one",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  // Return the nonce before increment (value - 1)
  const newNonce = result.Attributes?.currentNonce as number;
  return newNonce - 1;
}

export async function getCurrentNonce(chainId: number, address: string): Promise<number> {
  const pk = `${chainId}#${address}`;

  const result = await ddbClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE_NONCES,
      Key: { pk },
    }),
  );

  return (result.Item?.currentNonce as number) ?? 0;
}

export async function resetNonce(chainId: number, address: string, nonce: number): Promise<void> {
  const pk = `${chainId}#${address}`;

  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_NONCES,
      Key: { pk },
      UpdateExpression: "SET currentNonce = :nonce",
      ExpressionAttributeValues: {
        ":nonce": nonce,
      },
    }),
  );
}
