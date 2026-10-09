/** Explicit HTTPS parent origins are needed only for an authorized H5 host. */
export function frameAncestorSources(value = ""): string[] {
  return [...new Set(value.trim().split(/\s+/).filter(Boolean).map((entry) => {
    const url = new URL(entry);
    if (url.protocol !== "https:" || url.hostname.includes("*") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("APP_FRAME_ANCESTORS requires exact HTTPS origins.");
    }
    return url.origin;
  }))];
}

export function contentSecurityPolicy(nonce: string, development: boolean, parents: string[] = []) {
  if (!/^[A-Za-z0-9+/=]{24,}$/.test(nonce)) throw new Error("Invalid page nonce.");
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + (development ? " 'unsafe-eval'" : ""),
    // Motion and React Flow use inline style attributes for positions and animation.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self'" + (development ? " ws: wss:" : ""),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self'",
    "frame-ancestors " + (parents.length ? parents.join(" ") : "'none'"),
  ].join("; ") + ";";
}

/** Trusted Vite bundles have no Next nonce. This policy applies only to their static subpage. */
export function universeContentSecurityPolicy() {
  return [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https: http://127.0.0.1:43891", "font-src 'self' data:", "media-src 'self' blob: data: https: http://127.0.0.1:43891",
    "connect-src 'self' https: http://127.0.0.1:43891", "worker-src 'self' blob:", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-src 'none'", "frame-ancestors 'self'",
  ].join("; ") + ";";
}
