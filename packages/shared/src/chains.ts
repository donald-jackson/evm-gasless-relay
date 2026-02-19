export interface TokenConfig {
  readonly symbol: string;
  readonly address: string;
  readonly decimals: number;
}

export interface DexConfig {
  readonly name: string;
  readonly quoterV2Address: string;
  readonly swapRouterAddress?: string;
}

export interface ChainConfig {
  readonly chainId: number;
  readonly name: string;
  readonly nativeToken: string;
  readonly rpcUrl: string;
  readonly blockExplorer: string;
  readonly tokens: Record<string, TokenConfig>;
  readonly dex: DexConfig;
  readonly confirmationBlocks: number;
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    nativeToken: "ETH",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    blockExplorer: "https://etherscan.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      swapRouterAddress: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    },
    confirmationBlocks: 2,
  },
  137: {
    chainId: 137,
    name: "Polygon",
    nativeToken: "MATIC",
    rpcUrl: "https://polygon-rpc.com",
    blockExplorer: "https://polygonscan.com",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 5,
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    nativeToken: "ETH",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 1,
  },
  10: {
    chainId: 10,
    name: "Optimism",
    nativeToken: "ETH",
    rpcUrl: "https://mainnet.optimism.io",
    blockExplorer: "https://optimistic.etherscan.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 1,
  },
  8453: {
    chainId: 8453,
    name: "Base",
    nativeToken: "ETH",
    rpcUrl: "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
      swapRouterAddress: "0x2626664c2603336E57B271c5C0b26F421741e481",
    },
    confirmationBlocks: 1,
  },
  43114: {
    chainId: 43114,
    name: "Avalanche",
    nativeToken: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockExplorer: "https://snowtrace.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
    },
    confirmationBlocks: 3,
  },
  59144: {
    chainId: 59144,
    name: "Linea",
    nativeToken: "ETH",
    rpcUrl: "https://rpc.linea.build",
    blockExplorer: "https://lineascan.build",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 2,
  },
  534352: {
    chainId: 534352,
    name: "Scroll",
    nativeToken: "ETH",
    rpcUrl: "https://rpc.scroll.io",
    blockExplorer: "https://scrollscan.com",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 2,
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    nativeToken: "ETH",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    blockExplorer: "https://sepolia.etherscan.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 2,
  },
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    nativeToken: "ETH",
    rpcUrl: "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 1,
  },
} as const;

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIGS).map(Number);

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  return config;
}
