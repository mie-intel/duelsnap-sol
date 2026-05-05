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
const QUESTION_REVIEW_MODE = process.env.QUESTION_REVIEW_MODE ?? "assisted";
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
  | { status: "error"; questionId: number; reason: string; stage?: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function errorResponse(
  questionId: number | null,
  reason: string,
  status = 500,
  stage?: string,
) {
  return NextResponse.json(
    {
      error: reason,
      reason,
      status: "error",
      questionId: questionId ?? undefined,
      stage,
    },
    { status },
  );
}

function shouldAutoApprove() {
  return QUESTION_REVIEW_MODE !== "strict";
}

async function approveAndRespond(
  questionId: number,
  difficulty = "medium",
): Promise<Response> {
  const signature = await approveQuestionOnchain(
    questionId,
    difficultyMap[difficulty] ?? AI_FALLBACK_DIFFICULTY,
  );
  const response: VerifyResponse = {
    status: "approved",
    questionId,
    difficulty,
    signature,
  };
  await redis.set(`contribute:${questionId}`, JSON.stringify(response), {
    ex: 3600,
  });
  return NextResponse.json(response);
}

export async function POST(req: Request) {
  try {
    const { questionId, imageUrl, answer } = await req.json();
    const numericQuestionId = Number(questionId);

    if (!numericQuestionId || !imageUrl || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\S{2,40}$/.test(answer)) {
      return NextResponse.json(
        { error: "Answer must be a single word (2–40 chars, no spaces)" },
        { status: 400 },
      );
    }

    let question: Awaited<ReturnType<typeof getQuestionRecord>>;
    try {
      question = await getQuestionRecord(numericQuestionId);
    } catch (e) {
      return errorResponse(
        numericQuestionId,
        errorMessage(e),
        500,
        "fetch_question",
      );
    }

    const fetchedId =
      typeof question.id === "number" ? question.id : question.id.toNumber();
    if (!question || fetchedId !== numericQuestionId) {
      return NextResponse.json(
        { error: "Question does not exist onchain" },
        { status: 400 },
      );
    }

    try {
      await redis.set(
        `contribute:${numericQuestionId}`,
        JSON.stringify({ status: "verifying", questionId: numericQuestionId }),
        { ex: 3600 },
      );
      await Promise.all([
        redis.set(`question:${numericQuestionId}:imageUrl`, imageUrl),
        redis.set(`question:${numericQuestionId}:answer`, answer.toUpperCase()),
      ]);
    } catch (e) {
      return errorResponse(numericQuestionId, errorMessage(e), 500, "redis");
    }

    try {
      if (shouldAutoApprove()) {
        return await approveAndRespond(numericQuestionId);
      }

      const result = await verifyQuestionImage(imageUrl, answer);
      const approved = passesVerification(result);

      if (!approved) {
        const response: VerifyResponse = {
          status: "rejected",
          questionId: numericQuestionId,
          reason: result.rejectReason ?? "Did not pass AI verification",
        };
        await redis.set(
          `contribute:${numericQuestionId}`,
          JSON.stringify(response),
          {
            ex: 3600,
          },
        );
        return NextResponse.json(response);
      }

      const difficulty = difficultyMap[result.difficulty] ?? 2;
      const signature = await approveQuestionOnchain(
        numericQuestionId,
        difficulty,
      );
      const response: VerifyResponse = {
        status: "approved",
        questionId: numericQuestionId,
        difficulty: result.difficulty,
        signature,
      };
      await redis.set(
        `contribute:${numericQuestionId}`,
        JSON.stringify(response),
        {
          ex: 3600,
        },
      );
      return NextResponse.json(response);
    } catch (e) {
      const aiFallbackError = isRetryableGeminiError(e);

      if (aiFallbackError && !AI_FAILS_AS_ERROR) {
        return await approveAndRespond(numericQuestionId);
      }

      const response: VerifyResponse = {
        status: "error",
        questionId: numericQuestionId,
        reason: aiFallbackError
          ? "AI verification is temporarily overloaded. Please retry in a minute."
          : e instanceof Error
            ? e.message
            : "Verification error",
        stage: shouldAutoApprove() ? "approve_question" : "review_image",
      };
      await redis.set(
        `contribute:${numericQuestionId}`,
        JSON.stringify(response),
        {
          ex: 3600,
        },
      );
      return NextResponse.json(response, { status: 500 });
    }
  } catch (e) {
    return errorResponse(null, errorMessage(e), 500, "request");
  }
}
