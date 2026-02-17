import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { JsonRpcProvider } from "ethers";
import {
  DYNAMODB_TABLE_WALLET_POOL,
  DYNAMODB_TABLE_NONCES,
  WALLET_COOLDOWN_MS,
  DEFAULT_GAS_ESTIMATE,
  getChainConfig,
} from "@stablecoin-relay/shared";
import type { PoolWallet, PoolWalletStatus } from "@stablecoin-relay/shared";
import { deriveWallets } from "./wallet.js";

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

  // Compute minimum balance required to cover relay gas
  const minBalance = await estimateMinBalance(chainId);

  // Find first available wallet with sufficient balance (prefer lowest derivation index)
  const available = wallets
    .filter((w) => w.status === "available" && BigInt(w.balanceWei ?? "0") >= minBalance)
    .sort((a, b) => (a.derivationIndex ?? 0) - (b.derivationIndex ?? 0))[0];
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

export async function estimateMinBalance(chainId: number): Promise<bigint> {
  const chain = getChainConfig(chainId);
  const provider = new JsonRpcProvider(chain.rpcUrl, chainId);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
  // 2x buffer over estimated relay gas cost
  return gasPrice * DEFAULT_GAS_ESTIMATE * 2n;
}

export async function updateWalletBalance(
  chainId: number,
  address: string,
  balanceWei: string,
): Promise<void> {
  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_WALLET_POOL,
      Key: { chainId, address },
      UpdateExpression: "SET balanceWei = :balance",
      ExpressionAttributeValues: { ":balance": balanceWei },
    }),
  );
}

export interface SeedResult {
  chainId: number;
  address: string;
  derivationIndex: number;
  balanceWei: string;
  currentNonce: number;
}

export async function seedWalletPool(
  seedPhrase: string,
  chainIds: number[],
): Promise<SeedResult[]> {
  const wallets = deriveWallets(seedPhrase);
  const results: SeedResult[] = [];

  for (const chainId of chainIds) {
    const chain = getChainConfig(chainId);
    const provider = new JsonRpcProvider(chain.rpcUrl, chainId);

    for (const wallet of wallets) {
      const [balance, nonce] = await Promise.all([
        provider.getBalance(wallet.address),
        provider.getTransactionCount(wallet.address),
      ]);

      const balanceWei = balance.toString();

      // Write to WalletPool table
      await ddbClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE_WALLET_POOL,
          Item: {
            chainId,
            address: wallet.address,
            status: "available" as PoolWalletStatus,
            derivationIndex: wallet.index,
            lastUsed: new Date().toISOString(),
            balanceWei,
            currentNonce: nonce,
          },
        }),
      );

      // Write to Nonces table (don't overwrite existing)
      const noncePk = `${chainId}#${wallet.address}`;
      await ddbClient.send(
        new UpdateCommand({
          TableName: DYNAMODB_TABLE_NONCES,
          Key: { pk: noncePk },
          UpdateExpression: "SET currentNonce = if_not_exists(currentNonce, :nonce)",
          ExpressionAttributeValues: { ":nonce": nonce },
        }),
      );

      results.push({
        chainId,
        address: wallet.address,
        derivationIndex: wallet.index,
        balanceWei,
        currentNonce: nonce,
      });
    }
  }

  return results;
}
