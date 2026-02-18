import { createConfig, http } from "wagmi";
import { mainnet, base, sepolia, baseSepolia } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

export const config = createConfig(
  getDefaultConfig({
    chains: [mainnet, base, sepolia, baseSepolia],
    transports: {
      [mainnet.id]: http("https://eth.llamarpc.com"),
      [base.id]: http("https://mainnet.base.org"),
      [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
      [baseSepolia.id]: http("https://sepolia.base.org"),
    },
    walletConnectProjectId: "0e171917a3dab7ae9a102acd50497afe",
    appName: "Stablecoin Relay",
    appDescription: "Gasless stablecoin transfers using EIP-2612 permits",
  }),
);

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
