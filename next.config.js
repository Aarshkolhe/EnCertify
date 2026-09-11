/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: []
  },
  // pdf.js reads its bundled standard-font data from disk at runtime via a
  // path built at call time (see src/lib/pdfPreview.ts). Next's file tracing
  // cannot see a dynamic path, so name it explicitly or PDF templates upload
  // fine but rasterize without any text on a traced/serverless deploy.
  outputFileTracingIncludes: {
    "/api/admin/templates/upload": ["./node_modules/pdfjs-dist/standard_fonts/**"]
  },
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdf-lib", "pdfjs-dist", "archiver"]
  }
};

module.exports = nextConfig;
