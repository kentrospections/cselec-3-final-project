import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }]
  },
  async rewrites() {
    return [
      { source: "/graphql", destination: "http://cselec-3-backend:8000/graphql" },
    ]
  },
}

export default nextConfig
