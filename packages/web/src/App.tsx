import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { config } from "@/config/wagmi";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { RelayFlow } from "@/components/relay/RelayFlow";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          customTheme={{
            "--ck-font-family": "Inter, system-ui, sans-serif",
          }}
        >
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex flex-1 items-start justify-center px-4 py-12">
              <RelayFlow />
            </main>
            <Footer />
          </div>
          <Toaster />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
