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
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  turbopack: {
    root: appDir,
  },
  async rewrites() {
    const backendBase = backendBaseUrl()

    return [
      {
        source: "/ops",
        destination: `${backendBase}/ops`,
      },
      {
        source: "/ops/:path*",
        destination: `${backendBase}/ops/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendBase}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
