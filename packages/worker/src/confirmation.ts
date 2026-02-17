import { JsonRpcProvider } from "ethers";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  getChainConfig,
  DYNAMODB_TABLE_TRANSACTIONS,
} from "@stablecoin-relay/shared";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

export async function waitForConfirmation(
  requestId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const chain = getChainConfig(chainId);
  const provider = new JsonRpcProvider(chain.rpcUrl, chainId);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const receipt = await provider.getTransactionReceipt(txHash);

    if (receipt) {
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;

      if (confirmations >= chain.confirmationBlocks) {
        if (receipt.status === 1) {
          await updateTransactionConfirmed(requestId, txHash, receipt.gasUsed.toString());
          return;
        } else {
          await updateTransactionFailed(requestId, "Transaction reverted on-chain");
          return;
        }
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Timed out waiting for confirmation
  await updateTransactionFailed(requestId, "Confirmation timeout");
}

async function updateTransactionConfirmed(
  requestId: string,
  txHash: string,
  gasUsed: string,
): Promise<void> {
  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_TRANSACTIONS,
      Key: { requestId },
      UpdateExpression:
        "SET #status = :status, updatedAt = :now, confirmedAt = :now, gasUsed = :gasUsed",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "confirmed",
        ":now": new Date().toISOString(),
        ":gasUsed": gasUsed,
      },
    }),
  );
}

async function updateTransactionFailed(requestId: string, error: string): Promise<void> {
  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_TRANSACTIONS,
      Key: { requestId },
      UpdateExpression: "SET #status = :status, updatedAt = :now, #error = :error",
      ExpressionAttributeNames: { "#status": "status", "#error": "error" },
      ExpressionAttributeValues: {
        ":status": "failed",
        ":now": new Date().toISOString(),
        ":error": error,
      },
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
