
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Add debug logging for QuickNode endpoint
const quickNodeEndpoint = import.meta.env.VITE_QUICKNODE_ENDPOINT;
console.log("QuickNode Endpoint Config:", {
  exists: !!quickNodeEndpoint,
  value: quickNodeEndpoint || 'Not configured'
});

// Use QuickNode if configured, otherwise fall back to Solana's public mainnet-beta
const endpoint = quickNodeEndpoint || clusterApiUrl("mainnet-beta");
console.log("Using Solana endpoint:", endpoint);

const wallets = [new PhantomWalletAdapter()];

const App = () => (
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);

export default App;
