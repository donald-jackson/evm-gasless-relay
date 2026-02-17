import { HDNodeWallet, Mnemonic, JsonRpcProvider, Wallet } from "ethers";
import {
  HD_DERIVATION_BASE_PATH,
  WALLETS_PER_CHAIN,
  getChainConfig,
} from "@stablecoin-relay/shared";

export interface DerivedWallet {
  index: number;
  address: string;
  privateKey: string;
}

export function deriveWallets(seedPhrase: string, count: number = WALLETS_PER_CHAIN): DerivedWallet[] {
  const mnemonic = Mnemonic.fromPhrase(seedPhrase);
  const wallets: DerivedWallet[] = [];

  for (let i = 0; i < count; i++) {
    const path = `${HD_DERIVATION_BASE_PATH}/${i}`;
    const hdWallet = HDNodeWallet.fromMnemonic(mnemonic, path);
    wallets.push({
      index: i,
      address: hdWallet.address,
      privateKey: hdWallet.privateKey,
    });
  }

  return wallets;
}

export function getSignerForWallet(
  wallet: DerivedWallet,
  chainId: number,
): Wallet {
  const chain = getChainConfig(chainId);
  const provider = new JsonRpcProvider(chain.rpcUrl, chainId);
  return new Wallet(wallet.privateKey, provider);
}
