import { BN } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { PinataSDK } from "pinata";
import { configPda, questionPda, verifiedPoolPda } from "../lib/solana/pda";
import { verifiedPoolPageForQuestion } from "../lib/solana/questions";
import { createServerDuelSnapProgram } from "../lib/solana/server";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

type SeedMode = "upload" | "redis" | "onchain" | "all";

type SeedManifestEntry = {
  answer: string;
  cid: string;
  imageUrl: string;
  questionId?: number;
};

type SeedManifest = Record<string, SeedManifestEntry>;

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud";
const SEED_MODE = parseSeedMode(process.env.SEED_MODE ?? "all");
const FORCE_IPFS_UPLOAD = process.env.FORCE_IPFS_UPLOAD === "true";
const ANSWERS_PATH =
  process.env.SEED_ANSWERS_PATH ??
  path.join(__dirname, "seed-data/answers.json");
const IMAGES_DIR =
  process.env.SEED_IMAGES_DIR ?? path.join(__dirname, "seed-data/images");
const MANIFEST_PATH =
  process.env.SEED_MANIFEST_PATH ??
  path.join(__dirname, "seed-data/ipfs-manifest.json");

function parseSeedMode(value: string): SeedMode {
  if (
    value === "upload" ||
    value === "redis" ||
    value === "onchain" ||
    value === "all"
  ) {
    return value;
  }
  throw new Error("SEED_MODE must be upload, redis, onchain, or all");
}

function keypairFromJson(raw: string, source: string) {
  const secret = JSON.parse(raw);
  if (!Array.isArray(secret)) throw new Error(`${source} must be a JSON array`);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function defaultSolanaKeypairPath() {
  return (
    process.env.SOLANA_KEYPAIR_PATH ??
    path.join(os.homedir(), ".config/solana/id.json")
  );
}

function keypairFromEnvOrSolanaConfig(name: string) {
  const raw = process.env[name];
  if (raw) return keypairFromJson(raw, name);

  const keypairPath = defaultSolanaKeypairPath();
  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `${name} is not configured and Solana keypair was not found at ${keypairPath}`,
    );
  }

  return keypairFromJson(fs.readFileSync(keypairPath, "utf8"), keypairPath);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeManifest(manifest: SeedManifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function fileFromDisk(filename: string) {
  const imagePath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Seed image not found: ${imagePath}`);
  }

  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return new File([buffer], filename, {
    type: mimeMap[ext] ?? "application/octet-stream",
  });
}

async function uploadImages(answers: Record<string, string>) {
  const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: GATEWAY,
  });
  const manifest = readJsonFile<SeedManifest>(MANIFEST_PATH, {});

  for (const [filename, answer] of Object.entries(answers)) {
    if (manifest[filename] && !FORCE_IPFS_UPLOAD) {
      console.log(`SKIP ${filename} - already uploaded`);
      continue;
    }

    console.log(`Uploading ${filename}`);
    const result = await pinata.upload.public.file(fileFromDisk(filename));
    const cid = result.cid;
    manifest[filename] = {
      answer: answer.toUpperCase(),
      cid,
      imageUrl: `${GATEWAY}/ipfs/${cid}`,
    };
    writeManifest(manifest);
  }

  return manifest;
}

async function seedRedis(manifest: SeedManifest) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  let questionId = Number(process.env.SEED_REDIS_START_ID ?? 1);
  for (const [filename, entry] of Object.entries(manifest)) {
    const redisQuestionId = entry.questionId ?? questionId;
    await Promise.all([
      redis.set(`question:${redisQuestionId}:answer`, entry.answer),
      redis.set(`question:${redisQuestionId}:imageUrl`, entry.imageUrl),
    ]);
    console.log(`Stored Redis question:${redisQuestionId}:* from ${filename}`);
    questionId += 1;
  }
}

async function seedOnchain(manifest: SeedManifest) {
  const seedKeypair = keypairFromEnvOrSolanaConfig("SEED_KEYPAIR_JSON");
  const verifier = keypairFromEnvOrSolanaConfig("VERIFIER_KEYPAIR_JSON");
  const { program } = createServerDuelSnapProgram(seedKeypair);
  const { program: verifierProgram } = createServerDuelSnapProgram(verifier);

  for (const [filename, entry] of Object.entries(manifest)) {
    const config = await program.account.config.fetch(configPda());
    const questionCount =
      typeof config.questionCount === "number"
        ? config.questionCount
        : config.questionCount.toNumber();
    const questionId = questionCount + 1;

    const submitSignature = await program.methods
      .submitQuestion(new BN(questionId), entry.cid)
      .accountsStrict({
        config: configPda(),
        question: questionPda(questionId),
        contributor: seedKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(
      `Submitted ${filename} as question ${questionId}: ${submitSignature}`,
    );
    manifest[filename] = { ...entry, questionId };
    writeManifest(manifest);

    const page = verifiedPoolPageForQuestion(questionId);
    const verifiedPool = verifiedPoolPda(page);
    try {
      await verifierProgram.account.verifiedPool.fetch(verifiedPool);
    } catch {
      await verifierProgram.methods
        .initializeVerifiedPool(new BN(page))
        .accountsStrict({
          config: configPda(),
          verifiedPool,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const verifySignature = await verifierProgram.methods
      .verifyQuestion(new BN(page))
      .accountsStrict({
        config: configPda(),
        question: questionPda(questionId),
        verifiedPool,
        verifier: verifier.publicKey,
      })
      .rpc();
    console.log(`Verified question ${questionId}: ${verifySignature}`);
  }
}

async function main() {
  const answers = readJsonFile<Record<string, string>>(ANSWERS_PATH, {});
  const shouldUpload = SEED_MODE === "upload" || SEED_MODE === "all";
  const shouldSeedRedis = SEED_MODE === "redis" || SEED_MODE === "all";
  const shouldSeedOnchain = SEED_MODE === "onchain" || SEED_MODE === "all";
  const manifest = shouldUpload
    ? await uploadImages(answers)
    : readJsonFile<SeedManifest>(MANIFEST_PATH, {});

  if (!Object.keys(manifest).length) {
    throw new Error(
      `No seed manifest entries found. Run SEED_MODE=upload first or set SEED_MANIFEST_PATH.`,
    );
  }

  if (shouldSeedOnchain) await seedOnchain(manifest);
  if (shouldSeedRedis) await seedRedis(manifest);

  console.log("Seed flow complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
