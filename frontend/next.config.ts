import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal server bundle for the Docker image
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;
