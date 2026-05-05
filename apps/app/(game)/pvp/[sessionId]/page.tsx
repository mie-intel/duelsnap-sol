"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GameEngine, {
  type Question,
  type QuestionResult,
} from "../../../../components/game/GameEngine";
import { CheckCircleIcon, XCircleIcon } from "../../../../components/icons";
import Button from "../../../../components/ui/Button";
import Spinner from "../../../../components/ui/Spinner";
import { useGameSession } from "../../../../hooks/useGameSession";
import { usePlayerLog } from "../../../../hooks/usePlayerLog";
import { useWallet } from "../../../../hooks/useWallet";

export default function PvpSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { isReady, isConnected, address, login } = useWallet();
  const { addEntry } = usePlayerLog(address);
  const session = useGameSession(isConnected ? sessionId : null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<
    "waiting" | "playing" | "submitted" | "done"
  >("waiting");
  const [loadingQ, setLoadingQ] = useState(false);
  const [error, setError] = useState("");
  const [resolvedWinner, setResolvedWinner] = useState<string | null>(null);
  const winner = session.winner ?? resolvedWinner;

  useEffect(() => {
    if (!winner || !address) return;

    const logKey = `duelsnap_pvp_logged_${sessionId}_${address.toLowerCase()}`;
    if (localStorage.getItem(logKey) === "1") return;

    const isTie = winner === "tie";
    const isWinner = winner.toLowerCase() === address.toLowerCase();
    const amount = isTie ? -0.039 : isWinner ? 0.222 : -0.3;
    addEntry({
      mode: "competitive",
      result: isTie ? "tie" : isWinner ? "win" : "lose",
      amount,
    });
    localStorage.setItem(logKey, "1");
  }, [address, winner, sessionId, addEntry]);

  useEffect(() => {
    if (
      session.status >= 1 &&
      session.questionIds.length > 0 &&
      questions.length === 0 &&
      !loadingQ
    ) {
      setLoadingQ(true);
      fetch(`/api/game/questions?ids=${session.questionIds.join(",")}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.questions?.length) {
            setQuestions(data.questions);
            setPhase("playing");
          }
        })
        .catch(() => setError("Failed to load questions"))
        .finally(() => setLoadingQ(false));
    }
  }, [session.status, session.questionIds, questions.length, loadingQ]);

  useEffect(() => {
    if (winner && phase !== "done") {
      setPhase("done");
    }
  }, [winner, phase]);

  useEffect(() => {
    if (session.resolveError) {
      setError(session.resolveError);
    }
  }, [session.resolveError]);

  const handleComplete = useCallback(
    async (results: QuestionResult[]) => {
      setPhase("submitted");
      const answers = results.map((r) => r.guess);

      try {
        const res = await fetch(`/api/pvp/answers/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerAddress: address, answers }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to submit answers");

        if (data.status === "resolved") {
          setResolvedWinner(data.winner ?? null);
          setPhase("done");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit answers");
      }
    },
    [address, sessionId],
  );

  if (!isReady)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-text-primary font-sans">
          Connect wallet to view this session
        </p>
        <Button onClick={login}>Connect Wallet</Button>
      </div>
    );
  }

  if (session.loading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (session.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-error font-sans text-sm">{session.error}</p>
        <Button onClick={() => router.push("/pvp/lobby")}>Back to Lobby</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-error font-sans text-sm">{error}</p>
        <Button onClick={() => router.push("/pvp/lobby")}>Back to Lobby</Button>
      </div>
    );
  }

  if (session.status === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="animate-pulse">
          <svg
            width="88"
            height="88"
            viewBox="0 0 88 88"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="44"
              cy="44"
              r="38"
              fill="currentColor"
              className="text-primary/10"
            />
            <circle
              cx="30"
              cy="37"
              r="10"
              fill="currentColor"
              className="text-primary/30"
            />
            <circle
              cx="58"
              cy="37"
              r="10"
              fill="currentColor"
              className="text-error/30"
            />
            <path
              d="M22 60c4-7 11-11 22-11s18 4 22 11"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              className="text-text-secondary/70"
            />
            <path
              d="M38 42l12 4-12 4 3-4-3-4Z"
              fill="currentColor"
              className="text-text-primary"
            />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="font-display font-bold text-xl text-text-primary mb-2">
            Waiting for Opponent
          </h2>
          <p className="text-text-secondary text-sm font-sans">
            Finding an opponent for you now.
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/pvp/lobby")}>
          Cancel
        </Button>
      </div>
    );
  }

  if (phase === "playing" && questions.length > 0) {
    return (
      <GameEngine
        questions={questions}
        secondsPerQuestion={8}
        mode="free"
        onComplete={handleComplete}
        onHome={() => router.push("/")}
      />
    );
  }

  if (phase === "submitted") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <Spinner size="lg" />
        <p className="font-display font-bold text-xl text-text-primary">
          Waiting for opponent…
        </p>
        <p className="text-text-secondary text-sm font-sans">
          Your answers submitted. Hang tight.
        </p>
      </div>
    );
  }

  if (phase === "done" && winner) {
    const isWinner = winner.toLowerCase() === address?.toLowerCase();
    const isTie = winner === "tie";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        {isTie ? (
          <>
            <p className="font-display font-bold text-3xl text-text-primary">
              Tie!
            </p>
            <p className="text-text-secondary text-sm font-sans text-center">
              Refund: 0.261 USDC sent to your wallet
              <br />
              <span className="text-error">Net: -0.039 USDC after fees</span>
            </p>
          </>
        ) : isWinner ? (
          <>
            <CheckCircleIcon className="w-20 h-20 text-success" />
            <p className="font-display font-bold text-3xl text-success">
              You Win!
            </p>
            <p className="text-text-secondary text-sm font-sans text-center">
              Prize: <span className="font-bold text-success">0.522 USDC</span>{" "}
              sent to your wallet
              <br />
              <span className="text-success">Net profit: +0.222 USDC</span>
            </p>
          </>
        ) : (
          <>
            <XCircleIcon className="w-20 h-20 text-error" />
            <p className="font-display font-bold text-3xl text-error">
              You Lose
            </p>
            <p className="text-text-secondary text-sm font-sans text-center">
              Wager lost
              <br />
              <span className="text-error">Net: -0.300 USDC</span>
            </p>
          </>
        )}
        <Button
          onClick={() => router.push("/pvp/lobby")}
          size="lg"
          className="w-full max-w-xs"
        >
          Play Again
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")} size="sm">
          Home
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
