import type { Address } from "viem";

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function buildPermitDomain(chainId: number, usdcAddress: Address, tokenName: string) {
  return {
    name: tokenName,
    version: "2",
    chainId: BigInt(chainId),
    verifyingContract: usdcAddress,
  } as const;
}

export function buildPermitMessage(
  owner: Address,
  spender: Address,
  value: bigint,
  nonce: bigint,
  deadline: bigint,
) {
  return {
    owner,
    spender,
    value,
    nonce,
    deadline,
  } as const;
}

export const ERC20_PERMIT_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;
