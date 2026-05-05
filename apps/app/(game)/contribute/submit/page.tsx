"use client";

import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  AlertIcon,
  CameraIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "../../../../components/icons";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Spinner from "../../../../components/ui/Spinner";
import { useWallet } from "../../../../hooks/useWallet";
import { createBrowserDuelSnapProgram } from "../../../../lib/solana/client";
import { configPda, questionPda } from "../../../../lib/solana/pda";

type Step =
  | "form"
  | "uploading"
  | "submitting"
  | "verifying"
  | "done"
  | "error";

interface VerifyStatus {
  status: "verifying" | "approved" | "rejected" | "error";
  questionId?: number;
  difficulty?: string;
  signature?: string;
  reason?: string;
  error?: string;
  stage?: string;
}

export default function ContributeSubmitPage() {
  const router = useRouter();
  const { isConnected, isReady, walletClient, address, login } = useWallet();
  const [step, setStep] = useState<Step>("form");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image must be under 5MB.");
      return;
    }
    setErrorMsg("");
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect],
  );

  const pollStatus = useCallback((questionId: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/contribute/${questionId}/status`);
        const data: VerifyStatus = await res.json();
        if (data.status !== "verifying") {
          if (pollRef.current) clearInterval(pollRef.current);
          setVerifyStatus(data);
          setStep("done");
        }
      } catch {
        // keep polling on network error
      }
    }, 3000);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!imageFile || !answer.trim() || !walletClient || !address) return;

    try {
      setStep("uploading");
      const form = new FormData();
      form.append("image", imageFile);
      const uploadRes = await fetch("/api/contribute/upload", {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const { cid, imageUrl } = await uploadRes.json();
      console.log("[Upload] Success:", { cid, imageUrl });

      setStep("submitting");
      const { program } = createBrowserDuelSnapProgram(walletClient);
      const config = await program.account.config.fetch(configPda());
      const questionCount =
        typeof config.questionCount === "number"
          ? config.questionCount
          : config.questionCount.toNumber();
      const questionId = questionCount + 1;

      const signature = await program.methods
        .submitQuestion(new BN(questionId), cid)
        .accountsStrict({
          config: configPda(),
          question: questionPda(questionId),
          contributor: walletClient.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("[QuestionID] Submitted:", { questionId, signature });

      setStep("verifying");
      setVerifyStatus({ status: "verifying", questionId });

      const verifyPayload = {
        questionId,
        imageUrl,
        answer: answer.trim().toUpperCase(),
      };
      console.log("[Verify] Sending payload:", verifyPayload);

      const verifyRes = await fetch("/api/contribute/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifyPayload),
      });
      const verifyData: VerifyStatus = await verifyRes.json();
      console.log(
        "[Verify] Response status:",
        verifyRes.status,
        "data:",
        verifyData,
      );
      if (!verifyRes.ok) {
        const details = verifyData.stage ? ` (${verifyData.stage})` : "";
        throw new Error(
          `${verifyData.reason ?? verifyData.error ?? "Verification failed"}${details}`,
        );
      }

      if (verifyData.status === "verifying") {
        pollStatus(questionId);
      } else {
        setVerifyStatus(verifyData);
        setStep("done");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [imageFile, answer, walletClient, address, pollStatus]);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-purple-400/20 border-2 border-primary/30 flex items-center justify-center shadow-lg">
          <CameraIcon className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-text-primary mb-2">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm">
            Connect wallet to submit questions and earn royalties
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  // Done state
  if (step === "done" && verifyStatus) {
    const approved = verifyStatus.status === "approved";
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="bg-bg-card px-5 pt-8 pb-6 shadow-sm">
          <div className="max-w-lg mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-light flex items-center justify-center shrink-0">
              <CameraIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-text-primary">
                {approved ? "Question Approved!" : "Submission Reviewed"}
              </h1>
              <p className="text-text-secondary text-sm font-sans mt-0.5">
                {approved
                  ? "Your image is now live in the question pool"
                  : "AI verification complete"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 max-w-lg mx-auto flex flex-col gap-4">
          {approved ? (
            <Card className="border border-success/30 bg-success/5">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="w-8 h-8 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-sans font-semibold text-text-primary">
                    Question #{verifyStatus.questionId} is live!
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    Difficulty:{" "}
                    <span className="capitalize font-medium text-primary">
                      {verifyStatus.difficulty}
                    </span>
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    You&apos;ll earn royalties every time it&apos;s played in a
                    paid session.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border border-error/30 bg-error/5">
              <div className="flex items-start gap-3">
                <XCircleIcon className="w-8 h-8 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="font-sans font-semibold text-text-primary">
                    Not approved
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    {verifyStatus.reason ??
                      "Image did not pass AI verification."}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {!approved && (
              <Button
                onClick={() => {
                  setStep("form");
                  setImageFile(null);
                  setImagePreview(null);
                  setAnswer("");
                  setVerifyStatus(null);
                }}
              >
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push("/contribute")}
            >
              Back to Contribute
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Verifying / loading states
  if (step === "uploading" || step === "submitting" || step === "verifying") {
    const stepLabels: Record<Step, string> = {
      uploading: "Uploading image…",
      submitting: "Submitting to blockchain…",
      verifying: "AI is verifying your image…",
      form: "",
      done: "",
      error: "",
    };
    const stepDesc: Record<Step, string> = {
      uploading: "Storing your image securely",
      submitting: "Sign the transaction in your wallet",
      verifying: "AI checks content, relevance, difficulty. Takes ~30 sec.",
      form: "",
      done: "",
      error: "",
    };
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="w-20 h-20 rounded-3xl bg-primary-light flex items-center justify-center">
          <Spinner size="lg" />
        </div>
        <div className="text-center">
          <p className="font-display font-bold text-xl text-text-primary">
            {stepLabels[step]}
          </p>
          <p className="text-text-secondary text-sm font-sans mt-2">
            {stepDesc[step]}
          </p>
        </div>
        {step === "verifying" && verifyStatus?.questionId && (
          <p className="text-xs text-text-secondary font-mono">
            Question ID: #{verifyStatus.questionId}
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="w-20 h-20 rounded-3xl bg-error/10 flex items-center justify-center">
          <AlertIcon className="w-10 h-10 text-error" />
        </div>
        <div className="text-center">
          <p className="font-display font-bold text-xl text-text-primary">
            Submission Failed
          </p>
          <p className="text-text-secondary text-sm font-sans mt-2 max-w-xs">
            {errorMsg}
          </p>
        </div>
        <Button onClick={() => setStep("form")}>Try Again</Button>
      </div>
    );
  }

  // Form
  const answerValid = /^\S{2,40}$/.test(answer);
  const canSubmit = !!imageFile && answerValid;

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="bg-bg-card px-5 pt-8 pb-6 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/contribute")}
            className="w-9 h-9 rounded-xl bg-bg-page flex items-center justify-center text-text-secondary hover:text-text-primary shrink-0"
          >
            ‹
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl text-text-primary">
              Submit Image
            </h1>
            <p className="text-text-secondary text-sm font-sans mt-0.5">
              Upload · AI verified · Earn royalties
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto w-full flex flex-col gap-5">
        {/* Image upload */}
        <div>
          <label className="font-sans font-semibold text-sm text-text-primary mb-2 block">
            Image <span className="text-error">*</span>
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={[
              "relative rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
              "flex flex-col items-center justify-center overflow-hidden",
              imagePreview
                ? "border-primary/40 h-56"
                : "border-text-secondary/30 hover:border-primary/50 h-44",
            ].join(" ")}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-secondary p-6">
                <CameraIcon className="w-10 h-10 text-text-secondary/60" />
                <p className="font-sans text-sm text-center">
                  Tap to select or drag an image here
                </p>
                <p className="text-xs">JPG, PNG, WEBP · Max 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </div>
          {imagePreview && (
            <button
              type="button"
              onClick={() => {
                setImageFile(null);
                setImagePreview(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="mt-2 text-xs text-error hover:underline"
            >
              Remove image
            </button>
          )}
        </div>

        {/* Answer input */}
        <div>
          <label className="font-sans font-semibold text-sm text-text-primary mb-2 block">
            Answer <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/\s+/g, ""))}
            placeholder="e.g. Banana"
            maxLength={40}
            className={[
              "w-full rounded-2xl bg-bg-card border px-4 py-3",
              "font-sans text-sm text-text-primary placeholder:text-text-secondary/60",
              "focus:outline-none transition-colors",
              answer && !/^\S+$/.test(answer)
                ? "border-error/60 focus:border-error"
                : "border-text-secondary/20 focus:border-primary/50",
            ].join(" ")}
          />
          <p className="text-xs text-text-secondary mt-1.5">
            One clear universal word — something everyone worldwide can
            recognize
          </p>
        </div>

        {errorMsg && <p className="text-sm text-error font-sans">{errorMsg}</p>}

        {/* Info */}
        <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-sans font-semibold text-sm text-text-primary">
              Creator rewards
            </span>
            <span className="font-sans font-bold text-sm text-secondary-dark">
              Royalties
            </span>
          </div>
          <p className="font-sans text-xs text-text-secondary">
            Image metadata goes on-chain after verification. You earn royalties
            on every paid game that uses it.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          className="w-full"
        >
          Submit Question
        </Button>
      </div>
    </div>
  );
}
