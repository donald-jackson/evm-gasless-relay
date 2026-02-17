import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  DYNAMODB_TABLE_WALLET_POOL,
  WALLET_COOLDOWN_MS,
} from "@stablecoin-relay/shared";
import type { PoolWallet, PoolWalletStatus } from "@stablecoin-relay/shared";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function acquireWallet(chainId: number): Promise<PoolWallet | null> {
  // Query wallets for this chain
  const result = await ddbClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE_WALLET_POOL,
      KeyConditionExpression: "chainId = :chainId",
      ExpressionAttributeValues: { ":chainId": chainId },
    }),
  );

  const wallets = (result.Items ?? []) as PoolWallet[];
  const now = Date.now();

  // Check cooldown wallets and promote them back to available
  for (const wallet of wallets) {
    if (wallet.status === "cooldown" && wallet.lastUsed) {
      const elapsed = now - new Date(wallet.lastUsed).getTime();
      if (elapsed >= WALLET_COOLDOWN_MS) {
        await updateWalletStatus(chainId, wallet.address, "available");
        wallet.status = "available";
      }
    }
  }

  // Find first available wallet
  const available = wallets.find((w) => w.status === "available");
  if (!available) {
    return null;
  }

  // Atomically set to busy using conditional update
  try {
    await ddbClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE_WALLET_POOL,
        Key: { chainId, address: available.address },
        UpdateExpression: "SET #status = :busy, lastUsed = :now",
        ConditionExpression: "#status = :available",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":busy": "busy",
          ":available": "available",
          ":now": new Date().toISOString(),
        },
      }),
    );
    return { ...available, status: "busy" };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === "ConditionalCheckFailedException"
    ) {
      // Another worker grabbed this wallet; try to find another
      return acquireWallet(chainId);
    }
    throw err;
  }
}

export async function releaseWallet(chainId: number, address: string): Promise<void> {
  await updateWalletStatus(chainId, address, "cooldown");
}

export async function updateWalletStatus(
  chainId: number,
  address: string,
  status: PoolWalletStatus,
): Promise<void> {
  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_WALLET_POOL,
      Key: { chainId, address },
      UpdateExpression: "SET #status = :status, lastUsed = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":now": new Date().toISOString(),
      },
    }),
  );
}
