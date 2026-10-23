import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/*": ["./lib/tesseract-worker.js", "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
};

export default nextConfig;

