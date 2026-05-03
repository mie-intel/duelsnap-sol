import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { NextResponse } from "next/server";
import {
  isRetryableGeminiError,
  passesVerification,
  verifyQuestionImage,
} from "../../../../lib/gemini/verify";
import { redis } from "../../../../lib/redis/client";
import {
  configPda,
  questionPda,
  verifiedPoolPda,
} from "../../../../lib/solana/pda";
import { verifiedPoolPageForQuestion } from "../../../../lib/solana/questions";
import {
  createServerDuelSnapProgram,
  getVerifierKeypair,
} from "../../../../lib/solana/server";

const AI_FAILS_AS_ERROR = process.env.AI_FAILS_AS_ERROR !== "false";
// const SKIP_AI_VERIFICATION = process.env.SKIP_AI_VERIFICATION === "true";
const SKIP_AI_VERIFICATION = true; // TEMP: Force skip AI verification while Gemini is having issues
const AI_FALLBACK_DIFFICULTY = 2;

const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

async function getQuestionRecord(questionId: number) {
  const verifier = getVerifierKeypair();
  const { program } = createServerDuelSnapProgram(verifier);
  return program.account.question.fetch(questionPda(questionId));
}

async function approveQuestionOnchain(questionId: number, difficulty: number) {
  void difficulty;
  const verifier = getVerifierKeypair();
  const { program } = createServerDuelSnapProgram(verifier);
  const page = verifiedPoolPageForQuestion(questionId);
  const verifiedPool = verifiedPoolPda(page);

  try {
    await program.account.verifiedPool.fetch(verifiedPool);
  } catch {
    await program.methods
      .initializeVerifiedPool(new BN(page))
      .accountsStrict({
        config: configPda(),
        verifiedPool,
        verifier: verifier.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  return program.methods
    .verifyQuestion(new BN(page))
    .accountsStrict({
      config: configPda(),
      question: questionPda(questionId),
      verifiedPool,
      verifier: verifier.publicKey,
    })
    .rpc();
}

type VerifyResponse =
  | {
      status: "approved";
      questionId: number;
      difficulty: string;
      signature: string;
    }
  | { status: "rejected"; questionId: number; reason: string }
  | { status: "error"; questionId: number; reason: string };

export async function POST(req: Request) {
  try {
    const { questionId, imageUrl, answer } = await req.json();

    if (!questionId || !imageUrl || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\S{2,40}$/.test(answer)) {
      return NextResponse.json(
        { error: "Answer must be a single word (2–40 chars, no spaces)" },
        { status: 400 },
      );
    }

    const question = await getQuestionRecord(questionId);
    const fetchedId =
      typeof question.id === "number" ? question.id : question.id.toNumber();
    if (!question || fetchedId !== Number(questionId)) {
      return NextResponse.json(
        { error: "Question does not exist onchain" },
        { status: 400 },
      );
    }

    const key = `contribute:${questionId}`;
    await redis.set(key, JSON.stringify({ status: "verifying", questionId }), {
      ex: 3600,
    });
    await Promise.all([
      redis.set(`question:${questionId}:imageUrl`, imageUrl),
      redis.set(`question:${questionId}:answer`, answer.toUpperCase()),
    ]);

    try {
      // Bypass AI verification if SKIP_AI_VERIFICATION is enabled
      if (SKIP_AI_VERIFICATION) {
        const signature = await approveQuestionOnchain(
          questionId,
          AI_FALLBACK_DIFFICULTY,
        );
        const response: VerifyResponse = {
          status: "approved",
          questionId,
          difficulty: "medium",
          signature,
        };
        await redis.set(key, JSON.stringify(response), { ex: 3600 });
        return NextResponse.json(response);
      }

      const result = await verifyQuestionImage(imageUrl, answer);
      const approved = passesVerification(result);

      if (!approved) {
        const response: VerifyResponse = {
          status: "rejected",
          questionId,
          reason: result.rejectReason ?? "Did not pass AI verification",
        };
        await redis.set(key, JSON.stringify(response), { ex: 3600 });
        return NextResponse.json(response);
      }

      const difficulty = difficultyMap[result.difficulty] ?? 2;
      const signature = await approveQuestionOnchain(questionId, difficulty);
      const response: VerifyResponse = {
        status: "approved",
        questionId,
        difficulty: result.difficulty,
        signature,
      };
      await redis.set(key, JSON.stringify(response), { ex: 3600 });
      return NextResponse.json(response);
    } catch (e) {
      const aiFallbackError = isRetryableGeminiError(e);

      if (aiFallbackError && !AI_FAILS_AS_ERROR) {
        const signature = await approveQuestionOnchain(
          questionId,
          AI_FALLBACK_DIFFICULTY,
        );
        const response: VerifyResponse = {
          status: "approved",
          questionId,
          difficulty: "medium",
          signature,
        };
        await redis.set(key, JSON.stringify(response), { ex: 3600 });
        return NextResponse.json(response);
      }

      const response: VerifyResponse = {
        status: "error",
        questionId,
        reason: aiFallbackError
          ? "AI verification is temporarily overloaded. Please retry in a minute."
          : e instanceof Error
            ? e.message
            : "Verification error",
      };
      await redis.set(key, JSON.stringify(response), { ex: 3600 });
      return NextResponse.json(response);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
