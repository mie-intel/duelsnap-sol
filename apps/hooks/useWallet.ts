"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  type ConnectedStandardSolanaWallet,
  useSignTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrowserSolanaWallet } from "../lib/solana/client";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58: () => string };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBase58: () => string };
  }>;
  disconnect?: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

function getPrivyChain() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (cluster === "mainnet-beta") return "solana:mainnet" as const;
  if (cluster === "testnet") return "solana:testnet" as const;
  return "solana:devnet" as const;
}

function pickWallet(wallets: ConnectedStandardSolanaWallet[]) {
  return (
    wallets.find((wallet) => wallet.standardWallet.name === "Phantom") ??
    wallets.find((wallet) => wallet.standardWallet.name === "Privy") ??
    wallets[0] ??
    null
  );
}

function getPhantomProvider() {
  if (typeof window === "undefined") return null;
  const provider = window.solana;
  return provider?.isPhantom ? provider : null;
}

export function useWallet() {
  const {
    authenticated,
    login: privyLogin,
    logout: privyLogout,
    ready: privyReady,
  } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const selectedWallet = pickWallet(wallets);
  const [phantom, setPhantom] = useState<{
    provider: PhantomProvider;
    publicKey: PublicKey;
  } | null>(null);

  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) return;

    provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        setPhantom({
          provider,
          publicKey: new PublicKey(publicKey.toBase58()),
        });
      })
      .catch(() => {});
  }, []);

  const privyWalletClient = useMemo<BrowserSolanaWallet | null>(() => {
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
      disconnect: async () => privyLogout(),
    };
  }, [privyLogout, selectedWallet, signTransaction]);

  const phantomWalletClient = useMemo<BrowserSolanaWallet | null>(() => {
    if (!phantom) return null;

    return {
      publicKey: phantom.publicKey,
      signTransaction: (transaction: Transaction) =>
        phantom.provider.signTransaction(transaction),
      signAllTransactions: (transactions: Transaction[]) =>
        phantom.provider.signAllTransactions
          ? phantom.provider.signAllTransactions(transactions)
          : Promise.all(
              transactions.map((transaction) =>
                phantom.provider.signTransaction(transaction),
              ),
            ),
      connect: async () => ({ publicKey: phantom.publicKey }),
      disconnect: async () => {
        await phantom.provider.disconnect?.();
        setPhantom(null);
      },
    };
  }, [phantom]);

  const login = useCallback(async () => {
    const provider = getPhantomProvider();
    if (provider) {
      const { publicKey } = await provider.connect();
      setPhantom({
        provider,
        publicKey: new PublicKey(publicKey.toBase58()),
      });
      return;
    }

    privyLogin();
  }, [privyLogin]);

  const logout = useCallback(async () => {
    if (phantom) {
      await phantom.provider.disconnect?.();
      setPhantom(null);
    }
    await privyLogout();
  }, [phantom, privyLogout]);

  const walletClient = phantomWalletClient ?? privyWalletClient;
  const address =
    phantom?.publicKey.toBase58() ?? selectedWallet?.address ?? null;

  return {
    address,
    publicKey: walletClient?.publicKey ?? null,
    walletClient,
    isConnected: Boolean(phantom || (authenticated && selectedWallet)),
    isReady: privyReady && walletsReady,
    walletClientType: phantom
      ? "Phantom"
      : selectedWallet?.standardWallet.name ?? null,
    connectorType: phantom
      ? "phantom-extension"
      : selectedWallet
        ? "privy-solana"
        : null,
    isMiniPay: false,
    login,
    logout,
    chainId: null,
  };
}
