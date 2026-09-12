/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: []
  },
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdf-lib", "pdfjs-dist", "archiver"],
    // pdf.js reads its bundled standard-font data from disk at runtime via a
    // path built at call time (see src/lib/pdfPreview.ts). Next's file tracing
    // cannot see a dynamic path, so name it explicitly or PDF templates upload
    // fine but rasterize without any text on a traced/serverless deploy.
    // Note: this key sits under `experimental` on Next 14; it only moved to
    // the top level in Next 15.
    outputFileTracingIncludes: {
      "/api/admin/templates/upload": ["./node_modules/pdfjs-dist/standard_fonts/**"],
      // The certificate renderer registers these at runtime via
      // require.resolve (see src/lib/certificateRenderer.ts). Nothing imports
      // the .woff2 files as modules, so the tracer has no way to discover
      // them — without this they are dropped from the bundle and every
      // generated certificate comes out with its text missing.
      // Only the 400/700 weights are registered, so only those are traced —
      // @fontsource ships every weight from 100 to 900 and pulling them all in
      // would be several hundred KB of dead bundle.
      "/api/admin/certificates/generate": [
        "./node_modules/@fontsource/noto-serif/files/noto-serif-latin-400-*.woff2",
        "./node_modules/@fontsource/noto-serif/files/noto-serif-latin-700-*.woff2",
        "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-*.woff2",
        "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-*.woff2",
        "./node_modules/@fontsource/noto-sans-mono/files/noto-sans-mono-latin-400-normal.woff2",
        "./node_modules/@fontsource/noto-sans-mono/files/noto-sans-mono-latin-700-normal.woff2"
      ]
    }
  }
};

module.exports = nextConfig;
