"use client";

import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { SwordsIcon } from "../../../../components/icons";
import Button from "../../../../components/ui/Button";
import Spinner from "../../../../components/ui/Spinner";
import { useWallet } from "../../../../hooks/useWallet";
import {
  createBrowserDuelpicProgram,
  createPaymentAtaInstruction,
  sendWalletTransaction,
} from "../../../../lib/solana/client";
import { getPaymentMint } from "../../../../lib/solana/config";
import {
  configPda,
  sessionPda,
  sessionVaultAuthorityPda,
} from "../../../../lib/solana/pda";
import { sessionAddressFromId, sessionSeedFromHex } from "../../../../lib/solana/pvp";
import { paymentAta } from "../../../../lib/solana/token";

const WAGER_RAW = 300_000;

function FindingOpponentArt() {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 88 88"
      fill="none"
      aria-hidden="true"
      className="animate-pulse"
    >
      <circle cx="44" cy="44" r="38" fill="currentColor" className="text-primary/10" />
      <circle cx="30" cy="37" r="10" fill="currentColor" className="text-primary/30" />
      <circle cx="58" cy="37" r="10" fill="currentColor" className="text-error/30" />
      <path d="M22 60c4-7 11-11 22-11s18 4 22 11" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-text-secondary/70" />
      <path d="M38 42l12 4-12 4 3-4-3-4Z" fill="currentColor" className="text-text-primary" />
    </svg>
  );
}

export default function PvpLobbyPage() {
  const router = useRouter();
  const { isReady, isConnected, address, walletClient, login } = useWallet();
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [matchError, setMatchError] = useState("");
  const cancelledRef = useRef(false);

  const ensureWagerBalance = useCallback(async () => {
    if (!walletClient) throw new Error("Wallet signer is not ready yet.");
    const { connection } = createBrowserDuelpicProgram(walletClient);
    const token = paymentAta(walletClient.publicKey);
    const balance = await connection.getTokenAccountBalance(token);
    if (BigInt(balance.value.amount) < BigInt(WAGER_RAW)) {
      throw new Error("Not enough USDC. Need 0.30 USDC for PvP wager.");
    }
  }, [walletClient]);

  const sendCreateSession = useCallback(
    async (sessionId: string, questionIds: string[]) => {
      if (!walletClient) throw new Error("Wallet signer is not ready yet.");
      const { program } = createBrowserDuelpicProgram(walletClient);
      const seed = sessionSeedFromHex(sessionId);
      const session = sessionPda(seed);
      const vaultAuthority = sessionVaultAuthorityPda(session);
      const vault = createPaymentAtaInstruction(vaultAuthority, walletClient.publicKey, true);
      const playerToken = createPaymentAtaInstruction(walletClient.publicKey, walletClient.publicKey);
      const tx = await program.methods
        .createSession(
          Array.from(seed),
          new BN(WAGER_RAW),
          questionIds.map((id) => new BN(id)),
        )
        .accountsStrict({
          config: configPda(),
          session,
          player1: walletClient.publicKey,
          paymentMint: getPaymentMint(),
          player1Token: playerToken.ata,
          sessionVaultAuthority: vaultAuthority,
          sessionVault: vault.ata,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      return sendWalletTransaction(walletClient, [
        playerToken.instruction,
        vault.instruction,
        ...tx.instructions,
      ]);
    },
    [walletClient],
  );

  const sendJoinSession = useCallback(
    async (sessionId: string) => {
      if (!walletClient) throw new Error("Wallet signer is not ready yet.");
      const { program } = createBrowserDuelpicProgram(walletClient);
      const session = sessionAddressFromId(sessionId);
      const vaultAuthority = sessionVaultAuthorityPda(session);
      const vault = createPaymentAtaInstruction(vaultAuthority, walletClient.publicKey, true);
      const playerToken = createPaymentAtaInstruction(walletClient.publicKey, walletClient.publicKey);
      const tx = await program.methods
        .joinSession()
        .accountsStrict({
          config: configPda(),
          session,
          player2: walletClient.publicKey,
          paymentMint: getPaymentMint(),
          player2Token: playerToken.ata,
          sessionVaultAuthority: vaultAuthority,
          sessionVault: vault.ata,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();
      return sendWalletTransaction(walletClient, [
        playerToken.instruction,
        vault.instruction,
        ...tx.instructions,
      ]);
    },
    [walletClient],
  );

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setMatching(false);
    setMatchError("");
    setError("");
    router.push("/");
  }, [router]);

  const handlePlay = useCallback(async () => {
    if (!address) return;
    cancelledRef.current = false;
    setMatching(true);
    setError("");
    setMatchError("");

    try {
      const matchRes = await fetch("/api/pvp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", playerAddress: address }),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) throw new Error(matchData.error);

      if (matchData.action === "resume") {
        router.push(`/pvp/${matchData.sessionId}`);
        return;
      }

      await ensureWagerBalance();

      if (matchData.action === "join") {
        await sendJoinSession(matchData.sessionId);
        await fetch("/api/pvp/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", sessionId: matchData.sessionId }),
        });
        router.push(`/pvp/${matchData.sessionId}`);
        return;
      }

      const createRes = await fetch("/api/pvp/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerAddress: address }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error);
      if (!Array.isArray(createData.questionIds) || createData.questionIds.length === 0) {
        throw new Error("No questions available for PvP.");
      }

      await sendCreateSession(createData.sessionId, createData.questionIds);
      await fetch("/api/pvp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          playerAddress: address,
          sessionId: createData.sessionId,
          questionIds: createData.questionIds.map(Number),
        }),
      });

      router.push(`/pvp/${createData.sessionId}`);
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to start PvP";
      if (/rejected|Not enough|Wallet signer|insufficient|User rejected/i.test(msg)) {
        setError(msg);
        setMatching(false);
      } else {
        setMatchError(msg);
      }
    }
  }, [address, ensureWagerBalance, router, sendCreateSession, sendJoinSession]);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <SwordsIcon className="w-16 h-16 text-error" />
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
            PvP Ranked
          </h1>
          <p className="text-text-secondary font-sans text-sm">
            Connect wallet to battle 1v1
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
      {matching ? (
        <FindingOpponentArt />
      ) : (
        <SwordsIcon className="w-16 h-16 text-error" />
      )}

      <div className="text-center">
        <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
          PvP Ranked
        </h1>
        <p className="text-text-secondary font-sans text-sm">
          0.30 USDC wager · 10 questions · 8 sec each
        </p>
        <p className="text-text-secondary text-xs font-sans mt-1">
          Play now and we&apos;ll find your opponent automatically.
        </p>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-error text-sm font-sans text-center max-w-xs">
          {error}
        </div>
      )}

      {matching ? (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <p className="text-text-primary font-semibold font-sans text-center">
            {matchError ? "Having trouble..." : "Finding opponent..."}
          </p>
          {matchError ? (
            <p className="text-error text-xs font-sans text-center">{matchError}</p>
          ) : (
            <p className="text-text-secondary text-sm font-sans text-center">
              If someone is already waiting, you&apos;ll join them instantly.
              Otherwise, we&apos;ll keep your room open.
            </p>
          )}
          <div className="flex items-center gap-2 text-text-secondary text-xs font-sans">
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
          </div>
          <Button variant="ghost" onClick={handleCancel} size="sm">
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={handlePlay} size="lg" className="w-full" loading={matching}>
            Play
          </Button>
          <Button variant="ghost" onClick={() => router.push("/")} size="sm">
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
