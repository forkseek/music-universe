import type { NextConfig } from "next";
import { frameAncestorSources, universeContentSecurityPolicy } from "./src/lib/server/security-policy";

const frameParents = frameAncestorSources(process.env.APP_FRAME_ANCESTORS);

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  // QQ callbacks and media URLs contain short-lived credentials. Avoid dev URL logs.
  logging: { incomingRequests: { ignore: [/^\/api\/qq\/login\/callback(?:\?|$)/, /^\/api\/(?:music|qq)\/audio(?:\?|$)/] } },
  output: "standalone",
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: { "/*": ["./src/db/postgres-migrations/**/*"] },
  outputFileTracingExcludes: { "/*": ["./.env*", "./data/**/*", "./work/**/*", "./apps/music-universe/**/*", "./node_modules/@electric-sql/**/*"] },
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ...(frameParents.length ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    ] }, { source: "/universe/:path*", headers: [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: universeContentSecurityPolicy() },
    ] }];
  },
};

export default config;
