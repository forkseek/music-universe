import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, frameAncestorSources } from "@/lib/server/security-policy";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", frameAncestorSources(process.env.APP_FRAME_ANCESTORS));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Image sequences and videos bypass Proxy; only documents need a page nonce.
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|media(?:/|$)|samples(?:/|$)|favicon\\.ico$).*)"],
};
