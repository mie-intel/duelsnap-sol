"use client";

import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { createSolanaConnection } from "../lib/solana/connection";
import { configPda, questionPda, royaltyPda } from "../lib/solana/pda";
import { createReadonlyDuelpicProgram } from "../lib/solana/program";

export type CreatorQuestion = {
  id: number;
  isVerified: boolean;
  imageUrl: string | null;
  timesPlayed: number;
  earned: number;
};

const CREATOR_STATS_REFRESH_MS = 60_000;

export function useCreatorStats(address?: string | null) {
  const [questions, setQuestions] = useState<CreatorQuestion[]>([]);
  const [pendingRoyalty, setPendingRoyalty] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const clearPendingRoyalty = useCallback(() => {
    setPendingRoyalty(0);
  }, []);

  useEffect(() => {
    if (!address) {
      setQuestions([]);
      setPendingRoyalty(0);
      setLoading(false);
      setError("");
      return;
    }

    const owner = new PublicKey(address);
    let cancelled = false;

    async function load(showSpinner = false) {
      if (showSpinner) setLoading(true);
      try {
        const connection = createSolanaConnection();
        const program = createReadonlyDuelpicProgram(connection);
        const config = await program.account.config.fetch(configPda());
        const questionCount =
          typeof config.questionCount === "number"
            ? config.questionCount
            : config.questionCount.toNumber();

        try {
          const royalty = await program.account.royalty.fetch(royaltyPda(owner));
          if (!cancelled) setPendingRoyalty(Number(royalty.pendingAmount));
        } catch {
          if (!cancelled) setPendingRoyalty(0);
        }

        const records = await Promise.all(
          Array.from({ length: questionCount }, async (_, index) => {
            const id = index + 1;
            try {
              const question = await program.account.question.fetch(
                questionPda(id),
              );
              if (!question.contributor.equals(owner)) return null;
              return { id, question };
            } catch {
              return null;
            }
          }),
        );

        const owned = records.filter(Boolean) as NonNullable<
          (typeof records)[number]
        >[];
        if (owned.length === 0) {
          if (!cancelled) setQuestions([]);
          return;
        }

        const ids = owned.map(({ id }) => id);
        const imageMap: Record<number, string> = {};
        const trackedMetrics: Record<
          number,
          { plays: number; earned: number; pvpPlays: number; pvpEarned: number }
        > = {};

        try {
          const res = await fetch(`/api/game/questions?ids=${ids.join(",")}`);
          if (res.ok) {
            const data = (await res.json()) as {
              questions: { id: number; imageUrl: string }[];
            };
            for (const q of data.questions ?? []) imageMap[q.id] = q.imageUrl;
          }
        } catch {}

        try {
          const res = await fetch(`/api/game/casual-track?ids=${ids.join(",")}`);
          if (res.ok) {
            const data = (await res.json()) as {
              metrics?: {
                id: number;
                plays: number;
                earned: number;
                pvpPlays?: number;
                pvpEarned?: number;
              }[];
            };
            for (const metric of data.metrics ?? []) {
              trackedMetrics[metric.id] = {
                plays: metric.plays,
                earned: metric.earned,
                pvpPlays: metric.pvpPlays ?? 0,
                pvpEarned: metric.pvpEarned ?? 0,
              };
            }
          }
        } catch {}

        const nextQuestions = owned.map(({ id, question }) => {
          const metric = trackedMetrics[id];
          const trackedPlays = (metric?.plays ?? 0) + (metric?.pvpPlays ?? 0);
          const onchainPlays = Number(question.timesPlayed);
          const trackedEarned =
            (metric?.earned ?? 0) + (metric?.pvpEarned ?? 0);
          const onchainEarned = Number(question.royaltyEarned);
          return {
            id,
            isVerified: question.isVerified,
            imageUrl: imageMap[id] ?? null,
            timesPlayed: Math.max(onchainPlays, trackedPlays),
            earned: Math.max(onchainEarned, trackedEarned),
          };
        });

        if (!cancelled) {
          setQuestions(nextQuestions);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load creator stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), CREATOR_STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, reloadKey]);

  return {
    questions,
    pendingRoyalty,
    loading,
    error,
    refresh,
    clearPendingRoyalty,
  };
}
