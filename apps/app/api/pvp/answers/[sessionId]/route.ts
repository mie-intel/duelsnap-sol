import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { redis } from "../../../../../lib/redis/client";
import { parseRedisArray } from "../../../../../lib/redis/json";
import {
  getPaymentMint,
  getTreasuryAddress,
} from "../../../../../lib/solana/config";
import { createSolanaConnection } from "../../../../../lib/solana/connection";
import {
  configPda,
  questionPda,
  royaltyPda,
  royaltyVaultAuthorityPda,
  sessionVaultAuthorityPda,
} from "../../../../../lib/solana/pda";
import { createReadonlyDuelSnapProgram } from "../../../../../lib/solana/program";
import {
  sessionAddressFromId,
  solanaWinner,
} from "../../../../../lib/solana/pvp";
import {
  createServerDuelSnapProgram,
  getRelayerKeypair,
} from "../../../../../lib/solana/server";
import { paymentAta } from "../../../../../lib/solana/token";

export const runtime = "nodejs";
export const maxDuration = 60;

const PVP_WAGER_RAW = 300_000;
const PVP_POOL_RAW = PVP_WAGER_RAW * 2;
const PVP_CONTRIBUTOR_BPS = 1000;
const BPS_DENOMINATOR = 10000;

function normalizeAnswer(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toUpperCase();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { playerAddress, answers } = await req.json();

    if (!playerAddress || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const session = await fetchSession(sessionId);
    const player = new PublicKey(playerAddress);
    const isPlayer1 = session.player1.equals(player);
    const isPlayer2 = session.player2.equals(player);
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const key = isPlayer1 ? `pvp:${sessionId}:p1` : `pvp:${sessionId}:p2`;
    await redis.set(key, JSON.stringify(answers), { ex: 3600 });

    const p1Raw = await redis.get<unknown>(`pvp:${sessionId}:p1`);
    const p2Raw = await redis.get<unknown>(`pvp:${sessionId}:p2`);

    if (!p1Raw || !p2Raw) {
      return NextResponse.json({ status: "waiting_for_opponent" });
    }

    const qRaw = await redis.get<unknown>(`pvp:${sessionId}:q`);
    const questionIds = parseRedisArray<string | number | bigint>(qRaw).map(
      String,
    );
    const p1Answers = parseRedisArray<unknown>(p1Raw);
    const p2Answers = parseRedisArray<unknown>(p2Raw);

    let score1 = 0,
      score2 = 0;
    for (let i = 0; i < questionIds.length; i++) {
      const correctRaw = await redis.get<unknown>(
        `question:${questionIds[i]}:answer`,
      );
      const correctAnswer = normalizeAnswer(correctRaw);
      if (!correctAnswer) continue;
      const p1Guess = normalizeAnswer(p1Answers[i]);
      const p2Guess = normalizeAnswer(p2Answers[i]);
      if (p1Guess && p1Guess === correctAnswer) score1++;
      if (p2Guess && p2Guess === correctAnswer) score2++;
    }

    const winner =
      score1 > score2
        ? session.player1.toBase58()
        : score2 > score1
          ? session.player2.toBase58()
          : "tie";

    try {
      await resolveSession(sessionId, winner, score1, score2);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to resolve PvP session";
      await redis.set(`pvp:${sessionId}:resolveError`, msg, { ex: 3600 });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    await Promise.all([
      redis.set(`pvp:${sessionId}:winner`, winner, { ex: 3600 }),
      redis.del(`pvp:${sessionId}:resolveError`),
    ]);
    await trackPvpContributorEarnings(questionIds);

    return NextResponse.json({ status: "resolved", winner, score1, score2 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function fetchSession(sessionId: string) {
  const connection = createSolanaConnection();
  const program = createReadonlyDuelSnapProgram(connection);
  const session = await program.account.session.fetch(
    sessionAddressFromId(sessionId),
  );
  return {
    player1: session.player1,
    player2: session.player2,
    status: session.status,
    questionIds: session.questionIds.slice(0, Number(session.questionCount)),
  };
}

async function resolveSession(
  sessionId: string,
  winner: string,
  score1: number,
  score2: number,
) {
  const relayer = getRelayerKeypair();
  const { program } = createServerDuelSnapProgram(relayer);
  const sessionAddress = sessionAddressFromId(sessionId);
  const session = await program.account.session.fetch(sessionAddress);
  const questionIds = session.questionIds
    .slice(0, Number(session.questionCount))
    .map((id: unknown) => Number(id));
  const questionAccounts = await Promise.all(
    questionIds.map(async (id) => {
      const question = questionPda(id);
      const account = await program.account.question.fetch(question);
      const royalty = royaltyPda(account.contributor);
      try {
        await program.account.royalty.fetch(royalty);
      } catch {
        await program.methods
          .initializeRoyalty()
          .accountsStrict({
            royalty,
            contributor: account.contributor,
            payer: relayer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
      return [
        { pubkey: question, isWritable: true, isSigner: false },
        {
          pubkey: royalty,
          isWritable: true,
          isSigner: false,
        },
      ];
    }),
  );

  return program.methods
    .resolveByRelayer(solanaWinner(winner), score1, score2)
    .accountsStrict({
      config: configPda(),
      session: sessionAddress,
      relayer: relayer.publicKey,
      paymentMint: getPaymentMint(),
      player1Token: paymentAta(session.player1),
      player2Token: paymentAta(session.player2),
      treasuryToken: paymentAta(getTreasuryAddress()),
      royaltyVaultAuthority: royaltyVaultAuthorityPda(),
      royaltyVault: paymentAta(royaltyVaultAuthorityPda(), true),
      sessionVaultAuthority: sessionVaultAuthorityPda(sessionAddress),
      sessionVault: paymentAta(sessionVaultAuthorityPda(sessionAddress), true),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(questionAccounts.flat())
    .rpc();
}

async function trackPvpContributorEarnings(questionIds: string[]) {
  if (questionIds.length === 0) return;
  const totalContributorShare = Math.floor(
    (PVP_POOL_RAW * PVP_CONTRIBUTOR_BPS) / BPS_DENOMINATOR,
  );
  const perQuestion = Math.floor(totalContributorShare / questionIds.length);
  if (perQuestion <= 0) return;

  await Promise.all(
    questionIds.map(async (id) => {
      try {
        const [currentPlays, currentEarned] = await Promise.all([
          redis.get<number>(`question:${id}:pvpPlays`),
          redis.get<number>(`question:${id}:pvpEarnedRaw`),
        ]);
        await Promise.all([
          redis.set(`question:${id}:pvpPlays`, Number(currentPlays ?? 0) + 1),
          redis.set(
            `question:${id}:pvpEarnedRaw`,
            Number(currentEarned ?? 0) + perQuestion,
          ),
        ]);
      } catch {
        // tracking is best-effort; payout already happened on-chain
      }
    }),
  );
}
