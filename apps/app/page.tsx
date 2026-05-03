"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  CameraIcon,
  CoinIcon,
  GamepadIcon,
  SwordsIcon,
} from "../components/icons";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Spinner from "../components/ui/Spinner";
import { useWallet } from "../hooks/useWallet";

type HoverBorderStyle = CSSProperties & {
  "--hover-border-color": string;
};

function modeCardStyle(color: string, glow: string): HoverBorderStyle {
  return {
    "--hover-border-color": color,
    background: `linear-gradient(135deg, ${glow}, #ffffff 54%, #ffffff)`,
  };
}

export default function Home() {
  const { address, isConnected, isReady, login } = useWallet();

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 bg-bg-card shadow-sm">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="DuelSnap"
            width={36}
            height={36}
            className="rounded-lg"
            priority
          />
          <span className="font-display font-bold text-xl text-text-primary">
            DuelSnap
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isReady ? (
            <Spinner size="sm" />
          ) : isConnected ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs font-mono text-text-secondary bg-primary-light px-3 py-1.5 rounded-full">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
            </div>
          ) : (
            <Button size="sm" onClick={login}>
              Connect Wallet
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center px-5 py-10 pb-24 gap-8 max-w-lg mx-auto w-full">
        <div className="text-center">
          <h1 className="font-display font-bold text-4xl text-text-primary leading-tight">
            Snap the Clue.
            <br />
            <span className="text-primary">Win the Duel.</span>
          </h1>
          <p className="mt-3 text-text-secondary text-base">
            Bright picture rounds, real rewards, and quick 1v1 battles.
          </p>
        </div>

        {/* Game Mode Cards */}
        <div className="flex flex-col gap-4 w-full">
          <Link href="/casual" className="block">
            <Card
              className="border border-transparent hover:border-accent-free transition-colors"
              style={modeCardStyle(
                "var(--color-accent-free)",
                "rgb(20 241 149 / 0.18)",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-accent-free-light)" }}
                >
                  <GamepadIcon className="w-7 h-7 text-accent-free-dark" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-text-primary">
                      Free Casual
                    </h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: "var(--color-accent-free-light)",
                        color: "var(--color-accent-free)",
                      }}
                    >
                      FREE
                    </span>
                  </div>
                  <p className="text-text-secondary text-sm mt-0.5">
                    5 questions · 3 rounds/day · No wallet needed
                  </p>
                </div>
                <span className="text-text-secondary">›</span>
              </div>
            </Card>
          </Link>

          <Link href="/casual?mode=paid" className="block">
            <Card
              className="border border-transparent hover:border-accent-paid transition-colors"
              style={modeCardStyle(
                "var(--color-accent-paid)",
                "rgb(255 176 32 / 0.2)",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-accent-paid-light)" }}
                >
                  <CoinIcon className="w-7 h-7 text-accent-paid-dark" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-text-primary">
                      Paid Casual
                    </h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: "var(--color-accent-paid-light)",
                        color: "var(--color-accent-paid)",
                      }}
                    >
                      0.03 USDC
                    </span>
                  </div>
                  <p className="text-text-secondary text-sm mt-0.5">
                    10 questions · Earn royalties · Contributors rewarded
                  </p>
                </div>
                <span className="text-text-secondary">›</span>
              </div>
            </Card>
          </Link>

          <Link href="/pvp/lobby" className="block">
            <Card
              className="border border-transparent hover:border-accent-pvp transition-colors"
              style={modeCardStyle(
                "var(--color-accent-pvp)",
                "rgb(255 77 157 / 0.18)",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-accent-pvp-light)" }}
                >
                  <SwordsIcon className="w-7 h-7 text-accent-pvp-dark" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-text-primary">
                      PvP Ranked
                    </h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: "var(--color-accent-pvp-light)",
                        color: "var(--color-accent-pvp)",
                      }}
                    >
                      0.30 USDC
                    </span>
                  </div>
                  <p className="text-text-secondary text-sm mt-0.5">
                    1v1 · 10 questions · Winner takes 87%
                  </p>
                </div>
                <span className="text-text-secondary">›</span>
              </div>
            </Card>
          </Link>

          <Link href="/contribute" className="block">
            <Card
              className="border border-dashed border-text-secondary/30 hover:border-accent-contribute transition-colors"
              style={modeCardStyle(
                "var(--color-accent-contribute)",
                "rgb(0 209 255 / 0.18)",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--color-accent-contribute-light)",
                  }}
                >
                  <CameraIcon className="w-7 h-7 text-accent-contribute-dark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-bold text-text-primary">
                    Contribute Questions
                  </h3>
                  <p className="text-text-secondary text-sm mt-0.5">
                    Submit images · AI verified · Earn royalties forever
                  </p>
                </div>
                <span className="text-text-secondary">›</span>
              </div>
            </Card>
          </Link>
        </div>

        {isReady && !isConnected && (
          <Button onClick={login} size="lg" className="w-full">
            Connect Wallet
          </Button>
        )}
      </main>
    </div>
  );
}
