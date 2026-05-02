"use client";

import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import type { BrowserSolanaWallet } from "../lib/solana/client";

declare global {
  interface Window {
    solana?: BrowserSolanaWallet & {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: PublicKey;
    };
  }
}

interface WalletState {
  address: string | null;
  publicKey: PublicKey | null;
  walletClient: BrowserSolanaWallet | null;
  isConnected: boolean;
  isReady: boolean;
  walletClientType: string | null;
  connectorType: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    publicKey: null,
    walletClient: null,
    isConnected: false,
    isReady: false,
    walletClientType: null,
    connectorType: null,
  });

  const syncWallet = useCallback(() => {
    const wallet = window.solana;
    const publicKey = wallet?.publicKey ?? null;
    setState({
      address: publicKey?.toBase58() ?? null,
      publicKey,
      walletClient: wallet ?? null,
      isConnected: Boolean(wallet?.isConnected && publicKey),
      isReady: true,
      walletClientType: wallet?.isPhantom ? "phantom" : "solana",
      connectorType: "wallet-standard",
    });
  }, []);

  useEffect(() => {
    syncWallet();
    window.addEventListener("focus", syncWallet);
    return () => window.removeEventListener("focus", syncWallet);
  }, [syncWallet]);

  const login = useCallback(async () => {
    if (!window.solana) {
      window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
      return;
    }
    const result = await window.solana.connect?.();
    const publicKey = result?.publicKey ?? window.solana.publicKey ?? null;
    setState({
      address: publicKey?.toBase58() ?? null,
      publicKey,
      walletClient: window.solana,
      isConnected: Boolean(publicKey),
      isReady: true,
      walletClientType: window.solana.isPhantom ? "phantom" : "solana",
      connectorType: "wallet-standard",
    });
  }, []);

  const logout = useCallback(async () => {
    await window.solana?.disconnect?.();
    setState({
      address: null,
      publicKey: null,
      walletClient: window.solana ?? null,
      isConnected: false,
      isReady: true,
      walletClientType: null,
      connectorType: null,
    });
  }, []);

  return {
    ...state,
    isMiniPay: false,
    login,
    logout,
    chainId: null,
  };
}
