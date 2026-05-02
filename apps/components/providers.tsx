"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
const privyChain =
  cluster === "mainnet-beta"
    ? "solana:mainnet"
    : cluster === "testnet"
      ? "solana:testnet"
      : "solana:devnet";
const rpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const wsUrl =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? rpcUrl.replace(/^http/, "ws");

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
      config={{
        solana: {
          rpcs: {
            [privyChain]: {
              rpc: createSolanaRpc(rpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
            },
          },
        },
        appearance: {
          accentColor: "#8B5CF6",
          showWalletLoginFirst: false,
          walletChainType: "solana-only",
          walletList: [
            "phantom",
            "solflare",
            "backpack",
            "detected_solana_wallets",
          ],
        },
        loginMethods: ["email", "google", "passkey", "wallet"],
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({
              shouldAutoConnect: false,
            }),
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
