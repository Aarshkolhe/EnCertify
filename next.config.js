/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: []
  },
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdf-lib", "archiver"]
  }
};

module.exports = nextConfig;
