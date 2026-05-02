import { createSolanaConnection } from "./connection";
import { configPda, questionPda, verifiedPoolPda } from "./pda";
import { createReadonlyDuelpicProgram } from "./program";

const MAX_VERIFIED_IDS_PER_PAGE = 256;

function shuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function verifiedPoolPageForQuestion(questionId: number | bigint) {
  return Math.floor((Number(questionId) - 1) / MAX_VERIFIED_IDS_PER_PAGE);
}

export async function getRandomVerifiedQuestionIds(count = 10) {
  const connection = createSolanaConnection();
  const program = createReadonlyDuelpicProgram(connection);
  const config = await program.account.config.fetch(configPda());
  const questionCount =
    typeof config.questionCount === "number"
      ? config.questionCount
      : config.questionCount.toNumber();
  const pageCount = Math.max(
    1,
    Math.ceil(questionCount / MAX_VERIFIED_IDS_PER_PAGE),
  );

  const pages = await Promise.all(
    Array.from({ length: pageCount }, async (_, page) => {
      try {
        const pool = await program.account.verifiedPool.fetch(
          verifiedPoolPda(page),
        );
        return pool.ids.map(Number);
      } catch {
        return [];
      }
    }),
  );

  const ids = pages.flat();
  const seed = Math.floor(Math.random() * 1e12);
  return shuffle(ids, seed).slice(0, Math.min(count, 10));
}

export async function getQuestionContributor(questionId: number | bigint) {
  const connection = createSolanaConnection();
  const program = createReadonlyDuelpicProgram(connection);
  const question = await program.account.question.fetch(questionPda(questionId));
  return question.contributor;
}
