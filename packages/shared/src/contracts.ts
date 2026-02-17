import { Contract, InterfaceAbi, type Provider, type Signer } from "ethers";
import { STABLECOIN_RELAY_ABI, ERC20_ABI } from "./abi.js";
import { RELAY_CONTRACTS } from "./addresses.js";

export function getRelayContract(chainId: number, signerOrProvider: Signer | Provider): Contract {
  const address = RELAY_CONTRACTS[chainId];
  if (!address) {
    throw new Error(`No relay contract deployed on chainId ${chainId}`);
  }
  return new Contract(address, STABLECOIN_RELAY_ABI as InterfaceAbi, signerOrProvider);
}

export function getErc20Contract(
  tokenAddress: string,
  signerOrProvider: Signer | Provider,
): Contract {
  return new Contract(tokenAddress, ERC20_ABI as InterfaceAbi, signerOrProvider);
}
