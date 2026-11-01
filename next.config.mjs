/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a second dev server run next to the first without sharing .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["adm-zip", "solc"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
