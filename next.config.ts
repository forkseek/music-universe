import type { NextConfig } from "next";
import { frameAncestorSources } from "./src/lib/server/security-policy";

const frameParents = frameAncestorSources(process.env.APP_FRAME_ANCESTORS);

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/*": ["./src/db/migrations/**/*"] },
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ...(frameParents.length ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    ] }];
  },
};

export default config;
