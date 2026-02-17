import type { SQSHandler, SQSRecord } from "aws-lambda";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  getChainConfig,
  STABLECOIN_RELAY_ABI,
  RELAY_CONTRACTS,
  DYNAMODB_TABLE_TRANSACTIONS,
  SECRETS_MANAGER_SEED_KEY,
  MAX_RETRY_ATTEMPTS,
} from "@stablecoin-relay/shared";
import type { RelayStatusValue } from "@stablecoin-relay/shared";
import { deriveWallets, type DerivedWallet } from "./wallet.js";
import { acquireWallet, releaseWallet } from "./pool.js";
import { getAndIncrementNonce } from "./nonce.js";
import { waitForConfirmation } from "./confirmation.js";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

let cachedSeed: string | null = null;
let cachedWallets: Map<number, DerivedWallet[]> = new Map();

async function getSeedPhrase(): Promise<string> {
  if (cachedSeed) return cachedSeed;

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SECRETS_MANAGER_SEED_KEY }),
  );
  cachedSeed = result.SecretString ?? "";
  return cachedSeed;
}

function getWalletsForChain(seed: string, chainId: number): DerivedWallet[] {
  if (!cachedWallets.has(chainId)) {
    cachedWallets.set(chainId, deriveWallets(seed));
  }
  return cachedWallets.get(chainId)!;
}

interface RelayMessage {
  requestId: string;
  chainId: number;
  token: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

async function updateTransactionStatus(
  requestId: string,
  status: RelayStatusValue,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const updateParts = ["#status = :status", "updatedAt = :now"];
  const values: Record<string, unknown> = {
    ":status": status,
    ":now": new Date().toISOString(),
  };

  for (const [key, val] of Object.entries(extra)) {
    updateParts.push(`${key} = :${key}`);
    values[`:${key}`] = val;
  }

  await ddbClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE_TRANSACTIONS,
      Key: { requestId },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: values,
    }),
  );
}

async function processRelayMessage(msg: RelayMessage): Promise<void> {
  const { requestId, chainId, token, from, to, amount, fee, deadline, v, r, s } = msg;
  const chain = getChainConfig(chainId);
  const relayAddress = RELAY_CONTRACTS[chainId];

  if (!relayAddress) {
    await updateTransactionStatus(requestId, "failed", {
      error: `No relay contract on chainId ${chainId}`,
    });
    return;
  }

  // Acquire a wallet from the pool
  const poolWallet = await acquireWallet(chainId);
  if (!poolWallet) {
    throw new Error(`No available wallet for chainId ${chainId}, requestId ${requestId}`);
  }

  try {
    // Get the derived wallet that matches the pool wallet
    const seed = await getSeedPhrase();
    const wallets = getWalletsForChain(seed, chainId);
    const derivedWallet = wallets.find(
      (w) => w.address.toLowerCase() === poolWallet.address.toLowerCase(),
    );
    if (!derivedWallet) {
      throw new Error(`Pool wallet ${poolWallet.address} not found in derived wallets`);
    }

    const provider = new JsonRpcProvider(chain.rpcUrl, chainId);
    const signer = new Wallet(derivedWallet.privateKey, provider);
    const relay = new Contract(relayAddress, STABLECOIN_RELAY_ABI, signer);

    // Get nonce from DynamoDB atomic counter
    const nonce = await getAndIncrementNonce(chainId, poolWallet.address);

    await updateTransactionStatus(requestId, "pending", {
      relayerAddress: poolWallet.address,
    });

    // Send the transaction
    const tx = await relay.relayWithPermit(token, from, to, amount, fee, deadline, v, r, s, {
      nonce,
    });

    await updateTransactionStatus(requestId, "submitted", {
      txHash: tx.hash,
    });

    // Wait for confirmation
    await waitForConfirmation(requestId, tx.hash, chainId);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateTransactionStatus(requestId, "failed", {
      error: errorMsg,
    });
    throw err;
  } finally {
    await releaseWallet(chainId, poolWallet.address);
  }
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const msg: RelayMessage = JSON.parse(record.body);
    await processRelayMessage(msg);
  }
};
