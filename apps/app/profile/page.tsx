"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useWallet } from "../../hooks/useWallet";
import { usePlayerLog } from "../../hooks/usePlayerLog";
import { createSolanaConnection } from "../../lib/solana/connection";
import { getSolanaCluster } from "../../lib/solana/config";
import { paymentAta } from "../../lib/solana/token";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { UserIcon } from "../../components/icons";

const isPaymentMintConfigured = Boolean(process.env.NEXT_PUBLIC_PAYMENT_MINT);

function useFaucetCooldown(address: string | undefined) {
  const [cooldowns, setCooldowns] = useState({ sol: 0, usdc: 0 });
  const [remaining, setRemaining] = useState({ sol: 0, usdc: 0 });
  const cooldownsRef = useRef(cooldowns);
  cooldownsRef.current = cooldowns;

  useEffect(() => {
    if (!address) return;
    fetch(`/api/faucet?address=${address}`)
      .then((r) => r.json())
      .then((d) =>
        setCooldowns({
          sol: d.solCooldownUntil ?? d.cooldownUntil ?? 0,
          usdc: d.usdcCooldownUntil ?? d.cooldownUntil ?? 0,
        }),
      )
      .catch(() => {});
  }, [address]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setRemaining({
        sol: Math.max(0, cooldownsRef.current.sol - now),
        usdc: Math.max(0, cooldownsRef.current.usdc - now),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const setClaimed = useCallback((asset: "sol" | "usdc") => {
    setCooldowns((current) => ({
      ...current,
      [asset]: Date.now() + 8 * 60 * 60 * 1000,
    }));
  }, []);

  return {
    solOnCooldown: remaining.sol > 0,
    usdcOnCooldown: remaining.usdc > 0,
    solRemaining: remaining.sol,
    usdcRemaining: remaining.usdc,
    setClaimed,
  };
}

function formatCountdown(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function formatUsdc(raw: bigint) {
  return (Number(raw) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export default function ProfilePage() {
  const { address, publicKey, isConnected, isReady, login, logout } =
    useWallet();
  const { stats } = usePlayerLog(address);
  const [solBalance, setSolBalance] = useState(0n);
  const [usdcBalance, setUsdcBalance] = useState(0n);
  const [copied, setCopied] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState<"sol" | "usdc" | null>(
    null,
  );
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const faucet = useFaucetCooldown(address ?? undefined);

  const refreshBalances = useCallback(async () => {
    if (!publicKey) return;
    const connection = createSolanaConnection();
    const lamports = await connection.getBalance(publicKey);
    const token = isPaymentMintConfigured
      ? await connection
          .getTokenAccountBalance(paymentAta(publicKey))
          .catch(() => null)
      : null;
    setSolBalance(BigInt(lamports));
    setUsdcBalance(BigInt(token?.value.amount ?? "0"));
  }, [publicKey]);

  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 10_000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  const handleFaucet = async (asset: "sol" | "usdc") => {
    if (!address) return;
    if (asset === "sol" && faucet.solOnCooldown) return;
    if (asset === "usdc" && faucet.usdcOnCooldown) return;
    if (asset === "usdc" && !isPaymentMintConfigured) {
      setFaucetMsg("Payment mint is not configured");
      return;
    }
    setFaucetLoading(asset);
    setFaucetMsg(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, asset }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.cooldownUntil) faucet.setClaimed(asset);
        setFaucetMsg(data.error ?? "Claim failed");
      } else {
        faucet.setClaimed(asset);
        setFaucetMsg(
          asset === "sol"
            ? `+${data.solAmount ?? "0.05"} SOL received`
            : `+${data.tokenAmount ?? "3.00"} USDC received`,
        );
        setTimeout(refreshBalances, 3000);
      }
    } catch {
      setFaucetMsg("Faucet error. Try again.");
    } finally {
      setFaucetLoading(null);
    }
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-20">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-purple-400/20 border-2 border-primary/30 flex items-center justify-center shadow-lg">
          <UserIcon className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-display font-bold text-text-primary mb-1">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm font-sans">
            Connect Solana wallet to view profile and balances
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  const initials = address.slice(0, 2).toUpperCase();
  const solFormatted = (Number(solBalance) / LAMPORTS_PER_SOL).toFixed(4);
  const winRate =
    stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-24">
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 flex items-center justify-center text-2xl font-bold font-display text-primary mb-3">
          {initials}
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 text-xs font-mono mt-1 transition-colors ${
            copied ? "text-success" : "text-text-secondary active:text-text-primary"
          }`}
        >
          {copied
            ? "Copied!"
            : `${address.slice(0, 6)}...${address.slice(-4)} · tap to copy`}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bg-card rounded-2xl p-4 shadow-sm">
          <p className="text-text-secondary text-xs font-sans mb-1">
            SOL Balance
          </p>
          <p className="text-text-primary font-bold font-display text-xl">
            {solFormatted}
          </p>
          <p className="text-text-secondary text-[10px] font-sans mt-0.5">
            {getSolanaCluster()}
          </p>
        </div>
        <div className="bg-bg-card rounded-2xl p-4 shadow-sm">
          <p className="text-text-secondary text-xs font-sans mb-1">
            USDC Balance
          </p>
          <p className="text-text-primary font-bold font-display text-xl">
            {formatUsdc(usdcBalance)}
          </p>
          <p className="text-text-secondary text-[10px] font-sans mt-0.5">
            {isPaymentMintConfigured ? "Mock USDC" : "Not configured"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1">
        <button
          onClick={() => handleFaucet("sol")}
          disabled={faucetLoading !== null || faucet.solOnCooldown}
          className={`w-full py-3 rounded-2xl font-semibold text-xs font-sans transition-all border ${
            faucet.solOnCooldown
              ? "bg-bg-card border-black/10 text-text-secondary cursor-not-allowed"
              : "bg-primary/20 border-primary/40 text-primary hover:bg-primary/30 hover:border-primary/60 active:opacity-70"
          } disabled:opacity-60`}
        >
          {faucetLoading === "sol"
            ? "Claiming..."
            : faucet.solOnCooldown
              ? formatCountdown(faucet.solRemaining)
              : "Claim SOL"}
        </button>
        <button
          onClick={() => handleFaucet("usdc")}
          disabled={
            faucetLoading !== null ||
            faucet.usdcOnCooldown ||
            !isPaymentMintConfigured
          }
          className={`w-full py-3 rounded-2xl font-semibold text-xs font-sans transition-all border ${
            faucet.usdcOnCooldown || !isPaymentMintConfigured
              ? "bg-bg-card border-black/10 text-text-secondary cursor-not-allowed"
              : "bg-blue-500/20 border-blue-500/40 text-blue-500 hover:bg-blue-500/30 hover:border-blue-500/60 active:opacity-70"
          } disabled:opacity-60`}
        >
          {faucetLoading === "usdc"
            ? "Claiming..."
            : !isPaymentMintConfigured
              ? "Mint missing"
              : faucet.usdcOnCooldown
                ? formatCountdown(faucet.usdcRemaining)
                : "Claim USDC"}
        </button>
      </div>
      <div className="min-h-[1.25rem] mb-4 text-center">
        {faucetMsg && (
          <p
            className={`text-xs font-sans ${
              faucetMsg.startsWith("+") ? "text-success" : "text-error"
            }`}
          >
            {faucetMsg}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: "Games", value: stats.total },
          { label: "Wins", value: stats.wins },
          { label: "Win Rate", value: `${winRate}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-bg-card rounded-2xl p-3 text-center shadow-sm"
          >
            <p className="text-text-primary font-bold font-display text-lg">
              {value}
            </p>
            <p className="text-text-secondary text-[10px] font-sans">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-bg-card rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-text-primary text-sm font-semibold font-sans">
              Network
            </p>
            <p className="text-text-secondary text-xs font-sans mt-0.5">
              Solana {getSolanaCluster()}
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-success" />
        </div>
        <button
          onClick={logout}
          className="w-full py-3 rounded-2xl border border-error/30 text-error text-sm font-semibold font-sans transition-all hover:bg-error/10 hover:border-error/60 active:scale-[0.98] active:opacity-70"
        >
          Disconnect Wallet
        </button>
      </div>
    </div>
  );
}
