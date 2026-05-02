import type { Metadata } from "next";
import "./globals.css";
import NavBar from "../components/NavBar";
import Providers from "../components/providers";
import SwipeNav from "../components/SwipeNav";

export const metadata: Metadata = {
  title: "DuelSnap",
  description:
    "Compete in picture-guessing duels and earn rewards on Solana. Play free, pay to earn, or battle 1v1 in PvP ranked mode.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg-page">
        <Providers>
          <SwipeNav>{children}</SwipeNav>
          <NavBar />
        </Providers>
      </body>
    </html>
  );
}
