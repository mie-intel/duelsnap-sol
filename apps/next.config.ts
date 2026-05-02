import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  webpack: (config) => {
    config.externals["@solana/kit"] = "commonjs @solana/kit";
    config.externals["@solana-program/memo"] = "commonjs @solana-program/memo";
    config.externals["@solana-program/system"] =
      "commonjs @solana-program/system";
    config.externals["@solana-program/token"] =
      "commonjs @solana-program/token";
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gateway.pinata.cloud",
        pathname: "/ipfs/**",
      },
    ],
  },
};

export default nextConfig;
