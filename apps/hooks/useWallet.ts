"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  type ConnectedStandardSolanaWallet,
  useSignTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useMemo } from "react";
import type { BrowserSolanaWallet } from "../lib/solana/client";

function getPrivyChain() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (cluster === "mainnet-beta") return "solana:mainnet" as const;
  if (cluster === "testnet") return "solana:testnet" as const;
  return "solana:devnet" as const;
}

function pickWallet(wallets: ConnectedStandardSolanaWallet[]) {
  return (
    wallets.find((wallet) => wallet.standardWallet.name === "Privy") ??
    wallets[0] ??
    null
  );
}

export function useWallet() {
  const {
    authenticated,
    login,
    logout,
    ready: privyReady,
  } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const selectedWallet = pickWallet(wallets);

  const walletClient = useMemo<BrowserSolanaWallet | null>(() => {
    if (!selectedWallet) return null;

    const publicKey = new PublicKey(selectedWallet.address);

    return {
      publicKey,
      signTransaction: async (transaction: Transaction) => {
        const { signedTransaction } = await signTransaction({
          chain: getPrivyChain(),
          transaction: transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
          wallet: selectedWallet,
        });
        return Transaction.from(signedTransaction);
      },
      signAllTransactions: async (transactions: Transaction[]) =>
        Promise.all(
          transactions.map(async (transaction) => {
            const { signedTransaction } = await signTransaction({
              chain: getPrivyChain(),
              transaction: transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
              }),
              wallet: selectedWallet,
            });
            return Transaction.from(signedTransaction);
          }),
        ),
      connect: async () => ({ publicKey }),
      disconnect: async () => logout(),
    };
  }, [logout, selectedWallet, signTransaction]);

  return {
    address: selectedWallet?.address ?? null,
    publicKey: walletClient?.publicKey ?? null,
    walletClient,
    isConnected: Boolean(authenticated && selectedWallet),
    isReady: privyReady && walletsReady,
    walletClientType: selectedWallet?.standardWallet.name ?? null,
    connectorType: selectedWallet ? "privy-solana" : null,
    isMiniPay: false,
    login,
    logout,
    chainId: null,
  };
}
