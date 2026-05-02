"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "../../../hooks/useWallet";
import { usePlayerLog } from "../../../hooks/usePlayerLog";
import { createSolanaConnection } from "../../../lib/solana/connection";
import {
  createBrowserDuelpicProgram,
  createPaymentAtaInstruction,
  sendWalletTransaction,
} from "../../../lib/solana/client";
import { getPaymentMint, getTreasuryAddress } from "../../../lib/solana/config";
import {
  configPda,
  dailyPlayPda,
  questionPda,
  royaltyPda,
  royaltyVaultAuthorityPda,
} from "../../../lib/solana/pda";
import { paymentAta } from "../../../lib/solana/token";
import Button from "../../../components/ui/Button";
import Spinner from "../../../components/ui/Spinner";
import GameEngine, {
  type Question,
  type QuestionResult,
} from "../../../components/game/GameEngine";

const SECONDS_FREE = 30;
const FREE_DAILY_LIMIT = 3;
const PAID_FEE_RAW = 30_000;

type Phase = "lobby" | "playing" | "done";

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    if (/<!DOCTYPE|<html/i.test(text)) {
      throw new Error(
        "API returned HTML instead of JSON. Check the server logs for the failing /api route.",
      );
    }
    throw new Error(text.slice(0, 160) || "Invalid API response");
  }
}

