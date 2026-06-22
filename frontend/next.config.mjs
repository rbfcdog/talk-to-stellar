import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(fileURLToPath(import.meta.url))

function backendBaseUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3001"
  ).replace(/\/+$/, "")
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Embed BACKEND_URL at build time so it's available in Route Handlers at runtime.
  // Without this, process.env.BACKEND_URL is undefined in production server code.
  env: {
    BACKEND_URL: backendBaseUrl(),
  },
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  turbopack: {
    root: appDir,
  },
  async rewrites() {
    const backendBase = backendBaseUrl()

    // Only rewrite /ops — all /api/* paths are handled by
    // app/api/[...path]/route.ts (catch-all proxy). Keeping a blanket
    // /api/:path* rewrite here conflicts with that route handler in
    // Next.js 16 App Router and causes 404s on unmatched paths.
    return [
      {
        source: "/ops",
        destination: `${backendBase}/ops`,
      },
      {
        source: "/ops/:path*",
        destination: `${backendBase}/ops/:path*`,
      },
    ]
  },
}

export default nextConfig
