export interface TokenConfig {
  readonly symbol: string;
  readonly address: string;
  readonly decimals: number;
  readonly hasNativePermit: boolean;
}

export interface DexConfig {
  readonly name: string;
  readonly quoterV2Address: string;
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
    rpcUrl: "https://eth.llamarpc.com",
    blockExplorer: "https://etherscan.io",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        hasNativePermit: true,
      },
      USDT: {
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
        hasNativePermit: false, // Must use Permit2
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
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
        hasNativePermit: true,
      },
      USDT: {
        symbol: "USDT",
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        decimals: 6,
        hasNativePermit: false,
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
        hasNativePermit: true,
      },
      USDT: {
        symbol: "USDT",
        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        decimals: 6,
        hasNativePermit: false,
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
        hasNativePermit: true,
      },
      USDT: {
        symbol: "USDT",
        address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
        decimals: 6,
        hasNativePermit: false,
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
        hasNativePermit: true,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    },
    confirmationBlocks: 1,
  },
  56: {
    chainId: 56,
    name: "BSC",
    nativeToken: "BNB",
    rpcUrl: "https://bsc-dataseed.binance.org",
    blockExplorer: "https://bscscan.com",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        decimals: 18,
        hasNativePermit: false,
      },
      USDT: {
        symbol: "USDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
        hasNativePermit: false,
      },
    },
    dex: {
      name: "PancakeSwap V3",
      quoterV2Address: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
    },
    confirmationBlocks: 3,
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
        hasNativePermit: true,
      },
      USDT: {
        symbol: "USDT",
        address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        decimals: 6,
        hasNativePermit: false,
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
        hasNativePermit: true,
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
        hasNativePermit: true,
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
        hasNativePermit: true,
      },
    },
    dex: {
      name: "Uniswap V3",
      quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    },
    confirmationBlocks: 2,
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