export default function CasualPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPaid = searchParams.get("mode") === "paid";
  const { isReady, isConnected, address, walletClient, login } = useWallet();
  const { addEntry } = usePlayerLog(address);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);

  const playerPublicKey = address ? new PublicKey(address) : null;

  function currentDayId() {
    return Math.floor(Date.now() / 86_400_000);
  }

  const checkDailyLimit = useCallback(async () => {
    if (!playerPublicKey) return;
    try {
      const connection = createSolanaConnection();
      const { createReadonlyDuelpicProgram } = await import(
        "../../../lib/solana/program"
      );
      const program = createReadonlyDuelpicProgram(connection);
      const daily = await program.account.dailyPlay.fetch(
        dailyPlayPda(playerPublicKey, currentDayId()),
      );
      setDailyCount(Number(daily.count));
    } catch {
      setDailyCount(0);
    }
  }, [playerPublicKey]);

  const startFreeGame = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      const count = dailyCount ?? 0;
      if (count >= FREE_DAILY_LIMIT) {
        setError(
          `Daily limit reached (${FREE_DAILY_LIMIT}/day). Come back tomorrow!`,
        );
        setLoading(false);
        return;
      }
      const seed = Math.floor(Math.random() * 1e12);
      const res = await fetch(`/api/game/questions?count=5&seed=${seed}`);
      const data = await readJsonResponse<{
        questions?: Question[];
        error?: string;
      }>(res);
      if (!res.ok || !data.questions?.length)
        throw new Error(data.error ?? "No questions");
      setQuestions(data.questions);
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start game");
    } finally {
      setLoading(false);
    }
  }, [address, dailyCount]);

  const startPaidGame = useCallback(async () => {
    if (!address || !walletClient) return;
    setLoading(true);
    setError("");
    try {
      const seed = Math.floor(Math.random() * 1e12);
      const res = await fetch(`/api/game/questions?count=10&seed=${seed}`);
      const data = await readJsonResponse<{
        questions?: Question[];
        error?: string;
      }>(res);
      if (!res.ok || !data.questions?.length)
        throw new Error(data.error ?? "No questions");

      const { connection, program } = createBrowserDuelpicProgram(walletClient);
      const player = walletClient.publicKey;
      const playerToken = paymentAta(player);
      const tokenBalance = await connection.getTokenAccountBalance(playerToken);
      if (BigInt(tokenBalance.value.amount) < BigInt(PAID_FEE_RAW)) {
        throw new Error(
          `Not enough USDC on ${address.slice(0, 6)}...${address.slice(-4)}. Claim test USDC from profile.`,
        );
      }

      const questionIds = data.questions.map((q: Question) => new BN(q.id));
      const questionAccounts = await Promise.all(
        data.questions.map(async (q: Question) => {
          const question = questionPda(q.id);
          const account = await program.account.question.fetch(question);
          const royalty = royaltyPda(account.contributor);
          try {
            await program.account.royalty.fetch(royalty);
          } catch {
            const initRoyalty = await program.methods
              .initializeRoyalty()
              .accountsStrict({
                royalty,
                contributor: account.contributor,
                payer: player,
                systemProgram: SystemProgram.programId,
              })
              .instruction();
            await sendWalletTransaction(walletClient, [initRoyalty]);
          }
          return [
            { pubkey: question, isWritable: true, isSigner: false },
            { pubkey: royalty, isWritable: true, isSigner: false },
          ];
        }),
      );

      const treasuryToken = createPaymentAtaInstruction(
        getTreasuryAddress(),
        player,
      );
      const royaltyVaultAuthority = royaltyVaultAuthorityPda();
      const royaltyVault = createPaymentAtaInstruction(
        royaltyVaultAuthority,
        player,
        true,
      );
      const payTx = await program.methods
        .payAndPlay(questionIds)
        .accountsStrict({
          config: configPda(),
          player,
          paymentMint: getPaymentMint(),
          playerToken,
          treasuryToken: treasuryToken.ata,
          royaltyVaultAuthority,
          royaltyVault: royaltyVault.ata,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(questionAccounts.flat())
        .transaction();

      await sendWalletTransaction(walletClient, [
        treasuryToken.instruction,
        royaltyVault.instruction,
        ...payTx.instructions,
      ]);

      await fetch("/api/game/casual-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIds: data.questions.map((q: Question) => q.id),
        }),
      });

      setQuestions(data.questions);
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start paid game");
    } finally {
      setLoading(false);
    }
  }, [address, walletClient]);

  const fetchUsdcBalance = useCallback(async () => {
    if (!playerPublicKey) return;
    try {
      const connection = createSolanaConnection();
      const balance = await connection.getTokenAccountBalance(
        paymentAta(playerPublicKey),
      );
      setUsdcBalance(BigInt(balance.value.amount));
    } catch {
      setUsdcBalance(null);
    }
  }, [playerPublicKey]);

  // Fetch daily count on mount so lobby shows remaining chances immediately
  useEffect(() => {
    if (address && !isPaid) checkDailyLimit();
    if (address && isPaid) fetchUsdcBalance();
  }, [address, isPaid, checkDailyLimit, fetchUsdcBalance]);

  const handleComplete = useCallback(
    async (results: QuestionResult[]) => {
      const correct = results.filter((r) => r.correct).length;
      const threshold = isPaid ? 5 : 3;
      addEntry({
        mode: isPaid ? "casual" : "free",
        result: correct >= threshold ? "win" : "lose",
        amount: 0,
      });

      if (!isPaid && address) {
        try {
          await fetch("/api/game/free-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          });
        } catch {
          // non-critical
        }
      }
      // Don't setPhase here — GameEngine shows GameResults internally.
      // Navigation happens via onPlayAgain / onHome callbacks.
    },
    [address, addEntry, isPaid],
  );

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (phase === "playing" && questions.length > 0) {
    return (
      <GameEngine
        questions={questions}
        secondsPerQuestion={SECONDS_FREE}
        mode={isPaid ? "paid" : "free"}
        onComplete={handleComplete}
        onHome={() => router.push("/")}
        onPlayAgain={() => {
          setPhase("lobby");
          setQuestions([]);
          if (!isPaid) checkDailyLimit();
          if (isPaid) fetchUsdcBalance();
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
      <div className="text-center max-w-xs">
        {isPaid ? (
          <>
            <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
              Paid Casual
            </h1>
            <p className="text-text-secondary font-sans text-sm">
              10 questions · 30 sec each · 0.03 USDC
            </p>
            <p className="text-text-secondary text-xs font-sans mt-1">
              90% of fee goes to question contributors
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
              Free Casual
            </h1>
            <p className="text-text-secondary font-sans text-sm">
              5 questions · 30 sec each · {FREE_DAILY_LIMIT} sessions/day
            </p>
            {dailyCount !== null && (
              <p className="text-text-secondary text-xs font-sans mt-2">
                Today: {dailyCount}/{FREE_DAILY_LIMIT} sessions used
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-error text-sm font-sans text-center max-w-xs">
          {error}
        </div>
      )}

      <Button
        onClick={isConnected ? (isPaid ? startPaidGame : startFreeGame) : login}
        loading={loading}
        size="lg"
        className="w-full max-w-xs"
      >
        {isConnected
          ? isPaid
            ? "Pay 0.03 USDC & Start"
            : "Start Game"
          : "Connect Wallet to Play"}
      </Button>

      <Button variant="ghost" onClick={() => router.push("/")} size="sm">
        Back to Home
      </Button>
    </div>
  );
}
