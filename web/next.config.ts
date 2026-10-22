import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Proyek berada di subfolder dari repo utama — tetapkan root tracing agar tidak ambigu.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
